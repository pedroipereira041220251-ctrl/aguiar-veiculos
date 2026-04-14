/**
 * instagram.js — Webhook Meta Graph API (Instagram DM)
 * Fase 2: recebe mensagens de clientes via Instagram e roteia ao agente.
 *
 * Configuração no Meta for Developers:
 *  - Webhook URL: https://<dominio>/webhooks/instagram
 *  - Verify Token: META_VERIFY_TOKEN (env)
 *  - Campos: messages, messaging_postbacks
 */

import { Router } from 'express';
import crypto from 'crypto';
import supabase from '../db/supabase.js';
import { handler as agenteHandler } from '../services/agente.js';

const router = Router();

// ── GET /webhooks/instagram — verificação pelo Meta ────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[webhook/instagram] Webhook verificado pelo Meta');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook/instagram] Verificação inválida:', { mode, token });
  res.sendStatus(403);
});

// ── POST /webhooks/instagram — mensagens recebidas ─────────
router.post('/', (req, res) => {
  // Validar assinatura X-Hub-Signature-256
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && appSecret !== 'xxxxx') {
    const sig  = req.headers['x-hub-signature-256'] || '';
    const buf  = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const hash = 'sha256=' + crypto.createHmac('sha256', appSecret).update(buf).digest('hex');

    if (sig.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash))) {
      return res.sendStatus(401);
    }
  }

  // Responder 200 imediatamente (Meta exige resposta em < 20s)
  res.sendStatus(200);

  const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  processarUpdate(body).catch(err => console.error('[webhook/instagram] Erro:', err.message));
});

// ── processarUpdate ────────────────────────────────────────
async function processarUpdate(body) {
  if (body.object !== 'instagram') return;

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      await processarEvento(event).catch(err =>
        console.error('[instagram] erro evento:', err.message)
      );
    }
  }
}

// ── processarEvento ────────────────────────────────────────
async function processarEvento(event) {
  // Ignorar ecos (mensagens enviadas pela própria conta)
  if (event.message?.is_echo) return;

  const senderId = event.sender?.id;
  if (!senderId) return;

  const texto    = event.message?.text || '';
  const imageUrl = event.message?.attachments?.find(a => a.type === 'image')?.payload?.url || null;

  // Buscar lead existente pelo PSID do Instagram
  const { data: lead } = await supabase
    .from('leads')
    .select('id, atendimento_humano')
    .eq('contato', senderId)
    .eq('canal', 'instagram')
    .maybeSingle();

  // Atendimento humano ativo → só salva histórico, não responde
  if (lead?.atendimento_humano === true) {
    await salvarHistorico(lead.id, texto || '[mídia]');
    return;
  }

  await agenteHandler({
    contato:  senderId,
    canal:    'instagram',
    texto,
    imageUrl,
    body:     event,
    lead_id:  lead?.id || null,
  });
}

// ── salvarHistorico ────────────────────────────────────────
async function salvarHistorico(leadId, texto) {
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, mensagens')
    .eq('lead_id', leadId)
    .eq('canal', 'instagram')
    .maybeSingle();

  const agora        = new Date().toISOString();
  const novaMensagem = { role: 'user', content: texto, timestamp: agora, tipo: 'text' };

  if (conversa) {
    const msgs = Array.isArray(conversa.mensagens) ? conversa.mensagens : [];
    await supabase
      .from('conversas')
      .update({ mensagens: [...msgs, novaMensagem], ultima_mensagem_at: agora })
      .eq('id', conversa.id);
  } else {
    await supabase.from('conversas').insert({
      lead_id: leadId, canal: 'instagram',
      mensagens: [novaMensagem], ultima_mensagem_at: agora,
    });
  }

  await supabase.from('leads').update({ ultima_interacao: agora }).eq('id', leadId);
}

export default router;
