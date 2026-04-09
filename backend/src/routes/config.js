import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import supabase from '../db/supabase.js';

const router = Router();

const configSchema = z.object({
  horario_inicio:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  horario_fim:          z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dias_semana:          z.array(z.number().int().min(0).max(6)).optional(),
  msg_fora_horario:     z.string().min(1).optional(),
  owner_phone_number:   z.string().optional(),
  resumo_semanal_ativo: z.boolean().optional(),
  alerta_ipva_dias:     z.number().int().min(1).max(90).optional(),
  alerta_parado_dias:   z.number().int().min(1).max(180).optional(),
});

// ── GET /api/config ────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[GET /config]', err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// ── PATCH /api/config ──────────────────────────────────────
router.patch('/', async (req, res) => {
  try {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    const { data, error } = await supabase
      .from('configuracoes')
      .update(parsed.data)
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[PATCH /config]', err);
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

// ── GET /api/config/bots/status ───────────────────────────
router.get('/bots/status', async (_req, res) => {
  const result = { whatsapp: { ok: false, info: '' }, telegram: { ok: false, info: '' } };

  // ── WhatsApp (Z-API) ───────────────────────────────────
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token      = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || instanceId === 'xxxxx' || !token || token === 'xxxxx') {
    result.whatsapp.info = 'Credenciais Z-API não configuradas';
  } else {
    try {
      const r = await axios.get(
        `https://api.z-api.io/instances/${instanceId}/token/${token}/status`,
        { headers: { 'Client-Token': clientToken }, timeout: 6000 },
      );
      const connected = r.data?.connected === true;
      const smartphoneOk = r.data?.smartphoneConnected === true;
      result.whatsapp.ok   = connected;
      result.whatsapp.info = connected
        ? `Conectado${smartphoneOk ? ' · celular online' : ' · celular offline'}`
        : 'Desconectado — escaneie o QR Code no painel Z-API';
    } catch (err) {
      result.whatsapp.info = `Erro ao verificar: ${err.message}`;
    }
  }

  // ── Telegram ───────────────────────────────────────────
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!tgToken || tgToken === 'xxxxx') {
    result.telegram.info = 'Token do bot não configurado';
  } else {
    try {
      const r = await axios.get(
        `https://api.telegram.org/bot${tgToken}/getMe`,
        { timeout: 6000 },
      );
      if (r.data?.ok) {
        result.telegram.ok   = true;
        result.telegram.info = `@${r.data.result.username} ativo`;
      } else {
        result.telegram.info = 'Token inválido';
      }
    } catch (err) {
      result.telegram.info = `Erro ao verificar: ${err.message}`;
    }
  }

  res.json(result);
});

export default router;
