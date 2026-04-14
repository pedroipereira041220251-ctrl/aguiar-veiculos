# Checklist de Testes — Fase 1
**Aguiar Veículos — antes de avançar para a Fase 2**

**Legenda:**
- ✅ Aprovado
- 🔁 Corrigido — precisa retestar
- ❌ Falhou e ainda pendente
- ⬜ Ainda não testado

---

## ⚠️ MIGRAÇÕES OBRIGATÓRIAS — rodar no Supabase → SQL Editor

```sql
-- 1. Colunas nome_vendedor / nome_comprador (se ainda não rodou)
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_vendedor text;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_comprador text;

-- 2. Forma de pagamento
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS forma_pagamento text;

-- 3. Tabela de vendedores cadastrados
CREATE TABLE IF NOT EXISTS vendedores (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome       text NOT NULL UNIQUE,
  ativo      boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

---

## PRÉ-REQUISITO

- [x] Backend ativo no Railway
- [x] Frontend rodando em `localhost:3000`
- [x] WhatsApp conectado ao Z-API
- [x] Número do dono configurado em `OWNER_PHONE_NUMBER`
- [x] Bot do Telegram criado e `TELEGRAM_BOT_TOKEN` configurado
- [x] `TELEGRAM_OWNER_CHAT_ID` configurado
- [x] Webhook do Telegram configurado

---

## BLOCO 1 — Navegação do Menu (WhatsApp) ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 1.1–1.9 | ✅ | Menus, submenus, variações de texto | Funcionam corretamente |
| 1.10 | ⬜ | Ficar 31 min sem interagir | "Sessão expirada. Mande /menu para recomeçar." |

---

## BLOCO 2 — API de Placas ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 2.1–2.4 | ✅ | Placa válida, inválida, não encontrada, minúsculo | Funcionam corretamente |

---

## BLOCO 3 — Cadastrar Veículo

### 3A — Fluxo rápido (placa encontrada) ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 3A.1–3A.10 | ✅ | Cadastro ok + card no painel |

### 3B — Fluxo manual (placa não encontrada) ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3B.1–3B.8 | ✅ | Fluxo manual Honda Civic | Dados preenchidos corretamente |
| 3B.9 | ✅ | Digitar `03/2027` no IPVA | Data salva e exibida como 03/2027 |
| 3B.10 | ✅ | Abrir detalhe → aba Dados → Documentação | Exibe "IPVA vence em 03/2027" |

### 3C — Fotos via WhatsApp ❌

> Problema: Z-API pode estar enviando a imagem em um campo diferente do esperado.
> Para diagnosticar: abra Railway → Deploy Logs e copie a linha `[ownerBot/fotos/wa]` ao enviar foto.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3C.1 | ✅ | Digitar `1` (Adicionar fotos) | "Envie as fotos uma a uma." |
| 3C.2 | ❌ | Enviar foto como imagem no WhatsApp | "Foto 1 salva!" — copiar log Railway para diagnóstico |
| 3C.3 | ⬜ | Digitar `1` (Concluir) | "Mande /menu para continuar." |
| 3C.4 | ⬜ | Abrir `/estoque/[id]` | Foto aparece no painel |

---

## BLOCO 4 — Lançar Custo 🔁

> Corrigido: observação agora pede o texto direto (sem etapa intermediária "Adicionar").

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 4.1–4.5 | ✅ | Lançar custo no CROSSFOX | Custo salvo, investimento atualiza |
| 4.6 | 🔁 | Lançar custo em carro **vendido** | "⚠️ já foi vendido. Não é possível lançar custos. Mande /menu para continuar." |
| 4.7 | ✅ | Abrir aba Custos no painel | Custo listado, investimento atualizado |
| 4.8 | 🔁 | No step da observação, digitar texto | Observação salva diretamente (sem botão "Adicionar") |
| 4.9 | 🔁 | No step da observação, clicar Pular | Custo salvo sem observação |

---

## BLOCO 5 — Registrar Venda 🔁

> Corrigido: edição de veículo vendido agora bloqueada via bot; forma_pagamento salva; comprador/pagamento aparecem no cartão.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 5.1 | 🔁 | `/menu` → `1` → `3` → placa do Honda Civic | Veículo encontrado, confirma? |
| 5.2 | 🔁 | Digitar `1` (Confirmar) | "Por qual valor foi vendido? (R$)" |
| 5.3 | 🔁 | Digitar `51000` | "Forma de pagamento: 1 À vista, 2 Financiamento…" |
| 5.4 | 🔁 | Digitar `1` (À vista) | Lista de vendedores cadastrados (se houver) ou "Nome do vendedor?" |
| 5.5 | 🔁 | Selecionar vendedor ou digitar nome | "Nome do comprador?" |
| 5.6 | 🔁 | Digitar `pular` | Resumo com valor, lucro real, pagamento, vendedor |
| 5.7 | 🔁 | Abrir `/estoque` → filtro Vendidos | Honda Civic aparece como "Vendido" com lucro real |
| 5.8 | 🔁 | Abrir detalhe do veículo vendido | Exibe: Vendido por, Pagamento, Vendedor, Comprador |
| 5.9 | 🔁 | Tentar **editar** carro vendido via bot | "⚠️ já foi vendido e não pode ser editado. Mande /menu para continuar." |
| 5.10 | 🔁 | Tentar **lançar custo** no carro vendido | "⚠️ já foi vendido. Não é possível lançar custos. Mande /menu para continuar." |

---

## BLOCO 6 — Editar Veículo ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 6.1–6.4 | ✅ | Editar preço, cor, placa inexistente | Funcionam corretamente |

---

## BLOCO 7 — Consultas WhatsApp 🔁

> Corrigido: leads agora exibem número de telefone.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 7.1 | ✅ | `/menu` → `2` → `1` (Estoque) | Resumo compacto com lista de disponíveis |
| 7.2 | ✅ | `/menu` → `2` → `2` (Financeiro) | Resumo do mês |
| 7.3 | 🔁 | `/menu` → `2` → `3` (Leads) | Lista com nome, **número de telefone**, canal, score, veículo de interesse |
| 7.4 | ✅ | `/menu` → `2` → `4` (Alertas) | Lista alertas: IPVA, docs pendentes, parados |
| 7.5 | ✅ | Digitar `alertas` | Mesmo resultado de 7.4 |

---

## BLOCO 8 — Agente de IA 🔁

> Corrigido: agente solicita nome do cliente; leads criados fora do horário.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 8.1 | ✅ | Enviar "Oi" de número diferente do dono | Agente responde apresentando a loja |
| 8.2 | ✅ | "Vocês têm Honda Civic?" | Agente responde buscando no estoque |
| 8.3 | ✅ | "Tenho carta de crédito aprovada" | Agente eleva score e notifica o dono |
| 8.4 | 🔁 | Mensagem fora do horário | Resposta automática E **lead criado no CRM** |
| 8.5 | 🔁 | Agente pergunta o nome do cliente | Nome salvo no lead |
| 8.6 | ✅ | Abrir `localhost:3000/crm` | Lead aparece no kanban |
| 8.7 | ⬜ | Ajustes de mensagens do agente | A fazer posteriormente |

---

## BLOCO 9 — Painel Web

### 9A — Dashboard ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 9A.1–9A.3 | ✅ | Login, redirecionamento, métricas |

### 9A.4 — Configurações 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9A.4 | 🔁 | Alterar horário e clicar Salvar | Configurações salvas (mesmo com campo de mensagem vazio) |

### 9B — Estoque 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9B.1–9B.5 | ✅ | Listar, filtrar, buscar, abrir detalhe, editar preço | Ok |
| 9B.6 | ✅ | Aba Custos → lançar custo | Custo salvo |
| 9B.7 | ✅ | Aba Dados → Documentação com IPVA | Data exibe **03/2027** (não 02/2027) |
| 9B.8 | 🔁 | Buscar placa de veículo **vendido** na busca | Veículo vendido aparece nos resultados |
| 9B.9 | 🔁 | Aba Dados → Editar docs → campo IPVA | Campo de mês/ano aparece, permite alterar e limpar |
| 9B.10 | ⬜ | `+ Novo veículo` → placa com FIPE | FIPE preenche campo automaticamente |
| 9B.11 | ⬜ | Salvar novo veículo pelo painel | Card aparece no estoque |

### 9C — CRM 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9C.1 | ✅ | Acessar `/crm` | Kanban com colunas do funil |
| 9C.2 | ✅ | Clicar em um lead | Drawer lateral abre com histórico |
| 9C.3 | ✅ | Clicar em "Assumir" | Status muda para atendimento humano |
| 9C.4 | ❌ | Arrastar lead entre colunas | Drag & drop não funciona com excelência — pendente |

### 9D — Venda pelo painel 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9D.1 | 🔁 | Aba Vender → preencher valor → selecionar pagamento → Confirmar venda | Venda registrada |
| 9D.2 | 🔁 | Abrir detalhe do veículo vendido | Exibe: Vendido por, **Pagamento**, Vendedor, Comprador |
| 9D.3 | 🔁 | Card do veículo vendido na lista | Mostra "Lucro real" (não "Lucro est.") e "Vendido por" |

---

## BLOCO 10 — Casos Extremos ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 10.1 | ✅ | Cadastrar a mesma placa duas vezes | "Placa já cadastrada. Operação cancelada." |
| 10.2 | ✅ | Texto aleatório sem sessão ativa (dono) | Bot ignora silenciosamente |
| 10.3 | ✅ | Mensagem de grupo no WhatsApp | Bot ignora silenciosamente |
| 10.4 | ✅ | Cliente com `atendimento_humano=true` envia mensagem | Bot ignora, histórico salvo |
| 10.5 | ✅ | Enviar emoji ou mensagem vazia | Bot não trava |

---

## BLOCO 11 — Telegram: Menu ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 11.1–11.3 | ✅ | Menu, permissão, expiração |

---

## BLOCO 12 — Telegram: Cadastro 🔁

> Corrigido: documentacao_veiculo agora criada com todos os campos boolean ao cadastrar via Telegram.

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 12.1–12.4 | ✅ | Cadastro completo com foto via Telegram |
| 12.5 | 🔁 | Abrir detalhe do veículo → aba Dados → Documentação | Estado dos documentos aparece (Transferência, Laudo, DUT, CRLV) |

---

## BLOCO 13 — Telegram: Custo, Venda e Edição 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 13.1 | ✅ | Lançar custo pelo Telegram | "Custos salvos." |
| 13.2 | 🔁 | Registrar venda pelo Telegram | Fluxo: preço → pagamento → vendedor (lista ou digita) → comprador → resumo |
| 13.3 | 🔁 | Abrir detalhe do veículo vendido no painel | Campos Vendedor, Comprador e **Pagamento** aparecem |
| 13.4 | ✅ | Editar veículo pelo Telegram | "Atualizado com sucesso." |

---

## BLOCO 14 — Telegram: Consultas ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 14.1–14.5 | ✅ | Estoque, financeiro, leads, alertas, sair |

---

## BLOCO 15 — Paridade WA × Telegram ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 15.1–15.3 | ✅ | Cruzamento entre canais funciona |

---

## BLOCO 16 — Vendedores 🔁

> Implementado: CRUD de vendedores + bot lista vendedores cadastrados ao registrar venda.
> ⚠️ Rodar a migração SQL da tabela `vendedores` antes de testar.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 16.1 | ✅ | Acessar `/vendedores` → aba Desempenho | Lista de vendedores com qtd vendas, receita, comissão (10%) |
| 16.2 | ✅ | Clicar em um vendedor | Expande lista de vendas individuais |
| 16.3 | 🔁 | Aba Cadastro → digitar nome → Adicionar | Vendedor aparece na lista |
| 16.4 | 🔁 | Clicar no lixo ao lado de um vendedor | Vendedor removido da lista |
| 16.5 | 🔁 | Registrar venda via bot após cadastrar vendedor | Lista de vendedores aparece como opções numeradas |
| 16.6 | 🔁 | Selecionar vendedor da lista e confirmar venda | Vendedor correto salvo no veículo |

---

## RESULTADO

| Bloco | Status |
|-------|--------|
| 1 — Menu WhatsApp | ✅ |
| 2 — API Placas | ✅ |
| 3 — Cadastro WhatsApp | ❌ retestar 3C (fotos WA) |
| 4 — Custo WhatsApp | 🔁 retestar observação simplificada |
| 5 — Venda WhatsApp | 🔁 retestar fluxo completo + edição bloqueada |
| 6 — Edição WhatsApp | ✅ |
| 7 — Consultas WhatsApp | 🔁 retestar telefone no lead |
| 8 — Agente IA | 🔁 retestar nome + lead fora horário |
| 9 — Painel Web | 🔁 retestar venda + busca vendidos + IPVA edit |
| 10 — Casos extremos | ✅ |
| 11 — Telegram: menu | ✅ |
| 12 — Telegram: cadastro | 🔁 retestar docs |
| 13 — Telegram: custo/venda/edição | 🔁 retestar venda com pagamento |
| 14 — Telegram: consultas | ✅ |
| 15 — Paridade WA × TG | ✅ |
| 16 — Vendedores | 🔁 retestar CRUD + bot com lista |

**Todos os blocos ✅ → Fase 1 concluída → pode avançar para a Fase 2.**

---

*Atualizado em 14/04/2026 — deploy 0bd9a76*
