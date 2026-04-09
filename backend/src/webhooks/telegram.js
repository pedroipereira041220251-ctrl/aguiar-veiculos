import { Router } from 'express';
import { answerCallback } from '../services/telegramClient.js';
import { handler as ownerBotHandler, activateMenu } from '../services/ownerBot.js';
import supabase from '../db/supabase.js';

const router = Router();

// ── POST /webhooks/telegram ────────────────────────────────
// Recebe updates do Telegram (webhook mode em produção)
// Em dev o bot usa polling — este endpoint fica inativo mas não quebra
router.post('/', async (req, res) => {
  // Telegram não valida HMAC como Z-API; segurança via token no URL
  // Retornar 200 imediatamente para o Telegram não reenviar
  res.sendStatus(200);

  const update = Buffer.isBuffer(req.body)
    ? JSON.parse(req.body.toString())
    : req.body;

  processarUpdate(update).catch(err => {
    console.error('[webhook/telegram] Erro no processamento:', err);
  });
});

// ── processarUpdate ────────────────────────────────────────
async function processarUpdate(update) {
  if (!update) return;

  // Dois tipos de update relevantes: mensagem de texto e callback_query (botões)
  if (update.callback_query) {
    await processarCallback(update.callback_query);
  } else if (update.message) {
    await processarMensagem(update.message);
  }
}

// ── processarCallback ──────────────────────────────────────
// Botões inline clicados pelo dono
async function processarCallback(callback) {
  const chatId  = String(callback.from?.id || callback.message?.chat?.id);
  const msgId   = callback.message?.message_id;
  const data    = callback.data || '';  // callback_data do botão

  // Confirmar ao Telegram (remove spinner do botão)
  await answerCallback(callback.id).catch(() => {});

  // Validar que é o dono
  if (!isDono(chatId)) return;

  // Verificar timeout de sessão
  const sessaoValida = await verificarSessao(chatId);
  if (!sessaoValida) return;

  // Encaminhar para ownerBot com o callback_data como texto
  const resultado = await ownerBotHandler({
    text:       data,
    canal:      'telegram',
    owner_id:   chatId,
    message_id: msgId,
  });

  if (resultado) {
    await enviarRespostaTelegram(chatId, resultado, msgId);
  }
}

// ── processarMensagem ──────────────────────────────────────
// Mensagens de texto enviadas pelo dono
async function processarMensagem(msg) {
  const chatId = String(msg.chat?.id || msg.from?.id);
  const texto  = msg.text || msg.caption || '';

  // Validar que é o dono
  if (!isDono(chatId)) return;

  const textoNorm = texto.trim().toLowerCase();

  // Ativar menu
  if (textoNorm === '/menu' || textoNorm === 'menu') {
    const resultado = await activateMenu('telegram', chatId);
    if (resultado) await enviarRespostaTelegram(chatId, resultado);
    return;
  }

  // Verificar timeout de sessão
  const sessaoValida = await verificarSessao(chatId);
  if (!sessaoValida) return;

  // Só processar se tiver sessão ativa (modo_gestao=true ou estado!=null)
  const { data: sessao } = await supabase
    .from('bot_sessions')
    .select('modo_gestao, estado')
    .eq('canal', 'telegram')
    .eq('owner_id', chatId)
    .maybeSingle();

  if (!sessao?.modo_gestao && !sessao?.estado) return; // ignorar silenciosamente

  const resultado = await ownerBotHandler({
    text:     texto,
    canal:    'telegram',
    owner_id: chatId,
    body:     { message: msg },  // inclui photo, document, etc.
  });

  if (resultado) await enviarRespostaTelegram(chatId, resultado);
}

// ── enviarRespostaTelegram ─────────────────────────────────
// Mapeia retorno do ownerBot para o formato Telegram
async function enviarRespostaTelegram(chatId, resultado, editMsgId = null) {
  const { sendMessage, editMessage, buildInlineKeyboard } = await import('../services/telegramClient.js');

  const { message, keyboard, type } = resultado;

  let tgKeyboard = null;

  // Telegram usa InlineKeyboard para todos os tipos (list, buttons, inline)
  if (keyboard?.buttons) {
    tgKeyboard = buildInlineKeyboard(keyboard.buttons, keyboard.cols || 2);
  } else if (keyboard?.inline_keyboard) {
    tgKeyboard = keyboard;
  }

  // Editar mensagem anterior (ex: ao selecionar opção de um menu)
  if (editMsgId && type !== 'text') {
    await editMessage(chatId, editMsgId, message, tgKeyboard).catch(() => {
      // Fallback: enviar nova mensagem se edição falhar
      return sendMessage(chatId, message, tgKeyboard);
    });
  } else {
    await sendMessage(chatId, message, tgKeyboard);
  }
}

// ── Helpers ────────────────────────────────────────────────
function isDono(chatId) {
  const ownerId = String(process.env.TELEGRAM_OWNER_CHAT_ID || '');
  return chatId === ownerId;
}

async function verificarSessao(chatId) {
  const { data: sessao } = await supabase
    .from('bot_sessions')
    .select('modo_gestao, estado, updated_at')
    .eq('canal', 'telegram')
    .eq('owner_id', chatId)
    .maybeSingle();

  if (!sessao) return true; // sem sessão = permitir /menu

  const diffMin = (Date.now() - new Date(sessao.updated_at).getTime()) / 60000;

  if ((sessao.modo_gestao || sessao.estado) && diffMin > 30) {
    // Resetar sessão expirada
    await supabase
      .from('bot_sessions')
      .upsert(
        { canal: 'telegram', owner_id: chatId, modo_gestao: false, estado: null, dados_parciais: {} },
        { onConflict: 'canal,owner_id' }
      );

    const { sendMessage } = await import('../services/telegramClient.js');
    await sendMessage(chatId, 'Sessão expirada\\. Mande /menu para recomeçar\\.');
    return false;
  }

  return true;
}

// Usado pelo polling em dev (telegramClient.js)
export { enviarRespostaTelegram, processarUpdate as processarUpdatePolling };
export default router;
