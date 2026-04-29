'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ChevronLeft, Search, CheckCircle2 } from 'lucide-react';

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
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/estoque" className="text-text-muted hover:text-text-primary transition-colors p-1 -ml-1">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-lg font-bold text-text-primary tracking-tight">Novo veículo</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Placa */}
        <div>
          <label htmlFor="placa" className="block text-sm font-medium text-text-primary mb-1.5">
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
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white/5 border border-border rounded-xl text-sm font-medium text-text-muted hover:bg-white/10 hover:text-text-primary disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Search size={14} />
              {buscando ? 'Buscando...' : 'Consultar'}
            </button>
          </div>
          {placaStatus === 'found' && (
            <p className="flex items-center gap-1 text-xs text-green-400 mt-1.5">
              <CheckCircle2 size={13} /> Dados preenchidos automaticamente
            </p>
          )}
          {placaStatus === 'not_found' && (
            <p className="text-xs text-text-muted mt-1.5">Placa não encontrada. Preencha manualmente.</p>
          )}
        </div>

        {/* Marca / Modelo */}
        <div className="grid grid-cols-2 gap-3">
          <Field id="marca"  label="Marca"  required value={form.marca}  onChange={v => set('marca', v)}  placeholder="Honda" />
          <Field id="modelo" label="Modelo" required value={form.modelo} onChange={v => set('modelo', v)} placeholder="Civic" />
        </div>

        {/* Tipo / Ano */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-text-primary mb-1.5">Tipo</label>
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

        {/* Cor */}
        <Field id="cor" label="Cor" required value={form.cor} onChange={v => set('cor', v)} placeholder="Branco" />

        {/* KM */}
        <Field id="km" label="Quilometragem" required type="number" value={form.km} onChange={v => set('km', v)} min={0} placeholder="0" />

        {/* Preços */}
        <div className="grid grid-cols-2 gap-3">
          <Field id="preco_compra" label="Preço de compra (R$)" required type="number" value={form.preco_compra} onChange={v => set('preco_compra', v)} min={1} placeholder="0" />
          <Field id="preco_venda"  label="Preço de venda (R$)"  required type="number" value={form.preco_venda}  onChange={v => set('preco_venda', v)}  min={1} placeholder="0" />
        </div>

        {/* FIPE */}
        <Field id="fipe" label="Referência FIPE (R$)" type="number" value={form.fipe_referencia} onChange={v => set('fipe_referencia', v)} min={1} placeholder="Opcional" />

        {/* Obs */}
        <div>
          <label htmlFor="obs" className="block text-sm font-medium text-text-primary mb-1.5">Observações</label>
          <textarea
            id="obs"
            rows={3}
            value={form.obs}
            onChange={e => set('obs', e.target.value)}
            placeholder="Anotações sobre o veículo..."
            className={INPUT}
          />
        </div>

        {erro && (
          <div className="bg-red-400/10 border border-red-400/20 text-red-400 text-sm px-4 py-3 rounded-xl">
            {erro}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Link
            href="/estoque"
            className="flex-1 py-3 bg-white/5 border border-border text-text-muted font-medium rounded-xl text-sm text-center hover:bg-white/10 hover:text-text-primary transition-colors"
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
      <label htmlFor={id} className="block text-sm font-medium text-text-primary mb-1.5">
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
        className={'w-full px-3.5 py-2.5 bg-white/5 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors'}
      />
    </div>
  );
}
