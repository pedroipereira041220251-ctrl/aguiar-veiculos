# Guia Completo de Testes — Fase 2
**Aguiar Veículos · Agente Ana · Whisper · Vision · Financeiro · Instagram DM**
**Atualizado em 16/04/2026**

> **Como usar:** execute cada item em ordem. Anote o resultado ao lado:
> ✅ Aprovado · ❌ Falhou · 🔁 Comportamento inesperado · ⬜ Ainda não testado
>
> **Para reiniciar uma conversa:** Supabase → tabela `leads` → deletar o registro do número de teste (a tabela `conversas` é deletada em cascata automaticamente).

---

## PRÉ-REQUISITOS

- [ ] Backend ativo no Railway (deploy atual)
- [ ] Frontend rodando em `localhost:3000`
- [ ] WhatsApp conectado ao Z-API
- [ ] `OWNER_PHONE_NUMBER` configurado (número do dono)
- [ ] `TELEGRAM_BOT_TOKEN` e `TELEGRAM_OWNER_CHAT_ID` configurados
- [ ] `OPENAI_API_KEY` configurada no Railway
- [ ] Pelo menos 1 veículo disponível e 1 venda registrada no estoque
- [ ] `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_ID` configurados (Bloco 5 — pode deixar em branco e pular o bloco)

---

## BLOCO 1 — Agente Ana: conversa completa

> Abrir o WhatsApp com o número do bot. Enviar cada mensagem e aguardar a resposta antes de continuar.

---

### 1A — Apresentação e saudação adaptada

**O que valida:** Ana se apresenta com saudação correta para o período do dia, pede o nome, salva imediatamente.

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1A.1 | ⬜ | `Oi` | Ana se apresenta usando **Bom dia / Boa tarde / Boa noite** conforme o horário — nunca apenas "Oi". Pede o nome do cliente. |
| 1A.2 | ⬜ | `Lucas` | Ana usa o nome, agradece naturalmente (sem "Ótimo!" ou "Perfeito!") e pergunta o que procura. **Verificar no Supabase:** `leads.nome = "Lucas"` |

---

### 1B — Busca no estoque

**O que valida:** lista todos os veículos, preços exatos, sem markdown.

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1B.1 | ⬜ | `Estou procurando um Honda, o que vocês têm?` | Ana lista **todos** os Hondas com preço exato (não arredondado), descrição em texto corrido, sem listas numeradas |
| 1B.2 | ⬜ | `Quero só Honda Civic` | Ana refaz busca filtrada e lista só Civics |
| 1B.3 | ⬜ | `Até R$ 60 mil` | Ana filtra por preço e apresenta só os que cabem. Pode mencionar escassez de forma natural |

---

### 1C — Veículo indisponível e alternativas

**O que valida:** quando não tem o modelo, Ana sonda preferências antes de sugerir.

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1C.1 | ⬜ | `Vocês têm Hilux?` | Ana diz que não tem e **pergunta o que mais gosta na Hilux** (tamanho? marca? robustez?) — não sugere nada ainda |
| 1C.2 | ⬜ | `Gosto do tamanho e da Toyota` | Ana busca Toyotas **imediatamente** e apresenta o que tem |
| 1C.3 | ⬜ | `Tem alguma Porsche?` *(improvável)* | Ana diz que não tem e pergunta faixa de preço antes de sugerir qualquer coisa |

---

### 1D — Múltiplas informações de uma vez

**O que valida:** processa tudo em uma só resposta, sem perguntas redundantes.

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1D.1 | ⬜ | `Quero um SUV, ano 2022 pra cima, até R$ 90 mil, vou financiar, prazo de 30 dias` | Ana consulta estoque com todos os filtros, apresenta resultados, **não** pergunta de novo o que você acabou de dizer |

**Verificar no Supabase:** `forma_pagamento = "financiamento"` e `prazo_compra = "30 dias"` preenchidos.

---

### 1E — Qualificação score 4 → notificação do dono

**O que valida:** ao atingir score 4, dono recebe notificação com todos os campos preenchidos.

