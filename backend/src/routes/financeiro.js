import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

// ── GET /api/financeiro/resumo ─────────────────────────────
// Receita, lucro_real, margem e qtd vendas do mês. Query: mes=YYYY-MM
router.get('/resumo', async (req, res) => {
  try {
    const mes = req.query.mes || mesAtual();
    const { ini, fim } = limitesMes(mes);

    const { data: vendas, error } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('preco_venda_final, lucro_real, preco_compra, total_custos')
      .eq('status', 'vendido')
      .gte('data_venda', ini)
      .lte('data_venda', fim);

    if (error) throw error;

    const qtd     = vendas?.length || 0;
    const receita = soma(vendas, 'preco_venda_final');
    const lucro   = soma(vendas, 'lucro_real');
    const margem  = receita > 0 ? +((lucro / receita) * 100).toFixed(2) : 0;

    res.json({ mes, qtd_vendas: qtd, receita, lucro_real: lucro, margem_pct: margem });
  } catch (err) {
    console.error('[GET /financeiro/resumo]', err);
    res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
});

// ── GET /api/financeiro/ranking ────────────────────────────
// Vendas ordenadas por lucro_real DESC. Query: mes=YYYY-MM
router.get('/ranking', async (req, res) => {
  try {
    const mes = req.query.mes || mesAtual();
    const { ini, fim } = limitesMes(mes);

    const { data, error } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('id, placa, marca, modelo, ano, preco_venda_final, preco_compra, total_custos, lucro_real, margem_pct, data_venda')
      .eq('status', 'vendido')
      .gte('data_venda', ini)
      .lte('data_venda', fim)
      .order('lucro_real', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[GET /financeiro/ranking]', err);
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

// ── GET /api/financeiro/estoque ────────────────────────────
// Investimento total e lucro_estimado do estoque atual
router.get('/estoque', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_veiculos_com_financeiro')
      .select('id, placa, modelo, ano, investimento_total, lucro_estimado, margem_pct, preco_venda')
      .eq('status', 'disponivel');

    if (error) throw error;

    const total_investido  = soma(data, 'investimento_total');
    const lucro_estimado   = soma(data, 'lucro_estimado');
    const margem_media     = data?.length
      ? +(data.reduce((s, v) => s + Number(v.margem_pct || 0), 0) / data.length).toFixed(2)
      : 0;

    res.json({
      qtd_veiculos:   data?.length || 0,
      total_investido,
      lucro_estimado,
      margem_media,
      veiculos: data || [],
    });
  } catch (err) {
    console.error('[GET /financeiro/estoque]', err);
    res.status(500).json({ error: 'Erro ao buscar dados do estoque' });
  }
});

// ── GET /api/financeiro/categorias ────────────────────────
// Custos agrupados por tipo. Query: mes=YYYY-MM (opcional)
router.get('/categorias', async (req, res) => {
  try {
    let query = supabase
      .from('custos_veiculo')
      .select('tipo, valor, data_custo');

    if (req.query.mes) {
      const { ini, fim } = limitesMes(req.query.mes);
      query = query.gte('data_custo', ini).lte('data_custo', fim);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Agrupar por tipo
    const grupos = {};
    for (const c of (data || [])) {
      if (!grupos[c.tipo]) grupos[c.tipo] = { tipo: c.tipo, total: 0, qtd: 0 };
      grupos[c.tipo].total += Number(c.valor);
      grupos[c.tipo].qtd   += 1;
    }

    const resultado = Object.values(grupos).sort((a, b) => b.total - a.total);
    res.json(resultado);
  } catch (err) {
    console.error('[GET /financeiro/categorias]', err);
    res.status(500).json({ error: 'Erro ao buscar categorias de custos' });
  }
});

// ── Helpers ────────────────────────────────────────────────
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function limitesMes(mes) {
  // mes = 'YYYY-MM'
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return { ini: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

function soma(arr, campo) {
  return +(arr || []).reduce((s, v) => s + Number(v[campo] || 0), 0).toFixed(2);
}

export default router;
