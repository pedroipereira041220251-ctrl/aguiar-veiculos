'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Alerta } from '@/lib/api';
import { Bell, AlertTriangle, FileWarning, Car, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIPO_CONFIG: Record<Alerta['tipo'], { label: string; icon: typeof Bell; iconClass: string; bgClass: string }> = {
  ipva_vencendo:  { label: 'IPVA Vencendo',      icon: AlertTriangle, iconClass: 'text-red-400',    bgClass: 'bg-red-400/10' },
  docs_pendentes: { label: 'Documento Pendente',  icon: FileWarning,  iconClass: 'text-yellow-400', bgClass: 'bg-yellow-400/10' },
  veiculo_parado: { label: 'Veículo Parado',      icon: Car,          iconClass: 'text-orange-400', bgClass: 'bg-orange-400/10' },
};

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(false);

  async function carregar() {
    setLoading(true);
    setErro(false);
    try {
      const data = await api.alertas.listar();
      setAlertas(data);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const criticos = alertas.filter(a => a.urgencia === 'alta');
  const avisos   = alertas.filter(a => a.urgencia === 'media');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">Alertas</h1>
          <p className="text-text-muted text-xs mt-0.5 font-medium">Pendências e avisos do sistema</p>
        </div>
        {erro && (
          <button onClick={carregar} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary transition-colors">
            <RefreshCw size={15} /> Tentar novamente
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl border border-border" />
          ))}
        </div>
      )}

      {/* Erro */}
      {!loading && erro && (
        <div className="text-center py-12">
          <RefreshCw size={32} className="mx-auto text-border mb-3" />
          <p className="text-text-muted text-sm">Não foi possível carregar os alertas.</p>
        </div>
      )}

      {/* Vazio */}
      {!loading && !erro && alertas.length === 0 && (
        <div className="bg-card border border-border rounded-xl py-14 text-center">
          <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-text-primary font-medium">Tudo em dia!</p>
          <p className="text-text-muted text-sm mt-1">Nenhum alerta ativo no momento.</p>
        </div>
      )}

      {/* Resumo + lista */}
      {!loading && !erro && alertas.length > 0 && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-red-400/20 rounded-xl p-4 text-center">
              <p className="stat-number text-red-400">{criticos.length}</p>
              <p className="stat-label mt-1">Críticos</p>
            </div>
            <div className="bg-card border border-yellow-400/20 rounded-xl p-4 text-center">
              <p className="stat-number text-yellow-400">{avisos.length}</p>
              <p className="stat-label mt-1">Avisos</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="stat-number">{alertas.length}</p>
              <p className="stat-label mt-1">Total</p>
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-2">
            {alertas.map((a, i) => {
              const cfg  = TIPO_CONFIG[a.tipo] ?? TIPO_CONFIG.ipva_vencendo;
              const Icon = cfg.icon;
              return (
                <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-start gap-4 hover:bg-card-hover transition-colors">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', cfg.bgClass)}>
                    <Icon className={cn('w-5 h-5', cfg.iconClass)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', cfg.bgClass, cfg.iconClass)}>
                        {cfg.label}
                      </span>
                      {a.urgencia === 'alta' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-400/10 text-red-400">
                          Crítico
                        </span>
                      )}
                    </div>
                    <p className="text-text-primary text-sm mt-1.5">{a.descricao}</p>
                    {a.placa && (
                      <p className="text-text-muted text-xs mt-0.5 font-mono">{a.placa}</p>
                    )}
                  </div>

                  {a.veiculo_id && (
                    <Link
                      href={`/estoque/${a.veiculo_id}`}
                      className="text-primary text-xs hover:underline flex-shrink-0 mt-1"
                    >
                      Ver veículo →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
