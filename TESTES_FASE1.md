# Checklist de Testes — Fase 1
**Aguiar Veículos — antes de avançar para a Fase 2**

**Legenda:**
- ✅ Aprovado na rodada anterior
- 🔁 Corrigido — precisa retestar
- ❌ Falhou e ainda pendente (investigação em andamento)
- ⬜ Ainda não testado

---

## PRÉ-REQUISITO

- [x] Backend ativo no Railway (`aguiar-veiculos-production.up.railway.app`)
- [x] Frontend rodando em `localhost:3000`
- [x] WhatsApp conectado ao Z-API
- [x] Número do dono configurado em `OWNER_PHONE_NUMBER`
- [x] Bot do Telegram criado e `TELEGRAM_BOT_TOKEN` configurado no Railway
- [x] `TELEGRAM_OWNER_CHAT_ID` configurado
- [x] Webhook do Telegram configurado

---

## BLOCO 1 — Navegação do Menu (WhatsApp) ✅

> Passou na rodada anterior. Retestar apenas o item 1.10 (timeout).

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 1.1 | ✅ | Enviar `/menu` | Menu principal: 1 Veículos, 2 Consultas, 3 Sair |
| 1.2 | ✅ | Digitar `1` | Submenu Veículos com 5 opções |
| 1.3 | ✅ | Digitar `5` (Voltar) | Volta ao menu principal |
| 1.4 | ✅ | Digitar `2` | Submenu Consultas com 5 opções |
| 1.5 | ✅ | Digitar `5` (Voltar) | Volta ao menu principal |
| 1.6 | ✅ | Digitar `Veículos` (com acento) | Vai para Submenu Veículos |
| 1.7 | ✅ | Digitar `veiculos` (sem acento) | Vai para Submenu Veículos |
| 1.8 | ✅ | Digitar `VEICULOS` (maiúsculo) | Vai para Submenu Veículos |
| 1.9 | ✅ | Digitar `3` (Sair) | Encerra modo gestão |
| 1.10 | ⬜ | Ficar 31 min sem interagir e digitar qualquer coisa | "Sessão expirada. Mande /menu para recomeçar." |

---

## BLOCO 2 — API de Placas 🔁

> Corrigido: placa com campos em branco na API agora é tratada como "não encontrada".

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 2.1 | ✅ | Digitar `INT8C36` no wizard | "Encontrei: VW CROSSFOX 2007 · PRATA · FIPE: R$ 28.924,00 — Confirma?" |
| 2.2 | ✅ | Digitar `abc` (placa curta) | "Placa inválida. Digite novamente" |
| 2.3 | 🔁 | Digitar `ZZZ9Z99` (inexistente) | "Placa não encontrada. Vamos preencher manualmente." e pede Marca |
| 2.4 | ✅ | Digitar `int8c36` (minúsculo) | Mesmo resultado de 2.1 |

---

## BLOCO 3 — Cadastrar Veículo

### 3A — Fluxo rápido (placa encontrada) ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3A.1 | ✅ | `/menu` → `1` → `1` → placa `INT8C36` | Bot mostra dados + FIPE, pergunta "Confirma?" |
| 3A.2 | ✅ | Digitar `1` (Confirmar) | "Quilometragem (km):" |
| 3A.3 | ✅ | Digitar `45000` | "Preço de compra (R$):" |
| 3A.4 | ✅ | Digitar `20000` | "Preço de venda (R$):" |
| 3A.5 | ✅ | Digitar `28000` | "Observações (opcional):" |
| 3A.6 | ✅ | Digitar `1` (Pular obs) | "Vencimento do IPVA:" — obs deve ser NULL, não "1" |
| 3A.7 | ✅ | Digitar `1` (Pular IPVA) | "Transferência já está em dia?" |
| 3A.8 | ✅ | Digitar `1` (Sim) | Resumo com lucro estimado + "Mande /menu para continuar." |
| 3A.9 | ✅ | Digitar `2` (Concluir fotos) | "Cadastrado com sucesso! Mande /menu para continuar." |
| 3A.10 | ✅ | Abrir `localhost:3000/estoque` | Card do CROSSFOX aparece |

### 3B — Fluxo manual (placa não encontrada) 🔁

