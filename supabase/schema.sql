-- ============================================================
-- AGUIAR VEÍCULOS — Schema Supabase (PRD v2.0 Definitivo)
-- Rodar no SQL Editor do Supabase em ordem
-- ============================================================

-- ============================================================
-- 0. EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TABELA: veiculos (seção 3.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS veiculos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa            text UNIQUE NOT NULL,             -- sempre uppercase
  marca            text NOT NULL,
  modelo           text NOT NULL,
  ano              integer NOT NULL,
  cor              text NOT NULL,
  km               integer NOT NULL,
  preco_compra     numeric(12,2) NOT NULL,           -- custo de aquisição
  preco_venda      numeric(12,2) NOT NULL,           -- preço pedido
  status           text NOT NULL DEFAULT 'disponivel'
                   CHECK (status IN ('disponivel','reservado','vendido','inativo')),
  preco_venda_final numeric(12,2),                  -- valor real recebido (base do lucro_real)
  data_venda       date,
  nome_vendedor    text,                            -- vendedor responsável pela venda
  nome_comprador   text,                            -- comprador (para histórico)
  obs              text,
  fipe_referencia  numeric(12,2),                   -- valor FIPE no momento do cadastro
  criado_via       text NOT NULL DEFAULT 'painel'
                   CHECK (criado_via IN ('whatsapp','telegram','painel','api')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. TABELA: custos_veiculo (seção 3.2)
-- ============================================================
CREATE TABLE IF NOT EXISTS custos_veiculo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id  uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  tipo        text NOT NULL,   -- pintura, funilaria, revisão, documentação, outros
  valor       numeric(12,2) NOT NULL CHECK (valor > 0),
  descricao   text,
  data_custo  date NOT NULL DEFAULT CURRENT_DATE,
  criado_via  text NOT NULL DEFAULT 'painel'
              CHECK (criado_via IN ('whatsapp','telegram','painel','api')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. TABELA: fotos_veiculo (seção 3.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS fotos_veiculo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id   uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  url          text NOT NULL,          -- URL pública Supabase Storage
  storage_path text NOT NULL,          -- caminho interno para deletar
  ordem        integer NOT NULL DEFAULT 0,  -- ordem de exibição (0 = foto principal)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. TABELA: documentacao_veiculo (seção 3.4) — 1:1 com veiculos
-- ============================================================
CREATE TABLE IF NOT EXISTS documentacao_veiculo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id          uuid UNIQUE NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  ipva_vencimento     date,
  transferencia_ok    boolean NOT NULL DEFAULT false,
  laudo_vistoria_ok   boolean NOT NULL DEFAULT false,
  dut_ok              boolean NOT NULL DEFAULT false,
  crlv_ok             boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. TABELA: leads (seção 3.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text,
  contato               text NOT NULL,         -- número WA ou username IG
  canal                 text NOT NULL
                        CHECK (canal IN ('whatsapp','instagram')),
  veiculo_interesse_id  uuid REFERENCES veiculos(id) ON DELETE SET NULL,
  status_funil          text NOT NULL DEFAULT 'novo'
                        CHECK (status_funil IN ('novo','contato','visita','proposta','fechado','perdido')),
  forma_pagamento       text,                  -- financiamento, à vista
  prazo_compra          text,                  -- imediato, 30 dias, pesquisando...
  capacidade_financeira text,                  -- carta_aprovada | comprovante_renda | a_vista_confirmado | sem_informacao
  score_qualificacao    integer CHECK (score_qualificacao BETWEEN 1 AND 5),
  atendimento_humano    boolean NOT NULL DEFAULT false,  -- true = agente para permanentemente
  resumo_agente         text,                  -- gerado no momento do handoff
  foto_entrada_url      text,                  -- URL da foto de veículo de entrada
  anotacoes             text,                  -- anotações manuais do dono
  created_at            timestamptz NOT NULL DEFAULT now(),
  ultima_interacao      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. TABELA: conversas (seção 3.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  canal               text NOT NULL CHECK (canal IN ('whatsapp','instagram')),
  mensagens           jsonb NOT NULL DEFAULT '[]'::jsonb,
                      -- array de { role, content, timestamp, tipo: text|audio|image }
  ultima_mensagem_at  timestamptz NOT NULL DEFAULT now(),
  debounce_timer_id   text,                    -- setTimeout ID em memória (prod: Redis)
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. TABELA: bot_sessions (seção 3.7)
-- Timeout de 30 minutos de inatividade
-- Sessões WhatsApp e Telegram são independentes
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal         text NOT NULL CHECK (canal IN ('whatsapp','telegram')),
  owner_id      text NOT NULL,    -- OWNER_PHONE_NUMBER (WA) ou TELEGRAM_OWNER_CHAT_ID (TG)
  modo_gestao   boolean NOT NULL DEFAULT false,
  estado        text,             -- null | cadastro | custo | custo_loop | edicao | venda
  dados_parciais jsonb NOT NULL DEFAULT '{}'::jsonb,  -- campos coletados + step atual
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal, owner_id)
);

-- ============================================================
-- 8. TABELA: configuracoes — singleton (seção 3.8)
-- Sempre 1 linha com id=1
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes (
  id                   integer PRIMARY KEY DEFAULT 1
                       CHECK (id = 1),          -- garante singleton
  horario_inicio       time NOT NULL DEFAULT '08:00',
  horario_fim          time NOT NULL DEFAULT '18:00',
  dias_semana          integer[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 0=dom...6=sab
  msg_fora_horario     text NOT NULL DEFAULT 'Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve!',
  owner_phone_number   text NOT NULL DEFAULT '',
  resumo_semanal_ativo boolean NOT NULL DEFAULT true,
  alerta_ipva_dias     integer NOT NULL DEFAULT 15,
  alerta_parado_dias   integer NOT NULL DEFAULT 45,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. TRIGGER: set_updated_at (seção 3.9)
-- Aplicar em: veiculos, documentacao_veiculo, bot_sessions, conversas, configuracoes
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover triggers existentes antes de recriar (idempotente)
DROP TRIGGER IF EXISTS trg_veiculos_updated_at ON veiculos;
DROP TRIGGER IF EXISTS trg_documentacao_updated_at ON documentacao_veiculo;
DROP TRIGGER IF EXISTS trg_bot_sessions_updated_at ON bot_sessions;
DROP TRIGGER IF EXISTS trg_conversas_updated_at ON conversas;
DROP TRIGGER IF EXISTS trg_configuracoes_updated_at ON configuracoes;

CREATE TRIGGER trg_veiculos_updated_at
  BEFORE UPDATE ON veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_documentacao_updated_at
  BEFORE UPDATE ON documentacao_veiculo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversas_updated_at
  BEFORE UPDATE ON conversas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_configuracoes_updated_at
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 10. VIEW: vw_veiculos_com_financeiro (seção 3.9)
-- NUNCA armazenar lucro como campo fixo — sempre calcular via view
-- lucro_real usa preco_venda_final (valor real), NUNCA preco_venda (preço pedido)
-- ============================================================
CREATE OR REPLACE VIEW vw_veiculos_com_financeiro AS
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

-- ============================================================
-- 11. RLS — Row Level Security
-- Authenticated users podem ler e escrever
-- SERVICE_KEY (backend) bypassa RLS automaticamente
-- ============================================================
ALTER TABLE veiculos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE custos_veiculo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_veiculo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentacao_veiculo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes         ENABLE ROW LEVEL SECURITY;

-- Políticas: authenticated users têm acesso total
-- (backend usa service_role que bypassa RLS; frontend usa anon/auth)

CREATE POLICY "authenticated_all_veiculos"
  ON veiculos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_custos"
  ON custos_veiculo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_fotos"
  ON fotos_veiculo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_documentacao"
  ON documentacao_veiculo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_leads"
  ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_conversas"
  ON conversas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_bot_sessions"
  ON bot_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_configuracoes"
  ON configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 12. INDEXES — performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_veiculos_status     ON veiculos(status);
CREATE INDEX IF NOT EXISTS idx_veiculos_placa       ON veiculos(placa);
CREATE INDEX IF NOT EXISTS idx_custos_veiculo_id    ON custos_veiculo(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_fotos_veiculo_id     ON fotos_veiculo(veiculo_id, ordem);
CREATE INDEX IF NOT EXISTS idx_leads_contato        ON leads(contato);
CREATE INDEX IF NOT EXISTS idx_leads_status_funil   ON leads(status_funil);
CREATE INDEX IF NOT EXISTS idx_leads_humano         ON leads(atendimento_humano);
CREATE INDEX IF NOT EXISTS idx_leads_created_at     ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_conversas_lead_id    ON conversas(lead_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_canal   ON bot_sessions(canal, owner_id);

-- ============================================================
-- 13. SEED: configuracoes (singleton — sempre 1 linha)
-- INSERT OR IGNORE para não duplicar em re-runs
-- ============================================================
INSERT INTO configuracoes (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 14. STORAGE — bucket fotos-veiculos
-- Rodar separado em: Supabase Dashboard → Storage → New bucket
-- OU via SQL abaixo (requer extensão storage já ativa)
-- ============================================================

-- Criar bucket público para fotos de veículos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-veiculos',
  'fotos-veiculos',
  true,
  10485760,  -- 10 MB por arquivo
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Política: service_role faz upload (backend)
CREATE POLICY "backend_upload_fotos"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'fotos-veiculos');

-- Política: leitura pública (URLs públicas funcionam)
CREATE POLICY "public_read_fotos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'fotos-veiculos');

-- Política: service_role deleta
CREATE POLICY "backend_delete_fotos"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'fotos-veiculos');

-- ============================================================
-- FIM DO SCHEMA
-- Para aplicar: copiar e colar no SQL Editor do Supabase
-- ============================================================