Iniciar conversa nova:

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1E.1 | ⬜ | `Oi, me chamo Maria` | Ana salva o nome e pergunta o que procura |
| 1E.2 | ⬜ | `Quero um Honda Civic até R$ 60 mil` | Ana busca e apresenta as opções |
| 1E.3 | ⬜ | `Gostei do Civic 2020 de R$ 54 mil` | Ana confirma o interesse e pergunta o prazo |
| 1E.4 | ⬜ | `Quero comprar essa semana` | Ana salva prazo e pergunta a forma de pagamento |
| 1E.5 | ⬜ | `Vou financiar` | Ana salva pagamento e pergunta: *"você já tem carta de crédito aprovada ou ainda vai buscar?"* |
| 1E.6 | ⬜ | `Ainda vou buscar` | Ana salva `capacidade_financeira = sem_informacao`. **Score 4 atingido → dono recebe notificação no WhatsApp** |

**Notificação esperada no WhatsApp do dono:**
```
🔔 Lead qualificado — Score 4
👤 Maria · WhatsApp
📞 Contato: 5511...
🚗 Interesse: Civic 2020 (placa)
💳 Pagamento: financiamento
💰 Capacidade: Sem informação
📅 Prazo: essa semana
📝 [resumo da conversa]
```

**Verificar no Supabase:** `score_qualificacao = 4` · `veiculo_interesse_id` · `forma_pagamento` · `prazo_compra` — **todos preenchidos**.
**Verificar no CRM** (`localhost:3000/crm`): card da Maria mostra score 4.

---

### 1F — Score 5 → handoff automático

**O que valida:** confirmação de capital dispara transferência definitiva.

Continuar a conversa do bloco 1E:

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1F.1 | ⬜ | `Consegui a carta de crédito aprovada` | Score 5 → Ana diz que vai conectar com o consultor → **dono recebe notificação de handoff** |
| 1F.2 | ⬜ | Envie qualquer mensagem | Ana **não responde** (atendimento humano ativo) |

**Notificação esperada no WhatsApp do dono:**
```
🤝 Transferência de atendimento
Motivo: ✅ Score 5 atingido
👤 Maria · WhatsApp
📞 Contato: 5511...
🚗 Interesse: Civic 2020
💳 Pagamento: financiamento
💰 Capacidade: ✅ Carta de crédito aprovada
📅 Prazo: essa semana
```

**Verificar no Supabase:** `atendimento_humano = true` · `score_qualificacao = 5`
**Verificar no CRM:** card mostra badge `Humano` e score 5.

---

### 1G — Score 5 por pagamento à vista

**O que valida:** fluxo alternativo ao financiamento.

Iniciar conversa nova:

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1G.1 | ⬜ | `Oi, sou o João. Quero a Toyota SW4, vou pagar à vista, quero fechar esse mês` | Ana busca SW4, apresenta com preço exato, registra pagamento e prazo |
| 1G.2 | ⬜ | *(Ana pergunta: "você já tem o valor disponível?")* — responda: `Sim, tenho o valor` | Score 5 → handoff → dono notificado com `💵 À vista confirmado` |

---

### 1H — Handoff por pedido do cliente

**O que valida:** handoff imediato quando cliente pede falar com humano.

Iniciar conversa nova:

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1H.1 | ⬜ | `Oi, quero falar com um vendedor` | Ana faz handoff imediatamente — diz que vai conectar |
| 1H.2 | ⬜ | Qualquer mensagem | Ana **não responde** |

---

### 1I — Técnicas de fechamento e objeções

**O que valida:** Ana usa escassez, fechamento alternativo e trata objeções sem encerrar a conversa.

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1I.1 | ⬜ | `Ainda estou pesquisando` | Ana **não encerra** — pergunta o que falta para decidir ou sugere visita sem compromisso |
| 1I.2 | ⬜ | `Tá um pouco caro pra mim` | Ana sonda orçamento ou oferece financiamento |
| 1I.3 | ⬜ | `Vou pensar` | Ana menciona que o veículo tem boa saída e propõe agendar visita |
| 1I.4 | ⬜ | *(Ana propõe visita)* → responda: `Pode ser` | Ana usa fechamento alternativo: *"você prefere vir amanhã de manhã ou à tarde?"* |

---

### 1J — Identidade da Ana

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 1J.1 | ⬜ | `Você é um robô?` | Ana nega — diz ser consultora da loja, nunca confirma ser IA |
| 1J.2 | ⬜ | `Tá, mas é IA né` | Ana mantém a persona sem confirmar |

---

## BLOCO 2 — Whisper: transcrição de áudio

> Testar no WhatsApp. Verificar nos logs do Railway: filtrar por `[whisper]` e `[webhook]`.

---

