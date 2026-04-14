'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  api,
  type FinanceiroResumo,
  type FinanceiroEstoque,
  type FinanceiroRanking,
  type FinanceiroCategoria,
} from '@/lib/api';
import { fmt, cn } from '@/lib/utils';
import {
  DollarSign, TrendingUp, ShoppingCart, BarChart2,
  ChevronLeft, ChevronRight, RefreshCw, Package,
} from 'lucide-react';

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

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-white/5 rounded-xl', className)} />;
}

export default function FinanceiroPage() {
  const [mes, setMes]           = useState(mesAtual);
  const [resumo, setResumo]     = useState<FinanceiroResumo | null>(null);
  const [ranking, setRanking]   = useState<FinanceiroRanking[]>([]);
  const [estoque, setEstoque]   = useState<FinanceiroEstoque | null>(null);
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(false);
    try {
      const [r, rk, e, cat] = await Promise.all([
        api.financeiro.resumo(mes),
        api.financeiro.ranking(mes),
        api.financeiro.estoque(),
        api.financeiro.categorias(mes),
      ]);
      setResumo(r);
      setRanking(rk);
      setEstoque(e);
      setCategorias(cat);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const isMesAtual = mes === mesAtual();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-text-primary">Financeiro</h1>

        {/* Seletor de mês */}
        <div className="flex items-center gap-1 bg-white/5 border border-border rounded-xl p-1">
          <button
            onClick={() => setMes(mesAnterior(mes))}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-white/5"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-text-primary px-2 capitalize min-w-[140px] text-center">
            {mesLabel(mes)}
          </span>
          <button
            onClick={() => setMes(mesSeguinte(mes))}
            disabled={isMesAtual}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-3 bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3">
          <p className="text-sm text-red-400 flex-1">Não foi possível carregar os dados.</p>
          <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-red-400 hover:underline">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <MetricCard
              icon={DollarSign} iconBg="bg-primary/10" iconColor="text-primary"
              title="Receita" value={fmt(resumo?.receita)} highlight
            />
            <MetricCard
              icon={TrendingUp}
              iconBg={(resumo?.lucro_real ?? 0) >= 0 ? 'bg-green-400/10' : 'bg-red-400/10'}
              iconColor={(resumo?.lucro_real ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}
              title="Lucro real" value={fmt(resumo?.lucro_real)}
            />
            <MetricCard
              icon={BarChart2} iconBg="bg-blue-400/10" iconColor="text-blue-400"
              title="Margem" value={`${resumo?.margem_pct?.toFixed(1) ?? '0'}%`}
            />
            <MetricCard
              icon={ShoppingCart} iconBg="bg-amber-400/10" iconColor="text-amber-400"
              title="Vendas" value={String(resumo?.qtd_vendas ?? 0)}
              sub={resumo?.qtd_vendas === 1 ? 'veículo vendido' : 'veículos vendidos'}
            />
          </>
        )}
      </div>

      {/* Ranking de vendas */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">
            Vendas do mês {ranking.length > 0 && `(${ranking.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : ranking.length === 0 ? (
          <div className="py-12 text-center">
            <ShoppingCart className="w-10 h-10 text-border mx-auto mb-2" />
            <p className="text-sm text-text-muted">Nenhuma venda neste mês.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-white/5">
                  <th className="text-left px-5 py-3 text-xs text-text-muted font-medium uppercase tracking-wider">Veículo</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider hidden sm:table-cell">Venda</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider hidden md:table-cell">Custos</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider">Lucro</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium uppercase tracking-wider hidden sm:table-cell">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranking.map(v => (
                  <tr key={v.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/estoque/${v.id}`} className="hover:text-primary transition-colors">
                        <p className="text-sm font-medium text-text-primary">{v.marca} {v.modelo} {v.ano}</p>
                        <p className="text-xs text-text-muted font-mono">{v.placa} · {v.data_venda?.split('-').reverse().join('/')}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <p className="text-sm font-medium text-text-primary">{fmt(v.preco_venda_final)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden md:table-cell">
                      <p className="text-sm text-red-400">{fmt(v.total_custos + v.preco_compra)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className={cn('text-sm font-semibold', v.lucro_real >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {fmt(v.lucro_real)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
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
                  <tr className="border-t border-border bg-white/5">
                    <td className="px-5 py-3 text-xs font-bold text-text-muted uppercase">Total</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <p className="text-sm font-bold text-text-primary">{fmt(resumo?.receita)}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell" />
                    <td className="px-4 py-3 text-right">
                      <p className={cn('text-sm font-bold', (resumo?.lucro_real ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
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

      {/* Custos por categoria + Estoque */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Categorias de custos */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Custos por categoria</h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : categorias.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">Nenhum custo lançado neste mês.</p>
          ) : (
            <div className="divide-y divide-border">
              {(() => {
                const totalCat = categorias.reduce((s, c) => s + c.total, 0);
                return categorias.map(c => (
                  <div key={c.tipo} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-text-primary truncate">{c.tipo}</p>
                        <p className="text-sm font-semibold text-red-400 ml-3 flex-shrink-0">{fmt(c.total)}</p>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/50 rounded-full"
                          style={{ width: `${totalCat > 0 ? (c.total / totalCat) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{c.qtd} lançamento{c.qtd !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Estoque atual */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Estoque atual</h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                <div className="p-4 text-center">
                  <p className="text-xs text-text-muted">Veículos</p>
                  <p className="text-xl font-bold text-text-primary mt-0.5">{estoque?.qtd_veiculos ?? 0}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-text-muted">Investido</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5">{fmt(estoque?.total_investido)}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-text-muted">Lucro est.</p>
                  <p className={cn('text-sm font-bold mt-0.5', (estoque?.lucro_estimado ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {fmt(estoque?.lucro_estimado)}
                  </p>
                </div>
              </div>
              {(estoque?.veiculos?.length ?? 0) > 0 && (
                <div className="divide-y divide-border overflow-y-auto max-h-52">
                  {estoque!.veiculos.map(v => (
                    <Link
                      key={v.id}
                      href={`/estoque/${v.id}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{v.modelo} {v.ano}</p>
                        <p className="text-xs text-text-muted font-mono">{v.placa}</p>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="text-xs text-text-muted">{fmt(v.investimento_total)}</p>
                        <p className={cn('text-xs font-semibold', v.lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400')}>
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
  );
}

function MetricCard({
  icon: Icon, iconBg, iconColor, title, value, sub, highlight,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-xl p-4 transition-colors',
      highlight ? 'border-primary/30' : 'border-border',
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className="text-text-primary text-xl font-bold mt-1.5 leading-none">{value}</p>
          {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-2', iconBg)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      </div>
    </div>
  );
}
