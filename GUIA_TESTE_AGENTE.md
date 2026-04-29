# Guia Completo de Teste do Agente Ana

> **Como usar**: siga os roteiros abaixo enviando as mensagens pelo WhatsApp (número de teste). Após cada bloco, verifique o Supabase e as notificações conforme indicado.

---

## PRÉ-REQUISITOS

Antes de iniciar qualquer teste:

- [ ] Backend rodando (Railway ou `npm run dev` local na porta 3001)
- [ ] WhatsApp conectado ao Z-API (verificar no painel Z-API se o QR foi escaneado)
- [ ] `OWNER_PHONE_NUMBER` configurado — você vai receber as notificações nesse número
- [ ] Pelo menos 1 veículo com status `disponivel` cadastrado no estoque
- [ ] `OPENAI_API_KEY` válida

**Como resetar uma conversa entre testes:**
Supabase → tabela `leads` → localizar pelo número de telefone → deletar o registro (a tabela `conversas` é deletada em cascata automaticamente).

---

## COMO LER ESTE GUIA

Cada bloco tem:
- **Você envia** → a mensagem exata a digitar no WhatsApp
- **Ana deve** → o comportamento esperado na resposta
- **Verificar** → o que checar no Supabase ou nas notificações

---

## BLOCO 1 — FLUXO COMPLETO: do zero ao handoff à vista

> Use uma conversa nova. Substitua os dados em colchetes pelos do seu estoque real.

---

**Passo 1**
Você envia: `Oi`
Ana deve: se apresentar pelo nome ("Sou a Ana, da Aguiar Veículos"), adaptar a saudação ao período do dia (bom dia/boa tarde/boa noite), perguntar o nome.
Verificar: Supabase → tabela `leads` → novo registro criado com o número, `canal = 'whatsapp'`, `score_qualificacao = 1`.

---

**Passo 2**
Você envia: `Lucas`
Ana deve: usar o nome na resposta ("Lucas"), perguntar o que está procurando ou avançar na conversa.
Verificar: Supabase → `leads.nome = 'Lucas'`.

---

**Passo 3**
Você envia: `Quero um sedan, até R$ 60 mil`
Ana deve: consultar o estoque com `preco_max: 60000` (sem pedir mais informações, pois já tem faixa de preço), listar os veículos disponíveis descrevendo pontos fortes.
Verificar: Ana listou veículos reais do seu estoque. Nenhum valor foi inventado.

---

**Passo 4**
Você envia: `[nome do veículo que ela listou] me interessou`
Ana deve: confirmar o interesse (chama `confirmar_interesse` internamente), perguntar prazo e forma de pagamento juntos: "Para organizar aqui: qual é o seu prazo para comprar, e você prefere financiar ou pagar à vista?"
Verificar: Supabase → `leads.veiculo_interesse_id` preenchido com o UUID do veículo.

---

**Passo 5**
Você envia: `Quero comprar esse mês, vou pagar à vista`
Ana deve: salvar prazo e pagamento, propor uma visita à loja ANTES de perguntar sobre o valor: "Que tal você passar aqui para ver o carro pessoalmente? Fica muito mais fácil de fechar. Você teria disponibilidade essa semana?"
Verificar: Supabase → `forma_pagamento = 'à vista'`, `prazo_compra = 'esse mês'` (ou similar). `score_qualificacao = 4`.
Você receberá uma notificação no WhatsApp com "Lead qualificado — Score 4" contendo nome, veículo, pagamento, prazo e resumo narrativo.

---

**Passo 6**
Você envia: `Pode ser sim, tenho disponibilidade`
Ana deve: confirmar a visita e DEPOIS perguntar a capacidade: "E só pra eu organizar aqui, Lucas — você já tem o valor disponível?"
Verificar: Ana NÃO fez handoff aqui. A visita foi confirmada, mas capacidade ainda não foi confirmada.

---

**Passo 7**
Você envia: `Tenho mais da metade do valor`
Ana deve: continuar a conversa normalmente, NÃO acionar handoff. Pode perguntar quando terá o restante ou oferecer financiamento parcial.
Verificar: Supabase → `capacidade_financeira = 'sem_informacao'`. `atendimento_humano = false`. `score_qualificacao` permanece 4.

---

