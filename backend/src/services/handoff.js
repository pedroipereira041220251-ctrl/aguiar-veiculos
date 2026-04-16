import supabase from '../db/supabase.js';
import { sendText } from './waClient.js';

// ── Motivos de handoff ─────────────────────────────────────
export const MOTIVOS = {
  SCORE5:          'score5',
  PEDIDO_CLIENTE:  'pedido_cliente',
  FOTO_ENTRADA:    'foto_entrada',
  ASSUMIDO_PAINEL: 'assumido_painel',
};

// ── handoffAutomatico ──────────────────────────────────────
// Transferência definitiva — agente para permanentemente
// Regras PRD seção 4.2 e 8.1:
//   1. PATCH leads: atendimento_humano=true + resumo_agente
//   2. Enviar resumo ao dono via WhatsApp APENAS (nunca Telegram)
//   3. Enviar mensagem ao cliente
//
// atendimento_humano=true NUNCA é revertido pelo sistema
export async function handoffAutomatico(leadId, motivo, resumo) {
  // 1. Buscar dados do lead para montar a mensagem
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*, veiculos:veiculo_interesse_id(modelo, ano, placa)')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    console.error('[handoff] Lead não encontrado:', leadId, error);
    return;
  }

  // 2. Setar atendimento_humano=true — PERMANENTE, nunca revertido
  const update = { atendimento_humano: true, resumo_agente: resumo };
  if (motivo === MOTIVOS.SCORE5) update.score_qualificacao = 5;
  const { error: patchError } = await supabase
    .from('leads')
    .update(update)
    .eq('id', leadId);

  if (patchError) {
    console.error('[handoff] Erro ao atualizar lead:', patchError);
    return;
  }

  // 3. Enviar resumo ao dono via WhatsApp (APENAS WA — seção 8.1)
  const msgDono = montarMensagemDono(lead, motivo, resumo);
  try {
    await sendText(process.env.OWNER_PHONE_NUMBER, msgDono);
  } catch (err) {
    console.error('[handoff] Erro ao notificar dono WA:', err.message);
  }

  // 4. Enviar mensagem ao cliente no canal correto
  // (agente.js cuida do envio para o canal do cliente;
  //  handoff.js apenas sinaliza — a mensagem ao cliente é enviada pelo agente)
  return { ok: true, lead };
}

// ── notificarScore4 ────────────────────────────────────────
// Score 4: apenas notifica dono via WhatsApp — agente NÃO para
// atendimento_humano permanece false
export async function notificarScore4(leadId, resumo) {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*, veiculos:veiculo_interesse_id(modelo, ano, placa)')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    console.error('[handoff/score4] Lead não encontrado:', leadId);
    return;
  }

  // Garantir score 4 salvo no banco (inclui null, pois null < 4 não funciona no JS)
  if (!lead.score_qualificacao || lead.score_qualificacao < 4) {
    await supabase.from('leads').update({ score_qualificacao: 4 }).eq('id', leadId);
  }

  const msg = [
    '🔔 *Lead qualificado — Score 4*',
    '',
    `👤 ${lead.nome || 'Sem nome'} · ${canalLabel(lead.canal)}`,
    `📞 Contato: ${lead.contato}`,
    `🚗 Interesse: ${veiculoLabel(lead)}`,
    `💳 Pagamento: ${lead.forma_pagamento || '—'}`,
    `💰 Capacidade: ${capacidadeLabel(lead.capacidade_financeira)}`,
    `📅 Prazo: ${lead.prazo_compra || '—'}`,
    '',
    resumo ? `📝 ${resumo}` : '',
    '',
    '👉 Acesse o painel para assumir o atendimento.',
  ].filter(l => l !== undefined).join('\n');

  try {
    await sendText(process.env.OWNER_PHONE_NUMBER, msg.trim());
  } catch (err) {
    console.error('[handoff/score4] Erro ao notificar dono:', err.message);
  }
}

// ── notificarFotoEntrada ───────────────────────────────────
// Aviso de foto de entrada: vai para WhatsApp E Telegram (seção 8.1)
// Chamado pelo agente antes do handoffAutomatico
export async function notificarFotoEntrada({ fotoUrl, modelo, ano, km, condicao, contatoCliente }) {
  const msg = [
    '📸 *Foto de veículo de entrada recebida*',
    '',
    `👤 Cliente: ${contatoCliente}`,
    `🚗 Veículo: ${modelo || '?'} ${ano || '?'}`,
    `📍 KM: ${km || '?'} · Condição: ${condicao || '?'}`,
    '',
    '👉 Avalie e entre em contato para negociação.',
  ].join('\n');

  // WhatsApp
  try {
    await sendText(process.env.OWNER_PHONE_NUMBER, msg);
    if (fotoUrl) {
      const { sendImage } = await import('./waClient.js');
      await sendImage(process.env.OWNER_PHONE_NUMBER, fotoUrl, 'Veículo de entrada');
    }
  } catch (err) {
    console.error('[handoff/fotoEntrada] Erro WA:', err.message);
  }

  // Telegram — importado dinamicamente para evitar dependência circular
  try {
    const { sendMessage: tgSend } = await import('./telegramClient.js');
    await tgSend(process.env.TELEGRAM_OWNER_CHAT_ID, msg);
  } catch (err) {
    console.error('[handoff/fotoEntrada] Erro Telegram:', err.message);
  }
}

// ── Helpers ────────────────────────────────────────────────
function montarMensagemDono(lead, motivo, resumo) {
  const motivoLabel = {
    [MOTIVOS.SCORE5]:          '✅ Score 5 atingido (carta de crédito aprovada)',
    [MOTIVOS.PEDIDO_CLIENTE]:  '🙋 Cliente pediu falar com humano',
    [MOTIVOS.FOTO_ENTRADA]:    '📸 Cliente enviou foto de veículo de entrada',
    [MOTIVOS.ASSUMIDO_PAINEL]: '👆 Dono assumiu pelo painel',
  }[motivo] || motivo;

  return [
    '🤝 *Transferência de atendimento*',
    `Motivo: ${motivoLabel}`,
    '',
    `👤 ${lead.nome || 'Sem nome'} · ${canalLabel(lead.canal)}`,
    `📞 Contato: ${lead.contato}`,
    `🚗 Interesse: ${veiculoLabel(lead)}`,
    `💳 Pagamento: ${lead.forma_pagamento || '—'}`,
    `💰 Capacidade: ${capacidadeLabel(lead.capacidade_financeira)}`,
    `📅 Prazo: ${lead.prazo_compra || '—'}`,
    '',
    resumo ? `📝 Resumo:\n${resumo}` : '',
    '',
    '⚠️ O agente foi desativado para este contato.',
  ].filter(l => l !== undefined).join('\n').trim();
}

function canalLabel(canal) {
  return canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
}

function veiculoLabel(lead) {
  if (lead.veiculos) return `${lead.veiculos.modelo} ${lead.veiculos.ano} (${lead.veiculos.placa})`;
  return '—';
}

function capacidadeLabel(cap) {
  const labels = {
    carta_aprovada:       '✅ Carta de crédito aprovada',
    comprovante_renda:    '📄 Comprovante de renda',
    a_vista_confirmado:   '💵 À vista confirmado',
    sem_informacao:       '❓ Sem informação',
  };
  return labels[cap] || cap || '—';
}
