'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, type Veiculo } from '@/lib/api';
import { fmt, fmtKm, STATUS_LABEL, cn } from '@/lib/utils';
import { Plus, Search, Car, RefreshCw, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';

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
  { value: 'reservado',  label: 'Reservados' },
  { value: 'vendido',    label: 'Vendidos' },
  { value: 'inativo',   label: 'Inativos' },
];

const STATUS_DOT: Record<string, string> = {
  disponivel: 'bg-green-400',
  reservado:  'bg-yellow-400',
  vendido:    'bg-blue-400',
  inativo:    'bg-text-muted',
};

function Skeleton() {
  return (
    <div className="animate-pulse bg-card border border-border rounded-xl overflow-hidden">
      <div className="aspect-video bg-white/5" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-white/5 rounded w-2/3" />
        <div className="h-3 bg-white/5 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function EstoquePage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(false);
  const [busca, setBusca]       = useState('');
  const [status, setStatus]     = useState('disponivel');
  const [mes, setMes]           = useState<string>(() => new Date().toISOString().slice(0, 7));

  const [todos, setTodos] = useState<Veiculo[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(false);
    try {
      const [filtrados, todosList] = await Promise.all([
        api.veiculos.listar({ status }),
        api.veiculos.listar({}),
      ]);
      setVeiculos(filtrados);
      setTodos(todosList);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">Estoque</h1>
        <Link href="/estoque/novo" className="btn-primary">
          <Plus size={16} /> Novo veículo
        </Link>
      </div>

      {/* Busca */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar placa, marca ou modelo..."
          className="input pl-10"
        />
      </div>

      {/* Filtros */}
      <div className={cn('flex gap-2 overflow-x-auto pb-1 scrollbar-hide', status === 'vendido' ? 'mb-3' : 'mb-5')}>
        {FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              'flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all border tracking-wide',
              status === f.value
                ? 'bg-primary text-white border-primary shadow-glow-red'
                : 'bg-transparent text-text-muted border-border hover:border-border-bright hover:text-text-primary',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Seletor de mês — apenas para vendidos */}
      {status === 'vendido' && (
        <div className="flex items-center justify-between mb-5 bg-card border border-border rounded-xl px-4 py-2.5">
          <button
            onClick={() => setMes(mesAnterior(mes))}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-text-primary capitalize">
            {mesLabel(mes)}
          </span>
          <button
            onClick={() => setMes(mesSeguinte(mes))}
            disabled={mes >= new Date().toISOString().slice(0, 7)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="text-center py-12">
          <RefreshCw size={32} className="mx-auto text-border mb-3" />
          <p className="text-sm text-text-muted mb-3">Não foi possível carregar os veículos.</p>
          <button onClick={carregar} className="text-sm text-primary font-medium hover:underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Skeleton */}
      {loading && !erro && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} />)}
        </div>
      )}

      {/* Vazio */}
      {!loading && !erro && filtrados.length === 0 && (
        <div className="text-center py-16">
          <Car size={48} className="mx-auto text-border mb-3" />
          <p className="text-sm text-text-muted mb-4">
            {busca ? 'Nenhum resultado para essa busca.' : 'Nenhum veículo nessa categoria.'}
          </p>
          {!busca && status === 'disponivel' && (
            <Link href="/estoque/novo" className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
              <Plus size={15} /> Cadastrar primeiro veículo
            </Link>
          )}
        </div>
      )}

      {/* Lista */}
      {!loading && !erro && filtrados.length > 0 && (
        <>
          <p className="text-xs text-text-muted mb-3">
            {filtrados.length} veículo{filtrados.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(v => <VeiculoCard key={v.id} v={v} />)}
          </div>
        </>
      )}
    </div>
  );
}

function VeiculoCard({ v }: { v: Veiculo }) {
  return (
    <Link
      href={`/estoque/${v.id}`}
      className="bg-card border border-border rounded-xl overflow-hidden hover:bg-card-hover hover:border-border-bright transition-all block group shadow-card"
    >
      <div className="aspect-video bg-white/5 relative overflow-hidden">
        {v.foto_capa ? (
          <img
            src={v.foto_capa}
            alt={`${v.marca} ${v.modelo}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car size={40} className="text-border" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full border border-border">
          <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[v.status] ?? 'bg-text-muted')} />
          <span className="text-xs font-medium text-text-primary">{STATUS_LABEL[v.status]}</span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-text-primary text-sm truncate group-hover:text-primary transition-colors">
              {v.marca} {v.modelo}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{v.ano} · {fmtKm(v.km)} · {v.cor}</p>
          </div>
          <span className="text-xs font-mono text-text-muted flex-shrink-0 mt-0.5 bg-white/5 px-1.5 py-0.5 rounded">
            {v.placa}
          </span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
          <div>
            <p className="text-xs text-text-muted">{v.status === 'vendido' ? 'Vendido por' : 'Preço de venda'}</p>
            <p className="text-sm font-bold text-text-primary">
              {fmt(v.status === 'vendido' && v.preco_venda_final ? v.preco_venda_final : v.preco_venda)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-muted">{v.status === 'vendido' ? 'Lucro real' : 'Lucro est.'}</p>
            {(() => {
              const lucro = v.status === 'vendido' ? (v.lucro_real ?? v.lucro_estimado) : v.lucro_estimado;
              return (
                <p className={cn('text-sm font-semibold flex items-center gap-0.5 justify-end', lucro >= 0 ? 'text-green-400' : 'text-red-400')}>
                  <TrendingUp size={12} />
                  {fmt(lucro)}
                </p>
              );
            })()}
          </div>
        </div>
      </div>
    </Link>
  );
}
