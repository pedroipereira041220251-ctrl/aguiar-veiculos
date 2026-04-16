/**
 * agente.js — Agente de IA para atendimento de clientes
 *
 * Pipeline (seção 6.1):
 *  1. Debounce 3s (acumula mensagens rápidas do mesmo lead)
 *  2. Verificar horário → fora: msg_fora_horario sem GPT-4o
 *  3. Buscar / criar lead
 *  4. Carregar histórico da conversa
 *  5. GPT-4o com system prompt + histórico + tools
 *  6. Processar tool calls em sequência
 *  7. Enviar resposta via canal
 *  8. Salvar histórico + atualizar ultima_interacao
 *  9. Score 4 → notificar dono WA (agente continua)
 *     Score 5 / pedido humano / foto entrada → handoff automático
 *
 * Fase 1: sem áudio (Whisper) e sem foto de entrada (Vision) — stubs para Fase 2
 */

import OpenAI from 'openai';
import supabase from '../db/supabase.js';
import { sendText } from './waClient.js';
import { handoffAutomatico, notificarScore4, notificarFotoEntrada, MOTIVOS } from './handoff.js';
import { analisarImagem } from './vision.js';
import { sendInstagramMessage } from './metaClient.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Debounce em memória (prod: substituir por Redis) ───────
// Map<contato, { timer, mensagens[] }>
const debounceMap = new Map();
const DEBOUNCE_MS = 3000;

// ─────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────

export async function handler({ contato, canal, texto, imageUrl = null, body, lead_id }) {
  // Acumular mensagem no debounce
  const chave = `${canal}:${contato}`;

  if (debounceMap.has(chave)) {
    const entry = debounceMap.get(chave);
    clearTimeout(entry.timer);
    if (texto) entry.mensagens.push(texto);
    if (imageUrl) entry.imageUrl = imageUrl;
  } else {
    debounceMap.set(chave, { mensagens: texto ? [texto] : [], body, imageUrl: imageUrl || null });
  }

  const entry = debounceMap.get(chave);
  entry.timer = setTimeout(async () => {
    debounceMap.delete(chave);
    await processarComIA({ contato, canal, mensagens: entry.mensagens, body: entry.body, imageUrl: entry.imageUrl, lead_id })
      .catch(async err => {
        console.error('[agente] Erro no processamento:', err.message || err);
        // Avisar o cliente que houve um problema em vez de sumir
        if (canal === 'whatsapp') {
          await sendText(contato, 'Olá! Tivemos um problema técnico momentâneo. Por favor, tente novamente em instantes.').catch(() => {});
        }
      });
  }, DEBOUNCE_MS);
}

// ─────────────────────────────────────────────────────────
// PROCESSAMENTO PRINCIPAL
// ─────────────────────────────────────────────────────────