### 2A — Áudio do cliente (WhatsApp PTT)

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 2A.1 | ⬜ | 🎤 Grave: *"Oi, vocês têm Corolla disponível?"* | Ana transcreve e responde sobre Corollas. Log Railway: `[webhook] Áudio transcrito: Oi, vocês têm Corolla...` |
| 2A.2 | ⬜ | 🎤 Grave ~15s: *"Quero comprar um SUV, de preferência um Jeep Compass ou HR-V, com até 80 mil quilômetros e ano 2021 ou mais novo. Posso dar um Gol 2018 de entrada."* | Transcrição completa aparece no log. Ana responde citando SUV/Compass/HR-V |
| 2A.3 | ⬜ | Envie um arquivo de áudio com legenda digitada: *"Tenho interesse em sedan"* | Ana usa a **legenda** (não o áudio). Log **não** mostra `Áudio transcrito`. `conversas.tipo = 'text'` |
| 2A.4 | ⬜ | 🎤 Grave 2-3s com barulho / sem falar nada | Ana não trava — ignora ou pede para repetir. **Sem exception nos logs** |

**Verificar no Supabase `conversas`:** mensagens de áudio têm `tipo = 'audio'` (confirma que Whisper foi usado).

---

### 2B — Áudio do dono (Telegram)

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 2B.1 | ⬜ | No Telegram: enviar `/menu` → entrar em qualquer wizard (ex: Cadastrar Veículo → informar placa) → responder com **mensagem de voz** | Voz transcrita. Log: `[webhook/tg] Voz transcrita: ...` → wizard avança normalmente |
| 2B.2 | ⬜ | No Telegram: sem wizard ativo, enviar mensagem de voz | Log mostra a transcrição mas bot **não responde** (sem sessão ativa) |

---

## BLOCO 3 — GPT-4o Vision: análise de imagem

> Testar no WhatsApp. Verificar nos logs: `[vision]` e `[handoff]`.

---

### 3A — Foto de veículo (handoff automático)

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 3A.1 | ⬜ | 📷 Foto de um carro com legenda: *"Quero dar esse de entrada"* | Log: `[vision] is_veiculo: true`. Ana responde: *"Foto recebida! Vou encaminhar para nossa equipe avaliar."* |
| 3A.2 | ⬜ | Verificar `leads.foto_entrada_url` no Supabase | Campo preenchido com URL da imagem (não null) |
| 3A.3 | ⬜ | Verificar WhatsApp/Telegram do dono | Notificação com dados do veículo (marca, modelo estimado, condição) + foto |
| 3A.4 | ⬜ | Verificar CRM (`localhost:3000/crm`) | Lead em atendimento humano após o handoff |
| 3A.5 | ⬜ | Enviar qualquer mensagem após a foto | Ana **não responde** (handoff ativo) |

---

### 3B — Foto de veículo com texto

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 3B.1 | ⬜ | 📷 Foto de carro + legenda: *"Quero dar esse de entrada, é um Gol 2019"* | Handoff ativo. Texto da legenda salvo em `conversas`. Dono notificado com a foto E com o texto. |

---

### 3C — Foto que não é veículo

| # | Status | Você envia | Resultado esperado |
|---|--------|------------|--------------------|
| 3C.1 | ⬜ | 📷 Foto de documento (CNH, comprovante) | Log: `[vision] is_veiculo: false`. Ana continua a conversa normalmente. **Sem handoff**. |
| 3C.2 | ⬜ | 📷 Selfie ou foto de paisagem, sem legenda | Ana responde sem erros. **Sem handoff**. `foto_entrada_url` permanece null. |

---

### 3D — Foto no Telegram do dono (cadastro de veículo)

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3D.1 | ⬜ | No Telegram: `/menu` → Cadastrar Veículo → seguir wizard até o passo de foto → enviar foto de um carro | Foto salva como imagem do veículo em estoque. **Não** aciona Vision de análise de entrada. Wizard avança normalmente. |

---

## BLOCO 4 — Página /financeiro

> Acessar `http://localhost:3000/financeiro`.
> Pré-requisito: ter pelo menos 1 veículo com `status='vendido'` e `data_venda` no mês atual.

---

