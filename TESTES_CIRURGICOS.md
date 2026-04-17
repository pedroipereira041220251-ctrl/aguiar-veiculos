# Testes Cirúrgicos — Aguiar Veículos
**Agente Ana · Whisper · Vision · Financeiro · Instagram DM**

> **Status:** ✅ Aprovado · ❌ Falhou · 🔁 Comportamento inesperado · ⬜ Não testado
>
> **Para reiniciar uma conversa:** Supabase → tabela `leads` → deletar o registro do número de teste (tabela `conversas` deletada em cascata).

---

## PRÉ-REQUISITOS

- [ ] Backend ativo no Railway (deploy atual)
- [ ] Frontend em `localhost:3000`
- [ ] WhatsApp conectado ao Z-API
- [ ] `OWNER_PHONE_NUMBER` configurado
- [ ] `TELEGRAM_BOT_TOKEN` e `TELEGRAM_OWNER_CHAT_ID` configurados
- [ ] `OPENAI_API_KEY` válida no Railway
- [ ] Pelo menos 1 veículo disponível e 1 venda registrada no estoque
- [ ] `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_ID` configurados (Bloco 5 — pode pular se não disponível)

---

## BLOCO A — Conversação: fluxo principal

### A5 — Múltiplas informações de uma vez
**Entrada:** `Quero um SUV, ano 2022 pra cima, até R$ 90 mil, vou financiar, prazo de 30 dias`
**Esperado:** Ana consulta com todos os filtros, apresenta resultados, não pergunta nada que já foi dito.
**Verificar Supabase:** `forma_pagamento = "financiamento"` · `prazo_compra = "30 dias"`.

---

### A7 — Score 4: Ana propõe visita antes de perguntar capacidade
**Entrada:** `Quero comprar até o final do mês, vou pagar à vista`
**Esperado:** Score 4 atingido → Ana propõe visita à loja ANTES de perguntar se tem o valor.
**Verificar:** Palavra "visita" aparece antes de qualquer pergunta sobre valor/carta de crédito.

---

### A8 — "Tenho metade do valor" → não é score 5
**Entrada:** `Ainda não tenho tudo, tenho mais ou menos a metade`
**Esperado:** Ana continua a conversa normalmente. Sem handoff.
**Verificar Supabase:** `capacidade_financeira = sem_informacao`. Score permanece 4. `atendimento_humano = false`.

---

### A9 — Score 5: valor total confirmado → handoff
**Entrada:** `Sim, já tenho o valor todo disponível`
**Esperado:** Ana aciona handoff com despedida contextualizada (menciona o veículo e próximo passo).
**Verificar Supabase:** `atendimento_humano = true`.

---

### A10 — Veículo indisponível → sondar preferências
**Entrada:** `Vocês têm Hilux?`
**Esperado:** Ana diz que não tem e pergunta o que mais gosta na Hilux (tamanho? robustez?) — não sugere alternativas ainda.
**Verificar:** Ana pergunta sobre preferências antes de listar qualquer outra coisa.

---

### A11 — Score 5 por financiamento
**Sequência:** nome → veículo → prazo → `vou financiar` → `já tenho carta de crédito aprovada`
**Esperado:** Handoff com `carta_aprovada`. Dono notificado com `💰 Capacidade: ✅ Carta de crédito aprovada`.
**Verificar Supabase:** `score_qualificacao = 5` · `atendimento_humano = true`.

---

### A12 — Handoff por pedido do cliente
**Entrada:** `Quero falar com um vendedor`
**Esperado:** Handoff imediato com motivo `pedido_cliente`. Próxima mensagem: Ana não responde.
**Verificar:** Notificação do dono com `🙋 Cliente pediu falar com humano`.

---

### A13 — Técnicas de fechamento
| # | Entrada | Esperado |
|---|---------|----------|
| A13.1 | `Ainda estou pesquisando` | Ana não encerra — pergunta o que falta para decidir |
| A13.2 | `Tá um pouco caro pra mim` | Ana sonda orçamento ou oferece financiamento |
| A13.3 | `Vou pensar` | Ana menciona saída do veículo + propõe visita sem compromisso |
| A13.4 | (após proposta de visita) `Pode ser` | Fechamento alternativo: "você prefere vir amanhã de manhã ou à tarde?" |

---

### A14 — Identidade da Ana
| # | Entrada | Esperado |
|---|---------|----------|
| A14.1 | `Você é um robô?` | Ana nega, responde com personalidade — nunca confirma ser IA |
| A14.2 | `Tá, mas é IA né` | Mantém a persona sem confirmar |

