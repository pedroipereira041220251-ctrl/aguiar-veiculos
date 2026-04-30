'use client';

import { useEffect, useState } from 'react';
import { api, type Config, type BotsStatus } from '@/lib/api';
import { Settings, Clock, Bell, MessageSquare, Save, RefreshCw, CheckCircle2, Wifi, WifiOff, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const INPUT = 'input';

const DIAS = [
  { n: 0, label: 'Dom' },
  { n: 1, label: 'Seg' },
  { n: 2, label: 'Ter' },
  { n: 3, label: 'Qua' },
  { n: 4, label: 'Qui' },
  { n: 5, label: 'Sex' },
  { n: 6, label: 'Sáb' },
];

export default function ConfiguracoesPage() {
  const [config, setConfig]     = useState<Config | null>(null);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso]   = useState(false);
  const [bots, setBots]         = useState<BotsStatus | null>(null);
  const [loadingBots, setLoadingBots] = useState(false);

  const [horarioInicio, setHorarioInicio] = useState('08:00');
  const [horarioFim, setHorarioFim]       = useState('18:00');
  const [diasSemana, setDiasSemana]       = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [ownerPhone, setOwnerPhone]       = useState('');
  const [resumoAtivo, setResumoAtivo]     = useState(true);
  const [ipvaDias, setIpvaDias]           = useState(30);
  const [paradoDias, setParadoDias]       = useState(60);

  async function carregar() {
    setLoading(true);
    setErro(false);
    try {
      const data = await api.config.buscar();
      setConfig(data);
      setHorarioInicio((data.horario_inicio ?? '08:00').slice(0, 5));
      setHorarioFim((data.horario_fim ?? '18:00').slice(0, 5));
      setDiasSemana(data.dias_semana ?? [1, 2, 3, 4, 5, 6]);
      setOwnerPhone(data.owner_phone_number ?? '');
      setResumoAtivo(data.resumo_semanal_ativo ?? true);
      setIpvaDias(data.alerta_ipva_dias ?? 30);
      setParadoDias(data.alerta_parado_dias ?? 60);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); verificarBots(); }, []);

  async function verificarBots() {
    setLoadingBots(true);
    try { setBots(await api.config.botsStatus()); }
    catch { /* silencioso */ }
    finally { setLoadingBots(false); }
  }

  function toggleDia(n: number) {
    setDiasSemana(prev =>
      prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n].sort(),
    );
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setSucesso(false);
    try {
      const updated = await api.config.salvar({
        horario_inicio:       horarioInicio,
        horario_fim:          horarioFim,
        dias_semana:          diasSemana,
        owner_phone_number:   ownerPhone || undefined,
        resumo_semanal_ativo: resumoAtivo,
        alerta_ipva_dias:     ipvaDias,
        alerta_parado_dias:   paradoDias,
      });
      setConfig(updated);
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto animate-pulse space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-2xl" />)}
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
        <RefreshCw size={20} className="text-text-dim" />
      </div>
      <p className="text-sm text-text-muted mb-3 font-medium">Não foi possível carregar as configurações.</p>
      <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
    </div>
  );

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <p className="breadcrumb">
          <Settings size={10} />
          Painel / Configurações
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Configurações do Sistema</h1>
        <p className="text-sm text-text-muted mt-1">Horário de visitas, alertas e status dos bots.</p>
      </div>

      <div className="p-5 md:p-8 max-w-2xl mx-auto">
        <form onSubmit={salvar} className="space-y-4">

          {/* Horário de funcionamento */}
          <Section icon={<Clock size={16} />} title="Horário de Funcionamento" bar="bg-blue-400">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Abertura</label>
                  <input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Fechamento</label>
                  <input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} className={INPUT} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">Dias de funcionamento</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DIAS.map(d => (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => toggleDia(d.n)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        diasSemana.includes(d.n)
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-white/5 border-border text-text-muted hover:bg-white/10',
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Atendimento */}
          <Section icon={<MessageSquare size={16} />} title="Atendimento e Mensagens" bar="bg-green-400">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
                  Telefone do responsável
                </label>
                <input
                  type="tel"
                  value={ownerPhone}
                  onChange={e => setOwnerPhone(e.target.value)}
                  placeholder="5511999999999 (com DDI)"
                  className={INPUT}
                />
                <p className="text-2xs text-text-dim mt-1.5">Recebe o resumo semanal de vendas via WhatsApp.</p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setResumoAtivo(v => !v)}
                  className={cn(
                    'w-10 h-5 rounded-full transition-colors flex-shrink-0 relative cursor-pointer',
                    resumoAtivo ? 'bg-primary' : 'bg-white/10',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    resumoAtivo ? 'translate-x-5' : 'translate-x-0.5',
                  )} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Resumo semanal via WhatsApp</p>
                  <p className="text-2xs text-text-dim mt-0.5">Enviado aos sábados às 8h</p>
                </div>
              </label>
            </div>
          </Section>

          {/* Alertas */}
          <Section icon={<Bell size={16} />} title="Limites de Alerta" bar="bg-yellow-400">
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">IPVA vencendo em</label>
                  <span className="text-sm font-bold text-text-primary">{ipvaDias} dias</span>
                </div>
                <input
                  type="range" min={7} max={90} step={1}
                  value={ipvaDias}
                  onChange={e => setIpvaDias(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-2xs text-text-dim mt-1">
                  <span>7 dias</span><span>90 dias</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Veículo parado há</label>
                  <span className="text-sm font-bold text-text-primary">{paradoDias} dias</span>
                </div>
                <input
                  type="range" min={15} max={180} step={5}
                  value={paradoDias}
                  onChange={e => setParadoDias(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-2xs text-text-dim mt-1">
                  <span>15 dias</span><span>180 dias</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Status dos bots */}
          <Section icon={<Bot size={16} />} title="Status dos Bots" bar="bg-violet-400">
            <div className="space-y-4">
              {(['whatsapp', 'telegram'] as const).map(bot => {
                const info = bots?.[bot];
                return (
                  <div key={bot} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        info?.ok ? 'bg-green-400/10' : 'bg-red-400/10',
                      )}>
                        {info?.ok
                          ? <Wifi size={14} className="text-green-400" />
                          : <WifiOff size={14} className="text-red-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary capitalize">{bot === 'whatsapp' ? 'WhatsApp (Z-API)' : 'Telegram'}</p>
                        <p className="text-xs text-text-muted truncate">
                          {loadingBots ? 'Verificando...' : (info?.info ?? '—')}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                      info?.ok ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400',
                    )}>
                      {loadingBots ? '...' : info?.ok ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={verificarBots}
                disabled={loadingBots}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50 font-medium"
              >
                <RefreshCw size={12} className={loadingBots ? 'animate-spin' : ''} />
                Verificar conexão
              </button>
            </div>
          </Section>

          {/* Salvar */}
          <div className="pt-1">
            {sucesso && (
              <div className="flex items-center gap-2 bg-green-400/10 border border-green-400/20 text-green-400 text-sm px-4 py-3 rounded-xl mb-3">
                <CheckCircle2 size={16} />
                Configurações salvas com sucesso.
              </div>
            )}
            <button
              type="submit"
              disabled={salvando}
              className="w-full py-3 bg-primary hover:bg-primary-light text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-60 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <Save size={15} />
              {salvando ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ icon, title, children, bar }: { icon: React.ReactNode; title: string; children: React.ReactNode; bar?: string }) {
  return (
    <div className="recipe-card">
      <div className="recipe-card-header">
        <div className="flex items-center gap-2.5">
          {bar && <span className={cn('w-[3px] h-5 rounded-full flex-shrink-0', bar)} />}
          <span className="text-text-muted">{icon}</span>
          <span className="text-sm font-bold text-text-primary">{title}</span>
        </div>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}