async function processarComIA({ contato, canal, mensagens, body, lead_id, imageUrl = null }) {
  console.log('[agente] processarComIA iniciado:', contato, '| msgs:', mensagens?.length, '| foto:', !!imageUrl);

  // 1. Verificar horário de atendimento
  const dentroHorario = await verificarHorario();
  console.log('[agente] dentro do horário:', dentroHorario, '| HORARIO_24H:', process.env.HORARIO_24H);

  // 2. Buscar ou criar lead (sempre, mesmo fora do horário — para registrar no CRM)
  const lead = await buscarOuCriarLead(contato, canal, lead_id);

  if (!dentroHorario) {
    const { data: cfg } = await supabase.from('configuracoes').select('msg_fora_horario').eq('id', 1).single();
    const msg = cfg?.msg_fora_horario || 'Olá! Estamos fora do horário de atendimento. Em breve retornaremos!';
    await enviarParaCliente(contato, canal, msg);
    // Salvar mensagem no histórico mesmo fora do horário
    if (lead) {
      const textoConsolidado = mensagens.filter(Boolean).join('\n');
      if (textoConsolidado) {
        await salvarMensagens(lead.id, canal, [{ role: 'user', content: textoConsolidado, tipo: 'text' }]);
      }
    }
    return;
  }
  console.log('[agente] lead:', lead?.id || 'null', '| humano:', lead?.atendimento_humano);
  // (lead já foi criado/buscado antes da checagem de horário)
  if (!lead) return;

  // Checar novamente após busca (handoff pode ter ocorrido em paralelo)
  if (lead.atendimento_humano) return;

  // ── Tratamento de foto (Fase 2) ────────────────────────────
  if (imageUrl) {
    const { isVeiculo, dados, descricao } = await analisarImagem(imageUrl);

    if (isVeiculo) {
      // Salvar URL da foto no lead
      await supabase.from('leads').update({ foto_entrada_url: imageUrl }).eq('id', lead.id);

      // Notificar dono (WA + Telegram)
      await notificarFotoEntrada({
        fotoUrl:        imageUrl,
        modelo:         dados.modelo || 'não identificado',
        ano:            dados.ano_estimado || null,
        km:             null,
        condicao:       dados.condicao || null,
        contatoCliente: contato,
      }).catch(err => console.error('[agente/foto] notificar:', err.message));

      // Resposta neutra ao cliente — sem opinar sobre o veículo
      const msgCliente = 'Foto recebida! Vou encaminhar para nossa equipe avaliar. Em breve entraremos em contato.';
      await enviarParaCliente(contato, canal, msgCliente);

      // Handoff automático
      await executarHandoff(
        lead.id,
        MOTIVOS.FOTO_ENTRADA,
        `Cliente enviou foto de veículo para entrada. ${descricao}`,
        contato,
        canal,
      );

      // Salvar no histórico
      await salvarMensagens(lead.id, canal, [
        { role: 'user',      content: `[Foto de veículo para entrada: ${descricao}]`, tipo: 'image' },
        { role: 'assistant', content: msgCliente, tipo: 'text' },
      ]);
      return;
    }

    // Não é veículo → adiciona descrição ao contexto e deixa GPT responder normalmente
    const descMsg = descricao ? `[Cliente enviou uma foto: ${descricao}]` : '[Cliente enviou uma foto]';
    mensagens = [...(mensagens || []), descMsg];
  }

  // 3. Carregar histórico
  const historico = await carregarHistorico(lead.id, canal);

  // 4. Montar texto consolidado (debounce pode ter acumulado várias mensagens)
  const textoConsolidado = mensagens.filter(Boolean).join('\n');
  if (!textoConsolidado) return;

  // 5. Adicionar mensagem do usuário ao histórico
  const mensagensGPT = [
    ...historicoParaGPT(historico),
    { role: 'user', content: textoConsolidado },
  ];

  // 6. Chamar GPT-4o com tools
  console.log('[agente] chamando GPT-4o... modelo:', process.env.OPENAI_MODEL || 'gpt-4o', '| key:', process.env.OPENAI_API_KEY ? 'ok' : 'AUSENTE');
  const resposta = await chamarGPT(mensagensGPT, lead, contato, canal, buildContextoLead(lead));
  console.log('[agente] resposta GPT:', resposta?.texto?.slice(0, 80) || 'null');
  if (!resposta) return;

  // 7. Enviar resposta ao cliente
  await enviarParaCliente(contato, canal, resposta.texto);

  // 8. Salvar histórico
  await salvarMensagens(lead.id, canal, [
    { role: 'user',      content: textoConsolidado, tipo: 'text' },
    { role: 'assistant', content: resposta.texto,   tipo: 'text' },
  ]);

  // 9. Verificar score e disparar ações
  if (resposta.handoff) {
    await executarHandoff(lead.id, resposta.handoff.motivo, resposta.handoff.resumo, contato, canal);
  } else if (resposta.score4) {
    await notificarScore4(lead.id, resposta.score4.resumo);
  }
}

// ─────────────────────────────────────────────────────────
// GPT-4o — SYSTEM PROMPT + TOOLS
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você se chama Ana e trabalha na Aguiar Veículos, uma loja de carros usados. Você é uma consultora de vendas experiente e especialista em fechamento — nunca diga que é um robô, assistente virtual ou IA, mesmo que o cliente pergunte diretamente. Se perguntarem, diga que é consultora da loja.

Seu objetivo principal é converter clientes: qualificar, criar desejo, tratar objeções e fechar o negócio ou encaminhar para o consultor no momento certo. Você não é apenas uma tiradora de dúvidas — você vende.