> Corrigido: "encontrei: * 0*" eliminado. IPVA agora aparece no painel.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3B.1 | 🔁 | `/menu` → `1` → `1` → `ZZZ9Z99` | "Placa não encontrada. Marca:" (sem mostrar "encontrei * 0*") |
| 3B.2 | ✅ | Digitar `Honda` | "Modelo:" |
| 3B.3 | ✅ | Digitar `Civic` | "Ano:" |
| 3B.4 | ✅ | Digitar `2020` | "Cor:" |
| 3B.5 | ✅ | Digitar `Preto` | "Quilometragem:" |
| 3B.6 | ✅ | Digitar `30000` | "Preço de compra:" |
| 3B.7 | ✅ | Digitar `52000` | "Observações:" |
| 3B.8 | ✅ | Digitar `Único dono` | "Vencimento IPVA (MM/AAAA):" |
| 3B.9 | 🔁 | Digitar `03/2027` (mês/ano) | "Transferência ok?" — data salva corretamente |
| 3B.10 | 🔁 | Abrir `localhost:3000/estoque/[id]` → Documentação | IPVA vence em 03/2027 aparece na seção com ícone de alerta |

### 3C — Fotos via WhatsApp ❌

> Ainda em investigação. Precisa dos logs do Railway para identificar o formato que o Z-API usa.
> **Antes de testar:** abra o Railway → Deploy Logs e deixe visível enquanto envia a foto.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3C.1 | ✅ | Digitar `1` (Adicionar fotos) | "Envie as fotos uma a uma." |
| 3C.2 | ❌ | Enviar uma foto como imagem no WhatsApp | "Foto 1 salva!" — se falhar, copie a linha `[ownerBot/fotos/wa]` do log |
| 3C.3 | ⬜ | Digitar `1` (Concluir) | "Mande /menu para continuar." |
| 3C.4 | ⬜ | Abrir `localhost:3000/estoque/[id]` | Foto aparece no painel |

---

## BLOCO 4 — Lançar Custo ✅

> Passou. Nota: "Ver estoque" no WhatsApp mostra preço de venda (não investimento) — comportamento esperado.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 4.1 | ✅ | `/menu` → `1` → `2` → placa do CROSSFOX | "Veículo encontrado. Confirma?" |
| 4.2 | ✅ | Digitar `1` (Confirmar) | "Tipo de custo:" |
| 4.3 | ✅ | Digitar `Mecânica` | "Valor do custo (R$):" |
| 4.4 | ✅ | Digitar `500` | "Observação (opcional):" |
| 4.5 | ✅ | Digitar `2` (Pular) | "Custos salvos. Mande /menu para continuar." |
| 4.6 | ⬜ | Tentar lançar custo em carro **vendido** | "⚠️ já foi vendido. Não é possível lançar custos." |
| 4.7 | ✅ | Abrir `localhost:3000/estoque/[id]` → aba Custos | Custo listado, investimento atualizado |

---

## BLOCO 5 — Registrar Venda 🔁

> Corrigido: adicionada pergunta de forma de pagamento. Fluxo atualizado abaixo.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 5.1 | 🔁 | `/menu` → `1` → `3` → placa do Honda Civic | Veículo encontrado, confirma? |
| 5.2 | 🔁 | Digitar `1` (Confirmar) | "Por qual valor foi vendido? (R$)" |
| 5.3 | 🔁 | Digitar `51000` | "Forma de pagamento: 1 À vista, 2 Financiamento, 3 Consórcio, 4 Pular" |
| 5.4 | 🔁 | Digitar `1` (À vista) | "Nome do vendedor? 1 Informar, 2 Pular" |
| 5.5 | 🔁 | Digitar `2` (Pular vendedor) | "Nome do comprador? 1 Informar, 2 Pular" |
| 5.6 | 🔁 | Digitar `2` (Pular comprador) | Resumo: valor + lucro real + "💳 Pagamento: À vista" + "Mande /menu para continuar." |
| 5.7 | 🔁 | Abrir `localhost:3000/estoque` → filtro Vendidos | Honda Civic aparece como "Vendido" |
| 5.8 | ⬜ | Tentar editar carro **vendido** | "⚠️ já foi vendido e não pode ser editado." |
| 5.9 | ⬜ | Tentar lançar custo no carro **vendido** | "⚠️ já foi vendido. Não é possível lançar custos." |

---

## BLOCO 6 — Editar Veículo ✅