**Passo 8**
Você envia: `Na verdade já tenho o valor todo disponível`
Ana deve: acionar o handoff com despedida contextualizada — menciona o veículo e o próximo passo ("vou passar seu contato para o consultor").
Verificar: Supabase → `capacidade_financeira = 'a_vista_confirmado'`, `score_qualificacao = 5`, `atendimento_humano = true`.
Você receberá notificação "Transferência de atendimento — Score 5 atingido" com resumo completo.
Enviar outra mensagem: Ana NÃO responde (handoff ativo).

---

## BLOCO 2 — FLUXO COMPLETO: handoff por financiamento com carta aprovada

> Reinicie a conversa (delete o lead no Supabase).

Siga os passos 1–4 do Bloco 1, depois:

**Passo 5**
Você envia: `Quero financiar, prazo de 2 meses`
Ana deve: salvar pagamento e prazo, propor visita à loja.

**Passo 6**
Você envia: `Posso ir lá essa semana`
Ana deve: confirmar visita e perguntar: "Você já tem carta de crédito aprovada ou ainda vai buscar?"

**Passo 7**
Você envia: `Já tenho carta aprovada`
Ana deve: acionar handoff com motivo `score5` — despedida contextualizada.
Verificar: `capacidade_financeira = 'carta_aprovada'`, `score_qualificacao = 5`, `atendimento_humano = true`.
Notificação deve mostrar: "Capacidade: Carta de crédito aprovada".

---

## BLOCO 3 — HANDOFF POR PEDIDO DO CLIENTE

> Reinicie a conversa.

Você envia: `Oi, quero falar com um vendedor`
Ana deve: acionar handoff imediatamente com motivo `pedido_cliente`. Responde que vai passar para o consultor e se despede.
Verificar: `atendimento_humano = true`. Notificação com "Cliente pediu falar
 com humano".
Enviar outra mensagem: Ana NÃO responde.

---

## BLOCO 4 — VEÍCULO INDISPONÍVEL + ALTERNATIVAS

> Reinicie a conversa.

**Passo 1**
Você envia: `Vocês têm Hilux?`
Ana deve: perguntar faixa de preço e/ou ano (regra: não lista sem preço).

**Passo 2**
Você envia: `Até R$ 150 mil`
Ana deve: buscar Hilux no estoque. Se não tiver: informar brevemente que não tem e fazer UMA pergunta curta — "O que você mais valoriza na Hilux?" NÃO deve sugerir alternativas ainda.

**Passo 3**
Você envia: `Gosto do tamanho e da robustez`
Ana deve: fazer uma nova busca no estoque SEM o filtro "Hilux" — apenas com `preco_max: 150000`. Listar o que tiver. NÃO perguntar mais nada antes de buscar.

**Passo 4**
Você envia: `Pode me indicar qualquer opção disponível`
Ana deve: fazer nova busca imediatamente sem filtro de modelo. Listar tudo dentro do orçamento.
Verificar: Ana NÃO repetiu "não temos" mais de uma vez sem ter buscado entre as repetições.

---

## BLOCO 5 — OBJEÇÕES DE FECHAMENTO

> Reinicie a conversa. Leve até o ponto onde Ana listou um veículo, depois teste cada objeção separadamente.

**Objeção 1 — Ainda pesquisando**
Você envia: `Ainda estou pesquisando`
Ana deve: perguntar o que falta para se sentir mais seguro. NÃO encerrar a conversa.

**Objeção 2 — Preço alto**
Você envia: `Tá um pouco caro pra mim`
Ana deve: sondar orçamento ou oferecer financiamento. NÃO usar "Sem problemas" ou "Podemos tentar ajustar os critérios".

**Objeção 3 — Vou pensar**
Você envia: `Vou pensar`
Ana deve: mencionar que o modelo tem saída e propor visita sem compromisso. NÃO usar frase de encerramento.

**Objeção 4 — Após proposta de visita aceita**
Você envia: `Pode ser`
Ana deve: usar fechamento alternativo — "você prefere amanhã de manhã ou à tarde?" NÃO confirmar e encerrar.

---

## BLOCO 6 — IDENTIDADE DA ANA

> Pode ser em qualquer ponto da conversa.

**Teste 1**
Você envia: `Você é um robô?`
Ana deve: negar com personalidade e leveza. Ex.: "haha, sou gente sim! Consultora aqui da Aguiar."

**Teste 2**
Você envia: `Mas é IA né, pode falar`
Ana deve: manter a persona sem confirmar. Pode desviar com humor ou redirecionar.
Verificar: Ana NUNCA usa as palavras "robô", "IA", "inteligência artificial", "assistente virtual".

---

## BLOCO 7 — FOTO DE VEÍCULO PARA ENTRADA

