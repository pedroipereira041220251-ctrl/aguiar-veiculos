/**
 * resumoSemanal.js — Cron job: todo sábado às 18h (America/Sao_Paulo)
 * Conteúdo (seção 5.8):
 *   • Vendas da semana: qtd, receita total, lucro_real total
 *   • Leads recebidos: qtd por canal, qtd transferidos ao dono
 *   • Estoque atual: disponíveis, reservados, total investido
 *   • Alertas ativos: qtd IPVA, docs, parados
 * Enviado via WhatsApp E Telegram
 */

import cron from 'node-cron';
import supabase from '../db/supabase.js';
import { sendText } from './waClient.js';
import { sendMessage as tgSend } from './telegramClient.js';

// Sábado às 18h no fuso America/Sao_Paulo (ao fechar a loja)
// cron: minuto hora dia-mes mes dia-semana
// dia-semana 6 = sábado
const CRON_EXPR = '0 18 * * 6';

export function iniciarCronResumoSemanal() {
  cron.schedule(CRON_EXPR, async () => {
    console.log('[resumoSemanal] Iniciando resumo semanal...');
    try {
      await enviarResumoSemanal();
    } catch (err) {
      console.error('[resumoSemanal] Erro:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[resumoSemanal] Cron agendado — sábados às 18h (America/Sao_Paulo)');
}

export async function enviarResumoSemanal() {
  const { data: cfg } = await supabase
    .from('configuracoes')
    .select('owner_phone_number, resumo_semanal_ativo')
    .eq('id', 1)
    .single();

  if (!cfg?.resumo_semanal_ativo) {
    console.log('[resumoSemanal] Resumo semanal desativado nas configurações.');
    return;
  }

  const mensagem = await montarResumo();

  // WhatsApp
  const ownerPhone = cfg.owner_phone_number || process.env.OWNER_PHONE_NUMBER;
  if (ownerPhone) {
    await sendText(ownerPhone, mensagem).catch(err =>
      console.error('[resumoSemanal] Erro WA:', err.message)
    );
  }

  // Telegram
  const tgChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (tgChatId) {
    await tgSend(tgChatId, mensagem).catch(err =>
      console.error('[resumoSemanal] Erro Telegram:', err.message)
    );
  }

  console.log('[resumoSemanal] Resumo enviado.');
}

async function montarResumo() {
  const agora  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const ini7d  = new Date(agora - 7 * 86_400_000).toISOString();
  const hoje   = agora.toISOString().slice(0, 10);

  const [vendas, leadsWA, leadsIG, leadsTransf, estoque, alertasRes] = await Promise.all([
    // Vendas da semana
    supabase
      .from('vw_veiculos_com_financeiro')
      .select('preco_venda_final, lucro_real')
      .eq('status', 'vendido')
      .gte('data_venda', ini7d.slice(0, 10)),

    // Leads WhatsApp da semana
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'whatsapp')
      .gte('created_at', ini7d),

    // Leads Instagram da semana
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'instagram')
      .gte('created_at', ini7d),

    // Leads transferidos ao dono na semana
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('atendimento_humano', true)
      .gte('ultima_interacao', ini7d),

    // Estoque atual
    supabase
      .from('vw_veiculos_com_financeiro')
      .select('status, investimento_total')
      .neq('status', 'inativo'),

    // Alertas (reutilizar lógica)
    buscarResumoAlertas(hoje),
  ]);

  // ── Vendas ─────────────────────────────────────────────
  const qtdVendas  = vendas.data?.length || 0;
  const receita    = soma(vendas.data, 'preco_venda_final');
  const lucroReal  = soma(vendas.data, 'lucro_real');

  // ── Leads ──────────────────────────────────────────────
  const qtdWA     = leadsWA.count  || 0;
  const qtdIG     = leadsIG.count  || 0;
  const qtdTransf = leadsTransf.count || 0;

  // ── Estoque ────────────────────────────────────────────
  const disponíveis = (estoque.data || []).filter(v => v.status === 'disponivel');
  const reservados  = (estoque.data || []).filter(v => v.status === 'reservado');
  const totalInv    = soma(disponíveis, 'investimento_total');

  // ── Montar mensagem ────────────────────────────────────
  const linhas = [
    `📊 *Resumo Semanal — Aguiar Veículos*`,
    `_Semana encerrada em ${hoje}_`,
    ``,
    `🏷️ *Vendas da semana*`,
    `Quantidade: ${qtdVendas}`,
    `Receita: ${fmt(receita)}`,
    `Lucro real: ${fmt(lucroReal)}`,
    ``,
    `👥 *Leads recebidos*`,
    `WhatsApp: ${qtdWA} · Instagram: ${qtdIG}`,
    `Transferidos ao dono: ${qtdTransf}`,
    ``,
    `📦 *Estoque atual*`,
    `Disponíveis: ${disponíveis.length} · Reservados: ${reservados.length}`,
    `Total investido: ${fmt(totalInv)}`,
    ``,
    `🔔 *Alertas ativos*`,
    alertasRes,
    ``,
    `_Ver detalhes no painel._`,
  ];

  return linhas.join('\n');
}

async function buscarResumoAlertas(hoje) {
  const { data: cfg } = await supabase
    .from('configuracoes')
    .select('alerta_ipva_dias, alerta_parado_dias')
    .eq('id', 1)
    .single();

  const diasIpva   = cfg?.alerta_ipva_dias   || 15;
  const diasParado = cfg?.alerta_parado_dias  || 45;
  const limiteIpva  = new Date(Date.now() + diasIpva * 86_400_000).toISOString().slice(0, 10);
  const limiteParado = new Date(Date.now() - diasParado * 86_400_000).toISOString();

  const [{ count: qtdIpva }, { data: docs }, { count: qtdParados }] = await Promise.all([
    supabase
      .from('documentacao_veiculo')
      .select('id', { count: 'exact', head: true })
      .not('ipva_vencimento', 'is', null)
      .gte('ipva_vencimento', hoje)
      .lte('ipva_vencimento', limiteIpva),

    supabase
      .from('documentacao_veiculo')
      .select('transferencia_ok, laudo_vistoria_ok, dut_ok, crlv_ok'),

    supabase
      .from('veiculos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'disponivel')
      .lte('updated_at', limiteParado),
  ]);

  const qtdDocs = (docs || []).filter(
    d => !d.transferencia_ok || !d.laudo_vistoria_ok || !d.dut_ok || !d.crlv_ok
  ).length;

  if (!qtdIpva && !qtdDocs && !qtdParados) return 'Nenhum alerta ativo ✅';

  const partes = [];
  if (qtdIpva)   partes.push(`IPVA urgente: ${qtdIpva}`);
  if (qtdDocs)   partes.push(`Docs pendentes: ${qtdDocs}`);
  if (qtdParados) partes.push(`Veículos parados: ${qtdParados}`);
  return partes.join(' · ');
}

function soma(arr, campo) {
  return +((arr || []).reduce((s, v) => s + Number(v[campo] || 0), 0)).toFixed(2);
}

function fmt(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
