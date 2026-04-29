'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, type Veiculo } from '@/lib/api';
import { fmt, fmtKm, STATUS_LABEL, cn } from '@/lib/utils';
import { Plus, Search, Car, RefreshCw, TrendingUp, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

function mesLabel(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function mesAnterior(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesSeguinte(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const FILTROS = [
  { value: 'disponivel', label: 'Disponíveis' },
  { value: 'reservado',  label: 'Reservados'  },
  { value: 'vendido',    label: 'Vendidos'    },
  { value: 'inativo',    label: 'Inativos'    },
];

const STATUS_COLOR: Record<string, string> = {
  disponivel: 'bg-green-400',
  reservado:  'bg-yellow-400',
  vendido:    'bg-blue-400',
  inativo:    'bg-text-dim',
};

const STATUS_BADGE: Record<string, string> = {
  disponivel: 'bg-green-400/10 text-green-400',
  reservado:  'bg-yellow-400/10 text-yellow-400',
  vendido:    'bg-blue-400/10 text-blue-400',
  inativo:    'bg-white/5 text-text-muted',
};

const STATUS_BAR: Record<string, string> = {
  disponivel: 'bg-green-400',
  reservado:  'bg-yellow-400',
  vendido:    'bg-blue-400',
  inativo:    'bg-text-dim',
};

export default function EstoquePage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [todos, setTodos]       = useState<Veiculo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(false);
  const [busca, setBusca]       = useState('');
  const [status, setStatus]     = useState('disponivel');
  const [mes, setMes]           = useState<string>(() => new Date().toISOString().slice(0, 7));

  const carregar = useCallback(async () => {
    setLoading(true); setErro(false);
    try {
      const [filtrados, todosList] = await Promise.all([
        api.veiculos.listar({ status }),
        api.veiculos.listar({}),
      ]);
      setVeiculos(filtrados);
      setTodos(todosList);
    } catch { setErro(true); } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = busca.trim()
    ? todos.filter(v => {
        const q = busca.toLowerCase();
        return v.placa.toLowerCase().includes(q)
          || v.modelo.toLowerCase().includes(q)
          || v.marca.toLowerCase().includes(q);
      })
    : status === 'vendido'
      ? veiculos.filter(v => v.data_venda?.startsWith(mes))
      : veiculos;

  return (
    <div className="animate-fade-in h-full flex flex-col">

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="breadcrumb">
              <Car size={10} />
              Painel / Estoque
            </p>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Gestão de Estoque</h1>
            <p className="text-sm text-text-muted mt-1">Cadastre, consulte e gerencie os veículos da frota.</p>
          </div>
          <Link href="/estoque/novo" className="btn-primary flex-shrink-0">
            <Plus size={15} /> Novo veículo
          </Link>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-border px-5 md:px-8 py-3 flex items-center gap-3 flex-wrap bg-sidebar/30">

        {/* Filtros de status */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {FILTROS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                status === f.value
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-text-muted border-transparent hover:border-border hover:text-text-primary',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_BAR[f.value])} />
              {f.label}
            </button>
          ))}
        </div>

        {/* Seletor mês vendidos */}
        {status === 'vendido' && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1">
            <button onClick={() => setMes(mesAnterior(mes))} className="p-0.5 text-text-muted hover:text-text-primary transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-text-primary px-1 capitalize whitespace-nowrap">{mesLabel(mes)}</span>
            <button onClick={() => setMes(mesSeguinte(mes))} disabled={mes >= new Date().toISOString().slice(0, 7)} className="p-0.5 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* Busca */}
        <div className="relative w-full sm:w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por placa, marca..."
            className="input pl-8 !py-1.5 !text-xs"
          />
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="flex-1 overflow-auto">
        {erro ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mb-4">
              <RefreshCw size={20} className="text-text-dim" />
            </div>
            <p className="text-sm text-text-muted mb-3 font-medium">Não foi possível carregar.</p>
            <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
          </div>
        ) : loading ? (
          <table className="w-full">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td className="px-5 py-4"><div className="h-4 bg-white/[0.04] rounded w-32" /></td>
                  <td className="px-4 py-4 hidden md:table-cell"><div className="h-3 bg-white/[0.04] rounded w-20" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-white/[0.04] rounded w-24" /></td>
                  <td className="px-4 py-4 hidden sm:table-cell"><div className="h-4 bg-white/[0.04] rounded w-20" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mb-4">
              <Car size={26} className="text-text-dim" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-text-muted">
              {busca ? 'Nenhum resultado para essa busca.' : 'Nenhum veículo nessa categoria.'}
            </p>
            {!busca && status === 'disponivel' && (
              <Link href="/estoque/novo" className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mt-3">
                <Plus size={14} /> Cadastrar primeiro veículo
              </Link>
            )}
          </div>
        ) : (
          <>
            <table className="w-full min-w-[600px]">
              <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="tbl-th">Veículo</th>
                  <th className="tbl-th hidden md:table-cell">Km / Cor</th>
                  <th className="tbl-th hidden lg:table-cell">Status</th>
                  <th className="tbl-th-right">Preço</th>
                  <th className="tbl-th-right hidden sm:table-cell">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map(v => {
                  const lucro = v.status === 'vendido' ? (v.lucro_real ?? v.lucro_estimado) : v.lucro_estimado;
                  const preco = v.status === 'vendido' && v.preco_venda_final ? v.preco_venda_final : v.preco_venda;
                  return (
                    <Link key={v.id} href={`/estoque/${v.id}`} legacyBehavior>
                      <tr className="hover:bg-white/[0.02] cursor-pointer group transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/[0.04] border border-border flex-shrink-0">
                              {v.foto_capa ? (
                                <img src={v.foto_capa} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Car className="w-4 h-4 text-text-dim absolute inset-0 m-auto" strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                                {v.marca} {v.modelo} <span className="font-normal text-text-muted">{v.ano}</span>
                              </p>
                              <p className="text-xs font-mono text-text-muted mt-0.5">{v.placa}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <p className="text-xs font-mono text-text-muted">{fmtKm(v.km)}</p>
                          <p className="text-xs text-text-dim capitalize mt-0.5">{v.cor}</p>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className={cn('badge', STATUS_BADGE[v.status])}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLOR[v.status])} />
                            {STATUS_LABEL[v.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-sm font-semibold font-mono text-text-primary">{fmt(preco)}</p>
                          {v.status === 'vendido' && v.data_venda && (
                            <p className="text-2xs text-text-dim mt-0.5">{v.data_venda.split('-').reverse().join('/')}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right hidden sm:table-cell">
                          <span className={cn(
                            'text-xs font-semibold font-mono flex items-center gap-0.5 justify-end',
                            lucro >= 0 ? 'text-green-400' : 'text-red-400',
                          )}>
                            <TrendingUp className="w-3 h-3" />
                            {fmt(lucro)}
                          </span>
                        </td>
                      </tr>
                    </Link>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <p className="text-xs text-text-muted font-medium">{filtrados.length} veículo{filtrados.length !== 1 ? 's' : ''}</p>
              {busca && (
                <button onClick={() => setBusca('')} className="text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1 font-medium">
                  Limpar busca <ArrowRight size={11} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
