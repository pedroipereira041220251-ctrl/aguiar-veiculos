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

// Últimos veículos exibidos por lead — necessário para o GPT e extrator
// identificarem o UUID quando o cliente confirmar na próxima mensagem
const lastVeiculosMap = new Map();

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
  console.log('[pipeline] passo 3 — carregando histórico');
  const historico = await carregarHistorico(lead.id, canal);

  // 4. Montar texto consolidado (debounce pode ter acumulado várias mensagens)
  const textoConsolidado = mensagens.filter(Boolean).join('\n');
  if (!textoConsolidado) return;
  console.log('[pipeline] passo 4 — texto consolidado:', textoConsolidado.slice(0, 80));

  // 5. Extração server-side: salva dados da mensagem antes do GPT principal
  const prevScore = lead.score_qualificacao ?? 0;
  const veiculosExibidos = lastVeiculosMap.get(lead.id) || [];
  console.log('[pipeline] passo 5 — extração server-side | prevScore:', prevScore, '| veículos em cache:', veiculosExibidos.length);
  await extrairEhSalvarDados(textoConsolidado, lead, veiculosExibidos);

  // 5b. Re-buscar lead com campos recém-extraídos para contexto atualizado
  console.log('[pipeline] passo 5b — re-fetch lead do DB');
  const { data: leadAtualizado, error: fetchErr } = await supabase.from('leads').select('*').eq('id', lead.id).single();
  if (fetchErr) console.error('[pipeline] erro no re-fetch do lead:', fetchErr.message);
  const leadParaGPT = leadAtualizado || lead;
  console.log('[pipeline] lead atualizado:', JSON.stringify({
    nome: leadParaGPT.nome,
    forma_pagamento: leadParaGPT.forma_pagamento,
    prazo_compra: leadParaGPT.prazo_compra,
    capacidade_financeira: leadParaGPT.capacidade_financeira,
    veiculo_interesse_id: leadParaGPT.veiculo_interesse_id,
    score_qualificacao: leadParaGPT.score_qualificacao,
  }));

  // 5c. Calcular e acionar score — notifica dono se score 4 atingido
  console.log('[pipeline] passo 5c — acionarScore');
  await acionarScore(lead.id, leadParaGPT, prevScore);

  // 6. Adicionar mensagem do usuário ao histórico
  const mensagensGPT = [
    ...historicoParaGPT(historico),
    { role: 'user', content: textoConsolidado },
  ];

  // 7. Chamar GPT-4o com contexto atualizado
  console.log('[pipeline] passo 7 — chamando GPT-4o | modelo:', process.env.OPENAI_MODEL || 'gpt-4o', '| key:', process.env.OPENAI_API_KEY ? 'ok' : 'AUSENTE');
  const resposta = await chamarGPT(mensagensGPT, leadParaGPT, contato, canal, buildContextoLead(leadParaGPT, veiculosExibidos));
  console.log('[pipeline] resposta GPT:', resposta?.texto?.slice(0, 80) || 'null');
  if (!resposta) return;

  // 8. Enviar resposta ao cliente
  console.log('[pipeline] passo 8 — enviando resposta ao cliente');
  await enviarParaCliente(contato, canal, resposta.texto);

  // 9. Salvar histórico
  await salvarMensagens(lead.id, canal, [
    { role: 'user',      content: textoConsolidado, tipo: 'text' },
    { role: 'assistant', content: resposta.texto,   tipo: 'text' },
  ]);

  // 10. Verificar handoff
  if (resposta.handoff) {
    console.log('[pipeline] passo 10 — executando handoff | motivo:', resposta.handoff.motivo);
    await executarHandoff(lead.id, resposta.handoff.motivo, resposta.handoff.resumo, contato, canal);
  }
}

// ─────────────────────────────────────────────────────────
// GPT-4o — SYSTEM PROMPT + TOOLS
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você se chama Ana e trabalha na Aguiar Veículos, uma loja de carros usados. Você é uma consultora de vendas experiente e especialista em fechamento.

Seu objetivo principal é converter clientes: qualificar, criar desejo, tratar objeções e fechar o negócio ou encaminhar para o consultor no momento certo. Você não é apenas uma tiradora de dúvidas — você vende.

