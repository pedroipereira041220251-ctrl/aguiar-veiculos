import { Router } from 'express';
import crypto from 'crypto';
import supabase from '../db/supabase.js';
import { handler as ownerBotHandler, activateMenu } from '../services/ownerBot.js';
import { handler as agenteHandler } from '../services/agente.js';
import { sendText, sendListMessage, sendButtonMessage } from '../services/waClient.js';

const router = Router();

// ── Validação de assinatura Z-API ──────────────────────────
function validarAssinatura(req) {
  const secret = process.env.ZAPI_WEBHOOK_SECRET;
  if (!secret || secret === 'xxxxx') return true; // dev sem secret configurado

  const assinatura = req.headers['x-webhook-token'] || req.headers['x-zapi-token'];
  if (!assinatura) return false;

  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(hash));
}

// ── POST /webhooks/whatsapp ────────────────────────────────
// Implementação na ordem exata da seção 4.1 do PRD
router.post('/', (req, res) => {
  // 1. Validar assinatura — rejeitar antes de qualquer processamento
  if (!validarAssinatura(req)) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  // 2. Retornar HTTP 200 imediatamente (Z-API exige resposta rápida)
  res.sendStatus(200);

  // 3. Processar de forma assíncrona (não bloqueia a resposta)
  const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  processarMensagem(body).catch(err => {
    console.error('[webhook/whatsapp] Erro no processamento assíncrono:', err);
  });
});

// ── processarMensagem ──────────────────────────────────────
async function processarMensagem(body) {
  // a. Ignorar eventos delivered/read
  if (body.type === 'DeliveryCallback' || body.type === 'ReadCallback') return;
  if (body.status === 'DELIVERY_ACK' || body.status === 'READ') return;

  // Extrair campos principais
  const fromMe = body.fromMe === true || body.isFromMe === true;
  const phone   = body.phone || body.from || body.sender?.phone || '';
  const isGroup = body.isGroupMsg === true || phone.includes('@g.us');

  // a. Ignorar mensagens enviadas pelo próprio número (fromMe:true) e grupos
  if (fromMe || isGroup) return;

  // b. Tratar story_reply como mensagem normal
  const tipo    = body.type || 'chat';
  const isStory = tipo === 'story_reply' || body.isStory === true;

  // Extrair texto da mensagem
  const texto = extrairTexto(body);

  const ownerPhone = process.env.OWNER_PHONE_NUMBER;
  const remetente  = phone.replace(/\D/g, '');
  const isOwner    = remetente === ownerPhone.replace(/\D/g, '');

  // c. Roteamento principal
  if (isOwner) {
    await rotearDono(remetente, texto, body);
  } else {
    await rotearCliente(remetente, texto, body, isStory);
  }
}

// ── rotearDono ─────────────────────────────────────────────
async function rotearDono(phone, texto, body) {
  // Buscar sessão do dono (canal=whatsapp)
  const { data: sessao } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('canal', 'whatsapp')
    .eq('owner_id', phone)
    .maybeSingle();

  // Verificar timeout de 30 minutos
  if (sessao?.modo_gestao || sessao?.estado) {
    const diffMin = (Date.now() - new Date(sessao.updated_at).getTime()) / 60000;
    if (diffMin > 30) {
      await resetarSessao(phone, 'whatsapp');
      await sendText(phone, 'Sessão expirada. Mande /menu para recomeçar.');
      return;
    }
  }

  const textoNorm = texto?.trim().toLowerCase();

  // Ativar menu explicitamente
  if (textoNorm === '/menu' || textoNorm === 'menu') {
    const resultado = await activateMenu('whatsapp', phone);
    await enviarResposta(phone, resultado, 'whatsapp');
    return;
  }

  // Se em modo gestão ou com estado de wizard ativo → processar no bot
  if (sessao?.modo_gestao || sessao?.estado) {
    const resultado = await ownerBotHandler({ text: texto, canal: 'whatsapp', owner_id: phone, body });
    if (resultado) await enviarResposta(phone, resultado, 'whatsapp');
    return;
  }

  // Dono sem sessão ativa e sem /menu → ignorar silenciosamente (seção 4.1)
}

