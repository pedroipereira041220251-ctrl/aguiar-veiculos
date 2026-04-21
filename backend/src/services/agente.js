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
import { handoffAutomatico, notificarScore4, notificarCapacidadeAtualizada, notificarFotoEntrada, MOTIVOS } from './handoff.js';
import { analisarImagem } from './vision.js';
import { sendInstagramMessage } from './metaClient.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Debounce em memória (prod: substituir por Redis) ───────
// Map<contato, { timer, mensagens[] }>
const debounceMap = new Map();
const DEBOUNCE_MS = 6000;

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
    if (imageUrl) entry.imageUrls.push(imageUrl);
  } else {
    debounceMap.set(chave, { mensagens: texto ? [texto] : [], body, imageUrls: imageUrl ? [imageUrl] : [] });
  }

  const entry = debounceMap.get(chave);
  entry.timer = setTimeout(async () => {
    debounceMap.delete(chave);
    await processarComIA({ contato, canal, mensagens: entry.mensagens, body: entry.body, imageUrls: entry.imageUrls, lead_id })
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

async function processarComIA({ contato, canal, mensagens, body, lead_id, imageUrls = [] }) {
  console.log('[agente] processarComIA iniciado:', contato, '| msgs:', mensagens?.length, '| fotos:', imageUrls.length);

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

  // ── Tratamento de fotos (Fase 2) ──────────────────────────
  if (imageUrls.length > 0) {
    const fotosVeiculo = [];
    const ctxMensagens = [];

    for (const imageUrl of imageUrls) {
      const { isVeiculo, dados, descricao } = await analisarImagem(imageUrl);

      if (isVeiculo) {
        fotosVeiculo.push({ imageUrl, dados, descricao });
        // Não notifica ainda — Ana vai perguntar ano e km primeiro
        const ctx = `[Foto de veículo recebida: ${descricao || dados.modelo || 'veículo'}. NÃO notifique o dono ainda. Pergunte ao cliente o ano e a quilometragem antes de registrar.]`;
        ctxMensagens.push(ctx);
      } else {
        const descMsg = descricao ? `[Cliente enviou uma foto: ${descricao}]` : '[Cliente enviou uma foto]';
        ctxMensagens.push(descMsg);
      }
    }

    // Bloco de contexto com URLs e dados detectados para o GPT usar ao chamar registrar_veiculo_entrada
    if (fotosVeiculo.length > 0) {
      const linhasFotos = fotosVeiculo.map((f, i) => {
        const partes = [`Foto ${i + 1}: URL=${f.imageUrl}`];
        if (f.dados.modelo) partes.push(`Modelo detectado: ${f.dados.modelo}`);
        if (f.dados.cor)    partes.push(`Cor: ${f.dados.cor}`);
        if (f.dados.condicao) partes.push(`Condição: ${f.dados.condicao}`);
        return `  - ${partes.join(' | ')}`;
      }).join('\n');

      // Detectar se todas as fotos parecem ser do mesmo veículo (mesmo modelo detectado)
      const modelos = [...new Set(fotosVeiculo.map(f => f.dados.modelo).filter(Boolean))];
      const mesmoCarro = fotosVeiculo.length > 1 && modelos.length <= 1;

      const nomes = fotosVeiculo.map(f => f.dados.modelo || 'veículo').join(' e ');
      const instrucaoRegistro = mesmoCarro
        ? `São fotos do MESMO veículo (${modelos[0] || 'veículo'}). Quando tiver as informações, chame registrar_veiculo_entrada UMA vez com foto_urls=[todas as URLs acima].`
        : `Quando tiver as informações, chame registrar_veiculo_entrada ${fotosVeiculo.length > 1 ? 'para cada veículo separadamente' : 'com a URL acima'}.`;

      ctxMensagens.push(
        `[Fotos de veículo pendentes de registro:\n${linhasFotos}\nPergunte ao cliente o ano e a quilometragem ${fotosVeiculo.length > 1 && !mesmoCarro ? `de cada um (${nomes})` : `do ${nomes}`} em UMA só mensagem. ${instrucaoRegistro}]`
      );
    }

    mensagens = [...(mensagens || []), ...ctxMensagens];
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
  const prevCapacidadeObs = lead.capacidade_observacao ?? null;
  const veiculosExibidos = lastVeiculosMap.get(lead.id) || [];
  const ultimaMsgAna = historico.filter(m => m.role === 'assistant').slice(-1)[0]?.conteudo ?? null;
  console.log('[pipeline] passo 5 — extração server-side | prevScore:', prevScore, '| veículos em cache:', veiculosExibidos.length);
  await extrairEhSalvarDados(textoConsolidado, lead, veiculosExibidos, ultimaMsgAna);

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

  // 5d. Se capacidade_observacao foi definida pela primeira vez num lead score 4, notificar dono
  if (!prevCapacidadeObs && leadParaGPT.capacidade_observacao && (leadParaGPT.score_qualificacao ?? 0) === 4) {
    notificarCapacidadeAtualizada(leadParaGPT).catch(e =>
      console.error('[pipeline] erro notif capacidade obs:', e.message)
    );
  }

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

Primeira mensagem de um cliente novo: sempre se apresente pelo nome ("Sou a Ana, da Aguiar Veículos" ou variações). Leia o que o cliente escreveu e responda de forma coerente. OBRIGATÓRIO: inicie SEMPRE com a saudação do período do dia conforme indicado no contexto (manhã → "Bom dia!", tarde → "Boa tarde!", noite → "Boa noite!"). Nunca inicie uma primeira resposta sem a saudação temporal. Varie a abertura — não use sempre "Oi".

O nome do cliente é essencial para criar proximidade — garanta que ele seja coletado ao longo da conversa. O momento certo depende do contexto: se o cliente chegou apenas com "oi", peça na primeira resposta. Se chegou com uma pergunta objetiva, você pode encaixar o pedido do nome junto com outra pergunta relevante (ex: filtro de preço), ou na próxima troca natural. Nunca avance para proposta ou handoff sem saber o nome.

Exemplos:
- Cliente disse "Oi": "Boa tarde! Aqui é a Ana, da Aguiar Veículos. Com quem eu falo?"
- Cliente disse "vocês têm Honda?": "Boa tarde! Sou a Ana, da Aguiar — temos algumas opções sim. Com quem eu falo? E qual faixa de preço você tem em mente?"
- Cliente disse "Tem Civic?": "Boa tarde! Ana aqui, da Aguiar — vou checar o estoque pra você. Com quem eu falo? E tem alguma faixa de preço em mente?"
- Cliente disse "Quero comprar um carro, vou pagar à vista": "Boa noite! Ana aqui, da Aguiar. Pagamento à vista, ótimo — consigo as melhores condições pra você. Qual é o seu nome?"

Colete, ao longo da conversa:
0. Nome do cliente — colete ao longo da conversa, no momento mais natural. Assim que o cliente informar o nome, chame imediatamente registrar_nome(nome). Nunca feche proposta ou avance para handoff sem ter o nome.
1. Veículo de interesse (marca, modelo, ano ou características desejadas)
2. Prazo de compra + forma de pagamento — pergunte os dois juntos logo após o cliente confirmar o veículo. Ex: "Para organizar aqui do nosso lado: qual é o seu prazo para comprar, e você prefere financiar ou pagar à vista?"
3. Visita à loja — SEMPRE proponha uma visita ANTES de perguntar sobre capacidade financeira. Ex: "Que tal você passar aqui para ver o carro pessoalmente? Fica muito mais fácil de fechar. Você teria disponibilidade essa semana?" Não espere o cliente pedir.
   BLOQUEIO: só proponha a visita após ter coletado prazo_compra E forma_pagamento. Se o cliente confirmou o veículo mas ainda não informou prazo ou pagamento, pergunte esses dois juntos primeiro. Nunca pule para a visita direto do passo 1. ATENÇÃO: receber fotos de veículo de entrada NÃO suspende este bloqueio — após registrar as fotos, volte imediatamente para coletar o dado que faltava (prazo ou forma_pagamento) antes de propor visita.
   - Quando o cliente aceitar a visita ("pode ser", "sim", "topo", "combinado"), SEMPRE pergunte o dia e horário: "Que dia e horário ficam melhor pra você?" ou use fechamento alternativo "você prefere amanhã de manhã ou à tarde?". Nunca confirme a visita sem definir dia e hora.
   - Quando o cliente aceitar a visita E já informar dia E horário na mesma mensagem (ex: "vou passar às 14h hoje"), confirme o agendamento e pergunte a capacidade financeira IMEDIATAMENTE na mesma resposta — antes de endereço ou qualquer outra coisa.
4. Capacidade financeira — pergunte SOMENTE depois de ter proposto a visita:
   - Se financiamento: "você já tem carta de crédito aprovada ou ainda vai buscar?"
   - Se à vista: "você já tem o valor disponível?"
   - Se troca + à vista: "você já tem a diferença disponível em dinheiro?"
   - Se troca + financiamento: "você já tem carta de crédito aprovada para a diferença?"
5. Carro de entrada: se o cliente mencionar que vai dar um carro como entrada ("tenho um carro pra dar", "quero trocar meu carro", "vou dar de entrada", "dou meu carro de entrada"), pergunte imediatamente: "Que tal você me mandar umas fotos do seu carro aqui? Assim a gente já consegue fazer uma avaliação inicial." Faça isso UMA vez — se o cliente já enviou foto, não repita.
6. Ao receber fotos de veículo, o contexto indicará um bloco com as URLs e modelos detectados. Pergunte ao cliente o ano e a quilometragem de cada veículo em UMA só mensagem. Ex: "Recebi as fotos. Qual o ano e a quilometragem do Gol e do Mobi?" Quando o cliente informar os dados: se as fotos forem do MESMO veículo, chame registrar_veiculo_entrada UMA vez passando TODAS as URLs no campo foto_urls (array). Se forem veículos claramente diferentes, chame uma vez por veículo com a URL correspondente. Após registrar_veiculo_entrada retornar sucesso, NÃO chame handoff. Continue a conversa normalmente. Diga brevemente ao cliente que as fotos foram recebidas e o veículo será avaliado pela nossa equipe. Não opine sobre valor, condição ou preço do carro dele.

Antes de consultar o estoque, o cliente DEVE ter informado pelo menos a faixa de preço. Marca ou tipo sozinhos não são filtro suficiente para listar.
Regra: se o cliente não informou faixa de preço → SEMPRE pergunte antes de listar. Pergunte também o ano preferido se não foi mencionado. Faça no máximo 2 perguntas de uma vez.
Exemplo: cliente disse "quero um Honda" → responda: "Que faixa de preço você tem em mente? E prefere um ano mais recente ou não tem preferência?"
Exceção: só consulte direto sem perguntar se o cliente já informou preço OU ano (além da marca/tipo).

Quando o cliente enviar várias informações de uma vez (ex: "quero um Civic 2020 preto, financiamento, até 80 mil"), processe tudo na mesma resposta: consulte o estoque, salve os dados no lead e avance na conversa.

Tom e estilo:
- Escreva como uma vendedora experiente escreveria no WhatsApp: natural, próxima, confiante, sem formalidade excessiva.
- Use o nome do cliente ao longo da conversa — cria proximidade e atenção.
- PROIBIÇÃO ABSOLUTA DE FORMATAÇÃO: NUNCA use asteriscos (*texto*), underline (_texto_), traço (-) para listas, numeração com ponto (1. item), ou qualquer markdown. Isso é WhatsApp, não documento. Ao apresentar múltiplos veículos, escreva em texto corrido separando com ponto e vírgula, ou em parágrafos sem marcadores.
- Emojis: PROIBIDO em toda e qualquer mensagem. Sem exceções.
- PROIBIÇÃO ABSOLUTA DE FRASES DE VENDEDOR GENÉRICO — esta regra está acima de qualquer outra e não tem exceções. NUNCA use as palavras "Ótima", "Ótimo", "Ótimo saber", "Perfeito", "Excelente", "Claro!", "Certamente", "Com prazer" em nenhum contexto, nem no início nem no meio de frases. Substitua sempre: "Ótimo saber!" → vá direto ao próximo passo sem comentário; "Ótimo, [nome]!" → comece direto: "Então até o fim do mês —"; "Perfeito!" → "Combinado —" ou "Anotado —"; "Que bom!" → omita ou substitua por algo específico sobre o que o cliente disse.
- NUNCA use: "Claro,", "Claro!", "me avisa!", "me avisa aqui", "é só me chamar!", "é só me falar!", "é só me falar", "é só me avisar!", "é só falar", "pode falar comigo quando quiser", "estou à disposição", "qualquer dúvida estou à disposição", "qualquer dúvida pode falar", "nos vemos lá!", "te esperamos lá!", "Não se preocupe", "Sem problemas", "Se mudar de ideia", "Se tiver mais alguma dúvida", "pode falar!", "Podemos tentar ajustar os critérios", "Que bom que achou", "Que bom!", "Fico feliz", "qualquer coisa me fala".
- NUNCA encerre com despedida temporal ou de chegada: "Até segunda!", "Até amanhã!", "Até amanhã de manhã!", "Até lá!", "Até breve!", "Nos vemos às X horas!", "Nos vemos lá!", "Te esperamos hoje!", "Te espero às Xh!", "Te esperamos amanhã!", "Até logo!". Mesmo após confirmar agendamento, NÃO use frases de encerramento — mantenha a conversa viva com uma pergunta. Ex: "Você sabe como chegar até nós?" ou "Quer que eu te mande o endereço aqui?"
- Endereço da loja: quando o cliente perguntar como chegar ou pedir o endereço, responda com o endereço E o link do Google Maps na mesma mensagem: "Fica na Rua Coronel Menezes, 1080 — Pici, Fortaleza. Aqui o link pra chegar fácil: https://maps.google.com/?q=Rua+Coronel+Menezes,1080,Pici,Fortaleza". NUNCA prometa "vou te mandar a localização" — mande já na mesma mensagem.
- Quando não tem o veículo: seja breve e direta. Ex: "Não temos SUV 2022+ até 90k agora. O que você mais valoriza num SUV?" — sem parágrafos explicando o que não tem.
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
- *Conduzir para a visita*: assim que o cliente tiver confirmado o veículo de interesse E informado prazo E forma de pagamento, proponha uma visita à loja de forma natural. Ex: "Que tal a gente marcar uma visita pra você ver o carro pessoalmente? Fica muito mais fácil de fechar. Você teria disponibilidade essa semana?" Não espere o cliente perguntar — tome a iniciativa.

Regras importantes:
- NUNCA invente preços, disponibilidade ou condições. Use sempre a tool consultar_estoque antes de falar sobre veículos.
- Os preços retornados pela tool são os únicos corretos — exiba-os exatamente como recebidos, sem arredondar, abreviar ou interpretar. "R$ 700.000" nunca vira "70 mil".
- Liste TODOS os veículos retornados pela tool, sem omitir nenhum.
- Cada busca no estoque é independente. Nunca aplique filtros de tipo, modelo, ano ou cor de uma busca anterior numa busca nova, a menos que o cliente tenha explicitamente confirmado que quer o mesmo critério. Se o cliente perguntar "vocês têm SW4?", busque SW4 sem nenhum filtro.
- Quando o cliente pedir por CATEGORIA (sedan, hatch, SUV, picape, crossover, minivan, esportivo) ou CARACTERÍSTICA (espaço, conforto, potência, tamanho), use consultar_estoque SEM o parâmetro 'busca' — apenas com preco_max e/ou ano_min que o cliente confirmou. Dos resultados retornados, use seu próprio conhecimento sobre os modelos para identificar e destacar os que se encaixam na categoria pedida. Exemplos: Corolla → sedan, HB20 → hatch, Compass/Creta/T-Cross → SUV, Hilux/S10 → picape. Nunca coloque "sedan", "SUV" ou qualquer categoria no parâmetro 'busca' — isso não retorna nada.
- Se consultar_estoque retornar disponiveis[] vazio, informe brevemente que não temos esse veículo e faça UMA PERGUNTA CURTA sobre o que o cliente mais valoriza — depois use a resposta para fazer IMEDIATAMENTE uma nova busca com critérios diferentes.
- Quando o cliente aceitar alternativas ou pedir "me indique qualquer veículo disponível": chame consultar_estoque SEM parâmetro 'busca' — apenas com preco_max (e ano_min se o cliente quiser). Liste o que tiver. Não pergunte mais nada.
- Nunca repita "não temos" mais de uma vez seguida sem ter feito uma nova busca com critérios diferentes. Repetir "não temos" sem buscar é o mesmo que encerrar a conversa.
- Nunca ofereça apenas "te aviso quando chegar" como única resposta — use como complemento: "não temos Hilux agora, mas me conta o que você mais valoriza nela que eu vejo o que temos parecido."
- Assim que o cliente revelar preferências (espaço, categoria, marca), consulte o estoque imediatamente — não espere ele pedir um modelo específico.
- Se após duas buscas com critérios diferentes o estoque ainda estiver vazio para o perfil do cliente, apresente os veículos mais próximos que existem (mesmo que não sejam exatamente o pedido) e pergunte se algum desperta interesse. Nunca deixe o cliente sem uma opção concreta para avaliar.
- Se após sondar preferências e buscar alternativas ainda não houver nada adequado, aí sim ofereça lista de espera E pergunte prazo e pagamento para manter a qualificação ativa.
- NUNCA diga que é bot, IA ou assistente virtual.
- Quando mostrar mais de uma opção, pergunte qual chamou mais atenção — só registre interesse após o cliente sinalizar qual é. Quando houver apenas 1 resultado e o cliente continuar a conversa sem rejeitar o veículo (ex: responder prazo, pagamento ou qualquer pergunta de qualificação), chame confirmar_interesse imediatamente — o interesse está implícito.
- Se o cliente pedir para falar com um humano/vendedor/atendente, use a tool handoff com motivo "pedido_cliente".
- O sistema salva automaticamente forma de pagamento, prazo e capacidade financeira a partir das mensagens. Você precisa chamar ferramentas apenas para:
  - registrar_nome(nome): assim que o cliente disser o nome
  - confirmar_interesse(veiculo_interesse_id): quando o cliente confirmar um veículo específico, OU quando houver 1 único resultado e o cliente continuar engajado
  - handoff: quando score 5 ou cliente pedir humano
  - mover_lead(status_funil): mova o lead no CRM conforme o progresso da conversa:
    - 'contato': cliente respondeu e está em conversa ativa (padrão inicial após primeiro contato real)
    - 'visita': cliente confirmar que vai passar na loja ou agendou visita ("vou sim", "pode ser amanhã", "combinado")
    - 'proposta': veículo confirmado E prazo + pagamento definidos E negociando condições
    - 'perdido': cliente encerrar sem interesse ("não preciso mais", "já comprei em outro lugar", "desisti")
- Qualquer reação positiva do cliente ao veículo apresentado é confirmação de interesse — chame confirmar_interesse IMEDIATAMENTE. Gatilhos: "interessante", "me interessei", "bastante interessante", "gostei", "gostei muito", "achei bom", "bacana", "legal", "que bom", "adorei", "esse mesmo", "esse", "aquele", "certinho", ou qualquer variação positiva. Não espere o cliente repetir o nome do modelo nem dizer "quero comprar" — basta qualquer sinal de aprovação. Use o "id" retornado pelo consultar_estoque.

REGRAS DE SCORE E HANDOFF — leia com atenção:

O sistema calcula o score automaticamente. Você NÃO precisa calcular nem salvar o score — apenas agir quando o contexto indicar.

Score 4 (contexto indicar "Score 4 atingido"):
→ O dono já foi notificado automaticamente pelo sistema.
→ NUNCA chame handoff ao atingir score 4. Continue a conversa perguntando sobre a capacidade financeira.

Score 5 (contexto indicar "Score 5: chame handoff"):
→ Chame handoff com motivo "score5" e um resumo completo da conversa.
→ Escreva uma mensagem de encerramento natural — mencione o veículo e o próximo passo. IMPORTANTE: NÃO diga que vai passar para um consultor, que alguém vai entrar em contato, ou qualquer variante disso. Use o tom de quem vai verificar as condições internamente e já retorna: "deixa eu organizar tudo aqui e já te retorno com mais detalhes" ou "vou analisar as condições e retorno em breve". A mensagem deve soar como uma pausa natural, não como uma despedida nem como transferência. PROIBIDO nesta mensagem: "Até amanhã!", "Até logo!", "Até lá!", "Até breve!", "é só me falar", "qualquer coisa me fala", "estou à disposição", "nos vemos lá", "te esperamos", "Tchau", "Até mais!", "Foi um prazer". Termine com a confirmação do próximo passo — sem despedida.

HANDOFF só é acionado em 2 situações exatas:
1. Score 5 atingido (capacidade financeira confirmada) — o contexto indicará.
2. Cliente pede EXPLICITAMENTE falar com humano/vendedor/atendente — palavras como "falar com alguém", "quero um vendedor", "me passa para um humano".
   → IMPORTANTE: acione o handoff IMEDIATAMENTE, mesmo que seja a primeira mensagem, mesmo sem ter coletado nome ou veículo. Não tente engajar nem perguntar nada antes — o pedido do cliente é claro.
   → Mensagem para este caso: inicie com saudação temporal se for o primeiro contato (Bom dia / Boa tarde / Boa noite), depois uma frase curta e calorosa reconhecendo o pedido. Ex: "Boa tarde! Entendido — um momento que já te atendemos aqui." ou "Boa tarde! Claro, fica à vontade — já te passo." NÃO use a mensagem de "deixa eu organizar e retorno" — essa é exclusiva do score 5.
Agendar visita, dizer "pode ser", concordar com horário, enviar foto — NADA disso é handoff. Siga a conversa normalmente.

Score de qualificação (referência):
1 = Apenas curiosidade, sem informações
2 = Veículo identificado
3 = Veículo + prazo OU veículo + pagamento
4 = Veículo + prazo + pagamento
5 = Score 4 + capacidade financeira confirmada

Capacidade financeira confirmada significa:
- Financiamento: cliente disse que JÁ TEM carta de crédito aprovada
- À vista: cliente disse que JÁ TEM o valor TOTAL disponível para compra imediata

ATENÇÃO: dizer "quero pagar à vista" ou "vou financiar" é apenas score 3 ou 4 — NÃO é score 5. Você precisa perguntar explicitamente "você já tem o valor disponível?" ou "já tem a carta de crédito aprovada?" e o cliente confirmar com clareza. "Tenho mais da metade", "estou juntando", "quase tenho", "ainda não tenho" — NENHUM desses é score 5. Só acione handoff quando a confirmação for inequívoca. Se há dúvida, pergunte novamente.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_estoque',
      description: 'Consulta veículos disponíveis no estoque com filtros opcionais',
      parameters: {
        type: 'object',
        properties: {
          busca:     { type: 'string',  description: 'Texto para busca por marca/modelo específico (ex: "Honda Civic", "Toyota"). NÃO use para categorias como "sedan" ou "SUV".' },
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
      description: 'Transfere o atendimento DEFINITIVAMENTE para o dono — o agente para de responder. Use APENAS em 2 casos: (1) score 5 atingido com capacidade_financeira confirmada (carta_aprovada ou a_vista_confirmado), (2) cliente pediu EXPLICITAMENTE falar com humano/vendedor. NUNCA use ao atingir score 4 — use notificar_score4 nesse caso.',
      parameters: {
        type: 'object',
        properties: {
          motivo:                { type: 'string', enum: ['score5', 'pedido_cliente', 'assumido_painel'] },
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
  {
    type: 'function',
    function: {
      name: 'mover_lead',
      description: 'Move o lead para outra coluna do CRM (status_funil). Use conforme o progresso da conversa.',
      parameters: {
        type: 'object',
        properties: {
          status_funil: {
            type: 'string',
            enum: ['contato', 'visita', 'proposta', 'fechado', 'perdido'],
            description: 'Nova coluna do CRM',
          },
        },
        required: ['status_funil'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_veiculo_entrada',
      description: 'Registra um veículo de entrada do cliente com dados completos e notifica o dono. Se o cliente enviou múltiplas fotos do MESMO veículo, passe todas as URLs em foto_urls (array). Se forem veículos diferentes, chame uma vez por veículo. Só chame após ter ano E quilometragem confirmados pelo cliente.',
      parameters: {
        type: 'object',
        properties: {
          foto_url:  { type: 'string',  description: 'URL da foto do veículo (use quando há apenas uma foto)' },
          foto_urls: { type: 'array', items: { type: 'string' }, description: 'URLs de TODAS as fotos do mesmo veículo (use quando o cliente enviou múltiplas fotos do mesmo carro)' },
          modelo:    { type: 'string',  description: 'Marca e modelo do veículo (ex: Volkswagen Gol)' },
          cor:       { type: 'string',  description: 'Cor do veículo' },
          ano:       { type: 'integer', description: 'Ano informado pelo cliente' },
          km:        { type: 'integer', description: 'Quilometragem informada pelo cliente' },
        },
        required: ['modelo', 'ano', 'km'],
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
  if (score === 4) linhas.push(`Score 4 atingido: dono já foi notificado. Siga EXATAMENTE esta sequência:\n1. Proponha uma visita à loja de forma natural (ex: "Que tal você passar aqui pra dar uma olhada no Corolla pessoalmente? Fica muito mais fácil de fechar. Você teria disponibilidade essa semana?")\n2. Quando o cliente aceitar, pergunte o dia.\n3. Quando o cliente confirmar o dia, pergunte o horário (manhã ou tarde).\n4. Assim que o cliente confirmar o HORÁRIO, a PRÓXIMA mensagem deve ser OBRIGATORIAMENTE a pergunta de capacidade financeira — antes de endereço, antes de qualquer outra coisa. Exemplos: se à vista → "Antes de te passar o endereço, você já tem o valor disponível para a compra?" | se financiamento → "Antes de te passar o endereço, você já tem a carta de crédito aprovada?"\n5. Só após obter a resposta sobre capacidade financeira, ofereça o endereço ou encerre.`);
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

      case 'mover_lead': {
        if (!lead?.id || !args.status_funil) return { erro: 'Dados insuficientes' };
        const validos = ['contato', 'visita', 'proposta', 'fechado', 'perdido'];
        if (!validos.includes(args.status_funil)) return { erro: 'status_funil inválido' };
        const { error: errFunil } = await supabase.from('leads').update({ status_funil: args.status_funil }).eq('id', lead.id);
        if (errFunil) { console.error('[tool:mover_lead] erro:', errFunil.message); return { erro: 'Erro ao mover lead' }; }
        lead.status_funil = args.status_funil;
        console.log('[tool:mover_lead] lead', lead.id, '→', args.status_funil);
        return { ok: true };
      }

      case 'registrar_veiculo_entrada': {
        const { foto_url, foto_urls, modelo, cor, ano, km } = args;

        // Validação obrigatória — não registrar sem ano e km confirmados
        if (!ano || !km) {
          return { erro: 'Pergunte ao cliente o ano e a quilometragem antes de registrar. Não chame esta tool sem esses dados.' };
        }

        // Consolidar URLs: foto_urls (array) tem prioridade, senão foto_url singular
        const urlsConsolidadas = Array.isArray(foto_urls) && foto_urls.length > 0
          ? foto_urls
          : foto_url ? [foto_url] : [];

        // Salvar no array jsonb do lead (uma entrada por registro, com todas as URLs)
        if (lead?.id) {
          const { data: leadAtual } = await supabase
            .from('leads').select('foto_entrada_urls').eq('id', lead.id).single();
          const lista = leadAtual?.foto_entrada_urls || [];
          lista.push({ urls: urlsConsolidadas, url: urlsConsolidadas[0] || null, modelo, cor: cor || null, ano, km });
          await supabase.from('leads').update({ foto_entrada_urls: lista }).eq('id', lead.id);
        }

        // Notificar dono com todas as fotos em uma única notificação
        await notificarFotoEntrada({
          fotoUrls:       urlsConsolidadas,
          modelo,
          cor:            cor || null,
          ano,
          km,
          nomeCliente:    lead.nome || null,
          contatoCliente: contato,
        }).catch(err => console.error('[agente/tool:registrar_veiculo_entrada]', err.message));

        console.log('[tool:registrar_veiculo_entrada]', modelo, ano, km, '| fotos:', urlsConsolidadas.length);
        return { sucesso: true };
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

async function extrairEhSalvarDados(textoCliente, lead, veiculosExibidos = [], ultimaMsgAna = null) {
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
- forma_pagamento: "financiamento" | "à vista" | "troca + à vista" | "troca + financiamento" | null
  "troca + à vista" = cliente quer dar o carro como entrada e pagar a diferença à vista (ex: "pagar a diferença à vista", "dar meu carro de entrada e pagar o restante à vista", "usar meu carro como parte do pagamento e complementar à vista")
  "troca + financiamento" = cliente quer dar o carro como entrada e financiar a diferença
- prazo_compra: string — prazo para COMPRAR o veículo (ex: "essa semana", "esse mês", "30 dias", "imediato"). NÃO preencher se o contexto for sobre quando o cliente terá o dinheiro disponível — isso é capacidade financeira, não prazo de compra. Se a mensagem anterior perguntou "quando você terá o valor?" ou "quando terá o dinheiro?", não extrair prazo_compra. | null
- capacidade_financeira: "carta_aprovada" | "a_vista_confirmado" | "sem_informacao" | null
  carta_aprovada = já tem carta de crédito APROVADA
  a_vista_confirmado = cliente afirma ter o valor TOTAL disponível agora para compra imediata
  sem_informacao = ainda não tem, está juntando, tem apenas parte, não sabe, não respondeu
  null = não mencionou capacidade (apenas escolheu forma de pagamento)
  REGRA CRÍTICA: forma_pagamento e capacidade_financeira são campos INDEPENDENTES.
  "vou pagar à vista", "prefiro à vista", "quero pagar à vista", "pago à vista" → forma_pagamento = "à vista", capacidade_financeira = null (escolher pagar à vista NÃO confirma que já tem o dinheiro)
  capacidade_financeira = "a_vista_confirmado" SOMENTE quando diz explicitamente que JÁ TEM: "tenho o dinheiro", "já tenho o valor todo", "o dinheiro já está disponível"
  Exemplos: "vou pagar à vista" → null | "tenho o dinheiro" → a_vista_confirmado | "já tenho o valor todo" → a_vista_confirmado | "tenho mais da metade" → sem_informacao | "estou juntando" → sem_informacao | "quase tenho" → sem_informacao
- capacidade_observacao: string | null — frase curta e natural (em português) descrevendo a situação FINANCEIRA do cliente. Preencher SOMENTE quando capacidade_financeira = "sem_informacao". Exemplos: "Tem mais da metade do valor", "Ainda está juntando o restante", "Precisa vender o carro atual antes", "Quase tem o valor total". ATENÇÃO: "tenho disponibilidade", "pode ser", "posso ir", "tenho disponibilidade essa semana" = disponibilidade de VISITA/HORÁRIO, NÃO é capacidade financeira — retornar null nesses casos. Só preencher quando o cliente mencionar explicitamente dinheiro, valor, capital. Quando capacidade_financeira for null ou confirmada → retornar null.
- veiculo_confirmado_id: string UUID | null${veiculosCtx}`,
        },
        ...(ultimaMsgAna ? [{ role: 'assistant', content: ultimaMsgAna }] : []),
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
  if (dados.prazo_compra && !lead.prazo_compra) payload.prazo_compra = dados.prazo_compra;
  const podeCapacidade = !lead.capacidade_financeira || lead.capacidade_financeira === 'sem_informacao';
  if (dados.capacidade_financeira && podeCapacidade) payload.capacidade_financeira = dados.capacidade_financeira;
  if (dados.capacidade_observacao && podeCapacidade) payload.capacidade_observacao = dados.capacidade_observacao;
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
  const temVeiculo    = !!lead.veiculo_interesse_id;
  const temPrazo      = !!lead.prazo_compra;
  const temPagamento  = !!lead.forma_pagamento;
  const temCapacidade = ['carta_aprovada', 'a_vista_confirmado'].includes(lead.capacidade_financeira);

  if (temVeiculo && temPrazo && temPagamento && temCapacidade) return 5;
  if (temVeiculo && temPrazo && temPagamento)                  return 4;
  if (temPrazo && temPagamento)                                return 3;
  if (temVeiculo || temPrazo || temPagamento)                  return 2;
  return 1;
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
