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
  const [config, setConfig]   = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso]   = useState(false);
  const [bots, setBots]         = useState<BotsStatus | null>(null);
  const [loadingBots, setLoadingBots] = useState(false);

  // Form state
  const [horarioInicio, setHorarioInicio] = useState('08:00');
  const [horarioFim, setHorarioFim]       = useState('18:00');
  const [diasSemana, setDiasSemana]       = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [msgFora, setMsgFora]             = useState('');
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
      setMsgFora(data.msg_fora_horario ?? '');
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
        msg_fora_horario:     msgFora  || undefined,
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
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-pulse space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white/5 rounded-2xl" />)}
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <RefreshCw size={32} className="mx-auto text-border mb-3" />
      <p className="text-sm text-text-muted mb-3">Não foi possível carregar as configurações.</p>
      <button onClick={carregar} className="text-sm text-primary font-medium hover:underline">Tentar novamente</button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={22} className="text-text-muted" />
        <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">Configurações</h1>
      </div>

      <form onSubmit={salvar} className="space-y-4">

        {/* Horário de funcionamento */}
        <Section icon={<Clock size={16} />} title="Horário de funcionamento">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">Abertura</label>
                <input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">Fechamento</label>
                <input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} className={INPUT} />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-text-muted mb-2">Dias de funcionamento</p>
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

        {/* Mensagem fora do horário */}
        <Section icon={<MessageSquare size={16} />} title="Mensagem fora do horário">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Mensagem enviada automaticamente quando fora do horário de funcionamento
              </label>
              <textarea
                rows={3}
                value={msgFora}
                onChange={e => setMsgFora(e.target.value)}
                placeholder="Olá! No momento estamos fora do horário de atendimento..."
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Telefone do responsável (recebe resumo semanal)
              </label>
              <input
                type="tel"
                value={ownerPhone}
                onChange={e => setOwnerPhone(e.target.value)}
                placeholder="5511999999999 (com DDI)"
                className={INPUT}
              />
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
              <span className="text-sm text-text-primary">Resumo semanal via WhatsApp (sábados às 8h)</span>
            </label>
          </div>
        </Section>

        {/* Alertas */}
        <Section icon={<Bell size={16} />} title="Limites de alerta">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Alertar sobre IPVA vencendo em até <span className="text-text-primary font-semibold">{ipvaDias} dias</span>
              </label>
              <input
                type="range" min={7} max={90} step={1}
                value={ipvaDias}
                onChange={e => setIpvaDias(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>7 dias</span><span>90 dias</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Alertar sobre veículo parado há mais de <span className="text-text-primary font-semibold">{paradoDias} dias</span>
              </label>
              <input
                type="range" min={15} max={180} step={5}
                value={paradoDias}
                onChange={e => setParadoDias(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>15 dias</span><span>180 dias</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Status dos bots */}
        <Section icon={<Bot size={16} />} title="Status dos bots">
          <div className="space-y-3">
            {(['whatsapp', 'telegram'] as const).map(bot => {
              const info = bots?.[bot];
              return (
                <div key={bot} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {info?.ok
                      ? <Wifi size={15} className="text-green-400 flex-shrink-0" />
                      : <WifiOff size={15} className="text-red-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary capitalize">{bot === 'whatsapp' ? 'WhatsApp (Z-API)' : 'Telegram'}</p>
                      <p className="text-xs text-text-muted truncate">
                        {loadingBots ? 'Verificando...' : (info?.info ?? '—')}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
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
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loadingBots ? 'animate-spin' : ''} />
              Verificar novamente
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
            className="w-full py-3 bg-primary hover:bg-primary-light text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Save size={15} />
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-semibold text-text-primary">{title}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