---

## BLOCO B — Dados no Supabase

Execute em conversa encadeada. Verificar o campo no Supabase após cada mensagem.

| # | Mensagem | Campo | Valor esperado |
|---|----------|-------|---------------|
| B2 | `Quero financiar` | `forma_pagamento` | `financiamento` |
| B6 | `Tenho mais da metade do valor` | `capacidade_financeira` | `sem_informacao` (NÃO `a_vista_confirmado`) |
| B7 | `Já tenho o valor completo` | `capacidade_financeira` | `a_vista_confirmado` |
| B8 | `Já tenho carta aprovada` | `capacidade_financeira` | `carta_aprovada` |

---

## BLOCO C — Score: cálculo em cada estágio

| # | Estado do lead | Score esperado |
|---|----------------|---------------|
| C6 | Score 4 + `a_vista_confirmado` | `5` |
| C7 | Score 4 + `carta_aprovada` | `5` |
| C8 | Score 4 + `sem_informacao` | `4` (não vira 5) |

---

## BLOCO D — Notificações do dono

### D1 — Score 4: campos + resumo narrativo
**Formato esperado:**
```
🔔 *Lead qualificado — Score 4*

👤 [Nome] · WhatsApp
📞 Contato: [número]
🚗 Interesse: [Modelo Ano (Placa)]
💳 Pagamento: [forma]
💰 Capacidade: 🔄 Ainda juntando o valor
📅 Prazo: [prazo]

📝 Resumo:
[Nome] está interessado em um [Modelo Ano (Cor)] com X km por R$ Y. Pretende comprar [prazo] e pagar [forma]. Ainda está juntando o valor.

👉 Acesse o painel para assumir o atendimento.
```
**Verificar:** `📝 Resumo:` com parágrafo narrativo. Sem "Sem informação".

---

### D2 — Capacidade contextual por forma de pagamento

| Condição | Label esperado |
|----------|---------------|
| `à vista` + sem confirmação | `🔄 Ainda juntando o valor` |
| `financiamento` + sem confirmação | `🔄 Buscando carta de crédito` |

---

### D3 — Handoff score 5
**Formato esperado:**
```
🤝 *Transferência de atendimento*
Motivo: ✅ Score 5 atingido (carta de crédito aprovada)

👤 [Nome] · WhatsApp
📞 Contato: [número]
🚗 Interesse: [Modelo Ano (Placa)]
💳 Pagamento: [forma]
💰 Capacidade: [label confirmado]
📅 Prazo: [prazo]

📝 Resumo:
[parágrafo narrativo]

⚠️ O agente foi desativado para este contato.
```

---

### D4 — Handoff por pedido do cliente
**Verificar:** Motivo `🙋 Cliente pediu falar com humano` na notificação.

---

## BLOCO E — Whisper: transcrição de áudio

> Verificar nos logs do Railway: `[whisper]`

### E1 — Áudio do cliente (WhatsApp PTT)
| # | Ação | Esperado |
|---|------|----------|
| E1.1 | Gravar: *"Oi, vocês têm Corolla disponível?"* | Ana transcreve e responde sobre Corollas. Log: `[webhook] Áudio transcrito:` |
| E1.2 | Gravar ~15s com múltiplas informações: *"Quero SUV, Jeep Compass ou HR-V, até 80 mil km, ano 2021+"* | Transcrição completa no log. Ana responde citando os modelos. |
| E1.3 | Áudio com legenda digitada: *"Tenho interesse em sedan"* | Ana usa a **legenda**, não o áudio. Log sem `Áudio transcrito`. |
| E1.4 | Gravar 2-3s com ruído / sem falar | Ana não trava. Sem exception nos logs. |

**Verificar Supabase `conversas`:** mensagens de áudio com `tipo = 'audio'`.

---

### E2 — Áudio do dono (Telegram)
| # | Ação | Esperado |
|---|------|----------|
| E2.1 | Telegram: `/menu` → wizard → responder com **mensagem de voz** | Voz transcrita. Log: `[webhook/tg] Voz transcrita:` → wizard avança normalmente |
| E2.2 | Telegram: sem wizard ativo, enviar voz | Log mostra transcrição mas bot não responde (sem sessão ativa) |

---

## BLOCO F — Vision: análise de imagem

> Verificar nos logs: `[vision]` e `[handoff]`

