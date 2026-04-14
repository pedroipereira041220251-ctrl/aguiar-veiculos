# Checklist de Testes — Fase 1
**Aguiar Veículos — antes de avançar para a Fase 2**

**Legenda:**
- ✅ Aprovado
- 🔁 Corrigido — precisa retestar
- ❌ Falhou e ainda pendente
- ⬜ Ainda não testado

---

## ⚠️ MIGRAÇÕES OBRIGATÓRIAS — rodar no SQL Editor do Supabase antes de testar

```sql
-- 1. Adicionar colunas à tabela veiculos
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_vendedor text;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS nome_comprador text;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS forma_pagamento text;

-- 2. Criar tabela vendedores
CREATE TABLE IF NOT EXISTS vendedores (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome       text NOT NULL UNIQUE,
  ativo      boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_vendedores"
  ON vendedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. ⚠️ OBRIGATÓRIO: recriar a view após o ALTER TABLE
--    (v.* é expandido na criação — precisa DROP + CREATE para incluir forma_pagamento)
DROP VIEW IF EXISTS vw_veiculos_com_financeiro;
CREATE VIEW vw_veiculos_com_financeiro AS
SELECT
  v.*,
  COALESCE(SUM(c.valor), 0)                                        AS total_custos,
  v.preco_compra + COALESCE(SUM(c.valor), 0)                       AS investimento_total,
  v.preco_venda - v.preco_compra - COALESCE(SUM(c.valor), 0)       AS lucro_estimado,
  CASE
    WHEN v.preco_venda > 0 THEN
      ROUND(
        ((v.preco_venda - v.preco_compra - COALESCE(SUM(c.valor), 0)) / v.preco_venda) * 100,
        2
      )
    ELSE 0
  END                                                               AS margem_pct,
  CASE
    WHEN v.preco_venda_final IS NOT NULL THEN
      v.preco_venda_final - v.preco_compra - COALESCE(SUM(c.valor), 0)
    ELSE NULL
  END                                                               AS lucro_real
FROM veiculos v
LEFT JOIN custos_veiculo c ON c.veiculo_id = v.id
GROUP BY v.id;
```

---

## PRÉ-REQUISITO

- [x] Backend ativo no Railway (deploy `8e02428`)
- [x] Frontend rodando em `localhost:3000`
- [x] WhatsApp conectado ao Z-API
- [x] Número do dono configurado em `OWNER_PHONE_NUMBER`
- [x] Bot do Telegram criado e `TELEGRAM_BOT_TOKEN` configurado
- [x] `TELEGRAM_OWNER_CHAT_ID` configurado
- [x] Webhook do Telegram configurado
- [x] Migrações SQL acima rodadas no Supabase

---

## BLOCO 1 — Navegação do Menu (WhatsApp) ✅

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 1.1–1.9 | ✅ | Menus, submenus, variações de texto | Funcionam corretamente |
| 1.10 | ⬜ | Ficar 31 min sem interagir | "Sessão expirada. Mande /menu para recomeçar." |

---

## BLOCO 2 — API de Placas ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 2.1–2.4 | ✅ | Placa válida, inválida, não encontrada, minúsculo |

---

## BLOCO 3 — Cadastrar Veículo

### 3A — Fluxo rápido ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 3A.1–3A.10 | ✅ | Cadastro ok + card no painel |

### 3B — Fluxo manual ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 3B.1–3B.10 | ✅ | Fluxo manual, IPVA data correta |

### 3C — Fotos via WhatsApp 🔁

> Corrigido: usa `body.image.imageUrl` (campo real confirmado em log de produção).

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 3C.1 | ✅ | Digitar `1` (Adicionar fotos) | "Envie as fotos uma a uma." |
| 3C.2 | 🔁 | Enviar foto como imagem no WhatsApp | "Foto 1 salva!" |
| 3C.3 | ⬜ | Enviar mais de uma foto em sequência | Cada uma salva: "Foto 2 salva!", etc. |
| 3C.4 | ⬜ | Digitar `1` (Concluir) | "Mande /menu para continuar." |
| 3C.5 | ⬜ | Abrir `/estoque/[id]` | Fotos aparecem no painel |

---

## BLOCO 4 — Lançar Custo 🔁

> Corrigido: observação pede texto direto (sem etapa "Adicionar"); custo bloqueado em vendidos.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 4.1–4.5 | ✅ | Lançar custo no CROSSFOX | Custo salvo, investimento atualiza |
| 4.6 | 🔁 | Lançar custo em carro **vendido** | "⚠️ já foi vendido. Não é possível lançar custos. Mande /menu para continuar." |
| 4.7 | ✅ | Abrir aba Custos no painel | Custo listado |
| 4.8 | 🔁 | Step da observação → digitar texto | Observação salva diretamente |
| 4.9 | 🔁 | Step da observação → clicar Pular | Custo salvo sem observação |

