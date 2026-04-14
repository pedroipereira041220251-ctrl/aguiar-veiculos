/**
 * Cliente HTTP para o backend Node.js
 * Todas as chamadas de dados passam por aqui — nunca direto ao Supabase do frontend
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }
  return res.json();
}

// ── Veículos ───────────────────────────────────────────────
export const api = {
  veiculos: {
    listar:   (params?: Record<string, string>) =>
      req<Veiculo[]>(`/api/veiculos${params ? '?' + new URLSearchParams(params) : ''}`),
    buscar:   (id: string) => req<VeiculoCompleto>(`/api/veiculos/${id}`),
    criar:    (body: unknown) => req<Veiculo>('/api/veiculos', { method: 'POST', body: JSON.stringify(body) }),
    editar:   (id: string, body: unknown) => req<Veiculo>(`/api/veiculos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    inativar:    (id: string) => req<Veiculo>(`/api/veiculos/${id}`, { method: 'DELETE' }),
    reservar:    (id: string) => req<Veiculo>(`/api/veiculos/${id}/reservar`, { method: 'PATCH' }),
    liberar:     (id: string) => req<Veiculo>(`/api/veiculos/${id}/liberar`, { method: 'PATCH' }),
    vender:      (id: string, body: unknown) => req<Veiculo>(`/api/veiculos/${id}/vender`, { method: 'PATCH', body: JSON.stringify(body) }),
    documentacao:(id: string, body: unknown) => req<DocumentacaoVeiculo>(`/api/veiculos/${id}/documentacao`, { method: 'PATCH', body: JSON.stringify(body) }),

    custos: {
      listar:  (veiculoId: string) => req<Custo[]>(`/api/veiculos/${veiculoId}/custos`),
      criar:   (veiculoId: string, body: unknown) =>
        req(`/api/veiculos/${veiculoId}/custos`, { method: 'POST', body: JSON.stringify(body) }),
      deletar: (custoId: string) => req(`/api/custos/${custoId}`, { method: 'DELETE' }),
    },

    fotos: {
      upload:    (veiculoId: string, formData: FormData) =>
        fetch(`${BASE}/api/veiculos/${veiculoId}/fotos`, { method: 'POST', body: formData }).then(r => r.json()),
      deletar:   (fotoId: string) => req(`/api/fotos/${fotoId}`, { method: 'DELETE' }),
      reordenar: (veiculoId: string, ordem: { id: string; ordem: number }[]) =>
        req(`/api/veiculos/${veiculoId}/fotos/ordem`, { method: 'PATCH', body: JSON.stringify(ordem) }),
    },
  },

  placas: {
    consultar: (placa: string) => req<PlacaResult>(`/api/placas/${placa}`),
  },

  leads: {
    listar:  (params?: Record<string, string>) =>
      req<Lead[]>(`/api/leads${params ? '?' + new URLSearchParams(params) : ''}`),
    hoje:    () => req<Lead[]>('/api/leads/hoje'),
    buscar:  (id: string) => req<LeadCompleto>(`/api/leads/${id}`),
    criar:   (body: unknown) => req<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(body) }),
    editar:  (id: string, body: unknown) => req<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    assumir: (id: string, body?: { resumo?: string }) => req(`/api/leads/${id}/assumir`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  },

  financeiro: {
    resumo:     (mes?: string) => req<FinanceiroResumo>(`/api/financeiro/resumo${mes ? `?mes=${mes}` : ''}`),
    estoque:    () => req<FinanceiroEstoque>('/api/financeiro/estoque'),
  },

  alertas: {
    listar: () => req<Alerta[]>('/api/alertas'),
  },

  config: {
    buscar:      () => req<Config>('/api/config'),
    salvar:      (body: Partial<Config>) => req<Config>('/api/config', { method: 'PATCH', body: JSON.stringify(body) }),
    botsStatus:  () => req<BotsStatus>('/api/config/bots/status'),
  },

  vendedores: {
    listar:          () => req<VendedorResumo[]>('/api/vendedores'),
    vendas:          (nome: string) => req<VendaVendedor[]>(`/api/vendedores/${encodeURIComponent(nome)}`),
    cadastro: {
      listar:  () => req<Vendedor[]>('/api/vendedores/cadastro'),
      criar:   (nome: string) => req<Vendedor>('/api/vendedores/cadastro', { method: 'POST', body: JSON.stringify({ nome }) }),
      deletar: (id: string) => req<void>(`/api/vendedores/cadastro/${id}`, { method: 'DELETE' }),
    },
  },
};

// ── Types ──────────────────────────────────────────────────
export interface Veiculo {
  id: string; placa: string; marca: string; modelo: string; ano: number;
  cor: string; km: number; preco_compra: number; preco_venda: number;
  status: 'disponivel' | 'reservado' | 'vendido' | 'inativo';
  preco_venda_final?: number; data_venda?: string; obs?: string;
  nome_vendedor?: string; nome_comprador?: string; forma_pagamento?: string;
  fipe_referencia?: number; criado_via: string; created_at: string;
  // Da view:
  total_custos: number; investimento_total: number; lucro_estimado: number;
  margem_pct: number; lucro_real?: number;
  // Do join:
  foto_capa?: string;
}

export interface Custo {
  id: string; veiculo_id: string; tipo: string; valor: number;
  descricao?: string; data_custo: string; criado_via: string;
}

export interface Foto {
  id: string; veiculo_id: string; url: string; storage_path: string; ordem: number;
}

export interface DocumentacaoVeiculo {
  id: string; veiculo_id: string; ipva_vencimento?: string;
  transferencia_ok: boolean; laudo_vistoria_ok: boolean; dut_ok: boolean; crlv_ok: boolean;
}

export interface VeiculoCompleto extends Veiculo {
  custos: Custo[]; fotos: Foto[]; documentacao?: DocumentacaoVeiculo;
}

export interface Lead {
  id: string; nome?: string; contato: string; canal: 'whatsapp' | 'instagram';
  status_funil: 'novo' | 'contato' | 'visita' | 'proposta' | 'fechado' | 'perdido';
  forma_pagamento?: string; prazo_compra?: string; capacidade_financeira?: string;
  score_qualificacao?: number; atendimento_humano: boolean;
  resumo_agente?: string; foto_entrada_url?: string; anotacoes?: string;
  created_at: string; ultima_interacao: string;
  veiculo?: { placa: string; modelo: string; ano: number; preco_venda?: number };
}

export interface LeadCompleto extends Lead {
  conversas: { mensagens: unknown[]; canal: string; ultima_mensagem_at: string }[];
}

export interface PlacaResult {
  found: boolean; placa?: string; marca?: string; modelo?: string;
  ano?: number; cor?: string; fipe?: number;
}

export interface FinanceiroResumo {
  mes: string; qtd_vendas: number; receita: number; lucro_real: number; margem_pct: number;
}

export interface FinanceiroEstoque {
  qtd_veiculos: number; total_investido: number; lucro_estimado: number; margem_media: number;
}

export interface BotsStatus {
  whatsapp: { ok: boolean; info: string };
  telegram: { ok: boolean; info: string };
}

export interface Config {
  id: number;
  horario_inicio: string; horario_fim: string;
  dias_semana: number[];
  msg_fora_horario: string;
  owner_phone_number?: string;
  resumo_semanal_ativo: boolean;
  alerta_ipva_dias: number;
  alerta_parado_dias: number;
}

export interface Alerta {
  tipo: 'ipva_vencendo' | 'docs_pendentes' | 'veiculo_parado';
  urgencia: 'alta' | 'media'; cor: string; veiculo_id: string;
  placa: string; descricao: string;
}

export interface Vendedor {
  id: string; nome: string; ativo: boolean; created_at: string;
}

export interface VendedorResumo {
  nome_vendedor: string;
  qtd_vendas: number;
  total_vendas: number;
  comissao: number;
}

export interface VendaVendedor {
  id: string; placa: string; modelo: string; ano: number;
  data_venda?: string; preco_venda_final?: number;
  nome_comprador?: string; comissao: number;
}