> Passou. Atualização do painel sem reload é limitação de arquitetura (Fase 2 — Realtime).

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 6.1 | ✅ | `/menu` → `1` → `4` → placa do CROSSFOX | Dados + opções: 1 Preço, 2 KM, 3 Cor, 4 Obs |
| 6.2 | ✅ | Digitar `1` → `30000` | "Atualizado com sucesso! Mande /menu para continuar." |
| 6.3 | ✅ | Digitar `Cor` (texto) → novo valor | Campo cor atualizado |
| 6.4 | ✅ | Digitar placa inexistente | "Veículo não encontrado." |

---

## BLOCO 7 — Consultas WhatsApp 🔁

> Corrigido: alertas (query de banco), "alerta" singular, estoque compacto.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 7.1 | 🔁 | `/menu` → `2` → `1` (Ver estoque) | Resumo em 2 linhas + lista numerada: `1. PLACA · Modelo Ano · R$ preço` |
| 7.2 | ✅ | `/menu` → `2` → `2` (Financeiro) | Resumo do mês: vendas, receita, lucro, margem |
| 7.3 | ✅ | `/menu` → `2` → `3` (Leads de hoje) | Lista ou "Nenhum lead hoje." |
| 7.4 | 🔁 | `/menu` → `2` → `4` (Alertas) | Lista real de alertas ou "Nenhum alerta ativo." |
| 7.5 | 🔁 | Digitar `alerta` (singular, sem submenu) | Mesmo resultado de 7.4 |
| 7.6 | 🔁 | Digitar `alertas` (texto, no submenu consultas) | Mesmo resultado de 7.4 |

---

## BLOCO 8 — Agente de IA ⬜

> Ainda não testado.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 8.1 | ⬜ | Enviar "Oi" de número diferente do dono | Agente responde apresentando a loja |
| 8.2 | ⬜ | Perguntar "Vocês têm Honda Civic?" | Agente responde buscando no estoque |
| 8.3 | ⬜ | "Tenho carta de crédito aprovada, quero comprar" | Agente eleva score e notifica o dono |
| 8.4 | ⬜ | Mensagem fora do horário configurado | Resposta de fora do horário (sem IA) |
| 8.5 | ⬜ | Abrir `localhost:3000/crm` | Lead aparece no kanban |

---

## BLOCO 9 — Painel Web 🔁

### 9A — Dashboard ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9A.1 | ✅ | Acessar `localhost:3000` sem login | Redireciona para `/login` |
| 9A.2 | ✅ | Fazer login | Redireciona para `/dashboard` |
| 9A.3 | ✅ | Ver cards de métricas | Total veículos, investimento, lucro, leads |

### 9B — Estoque 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9B.1 | ✅ | Acessar `/estoque` | Cards com foto, preço, lucro |
| 9B.2 | ✅ | Filtro "Vendidos" | Mostra apenas vendidos |
| 9B.3 | ✅ | Buscar por placa/marca | Filtra em tempo real |
| 9B.4 | ✅ | Clicar em um card | Abre detalhe |
| 9B.5 | 🔁 | Editar preço de venda no detalhe → Salvar | Lucro estimado atualiza **imediatamente** sem recarregar |
| 9B.6 | 🔁 | Aba Custos → digitar `500` (ou `500,00`) → Lançar custo | Custo aparece + investimento atualiza na mesma tela |
| 9B.7 | 🔁 | Aba Dados → seção Documentação com IPVA cadastrado | Data do IPVA aparece com ícone de alerta |
| 9B.8 | ⬜ | `+ Novo veículo` → digitar placa com FIPE → confirmar | FIPE retorna e preenche campos automaticamente |
| 9B.9 | ⬜ | Salvar veículo pelo painel | Card aparece no estoque |

### 9C — CRM 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9C.1 | ✅ | Acessar `/crm` | Kanban com colunas do funil |
| 9C.2 | 🔁 | Clicar em um lead | Drawer lateral abre com histórico da conversa |
| 9C.3 | ✅ | Clicar em "Assumir" | Status muda para atendimento humano |

---

## BLOCO 10 — Casos Extremos ⬜

> Ainda não testado.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 10.1 | ⬜ | Cadastrar a mesma placa duas vezes | "Placa já cadastrada. Operação cancelada." |
| 10.2 | ⬜ | Digitar texto aleatório sem sessão ativa | Bot mostra menu principal |
| 10.3 | ⬜ | Mensagem de grupo no WhatsApp da loja | Bot ignora silenciosamente |
| 10.4 | ⬜ | Cliente com `atendimento_humano=true` envia mensagem | Bot ignora, histórico salvo, dono NÃO é notificado |
| 10.5 | ⬜ | Enviar emoji ou mensagem vazia | Bot não trava |
| 10.6 | ⬜ | Dono envia mensagem sem `/menu` ativo | Bot ignora silenciosamente |