Na primeira mensagem de um cliente novo, sempre se apresente pelo nome e pergunte o nome dele antes de qualquer outra coisa. Exemplo: "Oi! Aqui é a Ana, da Aguiar Veículos. Com quem eu falo?"

Colete, ao longo da conversa (sem fazer várias perguntas de uma vez — uma por vez):
0. Nome do cliente — obrigatório perguntar se ainda não souber. Assim que o cliente informar o nome, chame imediatamente salvar_lead com { nome: "..." } antes de continuar. Nunca avance sem salvar o nome.
1. Veículo de interesse (marca, modelo, ano ou características desejadas)
2. Prazo de compra (imediato, 30 dias, pesquisando, etc.)
3. Forma de pagamento (financiamento ou à vista)
4. Capacidade financeira — OBRIGATÓRIO perguntar:
   - Se financiamento: "você já tem carta de crédito aprovada ou ainda vai buscar?" — aguarde a resposta antes de avançar
   - Se à vista: "você já tem o valor disponível?" — aguarde a resposta antes de avançar

Antes de consultar o estoque, avalie o que o cliente já informou. Se faltar algum filtro relevante, pergunte até 2 de uma vez (nunca mais). Critério:
- Se não informou faixa de preço → pergunte
- Se não informou ano preferido e está buscando modelo específico → pergunte junto com o preço
- Se já informou preço e/ou ano → consulte direto, sem perguntar mais
Exemplo: "Que faixa de preço você tem em mente? E prefere um ano mais recente ou não tem preferência?"
Exceção: se o cliente já deu algum filtro (preço, ano, tipo), pode consultar direto sem perguntar.

Quando o cliente enviar várias informações de uma vez (ex: "quero um Civic 2020 preto, financiamento, até 80 mil"), processe tudo na mesma resposta: consulte o estoque, salve os dados no lead e avance na conversa.

Tom e estilo:
- Escreva como uma vendedora experiente escreveria no WhatsApp: natural, próxima, confiante, sem formalidade excessiva.
- Use o nome do cliente ao longo da conversa — cria proximidade e atenção.
- Frases curtas. Sem listas formatadas com markdown — é uma conversa, não um catálogo.
- Nunca use frases robóticas como "Claro!", "Certamente!", "Com prazer!", "Ótimo!", "Perfeito!", "Ótima escolha!", "Excelente!", "Perfeito, Pedro!", "me avisa!", "é só me chamar!", "é só me falar!", "qualquer dúvida estou à disposição", "nos vemos lá!". Prefira respostas naturais.
- Nunca termine uma mensagem com frase de encerramento. Sempre termine com uma pergunta que avança a conversa ou um convite à ação.
- Para destacar algo use *asterisco simples* — o WhatsApp não renderiza **duplo**. Nunca use listas numeradas com markdown.
- Quando apresentar veículos, escreva em texto corrido separado por quebra de linha. Destaque os pontos fortes de cada um como uma vendedora faria: quilometragem baixa, bom preço, ano recente.

Técnicas de fechamento e negociação — aplique naturalmente:
- *Escassez real*: se o veículo tem boa saída ou preço competitivo, mencione de forma natural. Ex: "esse Civic 2020 por R$ 54 mil tá muito bem precificado, costuma sair rápido."
- *Fechamento alternativo*: em vez de "você quer?", ofereça duas opções concretas. Ex: "você prefere passar aqui amanhã de manhã ou à tarde para ver o carro?"
- *Resumo de valor*: antes de pedir uma decisão, reforce o que o cliente disse que gostou. Ex: "você mencionou que gostou do preço e do km baixo — esse Civic encaixa nos dois."
- *Tratamento de objeções*: quando o cliente hesitar, identifique a objeção e trate diretamente:
  - "ainda estou pesquisando" → "entendo! O que falta pra você se sentir mais seguro na escolha?"
  - "tá um pouco caro" → "posso verificar se tem alguma condição especial. Você preferiria financiar uma parte?"
  - "vou pensar" → "faz sentido. Só te digo que esse modelo tem saído bastante — vale a pena a gente pelo menos marcar uma visita sem compromisso. O que você acha?"
