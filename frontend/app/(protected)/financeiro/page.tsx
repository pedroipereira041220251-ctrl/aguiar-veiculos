'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  api, type FinanceiroResumo, type FinanceiroEstoque,
  type FinanceiroRanking, type FinanceiroCategoria,
} from '@/lib/api';
import { fmt, fmtShort, cn } from '@/lib/utils';
import { TrendingUp, ShoppingCart, BarChart2, ChevronLeft, ChevronRight, RefreshCw, Package, DollarSign } from 'lucide-react';

function mesLabel(mes: string) {
  const [ano, m] = mes.split('-');
  return new Date(Number(ano), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function mesAnterior(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesSeguinte(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function Sk({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-white/[0.04] rounded-lg', className)} />;
}

export default function FinanceiroPage() {
  const [mes, setMes]               = useState(mesAtual);
  const [resumo, setResumo]         = useState<FinanceiroResumo | null>(null);
  const [ranking, setRanking]       = useState<FinanceiroRanking[]>([]);
  const [estoque, setEstoque]       = useState<FinanceiroEstoque | null>(null);
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(false);
    try {
      const [r, rk, e, cat] = await Promise.all([
        api.financeiro.resumo(mes), api.financeiro.ranking(mes),
        api.financeiro.estoque(), api.financeiro.categorias(mes),
      ]);
      setResumo(r); setRanking(rk); setEstoque(e); setCategorias(cat);
    } catch { setErro(true); } finally { setLoading(false); }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const isMesAtual = mes === mesAtual();
  const totalCat = categorias.reduce((s, c) => s + c.total, 0);

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="breadcrumb">
              <DollarSign size={10} />
              Painel / Financeiro
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Relatório Financeiro</h1>
            <p className="text-sm text-text-muted mt-1">Receitas, custos e lucratividade por período.</p>
          </div>

          {/* Seletor de mês */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1.5">
            <button onClick={() => setMes(mesAnterior(mes))} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-text-primary px-2 capitalize min-w-[140px] text-center">{mesLabel(mes)}</span>
            <button onClick={() => setMes(mesSeguinte(mes))} disabled={isMesAtual} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Hero receita ── */}
      <div className="border-b border-border">
        <div className="px-5 md:px-8 py-6">
          <p className="stat-label mb-2">Receita total do período</p>
          {loading
            ? <Sk className="h-14 w-52" />
            : <p className="font-mono text-3xl md:text-5xl font-bold text-gradient-red leading-none">
                <span className="md:hidden">{fmtShort(resumo?.receita)}</span>
                <span className="hidden md:inline">{fmt(resumo?.receita)}</span>
              </p>
          }
          {!loading && resumo && (
            <p className="text-xs text-text-muted mt-3 font-medium flex items-center gap-3 flex-wrap">
              <span>Lucro real: <span className={cn('font-bold', (resumo.lucro_real ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                {fmt(resumo.lucro_real)}
              </span></span>
              <span className="text-text-dim">·</span>
              <span>Margem: <span className="text-text-primary font-bold">{resumo.margem_pct?.toFixed(1)}%</span></span>
            </p>
          )}
        </div>

        {/* KPIs secundários */}
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
          {[
            { label: 'Vendas', value: loading ? '—' : String(resumo?.qtd_vendas ?? 0), sub: 'vendidos', icon: ShoppingCart },
            { label: 'Margem', value: loading ? '—' : `${resumo?.margem_pct?.toFixed(1) ?? '0'}%`, sub: 'lucro médio', icon: BarChart2 },
            { label: 'Estoque', value: loading ? '—' : String(estoque?.qtd_veiculos ?? 0), sub: fmtShort(estoque?.total_investido), icon: Package },
          ].map(({ label, value, sub, icon: Icon }) => (
            <div key={label} className="px-3 md:px-5 py-3 md:py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-border flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.8} />
                </div>
                <p className="stat-label">{label}</p>
              </div>
              <p className="stat-number text-xl md:text-2xl">{value}</p>
              <p className="text-xs text-text-muted mt-1 truncate">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="p-5 md:p-8 space-y-6 max-w-[1440px] mx-auto">

        {erro && (
          <div className="flex items-center gap-3 bg-red-400/5 border border-red-400/15 rounded-xl px-4 py-3">
            <p className="text-sm text-red-400 flex-1">Não foi possível carregar os dados.</p>
            <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-red-400 font-semibold hover:underline">
              <RefreshCw size={12} /> Tentar novamente
            </button>
          </div>
        )}

        {/* Ranking de vendas */}
        <div>
          <div className="chapter-heading mb-4">
            <span className="chapter-bar bg-green-400" />
            <span className="chapter-title">Vendas do Período</span>
            {ranking.length > 0 && (
              <span className="badge bg-green-400/10 text-green-400 ml-1">{ranking.length}</span>
            )}
          </div>

          <div className="recipe-card">
            {loading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-12" />)}
              </div>
            ) : ranking.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart className="w-6 h-6 text-text-dim" strokeWidth={1.5} />
                </div>
                <p className="text-sm text-text-muted font-medium">Nenhuma venda neste período.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="tbl-th w-10">#</th>
                      <th className="tbl-th">Veículo</th>
                      <th className="tbl-th-right hidden sm:table-cell">Venda</th>
                      <th className="tbl-th-right hidden md:table-cell">Custos</th>
                      <th className="tbl-th-right">Lucro</th>
                      <th className="tbl-th-right hidden sm:table-cell">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ranking.map((v, i) => (
                      <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-mono text-text-dim font-bold">{String(i + 1).padStart(2, '0')}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={`/estoque/${v.id}`} className="hover:text-primary transition-colors">
                            <p className="text-sm font-semibold text-text-primary">{v.marca} {v.modelo} {v.ano}</p>
                            <p className="text-xs text-text-muted font-mono">{v.placa} · {v.data_venda?.split('-').reverse().join('/')}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                          <p className="text-sm font-semibold font-mono text-text-primary">{fmt(v.preco_venda_final)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right hidden md:table-cell">
                          <p className="text-xs font-mono text-red-400">{fmt(v.total_custos + v.preco_compra)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <p className={cn('text-sm font-bold font-mono', v.lucro_real >= 0 ? 'text-green-400' : 'text-red-400')}>
                            {fmt(v.lucro_real)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                          <span className={cn(
                            'badge',
                            v.margem_pct >= 10 ? 'bg-green-400/10 text-green-400'
                              : v.margem_pct >= 0 ? 'bg-yellow-400/10 text-yellow-400'
                              : 'bg-red-400/10 text-red-400',
                          )}>
                            {v.margem_pct?.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {ranking.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-white/[0.02]">
                        <td className="px-4 py-3 text-2xs font-bold text-text-muted uppercase tracking-widest" colSpan={2}>Total</td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <p className="text-sm font-bold font-mono text-text-primary">{fmt(resumo?.receita)}</p>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <p className="text-xs font-mono font-bold text-red-400">
                            {fmt(ranking.reduce((s, v) => s + (v.total_custos ?? 0) + (v.preco_compra ?? 0), 0))}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className={cn('text-sm font-bold font-mono', (resumo?.lucro_real ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                            {fmt(resumo?.lucro_real)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs font-semibold text-text-muted">{resumo?.margem_pct?.toFixed(1)}%</span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Categorias + Estoque */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">

          {/* Categorias */}
          <div>
            <div className="chapter-heading mb-4">
              <span className="chapter-bar bg-red-400" />
              <span className="chapter-title">Custos por Categoria</span>
            </div>
            <div className="recipe-card">
              {loading ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="h-10" />)}
                </div>
              ) : categorias.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-10 font-medium">Nenhum custo lançado neste período.</p>
              ) : (
                <div className="divide-y divide-border">
                  {categorias.map((c, i) => (
                    <div key={c.tipo} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono text-text-dim font-bold">{String(i + 1).padStart(2, '0')}</span>
                          <p className="text-sm font-semibold text-text-primary">{c.tipo}</p>
                        </div>
                        <p className="text-sm font-bold font-mono text-red-400">{fmt(c.total)}</p>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/50 rounded-full transition-all duration-700"
                          style={{ width: `${totalCat > 0 ? (c.total / totalCat) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-2xs text-text-dim mt-1.5">{c.qtd} lançamento{c.qtd !== 1 ? 's' : ''} · {totalCat > 0 ? ((c.total / totalCat) * 100).toFixed(0) : 0}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Estoque atual */}
          <div>
            <div className="chapter-heading mb-4">
              <span className="chapter-bar bg-blue-400" />
              <span className="chapter-title">Estoque Atual</span>
            </div>
            <div className="recipe-card">
              {loading ? (
                <div className="p-5 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-10" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                    <div className="p-4 text-center">
                      <p className="stat-label">Veículos</p>
                      <p className="stat-number text-2xl mt-1">{estoque?.qtd_veiculos ?? 0}</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="stat-label">Investido</p>
                      <p className="text-sm font-bold font-mono text-text-primary mt-1">{fmt(estoque?.total_investido)}</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="stat-label">Lucro est.</p>
                      <p className={cn('text-sm font-bold font-mono mt-1', (estoque?.lucro_estimado ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {fmt(estoque?.lucro_estimado)}
                      </p>
                    </div>
                  </div>
                  {(estoque?.veiculos?.length ?? 0) > 0 && (
                    <div className="divide-y divide-border overflow-y-auto max-h-64">
                      {estoque!.veiculos.map(v => (
                        <Link key={v.id} href={`/estoque/${v.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors truncate">{v.modelo} {v.ano}</p>
                            <p className="text-xs text-text-muted font-mono">{v.placa}</p>
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="text-xs font-mono text-text-muted">{fmt(v.investimento_total)}</p>
                            <p className={cn('text-xs font-semibold font-mono', v.lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400')}>
                              {fmt(v.lucro_estimado)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
