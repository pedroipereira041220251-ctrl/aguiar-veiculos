'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  pointerWithin, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { api, type Lead } from '@/lib/api';
import { FUNIL_LABEL, cn } from '@/lib/utils';
import { Users, Handshake, RefreshCw, UserCheck } from 'lucide-react';

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

const COR_SCORE: Record<number, string> = {
  1: 'bg-white/5 text-text-muted',
  2: 'bg-blue-400/10 text-blue-400',
  3: 'bg-yellow-400/10 text-yellow-400',
  4: 'bg-orange-400/10 text-orange-400',
  5: 'bg-primary/10 text-primary',
};

export default function CRMPage() {
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState(false);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState<string | null>(null);

  // Ref sempre atualizado — evita stale closure em handleDragEnd
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
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const leadId  = active.id as string;
    const current = leadsRef.current; // sempre o valor mais recente

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
    <div className="p-4 md:p-6">
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
                onAssumir={assumir}
                assumindo={assumindo}
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
                  onAssumir={assumir}
                  assumindo={assumindo}
                  mobile
                />
              );
            })}
          </div>

          {/* DragOverlay: renderiza o card flutuante SEM useDraggable */}
          <DragOverlay dropAnimation={null}>
            {activeLead && (
              <LeadCardContent
                lead={activeLead}
                onAssumir={() => {}}
                assumindo={null}
                floating
              />
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Coluna({ id, leads, activeId, onAssumir, assumindo, mobile }: {
  id: Lead['status_funil'];
  leads: Lead[];
  activeId: string | null;
  onAssumir: (id: string) => void;
  assumindo: string | null;
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
            onAssumir={onAssumir}
            assumindo={assumindo}
          />
        ))}
      </div>
    </div>
  );
}

// ── LeadCard: wrapper com useDraggable ─────────────────────
function LeadCard({ lead, isDraggingThis, onAssumir, assumindo }: {
  lead: Lead;
  isDraggingThis: boolean;
  onAssumir: (id: string) => void;
  assumindo: string | null;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDraggingThis && 'invisible')}
    >
      <LeadCardContent
        lead={lead}
        onAssumir={onAssumir}
        assumindo={assumindo}
      />
    </div>
  );
}

// ── LeadCardContent: visual puro, sem hooks de drag ────────
function LeadCardContent({ lead, onAssumir, assumindo, floating }: {
  lead: Lead;
  onAssumir: (id: string) => void;
  assumindo: string | null;
  floating?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card-hover border border-border rounded-xl p-3 select-none',
        floating
          ? 'shadow-2xl border-primary/30 cursor-grabbing rotate-1 opacity-95'
          : 'cursor-grab',
      )}
    >
      <p className="text-sm font-semibold text-text-primary leading-tight truncate">
        {lead.nome || lead.contato}
      </p>
      <p className="text-xs text-text-muted mt-0.5 capitalize">{lead.canal}</p>

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