// ── rotearCliente ──────────────────────────────────────────
async function rotearCliente(phone, texto, body, isStory) {
  // Buscar lead pelo número
  const { data: lead } = await supabase
    .from('leads')
    .select('id, atendimento_humano, canal')
    .eq('contato', phone)
    .maybeSingle();

  // atendimento_humano=true → salvar histórico, NÃO responder
  if (lead?.atendimento_humano === true) {
    await salvarHistorico(lead.id, 'whatsapp', texto, body);
    return;
  }

  // Encaminhar para agente de IA
  await agenteHandler({
    contato:   phone,
    canal:     'whatsapp',
    texto,
    body,
    isStory,
    lead_id:   lead?.id || null,
  });
}

// ── enviarResposta ─────────────────────────────────────────
// Mapeia o retorno do ownerBot para o formato correto do canal
export async function enviarResposta(to, resultado, _canal) {
  if (!resultado) return;

  const { message, keyboard, type } = resultado;

  if (type === 'list' && keyboard) {
    // List Message — menus com múltiplas opções
    await sendListMessage(to, {
      title:       keyboard.title || 'Menu',
      description: message,
      buttonLabel: keyboard.buttonLabel || 'Ver opções',
      sections:    keyboard.sections,
    });
  } else if (type === 'buttons' && keyboard) {
    // Reply Buttons — confirmações (máx 3)
    await sendButtonMessage(to, message, keyboard.buttons, keyboard.footer || '');
  } else {
    // Texto simples
    await sendText(to, message);
  }
}

// ── Helpers ────────────────────────────────────────────────
function extrairTexto(body) {
  // Diferentes formatos do payload Z-API
  return (
    body.text?.message ||
    body.message?.conversation ||
    body.message?.extendedTextMessage?.text ||
    body.listResponseMessage?.title ||       // resposta de List Message
    body.buttonResponseMessage?.displayText || // resposta de Button
    body.selectedRowId ||                    // id da opção selecionada no list
    body.selectedButtonId ||                 // id do botão selecionado
    ''
  );
}

async function resetarSessao(ownerId, canal) {
  await supabase
    .from('bot_sessions')
    .upsert(
      { canal, owner_id: ownerId, modo_gestao: false, estado: null, dados_parciais: {} },
      { onConflict: 'canal,owner_id' }
    );
}

async function salvarHistorico(leadId, canal, texto, body) {
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, mensagens')
    .eq('lead_id', leadId)
    .eq('canal', canal)
    .maybeSingle();

  const novaMensagem = {
    role:      'user',
    content:   texto || '[mídia]',
    timestamp: new Date().toISOString(),
    tipo:      detectarTipo(body),
  };

  if (conversa) {
    const mensagens = Array.isArray(conversa.mensagens) ? conversa.mensagens : [];
    mensagens.push(novaMensagem);
    await supabase
      .from('conversas')
      .update({ mensagens, ultima_mensagem_at: new Date().toISOString() })
      .eq('id', conversa.id);
  } else {
    await supabase.from('conversas').insert({
      lead_id:           leadId,
      canal,
      mensagens:         [novaMensagem],
      ultima_mensagem_at: new Date().toISOString(),
    });
  }

  // Atualizar ultima_interacao do lead
  await supabase
    .from('leads')
    .update({ ultima_interacao: new Date().toISOString() })
    .eq('id', leadId);
}

function detectarTipo(body) {
  const tipo = body.type?.toLowerCase() || '';
  if (tipo.includes('audio') || tipo.includes('ptt')) return 'audio';
  if (tipo.includes('image') || tipo.includes('video')) return 'image';
  return 'text';
}

export default router;
