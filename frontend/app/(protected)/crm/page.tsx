'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type Lead } from '@/lib/api';
import { FUNIL_LABEL, cn } from '@/lib/utils';
import { Users, Handshake, RefreshCw, UserCheck, X, ArrowRightLeft, Search, Clock, Save, Car } from 'lucide-react';

type Mensagem = { role: string; content: unknown; timestamp: string; tipo?: string };
type LeadDetalhe = Lead & {
  conversas: { mensagens: Mensagem[]; canal: string; ultima_mensagem_at: string }[];
};

const COLUNAS: Lead['status_funil'][] = ['novo', 'contato', 'visita', 'proposta', 'fechado', 'perdido'];

const COR_COLUNA: Record<string, string> = {
  novo: 'border-blue-400/25', contato: 'border-amber-400/25',
  visita: 'border-orange-400/25', proposta: 'border-violet-400/25',
  fechado: 'border-green-400/25', perdido: 'border-border',
};
const COR_HEADER: Record<string, string> = {
  novo: 'text-blue-400', contato: 'text-amber-400',
  visita: 'text-orange-400', proposta: 'text-violet-400',
  fechado: 'text-green-400', perdido: 'text-text-muted',
};
const COR_BAR: Record<string, string> = {
  novo: 'bg-blue-400', contato: 'bg-amber-400',
  visita: 'bg-orange-400', proposta: 'bg-violet-400',
  fechado: 'bg-green-400', perdido: 'bg-text-dim',
};
const COR_FUNIL: Record<string, string> = {
  novo: 'bg-blue-400/10 text-blue-400 hover:bg-blue-400/20',
  contato: 'bg-amber-400/10 text-amber-400 hover:bg-amber-400/20',
  visita: 'bg-orange-400/10 text-orange-400 hover:bg-orange-400/20',
  proposta: 'bg-violet-400/10 text-violet-400 hover:bg-violet-400/20',
  fechado: 'bg-green-400/10 text-green-400 hover:bg-green-400/20',
  perdido: 'bg-white/5 text-text-muted hover:bg-white/10',
};
const COR_SCORE: Record<number, string> = {
  1: 'bg-white/5 text-text-muted', 2: 'bg-blue-400/10 text-blue-400',
  3: 'bg-yellow-400/10 text-yellow-400', 4: 'bg-orange-400/10 text-orange-400',
  5: 'bg-primary/10 text-primary',
};
const CAPACIDADE_LABEL: Record<string, string> = {
  carta_aprovada: 'Carta aprovada',
  comprovante_renda: 'Comprovante de renda',
  a_vista_confirmado: 'À vista confirmado',
  sem_informacao: 'Sem informação',
};