---

## BLOCO 5 — Registrar Venda 🔁

> Corrigido: edição de vendido bloqueada; `forma_pagamento` salvo; comprador/pagamento exibidos no detalhe.
> ⚠️ Requer migração 3 (recriar view) para `forma_pagamento` aparecer.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 5.1 | 🔁 | `/menu` → `1` → `3` → placa disponível | Veículo encontrado, confirma? |
| 5.2 | 🔁 | Digitar `1` (Confirmar) | "Por qual valor foi vendido?" |
| 5.3 | 🔁 | Digitar valor | "Forma de pagamento: 1 À vista…" |
| 5.4 | 🔁 | Digitar `1` (À vista) | Lista de vendedores cadastrados (se houver) ou "Nome do vendedor?" |
| 5.5 | 🔁 | Selecionar vendedor ou digitar nome | "Nome do comprador?" |
| 5.6 | 🔁 | Digitar `pular` | Resumo com valor, lucro real, pagamento, vendedor |
| 5.7 | 🔁 | Abrir `/estoque` → filtro Vendidos | Veículo como "Vendido" com lucro real no card |
| 5.8 | 🔁 | Abrir detalhe do veículo vendido | Exibe: Vendido por, **Pagamento**, Vendedor, Comprador |
| 5.9 | 🔁 | Tentar **editar** carro vendido via bot | "⚠️ já foi vendido e não pode ser editado. Mande /menu para continuar." |
| 5.10 | 🔁 | Tentar **lançar custo** no carro vendido | "⚠️ já foi vendido. Não é possível lançar custos. Mande /menu para continuar." |

---

## BLOCO 6 — Editar Veículo ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 6.1–6.4 | ✅ | Editar preço, cor, placa inexistente |

---

## BLOCO 7 — Consultas WhatsApp 🔁

> Corrigido: leads exibem número de telefone.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 7.1 | ✅ | `/menu` → `2` → `1` (Estoque) | Resumo compacto |
| 7.2 | ✅ | `/menu` → `2` → `2` (Financeiro) | Resumo do mês |
| 7.3 | 🔁 | `/menu` → `2` → `3` (Leads) | Lista com nome, **número de telefone**, canal, score |
| 7.4 | ✅ | `/menu` → `2` → `4` (Alertas) | IPVA, docs pendentes, parados |
| 7.5 | ✅ | Digitar `alertas` | Mesmo resultado de 7.4 |

---

## BLOCO 8 — Agente de IA 🔁

> Corrigido: solicita nome do cliente; leads criados mesmo fora do horário.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 8.1 | ✅ | Enviar "Oi" | Agente responde apresentando a loja |
| 8.2 | ✅ | "Vocês têm Honda Civic?" | Agente busca no estoque |
| 8.3 | ✅ | "Tenho carta de crédito aprovada" | Agente eleva score e notifica dono |
| 8.4 | 🔁 | Mensagem **fora do horário** | Resposta automática E lead aparece no CRM |
| 8.5 | 🔁 | Conversa com o agente | Agente pergunta o nome e salva no lead |
| 8.6 | ✅ | Abrir `localhost:3000/crm` | Lead aparece no kanban |

---

## BLOCO 9 — Painel Web

### 9A — Dashboard ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 9A.1–9A.3 | ✅ | Login, redirecionamento, métricas |

### 9A.4 — Configurações 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9A.4 | 🔁 | Alterar qualquer campo → Salvar | "Configurações salvas com sucesso." (mesmo sem preencher mensagem fora do horário) |

### 9B — Estoque 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9B.1–9B.6 | ✅ | Listar, filtrar, buscar, detalhe, editar, custos | Ok |
| 9B.7 | ✅ | Documentação → IPVA | Data exibe **03/2027** |
| 9B.8 | 🔁 | **Buscar** placa de veículo **vendido** (estando na aba Disponíveis) | Veículo vendido aparece nos resultados |
| 9B.9 | 🔁 | Documentação → Editar → campo IPVA | Input de mês/ano aparece; salvar altera; "Limpar" zera |
| 9B.10 | ⬜ | `+ Novo veículo` → digitar placa → Consultar | FIPE preenche campo automaticamente |
| 9B.11 | ⬜ | Salvar novo veículo pelo painel | Card aparece no estoque |