### 4A — Seletor de mês

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 4A.1 | ⬜ | Acessar `/financeiro` | Título exibe **"Abril 2026"** (mês atual) |
| 4A.2 | ⬜ | Clicar em `‹` (mês anterior) | Título muda para "Março 2026", cards recarregam |
| 4A.3 | ⬜ | Clicar em `›` estando no mês atual | Botão **desabilitado** — não avança além do mês atual |
| 4A.4 | ⬜ | Navegar até um mês sem vendas (ex: Janeiro 2025) | Cards mostram R$ 0,00 e "0 vendas" sem erro na tela |

---

### 4B — Cards de métricas

Com o mês atual selecionado (que tem vendas):

| # | Status | Card | O que verificar |
|---|--------|------|-----------------|
| 4B.1 | ⬜ | **Receita** | Soma dos `preco_venda_final` das vendas do mês — conferir contra Supabase |
| 4B.2 | ⬜ | **Lucro real** | Receita menos compra e custos |
| 4B.3 | ⬜ | **Margem %** | `(lucro / receita) × 100` — conferir com cálculo manual |
| 4B.4 | ⬜ | **Vendas** | Quantidade de registros `status='vendido'` no mês |

---

### 4C — Ranking de vendas

| # | Status | O que verificar |
|---|--------|-----------------|
| 4C.1 | ⬜ | Tabela com colunas: Veículo · Venda · Custos · Lucro · Margem, ordenada por maior lucro |
| 4C.2 | ⬜ | Rodapé com totais somados de Venda, Custos e Lucro |
| 4C.3 | ⬜ | Mês com mais de 5 vendas: **todos** aparecem, sem truncar |

---

### 4D — Custos por categoria

| # | Status | O que verificar |
|---|--------|-----------------|
| 4D.1 | ⬜ | Barras proporcionais com valor (R$) e quantidade de lançamentos, ordenadas por maior custo |
| 4D.2 | ⬜ | Navegar para mês sem custos: seção exibe estado vazio sem erro |

---

### 4E — Estoque atual (snapshot)

| # | Status | O que verificar |
|---|--------|-----------------|
| 4E.1 | ⬜ | Células de resumo: Qtd veículos · Total investido · Lucro estimado |
| 4E.2 | ⬜ | Lista de veículos: Placa · Modelo · Ano · Investimento · Lucro estimado · Margem % · Preço de venda |
| 4E.3 | ⬜ | Com 10+ veículos: lista rola verticalmente sem quebrar layout |

---

## BLOCO 5 — Instagram DM

> ⚠️ Este bloco requer `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` e `META_PAGE_ID` configurados no Railway e webhook registrado no painel Meta for Developers.
>
> **Como registrar o webhook:**
> 1. Meta for Developers → seu App → Webhooks → Adicionar produto Instagram
> 2. Webhook URL: `https://<domínio-railway>/webhooks/instagram`
> 3. Verify Token: valor de `META_VERIFY_TOKEN`
> 4. Campos: `messages`, `messaging_postbacks`
>
> Se as credenciais não estiverem disponíveis, marcar todos como `⬜ bloqueado` e pular.

---

### 5A — Verificação do webhook

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 5A.1 | ⬜ | Executar no terminal: `curl "https://<domínio>/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=test123"` | Resposta HTTP 200 com corpo `test123`. Log Railway: `[webhook/instagram] Webhook verificado pelo Meta` |

---

### 5B — Receber mensagem do cliente via Instagram

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 5B.1 | ⬜ | Cliente envia "Oi" via Instagram DM | Agente responde apresentando a loja. Supabase `leads`: novo registro com `canal = 'instagram'` |
| 5B.2 | ⬜ | Cliente pergunta sobre veículo disponível | Agente busca no estoque e responde |
| 5B.3 | ⬜ | Cliente envia foto de veículo de entrada | Vision detecta veículo → dono notificado → handoff ativo |
| 5B.4 | ⬜ | Verificar log Railway | `[metaClient] Mensagem enviada` sem erros de autorização. Ausência de `401 Unauthorized`. |

---

## BLOCO 6 — Casos extremos

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 6.1 | ⬜ | Enviar payload de áudio sem `audioUrl` (campo ausente) | HTTP 200, sem crash nos logs. `[whisper]` não é chamado. |
| 6.2 | ⬜ | Enviar imagem com `downloadError=true` e sem `thumbnailUrl` | `imageUrl = null` internamente. Conversa continua sem erro. |
| 6.3 | ⬜ | Alterar `OPENAI_API_KEY` para `sk-invalida` → enviar áudio → restaurar a chave | Log mostra `[whisper] Erro ao transcrever:` mas agente **continua respondendo** (sem transcrição). |
| 6.4 | ⬜ | Enviar foto de veículo + texto na mesma mensagem | Handoff acontece normalmente. Texto da legenda preservado em `conversas`. Dono recebe foto + texto. |