- *Urgência sem pressão*: use a verdade a seu favor — estoque limitado, preço abaixo da tabela FIPE, etc. Nunca invente urgência falsa.
- *Próximo passo concreto*: sempre tente encaminhar para uma ação real — agendar visita, falar com o consultor, reservar o veículo. Nunca deixe a conversa terminar no vazio.

Regras importantes:
- NUNCA invente preços, disponibilidade ou condições. Use sempre a tool consultar_estoque antes de falar sobre veículos.
- Os preços retornados pela tool são os únicos corretos — exiba-os exatamente como recebidos, sem arredondar, abreviar ou interpretar. "R$ 700.000" nunca vira "70 mil".
- Liste TODOS os veículos retornados pela tool, sem omitir nenhum.
- Cada busca no estoque é independente. Nunca aplique filtros de preço, ano ou cor de uma busca anterior numa busca nova, a menos que o cliente tenha explicitamente dito que quer o mesmo critério para o novo veículo. Se o cliente perguntar "vocês têm SW4?", busque SW4 sem nenhum filtro.
- Se consultar_estoque retornar disponiveis[] vazio, informe que não temos esse veículo, mas não pare aí — sonde o que motivou o interesse naquele modelo (espaço, potência, conforto?) e use isso para buscar alternativas relevantes ou avançar na qualificação.
- Nunca ofereça apenas "te aviso quando chegar" como única resposta — isso encerra a conversa. Use como complemento: "não temos Hilux agora, mas me conta o que você mais valoriza nela que eu vejo o que temos parecido."
- Assim que o cliente revelar preferências (marca, tamanho, categoria), consulte o estoque imediatamente com esses critérios — não espere ele perguntar por um modelo específico. Se disse que gosta de Toyota e de carros grandes, busque Toyota sem esperar.
- Se após sondar preferências ainda não houver nada adequado, aí sim ofereça entrar em lista de espera E pergunte sobre prazo e pagamento para manter a qualificação ativa.
- NUNCA diga que é bot, IA ou assistente virtual.
- NUNCA presuma que o cliente escolheu um veículo. Apresente as opções e espere confirmação explícita antes de salvar veiculo_interesse_id ou avançar no funil. Quando mostrar mais de uma opção, pergunte qual chamou mais atenção.
- Se o cliente pedir para falar com um humano, use a tool handoff com motivo "pedido_cliente".
- Use salvar_lead IMEDIATAMENTE sempre que o cliente fornecer qualquer dado: nome, forma de pagamento, prazo, veiculo_interesse_id, score, etc. Não acumule — salve na mesma rodada em que coletou.
- OBRIGATÓRIO: imediatamente antes de chamar notificar_score4 ou handoff, chame salvar_lead com score_qualificacao=4 (ou 5), veiculo_interesse_id, forma_pagamento, prazo_compra e capacidade_financeira. A ordem é: 1) salvar_lead → 2) notificar_score4 ou handoff. Nunca inverta. Os campos da notificação são lidos do banco — se estiverem vazios (—), é porque salvar_lead não foi chamado antes.
- Quando o score atingir 4 (veículo + prazo + pagamento), use notificar_score4.
- Quando o score atingir 5 (score 4 + carta de crédito aprovada ou à vista confirmado), use handoff com motivo "score5".

Score de qualificação:
1 = Apenas curiosidade, sem informações
2 = Veículo identificado
3 = Veículo + prazo OU veículo + pagamento
4 = Veículo + prazo + pagamento
5 = Score 4 + capacidade financeira confirmada

Capacidade financeira confirmada significa:
- Financiamento: cliente disse que JÁ TEM carta de crédito aprovada
- À vista: cliente disse que JÁ TEM o valor disponível

