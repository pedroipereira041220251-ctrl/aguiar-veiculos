'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type FinanceiroEstoque, type FinanceiroResumo, type Lead, type Alerta } from '@/lib/api';
import { fmt, fmtKm, FUNIL_LABEL } from '@/lib/utils';
import {
  Car, TrendingUp, DollarSign, Users, Bell,
  Plus, ArrowRight, AlertTriangle, Phone, Instagram,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Veiculo } from '@/lib/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-white/5 rounded-lg', className)} />;
}

function MetricCard({
  title, value, sub, icon: Icon, iconBg, iconColor, highlight,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-xl p-5 transition-colors hover:bg-card-hover',
      highlight ? 'border-primary/30' : 'border-border',
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className="text-text-primary text-2xl font-bold mt-1.5 leading-none">{value}</p>
          {sub && <p className="text-text-muted text-xs mt-1.5">{sub}</p>}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </div>
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
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-text-primary text-xl md:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-text-muted text-sm mt-0.5 capitalize">{hoje}</p>
        </div>
        <div className="flex items-center gap-2">
          {erro && (
            <button onClick={carregar} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary transition-colors">
              <RefreshCw size={15} /> Tentar novamente
            </button>
          )}
          <Link
            href="/estoque/novo"
            className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-primary/20 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo veículo</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </div>
      </div>

      {erro && (
        <div className="bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3 text-sm text-red-400">
          Não foi possível conectar ao servidor.
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <MetricCard
              title="Veículos em estoque"
              value={String(estoque?.qtd_veiculos ?? '—')}
              sub={`R$ ${estoque ? (estoque.total_investido / 1000).toFixed(0) : '—'}k investidos`}
              icon={Car}
              iconBg="bg-green-400/10"
              iconColor="text-green-400"
            />
            <MetricCard
              title="Leads hoje"
              value={String(leads.length)}
              sub={leads.length === 1 ? '1 lead recebido' : `${leads.length} leads recebidos`}
              icon={Users}
              iconBg="bg-blue-400/10"
              iconColor="text-blue-400"
            />
            <MetricCard
              title="Alertas ativos"
              value={String(alertas.length)}
              sub={alertas.length === 0 ? 'Tudo em dia ✓' : `${alertas.filter(a => a.urgencia === 'alta').length} urgentes`}
              icon={Bell}
              iconBg={alertas.some(a => a.urgencia === 'alta') ? 'bg-red-400/10' : 'bg-yellow-400/10'}
              iconColor={alertas.some(a => a.urgencia === 'alta') ? 'text-red-400' : 'text-yellow-400'}
            />
            <MetricCard
              title="Receita do mês"
              value={fmt(resumo?.receita)}
              sub={`Lucro: ${fmt(resumo?.lucro_real)}`}
              icon={DollarSign}
              iconBg="bg-primary/10"
              iconColor="text-primary"
              highlight
            />
          </>
        )}
      </div>

      {/* Main grid: estoque + alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Estoque recente */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-text-muted" />
              <h2 className="text-text-primary font-semibold text-sm">Estoque disponível</h2>
            </div>
            <Link href="/estoque" className="text-primary hover:text-primary-light text-xs flex items-center gap-1 transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : veiculos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <Car className="w-10 h-10 text-border mb-3" />
              <p className="text-text-muted text-sm">Nenhum veículo disponível</p>
              <Link href="/estoque/novo" className="text-primary text-sm hover:underline mt-2">
                Cadastrar primeiro veículo →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {veiculos.slice(0, 7).map(v => (
                <Link
                  key={v.id}
                  href={`/estoque/${v.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Car className="w-4 h-4 text-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-text-primary text-sm font-medium group-hover:text-primary transition-colors truncate">
                        {v.marca} {v.modelo} {v.ano}
                      </p>
                      <p className="text-text-muted text-xs">{v.placa} · {fmtKm(v.km)} · {v.cor}</p>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-text-primary text-sm font-semibold">{fmt(v.preco_venda)}</p>
                    <p className={cn('text-xs font-medium flex items-center gap-0.5 justify-end', v.lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400')}>
                      <TrendingUp className="w-3 h-3" />
                      {fmt(v.lucro_estimado)}
                    </p>
                  </div>
                </Link>
              ))}
              {veiculos.length > 7 && (
                <div className="px-5 py-3 text-center">
                  <Link href="/estoque" className="text-text-muted text-xs hover:text-primary transition-colors">
                    + {veiculos.length - 7} veículos no estoque
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-text-muted" />
              <h2 className="text-text-primary font-semibold text-sm">Alertas</h2>
              {alertas.filter(a => a.urgencia === 'alta').length > 0 && (
                <span className="w-5 h-5 rounded-full bg-red-400/20 text-red-400 text-xs flex items-center justify-center font-bold">
                  {alertas.filter(a => a.urgencia === 'alta').length}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : alertas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-5">
              <div className="w-10 h-10 rounded-full bg-green-400/10 flex items-center justify-center mb-3">
                <Bell className="w-5 h-5 text-green-400" />
              </div>
              <p className="text-text-primary text-sm font-medium">Tudo em dia!</p>
              <p className="text-text-muted text-xs mt-0.5">Sem alertas ativos</p>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto max-h-80">
              {alertas.map((a, i) => (
                <Link key={i} href={`/estoque/${a.veiculo_id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    a.urgencia === 'alta' ? 'bg-red-400/10' : 'bg-yellow-400/10',
                  )}>
                    <AlertTriangle className={cn('w-3.5 h-3.5', a.urgencia === 'alta' ? 'text-red-400' : 'text-yellow-400')} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-primary text-xs font-medium leading-snug">{a.descricao}</p>
                    <p className="text-primary text-xs mt-0.5">{a.placa}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leads recentes */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-text-muted" />
            <h2 className="text-text-primary font-semibold text-sm">Leads hoje ({leads.length})</h2>
          </div>
          <Link href="/crm" className="text-primary hover:text-primary-light text-xs flex items-center gap-1 transition-colors">
            Ver CRM <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Users className="w-10 h-10 text-border mb-3" />
            <p className="text-text-muted text-sm">Nenhum lead hoje</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-white/5">
                  <th className="text-left px-5 py-3 text-xs text-text-muted font-medium uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider hidden sm:table-cell">Canal</th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map(l => (
                  <tr key={l.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary text-xs font-bold">
                            {(l.nome || l.contato).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-text-primary text-sm font-medium">{l.nome || l.contato}</p>
                          {l.atendimento_humano && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 text-xs">
                              Humano
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        {l.canal === 'whatsapp'
                          ? <Phone className="w-3.5 h-3.5 text-green-400" />
                          : <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        }
                        <span className="text-text-muted text-sm capitalize">{l.canal}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-text-muted text-xs px-2 py-0.5 rounded-md bg-white/5 border border-border">
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