---

## BLOCO 11 — Telegram: Menu ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 11.1 | ✅ | `/menu` no Telegram | 9 botões inline em grade 2 colunas |
| 11.2 | ✅ | `/menu` de outro usuário | Bot ignora |
| 11.3 | ✅ | Sessão expirada | "Sessão expirada." |

---

## BLOCO 12 — Telegram: Cadastro ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 12.1 | ✅ | Clicar "🚗 Novo veículo" → `INT8C36` | Mostra dados + FIPE com botões Confirmar/Corrigir |
| 12.2 | ✅ | Completar cadastro | Resumo com lucro estimado |
| 12.3 | ✅ | Concluir sem fotos | "Mande /menu para continuar." |
| 12.4 | ✅ | Enviar foto pelo Telegram | "Foto 1 salva!" |
| 12.5 | ✅ | Abrir painel | Foto aparece no detalhe do veículo |

---

## BLOCO 13 — Telegram: Custo, Venda e Edição 🔁

> Venda: fluxo mudou (agora inclui forma de pagamento). Vendedor/comprador: verificar colunas no Supabase.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 13.1 | ✅ | Lançar custo pelo Telegram | "Custos salvos." |
| 13.2 | 🔁 | Registrar venda pelo Telegram (novo fluxo com forma de pagamento) | Resumo inclui "💳 Pagamento: ..." |
| 13.3 | 🔁 | Abrir detalhe do veículo vendido no painel | Campos Vendedor e Comprador aparecem (se preenchidos) |
| 13.4 | ✅ | Editar veículo pelo Telegram | "Atualizado com sucesso." |

> ⚠️ **Para 13.3 funcionar:** verifique no Supabase → Table Editor → tabela `veiculos` se existem as colunas `nome_vendedor` e `nome_comprador`. Se não existirem, execute no SQL Editor:
> ```sql
> ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_vendedor text;
> ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_comprador text;
> ```

---

## BLOCO 14 — Telegram: Consultas 🔁

> Alertas corrigidos (query de banco reescrita).

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 14.1 | ✅ | "📦 Ver estoque" | Lista de disponíveis |
| 14.2 | ✅ | "📊 Financeiro" | Resumo do mês |
| 14.3 | ✅ | "👥 Leads de hoje" | Lista ou "Nenhum lead hoje." |
| 14.4 | 🔁 | "🔔 Alertas" com alerta ativo | Lista os alertas corretamente |
| 14.5 | ✅ | "❌ Sair" | "Modo gestão encerrado." |

---

## BLOCO 15 — Paridade WA × Telegram ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 15.1 | ✅ | Cadastrar pelo WA → consultar pelo Telegram | Aparece nos dois |
| 15.2 | ✅ | Lançar custo pelo Telegram → ver no painel | Custo aparece |
| 15.3 | ✅ | Vender pelo WA → financeiro pelo Telegram | Venda contabilizada |

---

## RESULTADO FINAL

| Bloco | Status |
|-------|--------|
| 1 — Menu WhatsApp | ✅ (item 1.10 pendente) |
| 2 — API Placas | 🔁 retestar 2.3 |
| 3 — Cadastro WhatsApp | 🔁 retestar 3B + 3C pendente |
| 4 — Custo WhatsApp | ✅ (item 4.6 novo) |
| 5 — Venda WhatsApp | 🔁 retestar fluxo completo |
| 6 — Edição WhatsApp | ✅ |
| 7 — Consultas WhatsApp | 🔁 retestar alertas e estoque |
| 8 — Agente IA | ⬜ não testado |
| 9 — Painel Web | 🔁 retestar 9B.5, 9B.6, 9B.7, 9C.2 |
| 10 — Casos extremos | ⬜ não testado |
| 11 — Telegram: menu | ✅ |
| 12 — Telegram: cadastro | ✅ |
| 13 — Telegram: custo/venda/edição | 🔁 retestar venda + verificar DB |
| 14 — Telegram: consultas | 🔁 retestar alertas |
| 15 — Paridade WA × TG | ✅ |

**Todos os blocos ✅ → Fase 1 concluída → pode avançar para a Fase 2.**

---

*Atualizado em 12/04/2026 — deploy a717db0*