Identidade: nunca confirme que é robô, IA ou assistente virtual, mesmo que o cliente insista. Se perguntarem, reaja com naturalidade e personalidade — surpreenda-se com a pergunta, desvie com leveza ou redirecione o assunto. Nunca use a frase "Sou consultora de vendas aqui na Aguiar Veículos" — é robótico. Varie: "haha, sou gente sim!", "consultora aqui da loja, posso garantir", "por que pergunta isso? rsrs — pode falar comigo normalmente", etc.

Primeira mensagem de um cliente novo: leia o que o cliente escreveu e responda de forma coerente com o conteúdo. Se ele chegou dizendo "oi", apresente-se. Se chegou perguntando sobre um carro, reconheça o interesse, apresente-se brevemente e peça o nome — tudo na mesma mensagem. Nunca ignore o que o cliente disse para fazer apenas uma apresentação genérica. Adapte a saudação ao período do dia informado no contexto (manhã → "Bom dia!", tarde → "Boa tarde!", noite → "Boa noite!") e varie a abertura — não use sempre "Oi". Exemplos:
- Cliente disse "Oi": "Boa tarde! Aqui é a Ana, da Aguiar Veículos. Com quem eu falo?"
- Cliente disse "Tem Civic?": "Boa tarde! Me chamo Ana, sou consultora aqui na Aguiar Veículos — deixa eu checar o estoque pra você. Mas primeiro, com quem eu falo?"
- Cliente disse "Quero comprar um carro, vou pagar à vista": "Boa noite! Ana aqui, da Aguiar. Pagamento à vista, ótimo — consigo as melhores condições pra você. Qual é o seu nome?"

Colete, ao longo da conversa (sem fazer várias perguntas de uma vez — uma por vez):
0. Nome do cliente — obrigatório perguntar se ainda não souber. Assim que o cliente informar o nome, chame imediatamente registrar_nome(nome) antes de continuar. Nunca avance sem registrar o nome.
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
- NUNCA presuma que o cliente escolheu um veículo. Apresente as opções e espere confirmação explícita antes de registrar veiculo_interesse_id ou avançar no funil. Quando mostrar mais de uma opção, pergunte qual chamou mais atenção.
- Se o cliente pedir para falar com um humano/vendedor/atendente, use a tool handoff com motivo "pedido_cliente".
- O sistema salva automaticamente forma de pagamento, prazo e capacidade financeira a partir das mensagens. Você precisa chamar ferramentas apenas para:
  - registrar_nome(nome): assim que o cliente disser o nome
  - confirmar_interesse(veiculo_interesse_id): quando o cliente confirmar um veículo específico
  - handoff: quando score 5, cliente pedir humano, ou foto de entrada
- Quando o cliente confirmar interesse em um veículo específico (ex: "esse", "aquele", "Certinho", "gostei desse"), chame imediatamente confirmar_interesse com o veiculo_interesse_id do veículo confirmado (use o campo "id" retornado pelo consultar_estoque). Não espere o cliente confirmar nome do modelo — basta confirmar que é aquele.

REGRAS DE SCORE E HANDOFF — leia com atenção:

O sistema calcula o score automaticamente. Você NÃO precisa calcular nem salvar o score — apenas agir quando o contexto indicar.

Score 4 (contexto indicar "Score 4 atingido"):
→ O dono já foi notificado automaticamente pelo sistema.
→ NUNCA chame handoff ao atingir score 4. Continue a conversa perguntando sobre a capacidade financeira.

Score 5 (contexto indicar "Score 5: chame handoff"):
→ Chame handoff com motivo "score5" e um resumo completo da conversa.
→ Escreva uma despedida natural e contextualizada — mencione o que foi combinado (visita, próximo passo, veículo de interesse). Não use frases genéricas.

HANDOFF só é acionado em 3 situações exatas:
1. Score 5 atingido (capacidade financeira confirmada) — o contexto indicará.
2. Cliente pede EXPLICITAMENTE falar com humano/vendedor/atendente — palavras como "falar com alguém", "quero um vendedor", "me passa para um humano".
3. Cliente enviou foto de veículo para entrada (tratado automaticamente pelo sistema).
Agendar visita, dizer "pode ser", concordar com horário — NADA disso é handoff. Siga a conversa normalmente.