function diasSemInteracao(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function tempoLabel(iso: string) {
  const d = diasSemInteracao(iso);
  if (d === 0) return 'hoje';
  if (d === 1) return '1 dia';
  return `${d} dias`;
}
function tempoCor(iso: string) {
  const d = diasSemInteracao(iso);
  if (d < 1) return 'text-green-400';
  if (d < 3) return 'text-amber-400';
  if (d < 7) return 'text-orange-400';
  return 'text-red-400';
}
function msgTexto(content: unknown): string | null {
  if (typeof content === 'string') return content || null;
  if (Array.isArray(content)) {
    const t = content
      .filter((c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text')
      .map(c => c.text).join('');
    return t || null;
  }
  return null;
}
function fmtPrice(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
}

export default function CRMPage() {
  const [leads, setLeads]                         = useState<Lead[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [erro, setErro]                           = useState(false);
  const [busca, setBusca]                         = useState('');
  const [filtroCanal, setFiltroCanal]             = useState<'todos' | 'whatsapp' | 'instagram'>('todos');
  const [filtroAtend, setFiltroAtend]             = useState<'todos' | 'ana' | 'humano'>('todos');
  const [ocultarAntigos, setOcultarAntigos]       = useState(false);

  const [assumindo, setAssumindo]                 = useState<string | null>(null);
  const [movendoId, setMovendoId]                 = useState<string | null>(null);
  const [drawerLead, setDrawerLead]               = useState<LeadDetalhe | null>(null);
  const [loadingDrawer, setLoadingDrawer]         = useState(false);
  const [anotacoes, setAnotacoes]                 = useState('');
  const [salvandoAnotacoes, setSalvandoAnotacoes] = useState(false);

  const leadsRef      = useRef<Lead[]>([]);
  const msgEndRef     = useRef<HTMLDivElement>(null);
  const scrollRef     = useRef<HTMLDivElement>(null);

  useEffect(() => { leadsRef.current = leads; }, [leads]);

  async function carregar() {
    setLoading(true); setErro(false);
    try { setLeads(await api.leads.listar()); }
    catch { setErro(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!drawerLead) return;
    const t = setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
    return () => clearTimeout(t);
  }, [drawerLead]);

  async function moverLead(leadId: string, novoStatus: Lead['status_funil']) {
    const lead = leadsRef.current.find(l => l.id === leadId);
    if (!lead || lead.status_funil === novoStatus) { setMovendoId(null); return; }
    setMovendoId(null);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: novoStatus } : l));
    try { await api.leads.editar(leadId, { status_funil: novoStatus }); }
    catch { setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status_funil: lead.status_funil } : l)); }
  }

  async function abrirDrawer(leadId: string) {
    setLoadingDrawer(true);
    try {
      const d = await api.leads.buscar(leadId) as LeadDetalhe;
      setDrawerLead(d);
      setAnotacoes(d.anotacoes ?? '');
    } catch { } finally { setLoadingDrawer(false); }
  }

  async function assumir(leadId: string) {
    setAssumindo(leadId);
    try {
      await api.leads.assumir(leadId, { resumo: 'Dono assumiu o atendimento pelo painel.' });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, atendimento_humano: true } : l));
      if (drawerLead?.id === leadId)
        setDrawerLead(prev => prev ? { ...prev, atendimento_humano: true } : prev);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao assumir atendimento.');
    } finally { setAssumindo(null); }
  }

  async function salvarAnotacoes() {
    if (!drawerLead) return;
    setSalvandoAnotacoes(true);
    try {
      await api.leads.editar(drawerLead.id, { anotacoes });
      setLeads(prev => prev.map(l => l.id === drawerLead.id ? { ...l, anotacoes } : l));
      setDrawerLead(prev => prev ? { ...prev, anotacoes } : prev);
    } catch { } finally { setSalvandoAnotacoes(false); }
  }

  const leadsFiltrados = leads.filter(l => {
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!l.nome?.toLowerCase().includes(q) && !l.contato.toLowerCase().includes(q)) return false;
    }
    if (filtroCanal !== 'todos' && l.canal !== filtroCanal) return false;
    if (filtroAtend === 'ana'    && l.atendimento_humano)  return false;
    if (filtroAtend === 'humano' && !l.atendimento_humano) return false;
    if (ocultarAntigos && diasSemInteracao(l.ultima_interacao) > 30) return false;
    return true;
  });

  const countAtivos = leads.filter(l => l.status_funil !== 'fechado' && l.status_funil !== 'perdido').length;

  const allMsgs = drawerLead?.conversas?.flatMap(c => c.mensagens) ?? [];
  const visibleMsgs = allMsgs.filter(m =>
    (m.role === 'user' || m.role === 'assistant') && msgTexto(m.content) !== null
  );

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
      <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
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
              {countAtivos} ativo{countAtivos !== 1 ? 's' : ''} · {leads.length} total
            </p>
          </div>
          <button
            onClick={carregar}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-bright transition-all"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-border px-5 md:px-8 py-3 bg-sidebar/30 flex items-center gap-2 flex-wrap">
        <div className="relative w-full sm:w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Nome ou número..."
            className="input pl-8 !py-1.5 !text-xs"
          />
        </div>

        <div className="flex gap-1">
          {(['todos', 'whatsapp', 'instagram'] as const).map(c => (
            <button key={c} onClick={() => setFiltroCanal(c)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors capitalize',
                filtroCanal === c ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-text-muted hover:text-text-primary'
              )}>
              {c === 'todos' ? 'Canal' : c}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {([['todos','Atendimento'],['ana','Ana'],['humano','Humano']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltroAtend(v)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                filtroAtend === v ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-text-muted hover:text-text-primary'
              )}>
              {l}
            </button>
          ))}
        </div>

        <button
          onClick={() => setOcultarAntigos(v => !v)}
          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
            ocultarAntigos ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-text-muted hover:text-text-primary'
          )}>
          <Clock size={11} />
          &gt; 30 dias
        </button>

        {leadsFiltrados.length < leads.length && (
          <span className="text-xs text-text-muted ml-auto font-medium">{leadsFiltrados.length}/{leads.length}</span>
        )}
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
            <div className="hidden md:flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
              {COLUNAS.map(col => (
                <Coluna key={col} id={col}
                  leads={leadsFiltrados.filter(l => l.status_funil === col)}
                  movendoId={movendoId} onAssumir={assumir} assumindo={assumindo}
                  onAbrir={abrirDrawer} onMover={moverLead}
                  onToggleMover={id => setMovendoId(prev => prev === id ? null : id)}
                />
              ))}
            </div>
            <div className="md:hidden space-y-4">
              {COLUNAS.map(col => {
                const colLeads = leadsFiltrados.filter(l => l.status_funil === col);
                if (colLeads.length === 0) return null;
                return (
                  <Coluna key={col} id={col} leads={colLeads}
                    movendoId={movendoId} onAssumir={assumir} assumindo={assumindo}
                    onAbrir={abrirDrawer} onMover={moverLead}
                    onToggleMover={id => setMovendoId(prev => prev === id ? null : id)}
                    mobile
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Drawer ── */}
      {(drawerLead || loadingDrawer) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerLead(null)} />
          <div className="relative w-full max-w-sm bg-sidebar border-l border-border flex flex-col h-full shadow-2xl animate-slide-in">

            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <p className="font-bold text-text-primary text-sm truncate">{drawerLead?.nome || drawerLead?.contato}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {drawerLead?.canal && (
                    <span className="text-xs text-text-muted capitalize font-medium">{drawerLead.canal}</span>
                  )}
                  {drawerLead?.score_qualificacao != null && (
                    <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full', COR_SCORE[drawerLead.score_qualificacao])}>
                      Score {drawerLead.score_qualificacao}
                    </span>
                  )}
                  {drawerLead?.atendimento_humano && (
                    <span className="flex items-center gap-1 text-xs bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded-full font-semibold">
                      <UserCheck size={10} /> Humano
                    </span>
                  )}
                  {drawerLead?.ultima_interacao && (
                    <span className={cn('text-xs font-semibold', tempoCor(drawerLead.ultima_interacao))}>
                      {tempoLabel(drawerLead.ultima_interacao)} sem resposta
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDrawerLead(null)} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            {loadingDrawer ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-text-muted animate-pulse">Carregando...</p>
              </div>
            ) : (
              <div ref={scrollRef} className="flex-1 overflow-y-auto">

                {/* Lead details */}
                <div className="px-5 py-4 border-b border-border space-y-3.5">
                  {drawerLead?.nome && (
                    <div>
                      <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest">Contato</p>
                      <p className="text-sm text-text-primary mt-0.5 font-mono">{drawerLead.contato}</p>
                    </div>
                  )}
                  {drawerLead?.veiculo && (
                    <div>
                      <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest">Veículo de interesse</p>
                      <p className="text-sm text-text-primary mt-0.5 flex items-center gap-2">
                        <Car size={12} className="text-text-muted flex-shrink-0" />
                        {drawerLead.veiculo.modelo} {drawerLead.veiculo.ano}
                        {drawerLead.veiculo.preco_venda && (
                          <span className="text-text-muted font-mono text-xs">{fmtPrice(drawerLead.veiculo.preco_venda)}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {(drawerLead?.forma_pagamento || drawerLead?.prazo_compra || drawerLead?.capacidade_financeira) && (
                    <div className="grid grid-cols-2 gap-3">
                      {drawerLead?.forma_pagamento && (
                        <div>
                          <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest">Pagamento</p>
                          <p className="text-sm text-text-primary mt-0.5">{drawerLead.forma_pagamento}</p>
                        </div>
                      )}
                      {drawerLead?.prazo_compra && (
                        <div>
                          <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest">Prazo</p>
                          <p className="text-sm text-text-primary mt-0.5">{drawerLead.prazo_compra}</p>
                        </div>
                      )}
                      {drawerLead?.capacidade_financeira && drawerLead.capacidade_financeira !== 'sem_informacao' && (
                        <div className="col-span-2">
                          <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest">Capacidade</p>
                          <p className="text-sm text-text-primary mt-0.5">{CAPACIDADE_LABEL[drawerLead.capacidade_financeira] ?? drawerLead.capacidade_financeira}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerLead?.resumo_agente && (
                    <div>
                      <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest mb-1">Resumo da Ana</p>
                      <p className="text-xs text-text-muted leading-relaxed bg-white/[0.02] border border-border rounded-lg px-3 py-2">{drawerLead.resumo_agente}</p>
                    </div>
                  )}

                  {drawerLead && !drawerLead.atendimento_humano && (
                    <button
                      onClick={() => assumir(drawerLead.id)}
                      disabled={assumindo === drawerLead.id}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-primary border border-primary/20 rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-50 font-semibold"
                    >
                      <Handshake size={13} />
                      {assumindo === drawerLead.id ? 'Assumindo...' : 'Assumir atendimento'}
                    </button>
                  )}

                  {/* Anotações */}
                  <div>
                    <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest mb-1.5">Anotações</p>
                    <textarea
                      rows={3}
                      value={anotacoes}
                      onChange={e => setAnotacoes(e.target.value)}
                      placeholder="Observações internas sobre este lead..."
                      className="input !text-xs resize-none"
                    />
                    {anotacoes !== (drawerLead?.anotacoes ?? '') && (
                      <button
                        onClick={salvarAnotacoes}
                        disabled={salvandoAnotacoes}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-green-400/10 text-green-400 border border-green-400/20 rounded-lg text-xs font-semibold hover:bg-green-400/20 transition-colors disabled:opacity-50"
                      >
                        <Save size={11} />
                        {salvandoAnotacoes ? 'Salvando...' : 'Salvar anotações'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="px-4 pt-4 pb-6 space-y-2">
                  <p className="text-2xs font-semibold text-text-dim uppercase tracking-widest mb-3">
                    Histórico{visibleMsgs.length > 0 ? ` · ${visibleMsgs.length} mensagens` : ''}
                  </p>
                  {visibleMsgs.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-4">Nenhuma mensagem registrada.</p>
                  ) : (
                    visibleMsgs.map((msg, i) => {
                      const texto = msgTexto(msg.content);
                      if (!texto) return null;
                      const isUser = msg.role === 'user';
                      return (
                        <div
                          key={i}
                          className={cn(
                            'max-w-[85%] px-3 py-2 rounded-xl',
                            isUser
                              ? 'bg-white/5 border border-border text-text-primary'
                              : 'bg-primary/10 border border-primary/20 text-primary ml-auto',
                          )}
                        >
                          <p className="text-xs leading-relaxed">{texto}</p>
                          <p className="text-[10px] text-text-muted mt-1 opacity-70">
                            {new Date(msg.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div ref={msgEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Coluna({ id, leads, movendoId, onAssumir, assumindo, onAbrir, onMover, onToggleMover, mobile }: {
  id: Lead['status_funil']; leads: Lead[]; movendoId: string | null;
  onAssumir: (id: string) => void; assumindo: string | null;
  onAbrir: (id: string) => void; onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void; mobile?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border-2 bg-card', mobile ? 'min-h-[80px]' : 'w-52 flex-shrink-0 min-h-[400px]', COR_COLUNA[id])}>
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', COR_BAR[id])} />
          <span className={cn('text-xs font-bold uppercase tracking-wide', COR_HEADER[id])}>{FUNIL_LABEL[id]}</span>
        </div>
        <span className="text-xs font-semibold text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full">{leads.length}</span>
      </div>
      <div className="p-2 space-y-2">
        {leads.map(lead => (
          <LeadCard
            key={lead.id} lead={lead} movendoAberto={movendoId === lead.id}
            onAssumir={onAssumir} assumindo={assumindo}
            onAbrir={onAbrir} onMover={onMover} onToggleMover={onToggleMover}
          />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead, onAssumir, assumindo, onAbrir, onMover, onToggleMover, movendoAberto }: {
  lead: Lead; onAssumir: (id: string) => void; assumindo: string | null;
  onAbrir: (id: string) => void; onMover: (id: string, status: Lead['status_funil']) => void;
  onToggleMover: (id: string) => void; movendoAberto: boolean;
}) {
  return (
    <div
      onClick={() => onAbrir(lead.id)}
      className="bg-card-hover border border-border rounded-xl p-3 select-none cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight truncate">{lead.nome || lead.contato}</p>
          {lead.nome && <p className="text-xs text-text-muted leading-tight truncate font-mono">{lead.contato}</p>}
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleMover(lead.id); }}
          className={cn('flex-shrink-0 p-1 rounded-lg transition-colors',
            movendoAberto ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-primary hover:bg-white/5'
          )}
        >
          <ArrowRightLeft size={12} />
        </button>
      </div>

      {movendoAberto && (
        <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} className="mt-2 flex flex-wrap gap-1">
          {COLUNAS.filter(c => c !== lead.status_funil).map(col => (
            <button key={col}
              onClick={e => { e.stopPropagation(); onMover(lead.id, col); }}
              className={cn('text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors', COR_FUNIL[col])}
            >
              {FUNIL_LABEL[col]}
            </button>
          ))}
        </div>
      )}

      {lead.veiculo && (
        <p className="text-xs text-text-muted mt-1.5 truncate flex items-center gap-1">
          <Car size={9} className="flex-shrink-0" />
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
            <UserCheck size={10} /> Humano
          </span>
        )}
        <span className={cn('text-[10px] font-semibold ml-auto', tempoCor(lead.ultima_interacao))}>
          {tempoLabel(lead.ultima_interacao)}
        </span>
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
