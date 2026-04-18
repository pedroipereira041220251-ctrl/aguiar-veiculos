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
    .select('*, veiculos:veiculo_interesse_id(modelo, ano, placa, cor, km, preco_venda)')
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

  const capacidadeConfirmada = ['carta_aprovada', 'a_vista_confirmado', 'comprovante_renda'].includes(lead.capacidade_financeira);

  const msg = [
    '🔔 *Lead qualificado — Score 4*',
    '',
    `👤 ${lead.nome || 'Sem nome'} · ${canalLabel(lead.canal)}`,
    `📞 Contato: ${lead.contato}`,
    `🚗 Interesse: ${veiculoLabel(lead)}`,
    `💳 Pagamento: ${lead.forma_pagamento || '—'}`,
    capacidadeConfirmada
      ? `💰 Capacidade: ${capacidadeLabel(lead.capacidade_financeira, lead.forma_pagamento)}`
      : lead.capacidade_observacao ? `💰 Capacidade: ${lead.capacidade_observacao}` : null,
    `📅 Prazo: ${lead.prazo_compra || '—'}`,
    '',
    `📝 Resumo:\n${montarResumoNarrativoScore4(lead)}`,
    '',
    '👉 Acesse o painel para assumir o atendimento.',
  ].filter(l => l !== null && l !== undefined).join('\n');

  try {
    await sendText(process.env.OWNER_PHONE_NUMBER, msg.trim());
  } catch (err) {
    console.error('[handoff/score4] Erro ao notificar dono:', err.message);
  }
}

// ── notificarCapacidadeAtualizada ──────────────────────────
// Dispara quando capacidade_observacao é definida pela 1ª vez num lead score 4
export async function notificarCapacidadeAtualizada(lead) {
  const msg = [
    '🔄 *Atualização — Lead score 4*',
    '',
    `👤 ${lead.nome || 'Sem nome'} · ${canalLabel(lead.canal)}`,
    `💰 Capacidade: ${lead.capacidade_observacao}`,
  ].join('\n');

  try {
    await sendText(process.env.OWNER_PHONE_NUMBER, msg.trim());
  } catch (err) {
    console.error('[handoff/capacidade] Erro ao notificar dono:', err.message);
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

function montarResumoNarrativoScore4(lead) {
  const nome = lead.nome || 'O cliente';
  const v = lead.veiculos;

  const partes = [];

  if (v) {
    const preco = v.preco_venda ? `R$ ${Number(v.preco_venda).toLocaleString('pt-BR')}` : null;
    const km    = v.km          ? `${Number(v.km).toLocaleString('pt-BR')} km`            : null;
    const vDesc = [v.modelo, v.ano, v.cor ? `(${v.cor})` : null, km ? `com ${km}` : null, preco ? `por ${preco}` : null]
      .filter(Boolean).join(' ');
    partes.push(`${nome} está interessado em um ${vDesc}.`);
  } else {
    partes.push(`${nome} está interessado em um veículo.`);
  }

  const pagamento = lead.forma_pagamento;
  const prazo     = lead.prazo_compra;
  if (prazo && pagamento) {
    partes.push(`Pretende comprar ${prazo} e pagar ${pagamento}.`);
  } else if (prazo) {
    partes.push(`Pretende comprar ${prazo}.`);
  } else if (pagamento) {
    partes.push(`Prefere pagar ${pagamento}.`);
  }

  const capacidadeConfirmada = ['carta_aprovada', 'a_vista_confirmado', 'comprovante_renda'].includes(lead.capacidade_financeira);
  if (capacidadeConfirmada) {
    partes.push(`Capacidade financeira: ${capacidadeLabel(lead.capacidade_financeira, pagamento)}.`);
  } else if (lead.capacidade_observacao) {
    partes.push(`Situação financeira: ${lead.capacidade_observacao}.`);
  }

  return partes.join(' ');
}

function montarMensagemDono(lead, motivo, resumo) {
  const score5Label = lead.capacidade_financeira === 'a_vista_confirmado'
    ? '✅ Score 5 — Valor à vista confirmado'
    : lead.capacidade_financeira === 'carta_aprovada'
      ? '✅ Score 5 — Carta de crédito aprovada'
      : lead.capacidade_financeira === 'comprovante_renda'
        ? '✅ Score 5 — Comprovante de renda'
        : '✅ Score 5 atingido';

  const motivoLabel = {
    [MOTIVOS.SCORE5]:          score5Label,
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
    `💰 Capacidade: ${capacidadeLabel(lead.capacidade_financeira, lead.forma_pagamento)}`,
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

function capacidadeLabel(cap, formaPagamento) {
  if (cap === 'sem_informacao' || !cap) {
    if (formaPagamento === 'financiamento') return '🔄 Buscando carta de crédito';
    if (formaPagamento === 'à vista')        return '🔄 Ainda juntando o valor';
    return '🔄 Ainda buscando';
  }
  const labels = {
    carta_aprovada:     '✅ Carta de crédito aprovada',
    comprovante_renda:  '📄 Comprovante de renda',
    a_vista_confirmado: '💵 À vista confirmado',
  };
  return labels[cap] || cap || '—';
}