### 9C — CRM 🔁

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9C.1 | ✅ | Acessar `/crm` | Kanban com colunas |
| 9C.2 | ✅ | Clicar em lead | Drawer com histórico |
| 9C.3 | ✅ | Clicar "Assumir" | Status muda para atendimento humano |
| 9C.4 | 🔁 | Arrastar lead entre colunas | Card move para a coluna destino; drawer não abre ao soltar |

### 9D — Venda pelo painel 🔁

> ⚠️ Requer migração 3 (recriar view) para `forma_pagamento` aparecer no detalhe.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 9D.1 | 🔁 | Aba Vender → preencher valor + **selecionar pagamento** → Confirmar | Venda registrada |
| 9D.2 | 🔁 | Abrir detalhe do veículo vendido | Exibe: Vendido por, **Pagamento**, Vendedor, Comprador |
| 9D.3 | 🔁 | Card do veículo vendido na lista | Mostra "Lucro real" e "Vendido por" (não "Lucro est.") |

---

## BLOCO 10 — Casos Extremos ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 10.1–10.5 | ✅ | Placa duplicada, texto aleatório, grupo, humano=true, emoji |

---

## BLOCO 11 — Telegram: Menu ✅

| # | Status | Resultado esperado |
|---|--------|--------------------|
| 11.1–11.3 | ✅ | Menu, permissão, expiração |

---

## BLOCO 12 — Telegram: Cadastro 🔁

> Corrigido: documentação criada com todos os campos boolean ao cadastrar via bot.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 12.1–12.4 | ✅ | Fluxo completo com foto | Ok |
| 12.5 | 🔁 | Abrir detalhe → aba Dados → Documentação | Estado dos docs aparece (Transferência, Laudo, DUT, CRLV) |

---

## BLOCO 13 — Telegram: Custo, Venda e Edição 🔁

> ⚠️ Requer migração 3 (recriar view) para `forma_pagamento` aparecer no detalhe.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 13.1 | ✅ | Lançar custo | "Custos salvos." |
| 13.2 | 🔁 | Registrar venda | Fluxo: preço → pagamento → vendedor (lista ou digita) → comprador → resumo |
| 13.3 | 🔁 | Abrir detalhe do veículo vendido | Pagamento, Vendedor e Comprador aparecem |
| 13.4 | ✅ | Editar veículo | "Atualizado com sucesso." |

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

> ⚠️ Rodar migrações 2 e 3 antes de testar.

| # | Status | Ação | Resultado esperado |
|---|--------|------|--------------------|
| 16.1 | ✅ | `/vendedores` → aba Desempenho | Lista com qtd vendas, receita, comissão |
| 16.2 | ✅ | Clicar em vendedor | Expande vendas individuais |
| 16.3 | 🔁 | Aba Cadastro → digitar nome → Adicionar | Vendedor aparece na lista |
| 16.4 | 🔁 | Clicar no lixo ao lado de um vendedor | Vendedor removido |
| 16.5 | 🔁 | Registrar venda via bot (WA ou TG) com vendedor cadastrado | Lista de vendedores aparece como opções numeradas |
| 16.6 | 🔁 | Selecionar vendedor da lista e concluir venda | Vendedor correto salvo no veículo |

---

## RESULTADO

| Bloco | Status |
|-------|--------|
| 1 — Menu WhatsApp | ✅ (retestar 1.10) |
| 2 — API Placas | ✅ |
| 3A/3B — Cadastro | ✅ |
| 3C — Fotos WA | 🔁 retestar |
| 4 — Custo WhatsApp | 🔁 retestar observação + bloqueio vendido |
| 5 — Venda WhatsApp | 🔁 retestar fluxo completo |
| 6 — Edição WhatsApp | ✅ |
| 7 — Consultas WhatsApp | 🔁 retestar telefone no lead |
| 8 — Agente IA | 🔁 retestar nome + fora do horário |
| 9A — Dashboard | ✅ |
| 9A.4 — Configurações | 🔁 retestar salvar |
| 9B — Estoque | 🔁 retestar busca + IPVA edit + novo veículo |
| 9C — CRM | 🔁 retestar drag & drop |
| 9D — Venda painel | 🔁 retestar pagamento + card |
| 10 — Casos extremos | ✅ |
| 11 — Telegram: menu | ✅ |
| 12 — Telegram: cadastro | 🔁 retestar docs |
| 13 — Telegram: venda | 🔁 retestar pagamento |
| 14 — Telegram: consultas | ✅ |
| 15 — Paridade WA × TG | ✅ |
| 16 — Vendedores | 🔁 retestar CRUD + bot |

**Todos os blocos ✅ → Fase 1 concluída → pode avançar para a Fase 2.**

---

*Atualizado em 14/04/2026 — deploy `8e02428`*
