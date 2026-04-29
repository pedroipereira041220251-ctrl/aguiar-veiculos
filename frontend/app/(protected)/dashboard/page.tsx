'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type FinanceiroEstoque, type FinanceiroResumo, type Lead, type Alerta, type Veiculo } from '@/lib/api';
import { fmt, fmtKm, FUNIL_LABEL, cn } from '@/lib/utils';
import {
  Car, TrendingUp, DollarSign, Users, Bell,
  Plus, ArrowRight, AlertTriangle, Phone, Instagram, RefreshCw,
} from 'lucide-react';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-white/[0.04] rounded-lg', className)} />;
}

function StatCard({
  label, value, sub, accent = false,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-xl px-5 py-4 flex-1 min-w-0',
      accent ? 'border-primary/25' : 'border-border',
    )}>
      <p className="stat-label">{label}</p>
      <p className={cn('stat-number mt-1.5', accent && 'text-gradient-red')}>{value}</p>
      {sub && <p className="text-text-muted text-xs mt-1.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [estoque, setEstoque]   = useState<FinanceiroEstoque | null>(null);
  const [resumo, setResumo]     = useState<FinanceiroResumo | null>(null);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [alertas, setAlertas]   = useState<Alerta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(false);

  async function carregar() {
    setLoading(true);
    setErro(false);
    try {
      const [e, r, l, a, v] = await Promise.all([
        api.financeiro.estoque(),
        api.financeiro.resumo(),
        api.leads.hoje(),
        api.alertas.listar(),
        api.veiculos.listar({ status: 'disponivel' }),
      ]);
      setEstoque(e);
      setResumo(r);
      setLeads(l);
      setAlertas(a);
      setVeiculos(v);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const urgentes = alertas.filter(a => a.urgencia === 'alta').length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1440px] mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-text-muted text-xs mt-0.5 capitalize font-medium">{hoje}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {erro && (
            <button
              onClick={carregar}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors"
            >
              <RefreshCw size={14} /> Reconectar
            </button>
          )}
          <Link href="/estoque/novo" className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo veículo</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </div>
      </div>

      {erro && (
        <div className="bg-red-400/5 border border-red-400/15 rounded-xl px-4 py-3 text-xs text-red-400 font-medium">
          Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 flex-1 min-w-[140px]" />)
        ) : (
          <>
            <StatCard
              label="Em estoque"
              value={String(estoque?.qtd_veiculos ?? '—')}
              sub={estoque ? `R$ ${(estoque.total_investido / 1000).toFixed(0)}k investidos` : undefined}
            />
            <StatCard
              label="Leads hoje"
              value={String(leads.length)}
              sub={leads.length === 1 ? '1 recebido' : `${leads.length} recebidos`}
            />
            <StatCard
              label="Alertas"
              value={String(alertas.length)}
              sub={urgentes > 0 ? `${urgentes} urgentes` : 'Tudo em dia'}
            />
            <StatCard
              label="Receita mês"
              value={fmt(resumo?.receita)}
              sub={`Lucro: ${fmt(resumo?.lucro_real)}`}
              accent
            />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Estoque recente */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Car className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
              <span className="text-sm font-semibold text-text-primary">Estoque disponível</span>
              {!loading && (
                <span className="badge bg-white/5 text-text-muted border border-border">
                  {veiculos.length}
                </span>
              )}
            </div>
            <Link
              href="/estoque"
              className="text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1 font-medium"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
            </div>
          ) : veiculos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-5">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mb-3">
                <Car className="w-5 h-5 text-text-dim" strokeWidth={1.5} />
              </div>
              <p className="text-text-muted text-sm font-medium">Nenhum veículo disponível</p>
              <Link href="/estoque/novo" className="text-primary text-xs hover:underline mt-2 font-medium">
                Cadastrar primeiro veículo →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {veiculos.slice(0, 8).map(v => (
                <Link
                  key={v.id}
                  href={`/estoque/${v.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center flex-shrink-0">
                      <Car className="w-3.5 h-3.5 text-text-dim" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-text-primary text-sm font-medium group-hover:text-primary transition-colors truncate">
                        {v.marca} {v.modelo} {v.ano}
                      </p>
                      <p className="text-text-muted text-xs font-mono">{v.placa} · {fmtKm(v.km)} · {v.cor}</p>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-text-primary text-sm font-semibold font-mono">{fmt(v.preco_venda)}</p>
                    <p className={cn(
                      'text-xs font-medium font-mono flex items-center gap-0.5 justify-end',
                      v.lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400',
                    )}>
                      <TrendingUp className="w-3 h-3" />
                      {fmt(v.lucro_estimado)}
                    </p>
                  </div>
                </Link>
              ))}
              {veiculos.length > 8 && (
                <div className="px-5 py-3 text-center">
                  <Link href="/estoque" className="text-text-muted text-xs hover:text-primary transition-colors font-medium">
                    + {veiculos.length - 8} veículos no estoque
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
              <span className="text-sm font-semibold text-text-primary">Alertas</span>
              {urgentes > 0 && (
                <span className="badge bg-red-400/10 text-red-400">
                  {urgentes} urgente{urgentes > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <Link href="/alertas" className="text-xs text-text-muted hover:text-primary transition-colors font-medium">
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : alertas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
                <Bell className="w-5 h-5 text-accent" strokeWidth={1.8} />
              </div>
              <p className="text-text-primary text-sm font-semibold">Tudo em dia</p>
              <p className="text-text-muted text-xs mt-0.5">Sem alertas ativos</p>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto max-h-[340px]">
              {alertas.map((a, i) => (
                <Link
                  key={i}
                  href={`/estoque/${a.veiculo_id}`}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
                    a.urgencia === 'alta' ? 'bg-red-400/10' : 'bg-yellow-400/10',
                  )}>
                    <AlertTriangle className={cn(
                      'w-3 h-3',
                      a.urgencia === 'alta' ? 'text-red-400' : 'text-yellow-400',
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-primary text-xs font-medium leading-snug">{a.descricao}</p>
                    <p className="text-primary text-xs mt-0.5 font-mono">{a.placa}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leads recentes */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
            <span className="text-sm font-semibold text-text-primary">Leads hoje</span>
            {!loading && (
              <span className="badge bg-white/5 text-text-muted border border-border">{leads.length}</span>
            )}
          </div>
          <Link
            href="/crm"
            className="text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1 font-medium"
          >
            Ver CRM <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="p-5 space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Users className="w-9 h-9 text-text-dim mb-3" strokeWidth={1.5} />
            <p className="text-text-muted text-sm font-medium">Nenhum lead hoje</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-2xs font-semibold text-text-muted uppercase tracking-widest">Lead</th>
                  <th className="text-left px-4 py-3 text-2xs font-semibold text-text-muted uppercase tracking-widest hidden sm:table-cell">Canal</th>
                  <th className="text-left px-4 py-3 text-2xs font-semibold text-text-muted uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map(l => (
                  <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary text-xs font-bold">
                            {(l.nome || l.contato).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-text-primary text-sm font-medium">{l.nome || l.contato}</p>
                          {l.atendimento_humano && (
                            <span className="badge bg-blue-400/10 text-blue-400">Humano</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        {l.canal === 'whatsapp'
                          ? <Phone className="w-3.5 h-3.5 text-green-400" />
                          : <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        }
                        <span className="text-text-muted text-xs font-medium capitalize">{l.canal}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-white/[0.04] text-text-muted border border-border">
                        {FUNIL_LABEL[l.status_funil]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
