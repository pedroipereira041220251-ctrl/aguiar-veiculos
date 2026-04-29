'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type Lead } from '@/lib/api';
import { FUNIL_LABEL, cn } from '@/lib/utils';
import { Users, Handshake, RefreshCw, UserCheck, X, ArrowRightLeft } from 'lucide-react';

type Mensagem = { role: string; content: string; timestamp: string; tipo?: string };
type LeadDetalhe = Lead & { conversas: { mensagens: Mensagem[]; canal: string; ultima_mensagem_at: string }[] };

const COLUNAS: Lead['status_funil'][] = [
  'novo', 'contato', 'visita', 'proposta', 'fechado', 'perdido',
];

const COR_COLUNA: Record<string, string> = {
  novo:     'border-blue-400/25',
  contato:  'border-amber-400/25',
  visita:   'border-orange-400/25',
  proposta: 'border-violet-400/25',
  fechado:  'border-green-400/25',
  perdido:  'border-border',
};

const COR_HEADER: Record<string, string> = {
  novo:     'text-blue-400',
  contato:  'text-amber-400',
  visita:   'text-orange-400',
  proposta: 'text-violet-400',
  fechado:  'text-green-400',
  perdido:  'text-text-muted',
};

const COR_BAR: Record<string, string> = {
  novo:     'bg-blue-400',
  contato:  'bg-amber-400',
  visita:   'bg-orange-400',
  proposta: 'bg-violet-400',
  fechado:  'bg-green-400',
  perdido:  'bg-text-dim',
};

const COR_FUNIL: Record<string, string> = {
  novo:     'bg-blue-400/10 text-blue-400 hover:bg-blue-400/20',
  contato:  'bg-amber-400/10 text-amber-400 hover:bg-amber-400/20',
  visita:   'bg-orange-400/10 text-orange-400 hover:bg-orange-400/20',
  proposta: 'bg-violet-400/10 text-violet-400 hover:bg-violet-400/20',
  fechado:  'bg-green-400/10 text-green-400 hover:bg-green-400/20',
  perdido:  'bg-white/5 text-text-muted hover:bg-white/10',
};

const COR_SCORE: Record<number, string> = {
  1: 'bg-white/5 text-text-muted',
  2: 'bg-blue-400/10 text-blue-400',
  3: 'bg-yellow-400/10 text-yellow-400',
  4: 'bg-orange-400/10 text-orange-400',
  5: 'bg-primary/10 text-primary',
};

