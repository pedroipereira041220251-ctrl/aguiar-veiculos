import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

const COMISSAO_PCT = 0.10; // 10%

// ── GET /api/vendedores ────────────────────────────────────
// Resumo por vendedor: qtd vendas, receita total, comissão acumulada
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('veiculos')
      .select('nome_vendedor, preco_venda_final, data_venda')
      .eq('status', 'vendido')
      .not('nome_vendedor', 'is', null)
      .neq('nome_vendedor', '');
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