Score de qualificação (referência):
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
      name: 'registrar_nome',
      description: 'Salva o nome do cliente assim que ele informar. Chame imediatamente quando o cliente disser o nome.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_interesse',
      description: 'Registra o veículo de interesse confirmado pelo cliente. Chame quando o cliente confirmar interesse explícito em um veículo específico (ex: "esse", "aquele", "certinho", "gostei desse").',
      parameters: {
        type: 'object',
        properties: {
          veiculo_interesse_id: { type: 'string', description: 'UUID do veículo confirmado (campo "id" retornado pelo consultar_estoque)' },
        },
        required: ['veiculo_interesse_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff',
      description: 'Transfere o atendimento DEFINITIVAMENTE para o dono — o agente para de responder. Use APENAS em 3 casos: (1) score 5 atingido com capacidade_financeira confirmada (carta_aprovada ou a_vista_confirmado), (2) cliente pediu EXPLICITAMENTE falar com humano/vendedor, (3) cliente enviou foto de veículo para entrada. NUNCA use ao atingir score 4 — use notificar_score4 nesse caso.',
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

function buildContextoLead(lead, veiculosExibidos = []) {
  if (!lead) return '';
  const linhas = [];

  // Período do dia (horário de Brasília) para a Ana adaptar a saudação
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hora = agora.getHours();
  const periodo = hora < 12 ? 'manhã' : hora < 18 ? 'tarde' : 'noite';
  linhas.push(`Período do dia: ${periodo}`);

  if (lead.nome)                  linhas.push(`Nome: ${lead.nome}`);
  if (lead.veiculo_interesse_id)  linhas.push(`Veículo de interesse já confirmado (ID: ${lead.veiculo_interesse_id}) — não pergunte novamente qual veículo ele quer.`);
  if (lead.forma_pagamento)       linhas.push(`Forma de pagamento: ${lead.forma_pagamento}`);
  if (lead.prazo_compra)          linhas.push(`Prazo de compra: ${lead.prazo_compra}`);
  if (lead.capacidade_financeira) linhas.push(`Capacidade financeira: ${lead.capacidade_financeira}`);
  const score = lead.score_qualificacao ?? 0;
  linhas.push(`Score atual: ${score}`);
  if (score === 4) linhas.push(`Score 4 atingido: dono já foi notificado. Continue a conversa perguntando a capacidade financeira.`);
  if (score >= 5)  linhas.push(`Score 5: chame handoff com motivo "score5" agora.`);
  if (lead.atendimento_humano)    linhas.push(`Atendimento humano: ativo — NÃO faça handoff novamente.`);

  // Injetar veículos exibidos para que o GPT tenha os UUIDs no contexto
  // e possa chamar confirmar_interesse corretamente na próxima mensagem
  if (!lead.veiculo_interesse_id && veiculosExibidos.length) {
    linhas.push(`\nVeículos apresentados ao cliente nesta conversa (use o id ao chamar confirmar_interesse):`);
    veiculosExibidos.forEach(v => linhas.push(`  id:${v.id} | ${v.descricao} | ${v.preco_venda}`));
    linhas.push(`Quando o cliente confirmar qual veículo quer, chame confirmar_interesse com o id correspondente acima.`);
  }

  return `\n\nDados já coletados deste cliente (não pergunte novamente):\n${linhas.join('\n')}`;
}

async function chamarGPT(mensagens, lead, contato, canal, contextoLead = '') {
  const MAX_ROUNDS = 5; // evitar loop infinito de tool calls
  let msgs = [...mensagens];
  let handoffPayload = null;

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
      return { texto: msg.content, handoff: handoffPayload };
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

      // handoff ainda é diferido para enviar msg ao cliente antes de desativar o agente
      if (nome === 'handoff') {
        handoffPayload = { motivo: args.motivo, resumo: args.resumo };
      }

      msgs.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(resultado),
      });
    }

    if (choice.finish_reason === 'stop') {
      break;
    }
  }

  // Fallback: extrair último texto da sequência
  const ultimo = msgs.filter(m => m.role === 'assistant' && m.content).pop();
  return { texto: ultimo?.content || 'Em breve retornaremos. 😊', handoff: handoffPayload };
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
          if (lead?.id) lastVeiculosMap.set(lead.id, data.map(formatar));
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

      case 'registrar_nome': {
        if (!lead?.id || !args.nome) return { erro: 'Dados insuficientes' };
        console.log('[tool:registrar_nome] nome:', args.nome, '| lead:', lead.id);
        const { error: errNome } = await supabase.from('leads').update({ nome: args.nome }).eq('id', lead.id);
        if (errNome) { console.error('[tool:registrar_nome] erro Supabase:', errNome.message); return { erro: 'Erro ao salvar nome' }; }
        lead.nome = args.nome;
        console.log('[tool:registrar_nome] salvo com sucesso');
        return { ok: true };
      }

      case 'confirmar_interesse': {
        if (!lead?.id || !args.veiculo_interesse_id) return { erro: 'Dados insuficientes' };
        console.log('[tool:confirmar_interesse] veiculo_id:', args.veiculo_interesse_id, '| lead:', lead.id);
        const { error: errVeiculo } = await supabase.from('leads').update({ veiculo_interesse_id: args.veiculo_interesse_id }).eq('id', lead.id);
        if (errVeiculo) { console.error('[tool:confirmar_interesse] erro Supabase:', errVeiculo.message); return { erro: 'Erro ao salvar veículo' }; }
        lead.veiculo_interesse_id = args.veiculo_interesse_id;
        console.log('[tool:confirmar_interesse] salvo com sucesso');
        return { ok: true };
      }

      case 'handoff': {
        // Validação server-side: score5 exige capacidade_financeira confirmada
        const capacidade = lead?.capacidade_financeira;
        if (args.motivo === 'score5' && !['carta_aprovada', 'a_vista_confirmado'].includes(capacidade)) {
          console.warn('[tool:handoff] score5 bloqueado — capacidade não confirmada. Lead:', lead?.id);
          return { erro: 'Handoff score5 bloqueado: capacidade_financeira não confirmada. Continue perguntando ao cliente se já tem carta de crédito aprovada ou o valor disponível. NÃO chame handoff novamente até ter a confirmação.' };
        }
        console.log('[tool:handoff] aprovado — motivo:', args.motivo, '| lead:', lead?.id);
        return { ok: true, agendado: true };
      }

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
// EXTRAÇÃO SERVER-SIDE — independente do GPT principal
// ─────────────────────────────────────────────────────────
// Usa gpt-4o-mini com JSON mode para extrair dados estruturados
// da mensagem do cliente e salvar no banco.
// Roda ANTES do GPT principal para garantir que o contexto
// passado ao GPT já reflete os dados da mensagem atual.