export default function CRMPage() {
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState(false);
  const [assumindo, setAssumindo]       = useState<string | null>(null);
  const [movendoId, setMovendoId]       = useState<string | null>(null);
  const [drawerLead, setDrawerLead]     = useState<LeadDetalhe | null>(null);
  const [loadingDrawer, setLoadingDrawer] = useState(false);

  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  async function carregar() {
    setLoading(true);
    setErro(false);
    try {
      const data = await api.leads.listar();
      setLeads(data);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function moverLead(leadId: string, novoStatus: Lead['status_funil']) {
    const lead = leadsRef.current.find(l => l.id === leadId);
    if (!lead || lead.status_funil === novoStatus) { setMovendoId(null); return; }
    setMovendoId(null);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: novoStatus } : l));
    try {
      await api.leads.editar(leadId, { status_funil: novoStatus });
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: lead.status_funil } : l));
    }
  }

  async function abrirDrawer(leadId: string) {
    setLoadingDrawer(true);
    try {
      const detalhe = await api.leads.buscar(leadId) as LeadDetalhe;
      setDrawerLead(detalhe);
    } catch { /* ignora */ } finally {
      setLoadingDrawer(false);
    }
  }

  async function assumir(leadId: string) {
    setAssumindo(leadId);
    try {
      await api.leads.assumir(leadId, { resumo: 'Dono assumiu o atendimento pelo painel.' });
      setLeads(prev => prev.map(l =>
        l.id === leadId ? { ...l, atendimento_humano: true } : l
      ));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao assumir atendimento.');
    } finally {
      setAssumindo(null);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-3 animate-pulse">
          <Users size={18} className="text-text-dim" />
        </div>
        <p className="text-sm text-text-muted">Carregando leads...</p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
        <RefreshCw size={20} className="text-text-dim" />
      </div>
      <p className="text-sm text-text-muted mb-3 font-medium">Não foi possível carregar os leads.</p>
      <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">
        Tentar novamente
      </button>
    </div>
  );

  return (
    <div onClick={() => setMovendoId(null)}>

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-start justify-between">
          <div>
            <p className="breadcrumb">
              <Users size={10} />
              Painel / CRM
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Funil de Vendas</h1>
            <p className="text-sm text-text-muted mt-1">
              {leads.length} lead{leads.length !== 1 ? 's' : ''} ativos no pipeline
            </p>
          </div>
          <button
            onClick={carregar}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-bright transition-all"
            title="Atualizar leads"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="p-5 md:p-8">
        {leads.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-text-dim" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-text-muted">Nenhum lead ainda.</p>
            <p className="text-xs text-text-dim mt-1">Os leads chegam via WhatsApp ou Instagram.</p>
          </div>
        ) : (
          <>
            {/* Desktop: kanban horizontal */}
            <div className="hidden md:flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
              {COLUNAS.map(col => (
                <Coluna
                  key={col}
                  id={col}
                  leads={leads.filter(l => l.status_funil === col)}
                  movendoId={movendoId}
                  onAssumir={assumir}
                  assumindo={assumindo}
                  onAbrir={abrirDrawer}
                  onMover={moverLead}
                  onToggleMover={(id) => setMovendoId(prev => prev === id ? null : id)}
                />
              ))}
            </div>

            {/* Mobile: colunas empilhadas */}
            <div className="md:hidden space-y-4">
              {COLUNAS.map(col => {
                const colLeads = leads.filter(l => l.status_funil === col);
                if (colLeads.length === 0) return null;
                return (
                  <Coluna
                    key={col}
                    id={col}
                    leads={colLeads}
                    movendoId={movendoId}
                    onAssumir={assumir}
                    assumindo={assumindo}
                    onAbrir={abrirDrawer}
                    onMover={moverLead}
                    onToggleMover={(id) => setMovendoId(prev => prev === id ? null : id)}
                    mobile
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Drawer de histórico ── */}
      {(drawerLead || loadingDrawer) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerLead(null)} />
          <div className="relative w-full max-w-sm bg-sidebar border-l border-border flex flex-col h-full shadow-2xl animate-slide-in">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-bold text-text-primary text-sm">{drawerLead?.nome || drawerLead?.contato}</p>
                <p className="text-xs text-text-muted mt-0.5 capitalize font-medium">
                  {drawerLead?.canal} · Score {drawerLead?.score_qualificacao ?? '—'}
                </p>
              </div>
              <button onClick={() => setDrawerLead(null)} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
                <X size={16} />
              </button>
            </div>

            {loadingDrawer ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-text-muted">Carregando histórico...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {drawerLead?.conversas?.flatMap(c => c.mensagens).length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">Nenhuma mensagem registrada.</p>
                ) : (
                  drawerLead?.conversas?.flatMap(c => c.mensagens).map((msg, i) => (
                    <div
                      key={i}
                      className={cn('max-w-[85%] px-3 py-2 rounded-xl text-sm', msg.role === 'user'
                        ? 'bg-white/5 border border-border text-text-primary self-start'
                        : 'bg-primary/10 border border-primary/20 text-primary ml-auto'
                      )}
                    >
                      <p className="leading-snug">{String(msg.content)}</p>
                      <p className="text-[10px] text-text-muted mt-1">{new Date(msg.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Coluna({ id, leads, movendoId, onAssumir, assumindo, onAbrir, onMover, onToggleMover, mobile }: {
  id: Lead['status_funil'];
  leads: Lead[];
  movendoId: string | null;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  onAbrir: (id: string) => void;
  onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void;
  mobile?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-card',
        mobile ? 'min-h-[80px]' : 'w-52 flex-shrink-0 min-h-[400px]',
        COR_COLUNA[id],
      )}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', COR_BAR[id])} />
          <span className={cn('text-xs font-bold uppercase tracking-wide', COR_HEADER[id])}>
            {FUNIL_LABEL[id]}
          </span>
        </div>
        <span className="text-xs font-semibold text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>
      <div className="p-2 space-y-2">
        {leads.map(lead => (
          <LeadCardContent
            key={lead.id}
            lead={lead}
            movendoAberto={movendoId === lead.id}
            onAssumir={onAssumir}
            assumindo={assumindo}
            onAbrir={onAbrir}
            onMover={onMover}
            onToggleMover={onToggleMover}
          />
        ))}
      </div>
    </div>
  );
}

function LeadCardContent({ lead, onAssumir, assumindo, onAbrir, onMover, onToggleMover, movendoAberto }: {
  lead: Lead;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  onAbrir: (id: string) => void;
  onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void;
  movendoAberto: boolean;
}) {
  return (
    <div
      onClick={() => onAbrir(lead.id)}
      className="bg-card-hover border border-border rounded-xl p-3 select-none cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight truncate">
            {lead.nome || lead.contato}
          </p>
          {lead.nome && (
            <p className="text-xs text-text-muted leading-tight truncate">{lead.contato}</p>
          )}
          <p className="text-xs text-text-muted mt-0.5 capitalize">{lead.canal}</p>
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleMover(lead.id); }}
          title="Mover para coluna"
          className={cn(
            'flex-shrink-0 p-1 rounded-lg transition-colors',
            movendoAberto
              ? 'bg-primary/15 text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-white/5',
          )}
        >
          <ArrowRightLeft size={12} />
        </button>
      </div>

      {movendoAberto && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="mt-2 flex flex-wrap gap-1"
        >
          {COLUNAS.filter(c => c !== lead.status_funil).map(col => (
            <button
              key={col}
              onClick={e => { e.stopPropagation(); onMover(lead.id, col); }}
              className={cn('text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors', COR_FUNIL[col])}
            >
              {FUNIL_LABEL[col]}
            </button>
          ))}
        </div>
      )}

      {lead.veiculo && (
        <p className="text-xs text-text-muted mt-1.5 truncate">
          {lead.veiculo.modelo} {lead.veiculo.ano}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {lead.score_qualificacao != null && (
          <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full', COR_SCORE[lead.score_qualificacao])}>
            Score {lead.score_qualificacao}
          </span>
        )}
        {lead.atendimento_humano && (
          <span className="flex items-center gap-1 text-xs bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded-full font-semibold">
            <UserCheck size={10} />
            Humano
          </span>
        )}
      </div>

      {!lead.atendimento_humano && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onAssumir(lead.id); }}
          disabled={assumindo === lead.id}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50 font-semibold"
        >
          <Handshake size={12} />
          {assumindo === lead.id ? 'Assumindo...' : 'Assumir atendimento'}
        </button>
      )}
    </div>
  );
}
