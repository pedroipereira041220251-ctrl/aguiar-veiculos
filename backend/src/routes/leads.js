import { Router } from 'express';
import { z } from 'zod';
import supabase from '../db/supabase.js';
import { handoffAutomatico, MOTIVOS } from '../services/handoff.js';

const router = Router();

// ── Schemas Zod ────────────────────────────────────────────
const criarLeadSchema = z.object({
  nome:                  z.string().optional(),
  contato:               z.string().min(1),
  canal:                 z.enum(['whatsapp', 'instagram']),
  veiculo_interesse_id:  z.string().uuid().optional(),
  status_funil:          z.enum(['novo','contato','visita','proposta','fechado','perdido']).default('novo'),
  forma_pagamento:       z.string().optional(),
  prazo_compra:          z.string().optional(),
  capacidade_financeira: z.enum(['carta_aprovada','comprovante_renda','a_vista_confirmado','sem_informacao']).optional(),
  score_qualificacao:    z.number().int().min(1).max(5).optional(),
  anotacoes:             z.string().optional(),
});

const editarLeadSchema = criarLeadSchema.partial().omit({ contato: true, canal: true });

// ── GET /api/leads ─────────────────────────────────────────
// Filtros: status_funil, canal, atendimento_humano, data
router.get('/', async (req, res) => {
  try {
    const { status_funil, canal, atendimento_humano, data: dataFiltro } = req.query;

    let query = supabase
      .from('leads')
      .select(`
        *,
        veiculo:veiculo_interesse_id ( placa, modelo, ano )
      `)
      .order('ultima_interacao', { ascending: false });

    if (status_funil)       query = query.eq('status_funil', status_funil);
    if (canal)              query = query.eq('canal', canal);
    if (atendimento_humano !== undefined) {
      query = query.eq('atendimento_humano', atendimento_humano === 'true');
    }
    if (dataFiltro) {
      // filtrar por data de criação (YYYY-MM-DD)
      query = query.gte('created_at', `${dataFiltro}T00:00:00`)
                   .lte('created_at', `${dataFiltro}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[GET /leads]', err);
    res.status(500).json({ error: 'Erro ao listar leads' });
  }
});

// ── GET /api/leads/hoje ────────────────────────────────────
// Leads criados nas últimas 24h
router.get('/hoje', async (req, res) => {
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('leads')
      .select(`
        id, nome, contato, canal, status_funil,
        atendimento_humano, score_qualificacao, created_at,
        veiculo:veiculo_interesse_id ( placa, modelo, ano )
      `)
      .gte('created_at', desde)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[GET /leads/hoje]', err);
    res.status(500).json({ error: 'Erro ao buscar leads de hoje' });
  }
});

// ── GET /api/leads/:id ─────────────────────────────────────
// Lead completo com conversa, anotações, foto_entrada_urls
router.get('/:id', async (req, res) => {
  try {
    const [{ data: lead, error }, { data: conversa, error: eC }] = await Promise.all([
      supabase
        .from('leads')
        .select(`*, veiculo:veiculo_interesse_id ( placa, modelo, ano, preco_venda )`)
        .eq('id', req.params.id)
        .single(),
      supabase
        .from('conversas')
        .select('mensagens, canal, ultima_mensagem_at')
        .eq('lead_id', req.params.id)
        .order('ultima_mensagem_at', { ascending: false }),
    ]);

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Lead não encontrado' });
      throw error;
    }
    if (eC) throw eC;

    res.json({ ...lead, conversas: conversa || [] });
  } catch (err) {
    console.error('[GET /leads/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar lead' });
  }
});

// ── POST /api/leads ────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const parsed = criarLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });

    const { data, error } = await supabase
      .from('leads')
      .insert(parsed.data)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[POST /leads]', err);
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
});

// ── PATCH /api/leads/:id ───────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const parsed = editarLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: Object.entries(parsed.error.flatten().fieldErrors).map(([k,v]) => `${k}: ${v}`).join(", ") || "Dados inválidos" });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    const { data, error } = await supabase
      .from('leads')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Lead não encontrado' });
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error('[PATCH /leads/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// ── POST /api/leads/:id/assumir ────────────────────────────
// Dono assume pelo painel → handoff automático
router.post('/:id/assumir', async (req, res) => {
  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .select('id, atendimento_humano, contato, canal')
      .eq('id', req.params.id)
      .single();

    if (error || !lead) return res.status(404).json({ error: 'Lead não encontrado' });
    if (lead.atendimento_humano) return res.status(409).json({ error: 'Atendimento já transferido' });

    const resumo = req.body?.resumo || 'Dono assumiu o atendimento pelo painel.';
    await handoffAutomatico(lead.id, MOTIVOS.ASSUMIDO_PAINEL, resumo);

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /leads/:id/assumir]', err);
    res.status(500).json({ error: 'Erro ao assumir atendimento' });
  }
});

export default router;