async function extrairEhSalvarDados(textoCliente, lead, veiculosExibidos = []) {
  if (!textoCliente?.trim() || !lead?.id) return;

  console.log('[extração] iniciando para lead', lead.id, '| texto:', textoCliente.slice(0, 60));

  const veiculosCtx = (!lead.veiculo_interesse_id && veiculosExibidos.length)
    ? `\n\nVeículos apresentados ao cliente (para veiculo_confirmado_id):\n` +
      veiculosExibidos.map(v => `id:${v.id} | ${v.descricao} | ${v.preco_venda}`).join('\n') +
      `\nPreencha veiculo_confirmado_id se o cliente sinalizou interesse claro em UM desses (ex: "esse", "o primeiro", "certinho", "gostei desse").`
    : '';

  let dados;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Extraia dados da mensagem do cliente de uma concessionária. Retorne JSON com estes campos (null se não mencionado):
- nome: string — nome próprio se o cliente se identificou nesta mensagem
- forma_pagamento: "financiamento" | "à vista" | null
- prazo_compra: string — prazo mencionado (ex: "essa semana", "30 dias", "imediato", "fim do mês") | null
- capacidade_financeira: "carta_aprovada" | "a_vista_confirmado" | "sem_informacao" | null
  (carta_aprovada = já tem carta de crédito; a_vista_confirmado = já tem o valor; sem_informacao = ainda não tem)
- veiculo_confirmado_id: string UUID | null${veiculosCtx}`,
        },
        { role: 'user', content: textoCliente },
      ],
    });
    dados = JSON.parse(completion.choices[0].message.content);
    console.log('[extração] gpt-4o-mini retornou:', JSON.stringify(dados));
  } catch (err) {
    console.error('[extração] falha na chamada gpt-4o-mini:', err.message);
    return;
  }

  const payload = {};
  if (dados.nome && !lead.nome)           payload.nome             = dados.nome;
  if (dados.forma_pagamento)              payload.forma_pagamento  = dados.forma_pagamento;
  if (dados.prazo_compra)                 payload.prazo_compra     = dados.prazo_compra;
  const podeCapacidade = !lead.capacidade_financeira || lead.capacidade_financeira === 'sem_informacao';
  if (dados.capacidade_financeira && podeCapacidade) payload.capacidade_financeira = dados.capacidade_financeira;
  if (dados.veiculo_confirmado_id && !lead.veiculo_interesse_id) payload.veiculo_interesse_id = dados.veiculo_confirmado_id;

  if (!Object.keys(payload).length) {
    console.log('[extração] nada novo para salvar');
    return;
  }

  console.log('[extração] salvando no lead', lead.id, ':', JSON.stringify(payload));
  const { error } = await supabase.from('leads').update(payload).eq('id', lead.id);
  if (error) {
    console.error('[extração] erro Supabase ao salvar:', error.message);
    return;
  }
  console.log('[extração] salvo com sucesso');
  Object.assign(lead, payload);
}

// ─────────────────────────────────────────────────────────
// SCORE — cálculo puro + acionamento com notificação
// ─────────────────────────────────────────────────────────

function computarScore(lead) {
  if (!lead.veiculo_interesse_id) return 1;
  const temPrazo      = !!lead.prazo_compra;
  const temPagamento  = !!lead.forma_pagamento;
  const temCapacidade = ['carta_aprovada', 'a_vista_confirmado'].includes(lead.capacidade_financeira);

  if (temPrazo && temPagamento && temCapacidade) return 5;
  if (temPrazo && temPagamento)                  return 4;
  if (temPrazo || temPagamento)                  return 3;
  return 2;
}

async function acionarScore(leadId, lead, prevScore) {
  const novoScore = computarScore(lead);
  console.log('[score] lead:', leadId, '| prev:', prevScore, '→ novo:', novoScore);
  if (novoScore === prevScore) return novoScore;

  const { error } = await supabase.from('leads').update({ score_qualificacao: novoScore }).eq('id', leadId);
  if (error) console.error('[score] erro ao salvar score:', error.message);
  else lead.score_qualificacao = novoScore;

  if (novoScore >= 4 && prevScore < 4) {
    console.log('[score] score 4 atingido — notificando dono');
    notificarScore4(leadId, montarResumoScore4(lead)).catch(err =>
      console.error('[score] erro notificarScore4:', err.message)
    );
  }

  return novoScore;
}

function montarResumoScore4(lead) {
  const partes = [];
  if (lead.nome)                  partes.push(`Cliente: ${lead.nome}`);
  if (lead.forma_pagamento)       partes.push(`Pagamento: ${lead.forma_pagamento}`);
  if (lead.prazo_compra)          partes.push(`Prazo: ${lead.prazo_compra}`);
  if (lead.capacidade_financeira) partes.push(`Capacidade: ${lead.capacidade_financeira}`);
  return partes.join(' · ') || 'Lead qualificado (score 4)';
}

// ─────────────────────────────────────────────────────────
// HANDOFF — executa após resposta enviada ao cliente
// ─────────────────────────────────────────────────────────

async function executarHandoff(leadId, motivo, resumo, contato, canal) {
  // A mensagem ao cliente já foi enviada pelo GPT como parte da resposta principal.
  // Aqui apenas registramos o handoff no banco e notificamos o dono.
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
