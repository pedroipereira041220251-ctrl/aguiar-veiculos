import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

const COMISSAO_PCT = 0.10; // 10%

// ── GET /api/vendedores ────────────────────────────────────
// Resumo por vendedor: qtd vendas, receita total, comissão acumulada
// Query: mes=YYYY-MM (opcional)
router.get('/', async (req, res) => {
  try {
    const mes = req.query.mes; // "2026-04" ou undefined

    let query = supabase
      .from('veiculos')
      .select('nome_vendedor, preco_venda_final, data_venda')
      .eq('status', 'vendido')
      .not('nome_vendedor', 'is', null)
      .neq('nome_vendedor', '');

    if (mes) {
      const [ano, m] = mes.split('-');
      const ini = `${ano}-${m}-01`;
      const fim = new Date(Number(ano), Number(m), 0).toISOString().slice(0, 10); // último dia do mês
      query = query.gte('data_venda', ini).lte('data_venda', fim);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Agrupar em memória
    const map = {};
    for (const v of (data || [])) {
      const nome = v.nome_vendedor.trim();
      if (!map[nome]) map[nome] = { nome_vendedor: nome, qtd_vendas: 0, total_vendas: 0 };
      map[nome].qtd_vendas += 1;
      map[nome].total_vendas += Number(v.preco_venda_final || 0);
    }

    const lista = Object.values(map)
      .map(v => ({ ...v, comissao: v.total_vendas * COMISSAO_PCT }))
      .sort((a, b) => b.total_vendas - a.total_vendas);

    res.json(lista);
  } catch (err) {
    console.error('[GET /vendedores]', err);
    res.status(500).json({ error: 'Erro ao listar vendedores' });
  }
});

// ── GET /api/vendedores/cadastro ──────────────────────────
// Lista vendedores cadastrados
router.get('/cadastro', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vendedores')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[GET /vendedores/cadastro]', err);
    res.status(500).json({ error: 'Erro ao listar vendedores cadastrados' });
  }
});

// ── POST /api/vendedores/cadastro ─────────────────────────
// Cadastrar novo vendedor
router.post('/cadastro', async (req, res) => {
  try {
    const nome = (req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const { data, error } = await supabase
      .from('vendedores')
      .insert({ nome })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Vendedor já cadastrado' });
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error('[POST /vendedores/cadastro]', err);
    res.status(500).json({ error: 'Erro ao cadastrar vendedor' });
  }
});

// ── DELETE /api/vendedores/cadastro/:id ───────────────────
// Remover vendedor (soft delete)
router.delete('/cadastro/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('vendedores')
      .update({ ativo: false })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /vendedores/cadastro/:id]', err);
    res.status(500).json({ error: 'Erro ao remover vendedor' });
  }
});

// ── GET /api/vendedores/:nome ──────────────────────────────
// Vendas individuais de um vendedor
router.get('/:nome', async (req, res) => {
  try {
    const nome = decodeURIComponent(req.params.nome);
    const { data, error } = await supabase
      .from('veiculos')
      .select('id, placa, modelo, ano, data_venda, preco_venda_final, nome_comprador')
      .eq('status', 'vendido')
      .eq('nome_vendedor', nome)
      .order('data_venda', { ascending: false });
    if (error) throw error;

    const vendas = (data || []).map(v => ({
      ...v,
      comissao: Number(v.preco_venda_final || 0) * COMISSAO_PCT,
    }));

    res.json(vendas);
  } catch (err) {
    console.error('[GET /vendedores/:nome]', err);
    res.status(500).json({ error: 'Erro ao buscar vendas do vendedor' });
  }
});

export default router;