> Reinicie a conversa com nome e veículo de interesse já definidos.

**Passo 1**
Você envia: uma foto de um carro real com a legenda `Quero dar esse de entrada`
Ana deve: confirmar que recebeu a foto, dizer que encaminhou para a equipe, e continuar a conversa normalmente. NÃO opinar sobre o estado ou valor do carro da foto.
Verificar: Supabase → `leads.foto_entrada_url` preenchido.
Verificar: notificação no WhatsApp E Telegram com a foto e os dados estimados do veículo.
Verificar: `atendimento_humano` permanece `false` (sem handoff).

**Passo 2**
Você envia mais uma foto de carro com legenda `e esse também`
Ana deve: confirmar o recebimento da segunda foto também. Dono recebe as duas.

---

## BLOCO 8 — FOTO QUE NÃO É VEÍCULO

> Reinicie a conversa.

**Teste 1**
Você envia: uma foto de CNH, RG ou comprovante (sem legenda)
Ana deve: continuar a conversa normalmente. NÃO acionar handoff.
Verificar: `foto_entrada_url = null`. `atendimento_humano = false`.

**Teste 2**
Você envia: uma selfie ou foto de paisagem
Ana deve: continuar a conversa normalmente. Sem travar, sem erro.

---

## BLOCO 9 — ÁUDIO (WHISPER)

> Reinicie a conversa.

**Teste 1**
Grave e envie pelo WhatsApp: *"Oi, vocês têm Corolla disponível?"*
Ana deve: transcrever e responder sobre Corollas.
Verificar: logs do Railway → `[webhook] Áudio transcrito: Oi, vocês têm Corolla disponível?`

**Teste 2**
Grave: *"Quero um SUV, tenho até 80 mil, ano 2021 pra cima"*
Ana deve: buscar estoque com os filtros corretos sem pedir que você repita.

**Teste 3**
Grave 2–3 segundos de silêncio ou ruído
Ana deve: responder normalmente sem travar ou dar erro.

---

## BLOCO 10 — MÚLTIPLAS INFORMAÇÕES DE UMA VEZ

> Reinicie a conversa.

Você envia: `Quero um SUV, ano 2022 pra cima, até R$ 90 mil, vou financiar, prazo de 30 dias`
Ana deve: processar TUDO de uma vez — consultar estoque com todos os filtros, listar os resultados, salvar os dados — sem perguntar nada que já foi informado.
Verificar: Supabase → `forma_pagamento = 'financiamento'`, `prazo_compra` preenchido, score avançou.

---

## BLOCO 11 — FORA DO HORÁRIO

> Configure `HORARIO_24H=false` e envie uma mensagem fora do horário configurado.

Você envia: `Oi`
Ana deve: responder com a mensagem de fora do horário (sem chamar o GPT). Lead criado no Supabase mesmo assim.
Verificar: Supabase → lead criado. Nenhuma chamada à OpenAI nos logs.

---

## O QUE OBSERVAR EM TODAS AS RESPOSTAS

Após cada resposta da Ana, verifique:

| O que checar | Correto | Incorreto — sinal de problema |
|---|---|---|
| **Emojis** | Nenhum | Qualquer emoji |
| **Frases robóticas** | Ausentes | "Claro!", "Certamente!", "Perfeito!", "Ótima escolha!", "é só me chamar", "Sem problemas", "Não se preocupe", "Até lá!", "qualquer dúvida estou à disposição" |
| **Markdown** | Sem listas nem negrito duplo | Listas com `-` ou `**negrito**` |
| **Encerramento** | Termina com pergunta ou ação | Termina com despedida sem pergunta |
| **Preços** | Exatamente como no estoque | Arredondado, abreviado ou inventado |
| **Nome do cliente** | Usa o nome ao longo da conversa | Nunca usa o nome |

---

## VERIFICAÇÕES FINAIS NO SUPABASE

| Campo | Quando deve estar preenchido |
|---|---|
| `nome` | Após cliente informar |
| `veiculo_interesse_id` | Após confirmar interesse em veículo específico |
| `forma_pagamento` | Após cliente informar |
| `prazo_compra` | Após cliente informar |
| `capacidade_financeira` | Após score 4 + resposta sobre capital |
| `score_qualificacao` | Avança de 1 a 5 conforme a conversa |
| `atendimento_humano` | `true` somente após handoff |
| `foto_entrada_url` | Preenchido após foto de veículo |
| `status_funil` | Muda conforme conversa: visita confirmada → `visita` |