### F1 — Foto de veículo → handoff automático
| # | Ação | Esperado |
|---|------|----------|
| F1.1 | Foto de carro + legenda: *"Quero dar esse de entrada"* | Log: `[vision] is_veiculo: true`. Ana: "Foto recebida! Vou encaminhar para nossa equipe." |
| F1.2 | Verificar `leads.foto_entrada_url` | Campo preenchido com URL (não null) |
| F1.3 | Verificar WhatsApp/Telegram do dono | Notificação com dados estimados + foto |
| F1.4 | Enviar mensagem após a foto | Ana **não responde** (handoff ativo) |

---

### F2 — Foto de veículo + legenda com texto
**Ação:** Foto de carro + legenda: *"Quero dar esse de entrada, é um Gol 2019"*
**Esperado:** Handoff ativo. Texto da legenda salvo em `conversas`. Dono recebe foto + texto.

---

### F3 — Foto que não é veículo
| # | Ação | Esperado |
|---|------|----------|
| F3.1 | Foto de documento (CNH, comprovante) | Log: `[vision] is_veiculo: false`. Ana continua conversa. Sem handoff. |
| F3.2 | Selfie ou paisagem, sem legenda | Ana responde sem erros. `foto_entrada_url` permanece null. |

---

### F4 — Foto no Telegram (cadastro de veículo)
**Ação:** Telegram → `/menu` → Cadastrar Veículo → enviar foto de carro no passo de foto.
**Esperado:** Foto salva como imagem do veículo em estoque. Sem Vision de análise de entrada. Wizard avança.

---

## BLOCO G — Página /financeiro

> Acesse `http://localhost:3000/financeiro`.
> Pré-requisito: pelo menos 1 veículo com `status = 'vendido'` e `data_venda` no mês atual.

### G1 — Seletor de mês
| # | Ação | Esperado |
|---|------|----------|
| G1.1 | Acessar `/financeiro` | Título exibe mês atual (ex: "Abril 2026") |
| G1.2 | Clicar `‹` (mês anterior) | Título muda para mês anterior, cards recarregam |
| G1.3 | Clicar `›` estando no mês atual | Botão **desabilitado** — não avança além do mês atual |
| G1.4 | Navegar até mês sem vendas | Cards mostram R$ 0,00 e "0 vendas" sem erro |

---

### G2 — Cards de métricas
| # | Card | Verificar |
|---|------|-----------|
| G2.1 | **Receita** | Soma dos `preco_venda_final` do mês — conferir contra Supabase |
| G2.2 | **Lucro real** | Receita menos compra e custos |
| G2.3 | **Margem %** | `(lucro / receita) × 100` — conferir com cálculo manual |
| G2.4 | **Vendas** | Quantidade de `status = 'vendido'` no mês |

---

### G3 — Ranking de vendas
| # | Verificar |
|---|-----------|
| G3.1 | Colunas: Veículo · Venda · Custos · Lucro · Margem, ordenada por maior lucro |
| G3.2 | Rodapé com totais de Venda, Custos e Lucro |
| G3.3 | Mês com 5+ vendas: todos aparecem, sem truncar |

---

### G4 — Custos por categoria
| # | Verificar |
|---|-----------|
| G4.1 | Barras com valor (R$) e quantidade de lançamentos, ordenadas por maior custo |
| G4.2 | Mês sem custos: seção exibe estado vazio sem erro |

---

### G5 — Estoque atual (snapshot)
| # | Verificar |
|---|-----------|
| G5.1 | Células de resumo: Qtd veículos · Total investido · Lucro estimado |
| G5.2 | Lista: Placa · Modelo · Ano · Investimento · Lucro estimado · Margem % · Preço de venda |
| G5.3 | Com 10+ veículos: lista rola verticalmente sem quebrar layout |

---

## BLOCO H — Instagram DM

> ⚠️ Requer `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` e `META_PAGE_ID` configurados + webhook registrado no painel Meta.
>
> **Registrar webhook:** Meta for Developers → Webhooks → Instagram → URL: `https://<domínio>/webhooks/instagram` · Verify Token: `META_VERIFY_TOKEN` · Campos: `messages`, `messaging_postbacks`

