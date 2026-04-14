'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  pointerWithin, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { api, type Lead } from '@/lib/api';
import { FUNIL_LABEL, cn } from '@/lib/utils';
import { Users, Handshake, RefreshCw, UserCheck, X, ArrowRightLeft } from 'lucide-react';

type Mensagem = { role: string; content: string; timestamp: string; tipo?: string };
type LeadDetalhe = Lead & { conversas: { mensagens: Mensagem[]; canal: string; ultima_mensagem_at: string }[] };

const COLUNAS: Lead['status_funil'][] = [
  'novo', 'contato', 'visita', 'proposta', 'fechado', 'perdido',
];

const COR_COLUNA: Record<string, string> = {
  novo:     'border-blue-400/20',
  contato:  'border-amber-400/20',
  visita:   'border-orange-400/20',
  proposta: 'border-violet-400/20',
  fechado:  'border-green-400/20',
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
  const [activeId, setActiveId]         = useState<string | null>(null);
  const [assumindo, setAssumindo]       = useState<string | null>(null);
  const [movendoId, setMovendoId]       = useState<string | null>(null);
  const [drawerLead, setDrawerLead]     = useState<LeadDetalhe | null>(null);
  const [loadingDrawer, setLoadingDrawer] = useState(false);

  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
    setMovendoId(null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const leadId  = active.id as string;
    const current = leadsRef.current;

    let novoStatus = over.id as Lead['status_funil'];
    if (!COLUNAS.includes(novoStatus)) {
      const leadAlvo = current.find(l => l.id === over.id);
      if (!leadAlvo) return;
      novoStatus = leadAlvo.status_funil;
    }

    const lead = current.find(l => l.id === leadId);
    if (!lead || lead.status_funil === novoStatus) return;

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: novoStatus } : l));
    try {
      await api.leads.editar(leadId, { status_funil: novoStatus });
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: lead.status_funil } : l));
    }
  }

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

  const activeLead = leads.find(l => l.id === activeId);

  if (loading) return (
    <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-text-muted">Carregando leads...</p>
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <RefreshCw size={32} className="mx-auto text-border mb-3" />
      <p className="text-sm text-text-muted mb-3">Não foi possível carregar os leads.</p>
      <button onClick={carregar} className="text-sm text-primary font-medium hover:underline">
        Tentar novamente
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6" onClick={() => setMovendoId(null)}>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-text-primary">CRM</h1>
        <span className="text-sm text-text-muted">{leads.length} lead{leads.length !== 1 ? 's' : ''}</span>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-16">
          <Users size={48} className="mx-auto text-border mb-3" />
          <p className="text-sm text-text-muted">Nenhum lead ainda.</p>
          <p className="text-xs text-text-muted/60 mt-1">Os leads chegam via WhatsApp ou Instagram.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Desktop: kanban horizontal */}
          <div className="hidden md:flex gap-3 overflow-x-auto pb-4">
            {COLUNAS.map(col => (
              <Coluna
                key={col}
                id={col}
                leads={leads.filter(l => l.status_funil === col)}
                activeId={activeId}
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
                  activeId={activeId}
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

          <DragOverlay dropAnimation={null}>
            {activeLead && (
              <LeadCardContent
                lead={activeLead}
                onAssumir={() => {}}
                assumindo={null}
                onAbrir={() => {}}
                onMover={() => {}}
                onToggleMover={() => {}}
                movendoAberto={false}
                floating
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Drawer de histórico ── */}
      {(drawerLead || loadingDrawer) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerLead(null)} />
          <div className="relative w-full max-w-sm bg-background border-l border-border flex flex-col h-full shadow-2xl animate-fade-in">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-text-primary text-sm">{drawerLead?.nome || drawerLead?.contato}</p>
                <p className="text-xs text-text-muted capitalize">{drawerLead?.canal} · Score {drawerLead?.score_qualificacao ?? '—'}</p>
              </div>
              <button onClick={() => setDrawerLead(null)} className="p-1 text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            {loadingDrawer ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-text-muted">Carregando...</p>
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

function Coluna({ id, leads, activeId, movendoId, onAssumir, assumindo, onAbrir, onMover, onToggleMover, mobile }: {
  id: Lead['status_funil'];
  leads: Lead[];
  activeId: string | null;
  movendoId: string | null;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  onAbrir: (id: string) => void;
  onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void;
  mobile?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border-2 bg-card transition-colors',
        mobile ? 'min-h-[80px]' : 'w-52 flex-shrink-0 min-h-[400px]',
        COR_COLUNA[id],
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className={cn('text-xs font-bold uppercase tracking-wide', COR_HEADER[id])}>
          {FUNIL_LABEL[id]}
        </span>
        <span className="text-xs font-semibold text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>
      <div className="p-2 space-y-2">
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isDraggingThis={activeId === lead.id}
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

function LeadCard({ lead, isDraggingThis, movendoAberto, onAssumir, assumindo, onAbrir, onMover, onToggleMover }: {
  lead: Lead;
  isDraggingThis: boolean;
  movendoAberto: boolean;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  onAbrir: (id: string) => void;
  onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        const s = pointerStart.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) {
          e.stopPropagation();
          return;
        }
        onAbrir(lead.id);
      }}
      className={cn(isDraggingThis && 'invisible')}
    >
      <LeadCardContent
        lead={lead}
        onAssumir={onAssumir}
        assumindo={assumindo}
        onAbrir={() => {}}
        onMover={onMover}
        onToggleMover={onToggleMover}
        movendoAberto={movendoAberto}
      />
    </div>
  );
}

function LeadCardContent({ lead, onAssumir, assumindo, onAbrir, onMover, onToggleMover, movendoAberto, floating }: {
  lead: Lead;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  onAbrir: (id: string) => void;
  onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void;
  movendoAberto: boolean;
  floating?: boolean;
}) {
  return (
    <div
      onClick={!floating ? () => onAbrir(lead.id) : undefined}
      className={cn(
        'bg-card-hover border border-border rounded-xl p-3 select-none',
        floating
          ? 'shadow-2xl border-primary/30 cursor-grabbing rotate-1 opacity-95'
          : 'cursor-grab hover:border-primary/40 transition-colors',
      )}
    >
      {/* Header: nome + botão mover */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight truncate">
            {lead.nome || lead.contato}
          </p>
          <p className="text-xs text-text-muted mt-0.5 capitalize">{lead.canal}</p>
        </div>
        {!floating && (
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
        )}
      </div>

      {/* Seletor de colunas */}
      {movendoAberto && !floating && (
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

      {!lead.atendimento_humano && !floating && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onAssumir(lead.id); }}
          disabled={assumindo === lead.id}
          className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 text-xs text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50 font-medium"
        >
          <Handshake size={12} />
          {assumindo === lead.id ? 'Assumindo...' : 'Assumir atendimento'}
        </button>
      )}
    </div>
  );
}
