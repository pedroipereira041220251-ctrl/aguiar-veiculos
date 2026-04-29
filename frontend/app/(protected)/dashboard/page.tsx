'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type FinanceiroEstoque, type FinanceiroResumo, type Lead, type Alerta, type Veiculo } from '@/lib/api';
import { fmt, fmtKm, FUNIL_LABEL, cn } from '@/lib/utils';
import {
  Car, TrendingUp, DollarSign, Users, Bell, Plus,
  AlertTriangle, Phone, Instagram, RefreshCw, ArrowUpRight, LayoutDashboard,
} from 'lucide-react';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-white/[0.04] rounded-lg', className)} />;
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
    setLoading(true); setErro(false);
    try {
      const [e, r, l, a, v] = await Promise.all([
        api.financeiro.estoque(), api.financeiro.resumo(),
        api.leads.hoje(), api.alertas.listar(),
        api.veiculos.listar({ status: 'disponivel' }),
      ]);
      setEstoque(e); setResumo(r); setLeads(l); setAlertas(a); setVeiculos(v);
    } catch { setErro(true); } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const urgentes = alertas.filter(a => a.urgencia === 'alta').length;

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-start justify-between">
          <div>
            <p className="breadcrumb">
              <LayoutDashboard size={10} />
              Painel / Dashboard
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Visão Geral</h1>
            <p className="text-sm text-text-muted mt-1">Acompanhe o estoque, leads e performance financeira em tempo real.</p>
          </div>
          {erro && (
            <button
              onClick={carregar}
              className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary transition-colors border border-border rounded-lg px-3 py-2 hover:border-primary/40"
            >
              <RefreshCw size={12} /> Reconectar
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="border-b border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
          {[
            {
              label: 'Veículos em estoque',
              value: loading ? '—' : String(estoque?.qtd_veiculos ?? '—'),
              sub: loading ? null : estoque ? `R$ ${(estoque.total_investido / 1000).toFixed(0)}k investidos` : null,
              icon: Car, href: '/estoque', color: 'text-text-primary',
            },
            {
              label: 'Leads hoje',
              value: loading ? '—' : String(leads.length),
              sub: loading ? null : `${leads.filter(l => l.canal === 'whatsapp').length} WhatsApp`,
              icon: Users, href: '/crm', color: 'text-text-primary',
            },
            {
              label: 'Alertas ativos',
              value: loading ? '—' : String(alertas.length),
              sub: loading ? null : urgentes > 0 ? `${urgentes} urgentes` : 'Tudo em dia',
              icon: Bell, href: '/alertas', color: urgentes > 0 ? 'text-red-400' : 'text-text-primary',
            },
            {
              label: 'Receita do mês',
              value: loading ? '—' : fmt(resumo?.receita),
              sub: loading ? null : `Lucro: ${fmt(resumo?.lucro_real)}`,
              icon: DollarSign, href: '/financeiro', color: 'text-gradient-red',
            },
          ].map(({ label, value, sub, icon: Icon, href, color }) => (
            <Link key={label} href={href} className="group p-5 md:p-6 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center">
                  <Icon className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="stat-label mb-1.5">{label}</p>
              <p className={cn('font-mono text-2xl md:text-3xl font-bold tabular-nums', color)}>
                {value}
              </p>
              {sub && <p className="text-xs text-text-muted mt-1.5 font-medium">{sub}</p>}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1440px] mx-auto">

        {/* Estoque disponível — ocupa 2/3 */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="chapter-heading mb-0">
              <span className="chapter-bar bg-primary" />
              <span className="chapter-title">Estoque Disponível</span>
              {!loading && veiculos.length > 0 && (
                <span className="badge bg-white/5 border border-border text-text-muted ml-1">{veiculos.length}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link href="/estoque/novo" className="btn-primary !py-2 !text-xs">
                <Plus className="w-3.5 h-3.5" /> Novo
              </Link>
              <Link href="/estoque" className="text-xs text-text-muted hover:text-primary transition-colors font-semibold">
                Ver todos →
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : veiculos.length === 0 ? (
            <div className="recipe-card flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mb-4">
                <Car className="w-7 h-7 text-text-dim" strokeWidth={1.5} />
              </div>
              <p className="text-text-muted text-sm font-semibold">Nenhum veículo disponível</p>
              <Link href="/estoque/novo" className="text-primary text-xs hover:underline mt-2 font-medium">
                Cadastrar primeiro veículo →
              </Link>
            </div>
          ) : (
            <div className="recipe-card">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="tbl-th">Veículo</th>
                    <th className="tbl-th hidden md:table-cell">Km / Cor</th>
                    <th className="tbl-th-right">Preço</th>
                    <th className="tbl-th-right hidden sm:table-cell">Lucro est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {veiculos.slice(0, 10).map(v => (
                    <Link key={v.id} href={`/estoque/${v.id}`} legacyBehavior>
                      <tr className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
                            {v.marca} {v.modelo} <span className="font-normal text-text-muted">{v.ano}</span>
                          </p>
                          <p className="text-xs font-mono text-text-muted mt-0.5">{v.placa}</p>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <p className="text-xs text-text-muted font-mono">{fmtKm(v.km)}</p>
                          <p className="text-xs text-text-dim capitalize mt-0.5">{v.cor}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-sm font-semibold font-mono text-text-primary">{fmt(v.preco_venda)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                          <span className={cn(
                            'text-xs font-semibold font-mono flex items-center gap-0.5 justify-end',
                            v.lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400',
                          )}>
                            <TrendingUp className="w-3 h-3" /> {fmt(v.lucro_estimado)}
                          </span>
                        </td>
                      </tr>
                    </Link>
                  ))}
                </tbody>
              </table>
              {veiculos.length > 10 && (
                <div className="border-t border-border px-4 py-3">
                  <Link href="/estoque" className="text-xs text-text-muted hover:text-primary transition-colors font-medium">
                    + {veiculos.length - 10} veículos no estoque
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna direita: Leads + Alertas */}
        <div className="space-y-6">

          {/* Leads hoje */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="chapter-heading mb-0">
                <span className="chapter-bar bg-blue-400" />
                <span className="chapter-title">Leads Hoje</span>
                {!loading && leads.length > 0 && (
                  <span className="badge bg-blue-400/10 text-blue-400 ml-1">{leads.length}</span>
                )}
              </div>
              <Link href="/crm" className="text-xs text-text-muted hover:text-primary transition-colors font-semibold">
                CRM →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : leads.length === 0 ? (
              <div className="recipe-card py-8 text-center">
                <Users className="w-7 h-7 text-text-dim mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-xs text-text-muted font-medium">Nenhum lead hoje</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {leads.slice(0, 5).map(l => (
                  <Link key={l.id} href="/crm" className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:bg-card-hover hover:border-border-bright transition-all">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-xs font-bold">
                        {(l.nome || l.contato).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{l.nome || l.contato}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {l.canal === 'whatsapp'
                          ? <Phone className="w-3 h-3 text-green-400" />
                          : <Instagram className="w-3 h-3 text-pink-400" />
                        }
                        <span className="text-2xs text-text-muted uppercase font-semibold tracking-wide">
                          {FUNIL_LABEL[l.status_funil]}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
                {leads.length > 5 && (
                  <Link href="/crm" className="block text-center text-xs text-text-muted hover:text-primary transition-colors font-medium pt-1">
                    + {leads.length - 5} mais
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Alertas */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="chapter-heading mb-0">
                <span className={cn('chapter-bar', urgentes > 0 ? 'bg-red-400' : 'bg-yellow-400')} />
                <span className="chapter-title">Alertas</span>
                {urgentes > 0 && (
                  <span className="badge bg-red-400/10 text-red-400 ml-1">{urgentes} urgente{urgentes > 1 ? 's' : ''}</span>
                )}
              </div>
              <Link href="/alertas" className="text-xs text-text-muted hover:text-primary transition-colors font-semibold">
                Ver todos →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : alertas.length === 0 ? (
              <div className="recipe-card py-8 text-center">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-2">
                  <Bell className="w-4 h-4 text-accent" strokeWidth={1.8} />
                </div>
                <p className="text-xs text-text-muted font-medium">Tudo em dia</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {alertas.slice(0, 4).map((a, i) => (
                  <Link key={i} href={`/estoque/${a.veiculo_id}`} className="flex items-start gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:bg-card-hover transition-all">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      a.urgencia === 'alta' ? 'bg-red-400/10' : 'bg-yellow-400/10',
                    )}>
                      <AlertTriangle className={cn('w-3.5 h-3.5', a.urgencia === 'alta' ? 'text-red-400' : 'text-yellow-400')} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary leading-snug">{a.descricao}</p>
                      <p className="text-xs font-mono text-primary mt-0.5">{a.placa}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