| # | Ação | Esperado |
|---|------|----------|
| H1 | `curl "https://<domínio>/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=test123"` | HTTP 200, body `test123`. Log: `[webhook/instagram] Webhook verificado` |
| H2 | Cliente envia "Oi" via Instagram DM | Ana responde. Supabase: `canal = 'instagram'` |
| H3 | Cliente pergunta sobre veículo | Ana busca estoque e responde |
| H4 | Cliente envia foto de veículo | Vision → dono notificado → handoff ativo |
| H5 | Verificar logs | `[metaClient] Mensagem enviada` sem `401 Unauthorized` |

---

## BLOCO I — Edge cases

| # | Cenário | Esperado |
|---|---------|----------|
| I1 | Handoff bloqueado sem capacidade | GPT tenta `handoff score5` sem capacidade confirmada → bloqueado server-side. Ana continua perguntando. `atendimento_humano = false`. |
| I2 | Mensagens rápidas (debounce) | 3 mensagens em < 3s → apenas 1 resposta consolidada |
| I3 | Fora do horário | Mensagem de fora do horário sem GPT. Lead criado no Supabase mesmo assim. |
| I4 | Payload de áudio sem `audioUrl` | HTTP 200, sem crash. `[whisper]` não chamado. |
| I5 | Imagem com `downloadError=true` | `imageUrl = null` internamente. Conversa continua sem erro. |
| I6 | Foto de veículo + texto na mesma mensagem | Handoff normal. Texto da legenda preservado. Dono recebe foto + texto. |
| I7 | Emojis — verificar qualquer conversa | Máximo 1 emoji por mensagem. Nenhum emoji em duas mensagens consecutivas. Sem emoji no meio de listagem. |
| I8 | Frases proibidas — verificar qualquer conversa | Ana NÃO usa: "Claro!", "Certamente!", "Perfeito!", "é só me chamar", "qualquer dúvida estou à disposição", "nos vemos lá!" |

**Curls para I4 e I5:**
```bash
# I4 — Áudio sem audioUrl
curl -X POST https://<domínio>/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"type":"PTTMessage","phone":"5511912345678","fromMe":false,"audio":{}}'

# I5 — Imagem com downloadError
curl -X POST https://<domínio>/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"type":"ImageMessage","phone":"5511912345678","fromMe":false,"image":{"imageUrl":null,"downloadError":true,"thumbnailUrl":null}}'
```

---

## VERIFICAÇÕES FINAIS NO SUPABASE

| Tabela | Campo | O que checar |
|--------|-------|-------------|
| `leads` | `nome` | Preenchido quando cliente informa |
| `leads` | `forma_pagamento` | Preenchido após cliente informar |
| `leads` | `prazo_compra` | Preenchido após cliente informar |
| `leads` | `veiculo_interesse_id` | UUID do veículo confirmado |
| `leads` | `score_qualificacao` | `4` no score 4 · `5` após handoff score 5 |
| `leads` | `atendimento_humano` | `true` após qualquer handoff |
| `leads` | `foto_entrada_url` | Preenchido após foto de veículo (Bloco F) |
| `conversas` | `mensagens` | Histórico completo |
| `conversas` | `tipo` | `"audio"` para mensagens de voz (confirma Whisper) |

---

## CHECKLIST GERAL

| Bloco | Descrição | Status |
|-------|-----------|--------|
| A1–A14 | Conversação: fluxo principal | ⬜ |
| B1–B8 | Dados no Supabase | ⬜ |
| C1–C8 | Score em cada estágio | ⬜ |
| D1–D4 | Notificações do dono | ⬜ |
| E1–E2 | Whisper: áudio WA e Telegram | ⬜ |
| F1–F4 | Vision: fotos | ⬜ |
| G1–G5 | Página /financeiro | ⬜ |
| H1–H5 | Instagram DM | ⬜ bloqueado (sem credenciais Meta) |
| I1–I8 | Edge cases | ⬜ |

**Todos ✅ → pode avançar para a próxima fase.**

---

## ORDEM DE EXECUÇÃO RECOMENDADA

```
1. I4/I5 primeiro (confirmar que OPENAI_API_KEY está válida)
2. A1 → A6  (nova conversa a cada bloco)
3. A7 → A9  (conversa contínua: score 4 → 5)
4. A10 → A14 (novas conversas)
5. B1 → B8  (conversa encadeada única)
6. C1 → C8  (verificar Supabase a cada estágio)
7. D1 → D4  (validar notificações recebidas no WhatsApp)
8. E1 → E2  (focos em áudio)
9. F1 → F4  (fotos)
10. G1 → G5 (página /financeiro)
11. I1 → I8 (edge cases restantes)
12. H1 → H5 (se credenciais Meta disponíveis)
```
