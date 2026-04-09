import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

// ── GET /api/alertas ───────────────────────────────────────
// Todos os alertas ativos — APENAS para painel e consulta do bot (seção 7.8)
// Tipos: ipva_vencendo | docs_pendentes | veiculo_parado
// Ordenados por urgência: IPVA (vermelho) > docs (amarelo) > parados (amarelo)
router.get('/', async (req, res) => {
  try {
    const { data: cfg } = await supabase
      .from('configuracoes')
      .select('alerta_ipva_dias, alerta_parado_dias')
      .eq('id', 1)
      .single();

    const diasIpva   = cfg?.alerta_ipva_dias   || 15;
    const diasParado = cfg?.alerta_parado_dias  || 45;

    const hoje        = new Date().toISOString().slice(0, 10);
    const limiteIpva  = new Date(Date.now() + diasIpva * 86_400_000).toISOString().slice(0, 10);
    const limiteParado = new Date(Date.now() - diasParado * 86_400_000).toISOString();

    // Buscar os três tipos em paralelo
    const [{ data: ipvaDocs }, { data: docsRaw }, { data: parados }] = await Promise.all([
      // IPVA vencendo nos próximos N dias
      supabase
        .from('documentacao_veiculo')
        .select('ipva_vencimento, veiculo:veiculo_id ( id, placa, modelo, ano, status )')
        .not('ipva_vencimento', 'is', null)
        .gte('ipva_vencimento', hoje)
        .lte('ipva_vencimento', limiteIpva),

      // Documentação com campos false em veículos disponíveis/reservados
      supabase
        .from('documentacao_veiculo')
        .select('veiculo_id, transferencia_ok, laudo_vistoria_ok, dut_ok, crlv_ok, veiculo:veiculo_id ( id, placa, modelo, ano, status )')
        .or('transferencia_ok.eq.false,laudo_vistoria_ok.eq.false,dut_ok.eq.false,crlv_ok.eq.false'),

      // Veículos disponíveis sem movimentação há N dias
      supabase
        .from('veiculos')
        .select('id, placa, modelo, ano, updated_at')
        .eq('status', 'disponivel')
        .lte('updated_at', limiteParado),
    ]);

    const alertas = [];

    // ── IPVA ──────────────────────────────────────────────
    for (const doc of (ipvaDocs || [])) {
      if (doc.veiculo?.status === 'inativo' || doc.veiculo?.status === 'vendido') continue;

      const diasRestantes = Math.ceil(
        (new Date(doc.ipva_vencimento) - new Date(hoje)) / 86_400_000
      );

      alertas.push({
        tipo:       'ipva_vencendo',
        urgencia:   'alta',
        cor:        'vermelho',
        veiculo_id: doc.veiculo?.id,
        placa:      doc.veiculo?.placa,
        descricao:  `${doc.veiculo?.modelo} ${doc.veiculo?.ano} — IPVA vence em ${diasRestantes} dia(s) (${doc.ipva_vencimento})`,
        data_ref:   doc.ipva_vencimento,
      });
    }

    // ── Docs pendentes ────────────────────────────────────
    for (const doc of (docsRaw || [])) {
      if (doc.veiculo?.status === 'inativo' || doc.veiculo?.status === 'vendido') continue;

      const pendentes = [];
      if (!doc.transferencia_ok)   pendentes.push('Transferência');
      if (!doc.laudo_vistoria_ok)  pendentes.push('Laudo de vistoria');
      if (!doc.dut_ok)             pendentes.push('DUT');
      if (!doc.crlv_ok)            pendentes.push('CRLV');
      if (!pendentes.length)       continue;

      alertas.push({
        tipo:       'docs_pendentes',
        urgencia:   'media',
        cor:        'amarelo',
        veiculo_id: doc.veiculo?.id,
        placa:      doc.veiculo?.placa,
        descricao:  `${doc.veiculo?.modelo} ${doc.veiculo?.ano} — Docs pendentes: ${pendentes.join(', ')}`,
        pendentes,
      });
    }

    // ── Veículos parados ──────────────────────────────────
    for (const v of (parados || [])) {
      const diasParadoReal = Math.floor(
        (Date.now() - new Date(v.updated_at).getTime()) / 86_400_000
      );
      alertas.push({
        tipo:       'veiculo_parado',
        urgencia:   'media',
        cor:        'amarelo',
        veiculo_id: v.id,
        placa:      v.placa,
        descricao:  `${v.modelo} ${v.ano} — Sem movimentação há ${diasParadoReal} dias`,
        dias_parado: diasParadoReal,
      });
    }

    // Ordenar: alta urgência primeiro, depois por descrição
    alertas.sort((a, b) => {
      if (a.urgencia === 'alta' && b.urgencia !== 'alta') return -1;
      if (b.urgencia === 'alta' && a.urgencia !== 'alta') return  1;
      return a.descricao.localeCompare(b.descricao);
    });

    res.json(alertas);
  } catch (err) {
    console.error('[GET /alertas]', err);
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
});

export default router;