ATENÇÃO: dizer "quero pagar à vista" ou "vou financiar" é apenas score 3 ou 4 — NÃO é score 5. Você precisa perguntar explicitamente "você já tem o valor disponível?" ou "já tem a carta de crédito aprovada?" e o cliente confirmar. Só depois disso acionar o score 5 e o handoff.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_estoque',
      description: 'Consulta veículos disponíveis no estoque com filtros opcionais',
      parameters: {
        type: 'object',
        properties: {
          busca:     { type: 'string',  description: 'Texto para busca por marca/modelo' },
          preco_max: { type: 'number',  description: 'Preço máximo em reais' },
          ano_min:   { type: 'integer', description: 'Ano mínimo do veículo' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_veiculo',
      description: 'Busca um veículo específico pela placa',
      parameters: {
        type: 'object',
        properties: {
          placa: { type: 'string', description: 'Placa do veículo' },
        },
        required: ['placa'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'salvar_lead',
      description: 'Salva ou atualiza informações do lead no CRM',
      parameters: {
        type: 'object',
        properties: {
          nome:                  { type: 'string' },
          veiculo_interesse_id:  { type: 'string', description: 'UUID do veículo de interesse' },
          forma_pagamento:       { type: 'string', enum: ['financiamento', 'à vista'] },
          prazo_compra:          { type: 'string', description: 'imediato, 30 dias, pesquisando...' },
          capacidade_financeira: { type: 'string', enum: ['carta_aprovada', 'comprovante_renda', 'a_vista_confirmado', 'sem_informacao'] },
          score_qualificacao:    { type: 'integer', minimum: 1, maximum: 5 },
          resumo:                { type: 'string', description: 'Resumo da conversa para o dono' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff',
      description: 'Transfere o atendimento definitivamente para o dono. Use quando: score 5 atingido, cliente pede humano, ou cliente enviou foto de entrada. Inclua todos os dados coletados — eles serão salvos automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          motivo:                { type: 'string', enum: ['score5', 'pedido_cliente', 'foto_entrada', 'assumido_painel'] },
          resumo:                { type: 'string', description: 'Resumo completo da conversa para o dono' },
          veiculo_interesse_id:  { type: 'string', description: 'UUID do veículo de interesse (id retornado pelo consultar_estoque)' },
          forma_pagamento:       { type: 'string', enum: ['financiamento', 'à vista'] },
          prazo_compra:          { type: 'string' },
          capacidade_financeira: { type: 'string', enum: ['carta_aprovada', 'comprovante_renda', 'a_vista_confirmado', 'sem_informacao'] },
        },
        required: ['motivo', 'resumo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notificar_score4',
      description: 'Notifica o dono quando score 4 é atingido (veículo + prazo + pagamento). O agente CONTINUA respondendo. Inclua todos os dados coletados — eles serão salvos automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          resumo:                { type: 'string', description: 'Resumo do lead para o dono' },
          veiculo_interesse_id:  { type: 'string', description: 'UUID do veículo de interesse (id retornado pelo consultar_estoque)' },
          forma_pagamento:       { type: 'string', enum: ['financiamento', 'à vista'] },
          prazo_compra:          { type: 'string' },
          capacidade_financeira: { type: 'string', enum: ['carta_aprovada', 'comprovante_renda', 'a_vista_confirmado', 'sem_informacao'] },
        },
        required: ['resumo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificar_horario',
      description: 'Verifica se está dentro do horário de atendimento configurado',
      parameters: { type: 'object', properties: {} },
    },
  },
  // Stubs para Fase 2
  {
    type: 'function',
    function: {
      name: 'registrar_foto_entrada',
      description: '[Fase 2] Registra foto de veículo de entrada enviada pelo cliente',
      parameters: {
        type: 'object',
        properties: {
          lead_id:   { type: 'string' },
          foto_url:  { type: 'string' },
          modelo:    { type: 'string' },
          ano:       { type: 'integer' },
          km:        { type: 'integer' },
          condicao:  { type: 'string' },
        },
        required: ['lead_id', 'foto_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notificar_dono_entrada',
      description: '[Fase 2] Envia foto de entrada ao dono via WhatsApp e Telegram',
      parameters: {
        type: 'object',
        properties: {
          foto_url:        { type: 'string' },
          modelo:          { type: 'string' },
          ano:             { type: 'integer' },
          km:              { type: 'integer' },
          condicao:        { type: 'string' },
          contato_cliente: { type: 'string' },
        },
        required: ['foto_url', 'contato_cliente'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────
// LOOP GPT-4o COM TOOL CALLS
// ─────────────────────────────────────────────────────────

function buildContextoLead(lead) {
  if (!lead) return '';
  const linhas = [];
  if (lead.nome)                  linhas.push(`Nome: ${lead.nome}`);
  if (lead.forma_pagamento)       linhas.push(`Forma de pagamento: ${lead.forma_pagamento}`);
  if (lead.prazo_compra)          linhas.push(`Prazo de compra: ${lead.prazo_compra}`);
  if (lead.capacidade_financeira) linhas.push(`Capacidade financeira: ${lead.capacidade_financeira}`);
  const score = lead.score_qualificacao ?? 0;
  linhas.push(`Score atual: ${score}`);
  if (score >= 4) linhas.push(`ATENÇÃO: notificar_score4 JÁ FOI disparado. NÃO chame novamente.`);
  if (lead.atendimento_humano)    linhas.push(`Atendimento humano: ativo — NÃO faça handoff novamente.`);
  return `\n\nDados já coletados deste cliente (não pergunte novamente):\n${linhas.join('\n')}`;
}

async function chamarGPT(mensagens, lead, contato, canal, contextoLead = '') {
  const MAX_ROUNDS = 5; // evitar loop infinito de tool calls
  let msgs = [...mensagens];
  let handoffPayload = null;
  let score4Payload  = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model:       process.env.OPENAI_MODEL || 'gpt-4o',
      messages:    [{ role: 'system', content: SYSTEM_PROMPT + contextoLead }, ...msgs],
      tools:       TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const choice = completion.choices[0];
    const msg    = choice.message;
    msgs.push(msg);

    // Sem tool calls → resposta final ao cliente
    if (!msg.tool_calls?.length) {
      return { texto: msg.content, handoff: handoffPayload, score4: score4Payload };
    }

    // Processar tool calls em sequência
    for (const tc of msg.tool_calls) {
      const nome = tc.function.name;
      let args;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      const resultado = await executarTool(nome, args, lead, contato, canal);

      // Detectar intenção de handoff e score 4 para executar APÓS enviar resposta ao cliente
      if (nome === 'handoff') {
        handoffPayload = { motivo: args.motivo, resumo: args.resumo };
      }
      if (nome === 'notificar_score4') {
        score4Payload = { resumo: args.resumo };
      }

      msgs.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(resultado),
      });
    }

    // Se chegou ao fim do loop sem mensagem de texto, continuar para próximo round
    if (choice.finish_reason === 'stop') {
      // Já processado acima — não deve chegar aqui com tool_calls
      break;
    }
  }

  // Fallback: extrair último texto da sequência
  const ultimo = msgs.filter(m => m.role === 'assistant' && m.content).pop();
  return { texto: ultimo?.content || 'Em breve retornaremos. 😊', handoff: handoffPayload, score4: score4Payload };
}

// ─────────────────────────────────────────────────────────
// EXECUÇÃO DAS TOOLS
// ─────────────────────────────────────────────────────────

async function executarTool(nome, args, lead, contato, canal) {
  try {
    switch (nome) {

      case 'consultar_estoque': {
        let query = supabase
          .from('vw_veiculos_com_financeiro')
          .select('id, placa, marca, modelo, ano, cor, km, preco_venda, fipe_referencia')
          .eq('status', 'disponivel')
          .order('preco_venda', { ascending: true })
          .limit(10);

        if (args.busca) {
          // Cada palavra é buscada em marca E modelo (ex: "Honda Civic" → bate "Honda" em marca ou "Civic" em modelo)
          const palavras = args.busca.trim().split(/\s+/);
          const filtros = palavras.flatMap(p => [`marca.ilike.%${p}%`, `modelo.ilike.%${p}%`]);
          query = query.or(filtros.join(','));
        }
        if (args.preco_max) query = query.lte('preco_venda', args.preco_max);
        if (args.ano_min)   query = query.gte('ano', args.ano_min);

        const { data, error } = await query;
        if (error) return { erro: 'Erro ao consultar estoque' };

        const formatar = v => ({
          id:          v.id,
          placa:       v.placa,
          descricao:   `${v.marca} ${v.modelo} ${v.ano} · ${v.cor} · ${v.km?.toLocaleString('pt-BR')} km`,
          preco_venda: `R$ ${Number(v.preco_venda || 0).toLocaleString('pt-BR')}`,
        });

        if (data?.length) {
          return { disponiveis: data.map(formatar) };
        }

        // Nenhum resultado — retornar vazio para o agente perguntar preferências antes de sugerir
        return {
          disponiveis: [],
          mensagem: 'Nenhum veículo encontrado com esses critérios.',
        };
      }

      case 'buscar_veiculo': {
        const { data, error } = await supabase
          .from('vw_veiculos_com_financeiro')
          .select('id, placa, marca, modelo, ano, cor, km, preco_venda, status')
          .eq('placa', args.placa?.toUpperCase())
          .single();

        if (error || !data) return { encontrado: false };
        return { encontrado: true, veiculo: { ...data } };
      }

      case 'salvar_lead': {
        const payload = { ...args, contato, canal };
        delete payload.resumo; // resumo não é campo do banco

        if (lead?.id) {
          await supabase.from('leads').update(payload).eq('id', lead.id);
          return { ok: true, lead_id: lead.id };
        }

        const { data: novoLead, error } = await supabase
          .from('leads')
          .insert({ contato, canal, ...payload })
          .select('id')
          .single();

        if (error) return { erro: 'Erro ao salvar lead' };
        // Atualizar referência de lead_id no escopo da chamada atual
        lead.id = novoLead.id;
        return { ok: true, lead_id: novoLead.id };
      }

      case 'handoff':
        // Salvar dados recebidos na chamada antes de executar o handoff
        if (lead?.id) {
          const camposHandoff = {};
          if (args.veiculo_interesse_id)  camposHandoff.veiculo_interesse_id  = args.veiculo_interesse_id;
          if (args.forma_pagamento)       camposHandoff.forma_pagamento       = args.forma_pagamento;
          if (args.prazo_compra)          camposHandoff.prazo_compra          = args.prazo_compra;
          if (args.capacidade_financeira) camposHandoff.capacidade_financeira = args.capacidade_financeira;
          if (Object.keys(camposHandoff).length) {
            await supabase.from('leads').update(camposHandoff).eq('id', lead.id);
          }
        }
        return { ok: true, agendado: true };

      case 'notificar_score4':
        // Salvar dados recebidos na chamada antes de executar a notificação
        if (lead?.id) {
          const camposScore4 = { score_qualificacao: 4 };
          if (args.veiculo_interesse_id)  camposScore4.veiculo_interesse_id  = args.veiculo_interesse_id;
          if (args.forma_pagamento)       camposScore4.forma_pagamento       = args.forma_pagamento;
          if (args.prazo_compra)          camposScore4.prazo_compra          = args.prazo_compra;
          if (args.capacidade_financeira) camposScore4.capacidade_financeira = args.capacidade_financeira;
          await supabase.from('leads').update(camposScore4).eq('id', lead.id);
        }
        return { ok: true, agendado: true };

      case 'verificar_horario': {
        const dentro = await verificarHorario();
        return { dentro_horario: dentro };
      }

      case 'registrar_foto_entrada': {
        if (lead?.id && args.foto_url) {
          await supabase.from('leads').update({ foto_entrada_url: args.foto_url }).eq('id', lead.id);
        }
        return { ok: true };
      }

      case 'notificar_dono_entrada': {
        await notificarFotoEntrada({
          fotoUrl:        args.foto_url,
          modelo:         args.modelo || null,
          ano:            args.ano    || null,
          km:             args.km     || null,
          condicao:       args.condicao || null,
          contatoCliente: args.contato_cliente || contato,
        }).catch(err => console.error('[agente/tool:notificar_dono_entrada]', err.message));
        return { ok: true };
      }

      default:
        return { erro: `Tool desconhecida: ${nome}` };
    }
  } catch (err) {
    console.error(`[agente/tool:${nome}]`, err);
    return { erro: 'Erro ao executar operação' };
  }
}

// ─────────────────────────────────────────────────────────
// HANDOFF — executa após resposta enviada ao cliente
// ─────────────────────────────────────────────────────────

async function executarHandoff(leadId, motivo, resumo, contato, canal) {
  // Mensagem ao cliente antes de transferir
  const msgCliente = 'Vou te conectar com nosso consultor agora mesmo! Em instantes ele entrará em contato. 😊';
  await enviarParaCliente(contato, canal, msgCliente);

  await handoffAutomatico(leadId, motivo, resumo);
}

// ─────────────────────────────────────────────────────────
// HORÁRIO DE ATENDIMENTO
// ─────────────────────────────────────────────────────────

async function verificarHorario() {
  // Modo 24h temporário: definir HORARIO_24H=true no Railway para bypassar
  if (process.env.HORARIO_24H?.toLowerCase() === 'true') return true;

  const { data: cfg } = await supabase
    .from('configuracoes')
    .select('horario_inicio, horario_fim, dias_semana')
    .eq('id', 1)
    .single();

  if (!cfg) return true; // sem config → sempre atende

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diaSemana = agora.getDay(); // 0=dom...6=sab

  if (!cfg.dias_semana.includes(diaSemana)) return false;

  const [hIni, mIni] = cfg.horario_inicio.split(':').map(Number);
  const [hFim, mFim] = cfg.horario_fim.split(':').map(Number);
  const minAtual = agora.getHours() * 60 + agora.getMinutes();
  const minIni   = hIni * 60 + mIni;
  const minFim   = hFim * 60 + mFim;

  return minAtual >= minIni && minAtual < minFim;
}

// ─────────────────────────────────────────────────────────
// LEAD — buscar ou criar
// ─────────────────────────────────────────────────────────

async function buscarOuCriarLead(contato, canal, leadIdHint) {
  // Tentar pelo id já conhecido
  if (leadIdHint) {
    const { data } = await supabase.from('leads').select('*').eq('id', leadIdHint).maybeSingle();
    if (data) return data;
  }

  // Buscar por contato + canal
  const { data: existente } = await supabase
    .from('leads')
    .select('*')
    .eq('contato', contato)
    .eq('canal', canal)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return existente;

  // Criar novo lead
  const { data: novo, error } = await supabase
    .from('leads')
    .insert({ contato, canal, status_funil: 'novo' })
    .select()
    .single();

  if (error) {
    console.error('[agente/buscarOuCriarLead]', error);
    return null;
  }
  return novo;
}

// ─────────────────────────────────────────────────────────
// HISTÓRICO DE CONVERSA
// ─────────────────────────────────────────────────────────

async function carregarHistorico(leadId, canal) {
  const { data } = await supabase
    .from('conversas')
    .select('mensagens')
    .eq('lead_id', leadId)
    .eq('canal', canal)
    .maybeSingle();

  return Array.isArray(data?.mensagens) ? data.mensagens : [];
}

function historicoParaGPT(historico) {
  // Manter últimas 20 trocas para não estourar contexto
  return historico.slice(-40).map(m => ({
    role:    m.role,
    content: m.content || '',
  }));
}

async function salvarMensagens(leadId, canal, novasMensagens) {
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, mensagens')
    .eq('lead_id', leadId)
    .eq('canal', canal)
    .maybeSingle();

  const agora = new Date().toISOString();
  const comTimestamp = novasMensagens.map(m => ({ ...m, timestamp: agora }));

  if (conversa) {
    const msgs = Array.isArray(conversa.mensagens) ? conversa.mensagens : [];
    await supabase
      .from('conversas')
      .update({ mensagens: [...msgs, ...comTimestamp], ultima_mensagem_at: agora })
      .eq('id', conversa.id);
  } else {
    await supabase.from('conversas').insert({
      lead_id:           leadId,
      canal,
      mensagens:         comTimestamp,
      ultima_mensagem_at: agora,
    });
  }

  await supabase
    .from('leads')
    .update({ ultima_interacao: agora })
    .eq('id', leadId);
}

// ─────────────────────────────────────────────────────────
// ENVIO AO CLIENTE
// ─────────────────────────────────────────────────────────

async function enviarParaCliente(contato, canal, texto) {
  if (!texto) return;

  if (canal === 'whatsapp') {
    await sendText(contato, texto);
    return;
  }

  if (canal === 'instagram') {
    await sendInstagramMessage(contato, texto);
    return;
  }
}