**Comandos curl para 6.1 e 6.2 (trocar `<domínio>` pelo seu Railway):**

```bash
# 6.1 — Áudio sem audioUrl
curl -X POST https://<domínio>/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"type":"PTTMessage","phone":"5511912345678","fromMe":false,"audio":{}}'

# 6.2 — Imagem com downloadError
curl -X POST https://<domínio>/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"type":"ImageMessage","phone":"5511912345678","fromMe":false,"image":{"imageUrl":null,"downloadError":true,"thumbnailUrl":null}}'
```

---

## VERIFICAÇÕES FINAIS NO SUPABASE

Após concluir todos os blocos acima:

| Tabela | Campo | O que checar |
|--------|-------|-------------|
| `leads` | `nome` | Preenchido assim que o cliente informa o nome |
| `leads` | `forma_pagamento` | Preenchido após o cliente informar |
| `leads` | `prazo_compra` | Preenchido após o cliente informar |
| `leads` | `veiculo_interesse_id` | UUID do veículo confirmado |
| `leads` | `score_qualificacao` | `4` após score 4 · `5` após handoff score 5 |
| `leads` | `atendimento_humano` | `true` após qualquer handoff |
| `leads` | `foto_entrada_url` | Preenchido após foto de veículo (Bloco 3) |
| `conversas` | `mensagens` | Histórico completo com mensagens do cliente e da Ana |
| `conversas` | `tipo` | `"audio"` para mensagens de voz (confirma Whisper funcionou) |

---

## CHECKLIST GERAL DE RESULTADO

| Bloco | Status |
|-------|--------|
| 1A — Saudação adaptada ao horário | ⬜ |
| 1B — Busca no estoque | ⬜ |
| 1C — Veículo indisponível | ⬜ |
| 1D — Múltiplas informações | ⬜ |
| 1E — Score 4 com dados salvos | ⬜ |
| 1F — Score 5 / handoff | ⬜ |
| 1G — À vista confirmado | ⬜ |
| 1H — Pedido de humano | ⬜ |
| 1I — Técnicas de fechamento | ⬜ |
| 1J — Identidade da Ana | ⬜ |
| 2A — Whisper WhatsApp | ⬜ |
| 2B — Whisper Telegram | ⬜ |
| 3A — Vision: foto de veículo | ⬜ |
| 3B — Vision: foto + texto | ⬜ |
| 3C — Vision: foto sem veículo | ⬜ |
| 3D — Vision: Telegram (cadastro) | ⬜ |
| 4A — Financeiro: seletor de mês | ⬜ |
| 4B — Financeiro: cards de métricas | ⬜ |
| 4C — Financeiro: ranking | ⬜ |
| 4D — Financeiro: categorias | ⬜ |
| 4E — Financeiro: snapshot estoque | ⬜ |
| 5 — Instagram DM | ⬜ bloqueado (sem credenciais Meta) |
| 6 — Casos extremos | ⬜ |

**Todos os blocos ✅ → Fase 2 concluída → pode avançar para a Fase 3.**

---

## ORDEM DE EXECUÇÃO RECOMENDADA

```
1. Bloco 6.3 primeiro (confirmar que OPENAI_API_KEY está válida) → restaurar a chave
2. Bloco 1A → 1B → 1C  (nova conversa a cada bloco)
3. Bloco 1D             (nova conversa)
4. Bloco 1E → 1F        (conversa contínua — score 4 depois 5)
5. Bloco 1G             (nova conversa)
6. Bloco 1H             (nova conversa)
7. Bloco 1I             (pode continuar qualquer conversa anterior)
8. Bloco 1J             (qualquer momento)
9. Bloco 2A             (nova conversa — foco em áudio WA)
10. Bloco 2B            (Telegram)
11. Bloco 3A → 3B       (nova conversa — fotos de veículo)
12. Bloco 3C → 3D       (nova conversa)
13. Bloco 4A → 4E       (página /financeiro)
14. Bloco 6.1 → 6.2 → 6.4 (casos extremos restantes)
15. Bloco 5             (se credenciais Meta disponíveis)
```
