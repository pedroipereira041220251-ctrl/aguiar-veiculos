'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ChevronLeft, Search, CheckCircle2, Car } from 'lucide-react';

const INPUT = 'input';

const TIPOS = ['sedan','hatch','SUV','picape','crossover','minivan','esportivo'] as const;
type TipoVeiculo = typeof TIPOS[number] | '';

type Form = {
  placa: string; marca: string; modelo: string; ano: string;
  cor: string; km: string; preco_compra: string; preco_venda: string;
  fipe_referencia: string; obs: string; tipo: TipoVeiculo;
};

const INITIAL: Form = {
  placa: '', marca: '', modelo: '', ano: String(new Date().getFullYear()),
  cor: '', km: '0', preco_compra: '', preco_venda: '', fipe_referencia: '', obs: '', tipo: '',
};

export default function EstoqueNovoPage() {
  const router = useRouter();
  const [form, setForm]               = useState<Form>(INITIAL);
  const [buscando, setBuscando]       = useState(false);
  const [placaStatus, setPlacaStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [salvando, setSalvando]       = useState(false);
  const [erro, setErro]               = useState('');

  function set(k: keyof Form, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function buscarPlaca() {
    const placa = form.placa.replace(/\W/g, '').toUpperCase();
    if (placa.length < 7) return;
    setBuscando(true);
    setPlacaStatus('idle');
    try {
      const res = await api.placas.consultar(placa);
      if (res.found) {
        setForm(p => ({
          ...p,
          marca:           res.marca  ?? p.marca,
          modelo:          res.modelo ?? p.modelo,
          ano:             res.ano    ? String(res.ano) : p.ano,
          cor:             res.cor    ?? p.cor,
          fipe_referencia: res.fipe   ? String(res.fipe) : p.fipe_referencia,
        }));
        setPlacaStatus('found');
      } else {
        setPlacaStatus('not_found');
      }
    } catch {
      setPlacaStatus('not_found');
    } finally {
      setBuscando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        placa:        form.placa.replace(/\W/g, '').toUpperCase(),
        marca:        form.marca.trim(),
        modelo:       form.modelo.trim(),
        ano:          Number(form.ano),
        cor:          form.cor.trim(),
        km:           Number(form.km),
        preco_compra: Number(form.preco_compra),
        preco_venda:  Number(form.preco_venda),
        criado_via:   'painel',
      };
      if (form.fipe_referencia) payload.fipe_referencia = Number(form.fipe_referencia);
      if (form.obs.trim())       payload.obs             = form.obs.trim();
      if (form.tipo)             payload.tipo            = form.tipo;

      const v = await api.veiculos.criar(payload);
      router.push(`/estoque/${v.id}`);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar veículo.');
      setSalvando(false);
    }
  }

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <div className="flex items-center gap-3">
          <Link href="/estoque" className="p-1.5 -ml-1 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-white/5">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <p className="breadcrumb">
              <Car size={10} />
              Painel / Estoque / Novo veículo
            </p>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Cadastrar Veículo</h1>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-8 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Identificação */}
          <FormSection title="Identificação" bar="bg-primary">
            <div className="space-y-4">
              <div>
                <label htmlFor="placa" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Placa <span className="text-primary">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="placa"
                    required
                    value={form.placa}
                    onChange={e => { set('placa', e.target.value.toUpperCase()); setPlacaStatus('idle'); }}
                    onBlur={buscarPlaca}
                    maxLength={8}
                    placeholder="ABC1D23"
                    className={INPUT + ' flex-1 font-mono tracking-widest uppercase'}
                  />
                  <button
                    type="button"
                    onClick={buscarPlaca}
                    disabled={buscando || form.placa.length < 7}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 border border-border rounded-xl text-sm font-semibold text-text-muted hover:bg-white/10 hover:text-text-primary disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    <Search size={14} />
                    {buscando ? 'Buscando...' : 'Consultar FIPE'}
                  </button>
                </div>
                {placaStatus === 'found' && (
                  <p className="flex items-center gap-1.5 text-xs text-green-400 mt-1.5 font-medium">
                    <CheckCircle2 size={13} /> Dados preenchidos automaticamente via FIPE
                  </p>
                )}
                {placaStatus === 'not_found' && (
                  <p className="text-xs text-text-muted mt-1.5">Placa não encontrada. Preencha os dados manualmente.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="marca"  label="Marca"  required value={form.marca}  onChange={v => set('marca', v)}  placeholder="Honda" />
                <Field id="modelo" label="Modelo" required value={form.modelo} onChange={v => set('modelo', v)} placeholder="Civic" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tipo" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Tipo</label>
                  <select
                    id="tipo"
                    value={form.tipo}
                    onChange={e => set('tipo', e.target.value as TipoVeiculo)}
                    className={INPUT}
                  >
                    <option value="">Selecionar...</option>
                    {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <Field id="ano" label="Ano" required type="number" value={form.ano} onChange={v => set('ano', v)} min={1950} max={2030} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="cor" label="Cor" required value={form.cor} onChange={v => set('cor', v)} placeholder="Branco" />
                <Field id="km" label="Quilometragem" required type="number" value={form.km} onChange={v => set('km', v)} min={0} placeholder="0" />
              </div>
            </div>
          </FormSection>

          {/* Precificação */}
          <FormSection title="Precificação" bar="bg-green-400">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field id="preco_compra" label="Preço de compra (R$)" required type="number" value={form.preco_compra} onChange={v => set('preco_compra', v)} min={1} placeholder="0" />
                <Field id="preco_venda"  label="Preço de venda (R$)"  required type="number" value={form.preco_venda}  onChange={v => set('preco_venda', v)}  min={1} placeholder="0" />
              </div>
              <Field id="fipe" label="Referência FIPE (R$)" type="number" value={form.fipe_referencia} onChange={v => set('fipe_referencia', v)} min={1} placeholder="Opcional" />
            </div>
          </FormSection>

          {/* Observações */}
          <FormSection title="Observações" bar="bg-text-dim">
            <div>
              <label htmlFor="obs" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Anotações internas</label>
              <textarea
                id="obs"
                rows={3}
                value={form.obs}
                onChange={e => set('obs', e.target.value)}
                placeholder="Anotações sobre o veículo, histórico, condições..."
                className={INPUT}
              />
            </div>
          </FormSection>

          {erro && (
            <div className="flex items-start gap-2 bg-red-400/10 border border-red-400/20 px-4 py-3 rounded-xl">
              <div className="w-1 min-h-[16px] bg-red-400 rounded-full flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{erro}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Link
              href="/estoque"
              className="flex-1 py-3 bg-white/5 border border-border text-text-muted font-semibold rounded-xl text-sm text-center hover:bg-white/10 hover:text-text-primary transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 py-3 bg-primary hover:bg-primary-light text-white font-bold rounded-xl text-sm transition-all disabled:opacity-60 shadow-glow-red hover:shadow-none"
            >
              {salvando ? 'Cadastrando...' : 'Cadastrar veículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormSection({ title, children, bar }: { title: string; children: React.ReactNode; bar?: string }) {
  return (
    <div className="recipe-card">
      <div className="recipe-card-header">
        <div className="flex items-center gap-2.5">
          {bar && <span className={`w-[3px] h-5 rounded-full flex-shrink-0 ${bar}`} />}
          <span className="text-sm font-bold text-text-primary">{title}</span>
        </div>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function Field({
  id, label, required, type = 'text', value, onChange, placeholder, min, max, step,
}: {
  id: string; label: string; required?: boolean; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      <input
        id={id}
        required={required}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={INPUT}
      />
    </div>
  );
}
