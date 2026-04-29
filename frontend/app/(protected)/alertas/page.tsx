'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Alerta } from '@/lib/api';
import { Bell, AlertTriangle, FileWarning, Car, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIPO_CONFIG: Record<Alerta['tipo'], { label: string; icon: typeof Bell; iconClass: string; bgClass: string; bar: string }> = {
  ipva_vencendo:  { label: 'IPVA Vencendo',     icon: AlertTriangle, iconClass: 'text-red-400',    bgClass: 'bg-red-400/10',    bar: 'bg-red-400' },
  docs_pendentes: { label: 'Documento Pendente', icon: FileWarning,  iconClass: 'text-yellow-400', bgClass: 'bg-yellow-400/10', bar: 'bg-yellow-400' },
  veiculo_parado: { label: 'Veículo Parado',     icon: Car,          iconClass: 'text-orange-400', bgClass: 'bg-orange-400/10', bar: 'bg-orange-400' },
};

function AlertCard({ a }: { a: Alerta }) {
  const cfg  = TIPO_CONFIG[a.tipo] ?? TIPO_CONFIG.ipva_vencendo;
  const Icon = cfg.icon;
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:bg-card-hover hover:border-border-bright transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bgClass)}>
        <Icon className={cn('w-5 h-5', cfg.iconClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn('badge mb-2', cfg.bgClass, cfg.iconClass)}>{cfg.label}</span>
        <p className="text-text-primary text-sm font-medium leading-snug">{a.descricao}</p>
        {a.placa && <p className="text-xs font-mono text-primary mt-1.5">{a.placa}</p>}
      </div>
      {a.veiculo_id && (
        <Link
          href={`/estoque/${a.veiculo_id}`}
          className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-all"
          title="Ver veículo"
        >
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(false);

  async function carregar() {
    setLoading(true); setErro(false);
    try {
      setAlertas(await api.alertas.listar());
    } catch { setErro(true); } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const criticos = alertas.filter(a => a.urgencia === 'alta');
  const avisos   = alertas.filter(a => a.urgencia !== 'alta');

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-start justify-between">
          <div>
            <p className="breadcrumb">
              <Bell size={10} />
              Painel / Alertas
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Central de Alertas</h1>
            <p className="text-sm text-text-muted mt-1">Monitore IPVA, documentação pendente e veículos parados.</p>
          </div>
          <button
            onClick={carregar}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-bright transition-all"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Stat bar ── */}
      <div className="border-b border-border">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-5 md:px-8 py-4">
            <p className="stat-label mb-1">Total</p>
            <p className="stat-number text-2xl">{loading ? '—' : alertas.length}</p>
          </div>
          <div className="px-5 md:px-8 py-4">
            <p className="stat-label mb-1">Críticos</p>
            <p className={cn('stat-number text-2xl', criticos.length > 0 && 'text-red-400')}>{loading ? '—' : criticos.length}</p>
          </div>
          <div className="px-5 md:px-8 py-4">
            <p className="stat-label mb-1">Avisos</p>
            <p className={cn('stat-number text-2xl', avisos.length > 0 && 'text-yellow-400')}>{loading ? '—' : avisos.length}</p>
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="p-5 md:p-8 max-w-[1200px] mx-auto">

        {/* Erro */}
        {!loading && erro && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
              <RefreshCw size={20} className="text-text-dim" />
            </div>
            <p className="text-text-muted text-sm font-medium mb-3">Não foi possível carregar os alertas.</p>
            <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-white/[0.04] rounded-xl animate-pulse border border-border" />
            ))}
          </div>
        )}

        {/* Vazio */}
        {!loading && !erro && alertas.length === 0 && (
          <div className="recipe-card py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-7 h-7 text-accent" strokeWidth={1.8} />
            </div>
            <p className="text-text-primary font-bold text-lg">Tudo em dia!</p>
            <p className="text-text-muted text-sm mt-1">Nenhum alerta ativo no momento.</p>
          </div>
        )}

        {/* Dois colunas: Críticos | Avisos */}
        {!loading && !erro && alertas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Críticos */}
            <div>
              <div className="chapter-heading mb-4">
                <span className="chapter-bar bg-red-400" />
                <span className="chapter-title">Críticos</span>
                {criticos.length > 0 && (
                  <span className="badge bg-red-400/10 text-red-400 ml-1">{criticos.length}</span>
                )}
              </div>
              {criticos.length === 0 ? (
                <div className="recipe-card py-10 text-center">
                  <p className="text-xs text-text-muted font-medium">Nenhum alerta crítico</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {criticos.map((a, i) => <AlertCard key={i} a={a} />)}
                </div>
              )}
            </div>

            {/* Avisos */}
            <div>
              <div className="chapter-heading mb-4">
                <span className="chapter-bar bg-yellow-400" />
                <span className="chapter-title">Avisos</span>
                {avisos.length > 0 && (
                  <span className="badge bg-yellow-400/10 text-yellow-400 ml-1">{avisos.length}</span>
                )}
              </div>
              {avisos.length === 0 ? (
                <div className="recipe-card py-10 text-center">
                  <p className="text-xs text-text-muted font-medium">Nenhum aviso</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {avisos.map((a, i) => <AlertCard key={i} a={a} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
