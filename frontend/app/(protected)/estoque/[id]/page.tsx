'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type VeiculoCompleto, type Custo, type Foto, type DocumentacaoVeiculo } from '@/lib/api';
import { fmt, fmtKm, STATUS_LABEL, cn } from '@/lib/utils';
import { ChevronLeft, Edit2, Check, X, Trash2, Car, CheckCircle2, AlertCircle, Plus, Star, Lock, Unlock } from 'lucide-react';

const INPUT = 'w-full px-3 py-2 bg-white/5 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors';

const STATUS_DOT: Record<string, string> = {
  disponivel: 'bg-green-400',
  reservado:  'bg-yellow-400',
  vendido:    'bg-blue-400',
  inativo:    'bg-text-muted',
};

type Tab = 'dados' | 'custos' | 'vender';

export default function VeiculoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [veiculo, setVeiculo]   = useState<VeiculoCompleto | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab]           = useState<Tab>('dados');

  const [editando, setEditando]         = useState(false);
  const [editForm, setEditForm]         = useState<Record<string, string>>({});
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  const [custoForm, setCustoForm]           = useState({ tipo: '', valor: '', descricao: '' });
  const [salvandoCusto, setSalvandoCusto]   = useState(false);

  const [vendaForm, setVendaForm]           = useState(() => {
    const hoje = new Date();
    const data = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
    return { preco_venda_final: '', data_venda: data, nome_comprador: '', nome_vendedor: '' };
  });
  const [salvandoVenda, setSalvandoVenda]   = useState(false);
  const [reservando, setReservando]         = useState(false);
  const [editandoDoc, setEditandoDoc]       = useState(false);
  const [salvandoDoc, setSalvandoDoc]       = useState(false);

  useEffect(() => {
    api.veiculos.buscar(id)
      .then(v => {
        setVeiculo(v);
        setEditForm({
          placa: v.placa, marca: v.marca, modelo: v.modelo, ano: String(v.ano),
          cor: v.cor, km: String(v.km), preco_compra: String(v.preco_compra),
          preco_venda: String(v.preco_venda), obs: v.obs ?? '',
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function salvarEdicao() {
    if (!veiculo) return;
    setSalvandoEdit(true);
    try {
      await api.veiculos.editar(id, {
        placa: editForm.placa, marca: editForm.marca, modelo: editForm.modelo,
        ano: Number(editForm.ano), cor: editForm.cor, km: Number(editForm.km),
        preco_compra: Number(editForm.preco_compra), preco_venda: Number(editForm.preco_venda),
        obs: editForm.obs || undefined,
      });
      // Rebusca da view para atualizar lucro estimado e outros campos calculados
      const atualizado = await api.veiculos.buscar(id);
      setVeiculo(p => p ? { ...p, ...atualizado } : p);
      setEditando(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally { setSalvandoEdit(false); }
  }

  async function adicionarCusto(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoCusto(true);
    try {
      const valorNum = parseFloat(custoForm.valor.replace(/\./g, '').replace(',', '.'));
      if (!valorNum || valorNum <= 0) { alert('Insira um valor válido (ex: 500 ou 1.500,00)'); setSalvandoCusto(false); return; }
      const res = await api.veiculos.custos.criar(id, {
        tipo: custoForm.tipo, valor: valorNum,
        descricao: custoForm.descricao || undefined, criado_via: 'painel',
      }) as { custo: Custo; financeiro: { total_custos: number; investimento_total: number; lucro_estimado: number; margem_pct: number } };
      setVeiculo(p => {
        if (!p) return p;
        return { ...p, custos: [res.custo, ...p.custos], ...res.financeiro };
      });
      setCustoForm({ tipo: '', valor: '', descricao: '' });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao lançar custo.');
    } finally { setSalvandoCusto(false); }
  }

  async function deletarCusto(custoId: string) {
    if (!confirm('Remover este custo?')) return;
    try {
      await api.veiculos.custos.deletar(custoId);
      const updated = await api.veiculos.buscar(id);
      setVeiculo(updated);
    } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Erro.'); }
  }

  async function registrarVenda(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoVenda(true);
    try {
      await api.veiculos.vender(id, {
        preco_venda_final: Number(vendaForm.preco_venda_final),
        data_venda: vendaForm.data_venda || undefined,
        nome_comprador: vendaForm.nome_comprador || undefined,
        nome_vendedor: vendaForm.nome_vendedor || undefined,
      });
      router.push('/estoque');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar venda.');
      setSalvandoVenda(false);
    }
  }

  async function reservar() {
    setReservando(true);
    try {
      const updated = await api.veiculos.reservar(id);
      setVeiculo(p => p ? { ...p, status: updated.status } : p);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao reservar.');
    } finally { setReservando(false); }
  }

  async function liberar() {
    setReservando(true);
    try {
      const updated = await api.veiculos.liberar(id);
      setVeiculo(p => p ? { ...p, status: updated.status } : p);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao liberar reserva.');
    } finally { setReservando(false); }
  }

  async function salvarDocumentacao(patch: Record<string, boolean | string | null>) {
    setSalvandoDoc(true);
    try {
      const updated = await api.veiculos.documentacao(id, patch);
      setVeiculo(p => p ? { ...p, documentacao: updated } : p);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar documentação.');
    } finally { setSalvandoDoc(false); }
  }

  async function inativar() {
    if (!confirm('Inativar este veículo? Ele sairá do estoque ativo.')) return;
    try { await api.veiculos.inativar(id); router.push('/estoque'); }
    catch (err: unknown) { alert(err instanceof Error ? err.message : 'Erro.'); }
  }

  async function reativar() {
    if (!confirm('Reativar este veículo? Ele voltará para o estoque como disponível.')) return;
    try {
      const updated = await api.veiculos.editar(id, { status: 'disponivel' });
      setVeiculo(p => p ? { ...p, status: updated.status } : p);
    } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Erro ao reativar.'); }
  }

  if (loading) return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-pulse space-y-4">
      <div className="h-7 bg-white/5 rounded-xl w-48" />
      <div className="aspect-video bg-white/5 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
      </div>
    </div>
  );

  if (notFound || !veiculo) return (
    <div className="p-6 text-center">
      <Car size={48} className="mx-auto text-border mb-3" />
      <p className="text-sm text-text-muted mb-4">Veículo não encontrado.</p>
      <Link href="/estoque" className="text-sm text-primary font-medium hover:underline">← Voltar ao estoque</Link>
    </div>
  );

  const isVendido    = veiculo.status === 'vendido';
  const isInativo    = veiculo.status === 'inativo';
  const isReservado  = veiculo.status === 'reservado';
  const isDisponivel = veiculo.status === 'disponivel';
  const bloqueado    = isVendido || isInativo;
  const TABS: { id: Tab; label: string }[] = [
    { id: 'dados',  label: 'Dados' },
    { id: 'custos', label: `Custos${veiculo.custos.length > 0 ? ` (${veiculo.custos.length})` : ''}` },
    ...(!bloqueado ? [{ id: 'vender' as Tab, label: 'Vender' }] : []),
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/estoque" className="p-1 -ml-1 text-text-muted hover:text-text-primary transition-colors">
          <ChevronLeft size={22} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-text-primary truncate">{veiculo.marca} {veiculo.modelo}</h1>
          <p className="text-xs font-mono text-text-muted">{veiculo.placa}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-background/80 px-2.5 py-1 rounded-full border border-border">
            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[veiculo.status] ?? 'bg-text-muted')} />
            <span className="text-xs font-medium text-text-primary">{STATUS_LABEL[veiculo.status]}</span>
          </div>
          {isDisponivel && (
            <button
              onClick={reservar}
              disabled={reservando}
              className="flex items-center gap-1 px-2.5 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-semibold rounded-full hover:bg-yellow-400/20 transition-colors disabled:opacity-50"
            >
              <Lock size={10} />
              {reservando ? '...' : 'Reservar'}
            </button>
          )}
          {isReservado && (
            <button
              onClick={liberar}
              disabled={reservando}
              className="flex items-center gap-1 px-2.5 py-1 bg-white/5 border border-border text-text-muted text-xs font-semibold rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <Unlock size={10} />
              {reservando ? '...' : 'Liberar'}
            </button>
          )}
        </div>
      </div>

      {/* Galeria de fotos */}
      <FotoGaleria
        veiculoId={id}
        fotos={veiculo.fotos}
        bloqueado={bloqueado}
        onFotosChange={fotos => setVeiculo(p => p ? { ...p, fotos } : p)}
      />

      {/* Resumo financeiro */}
      <div className="grid grid-cols-3 gap-3">
        <FinCard label="Investimento" value={fmt(veiculo.investimento_total)} />
        <FinCard label="Venda"        value={fmt(veiculo.preco_venda)} />
        <FinCard
          label={isVendido ? 'Lucro real' : 'Lucro est.'}
          value={fmt(isVendido ? veiculo.lucro_real : veiculo.lucro_estimado)}
          green={(isVendido ? veiculo.lucro_real : veiculo.lucro_estimado) ?? 0}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-border rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
              tab === t.id
                ? 'bg-card-hover text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Dados ── */}
      {tab === 'dados' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">Dados do veículo</span>
            {!bloqueado && (
              <div className="flex items-center gap-2">
                {editando && (
                  <button onClick={() => setEditando(false)} className="p-1 text-text-muted hover:text-text-primary">
                    <X size={16} />
                  </button>
                )}
                <button
                  onClick={() => editando ? salvarEdicao() : setEditando(true)}
                  disabled={salvandoEdit}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    editando
                      ? 'bg-green-400/10 text-green-400 hover:bg-green-400/20 border border-green-400/20'
                      : 'bg-white/5 border border-border text-text-muted hover:bg-white/10 hover:text-text-primary',
                  )}
                >
                  {editando
                    ? <><Check size={13} /> {salvandoEdit ? '...' : 'Salvar'}</>
                    : <><Edit2 size={13} /> Editar</>
                  }
                </button>
              </div>
            )}
          </div>

          {editando ? (
            <div className="p-4 grid grid-cols-2 gap-3">
              {[
                ['placa',  'Placa',    'text'],
                ['marca',  'Marca',    'text'],
                ['modelo', 'Modelo',   'text'],
                ['ano',    'Ano',      'number'],
                ['cor',    'Cor',      'text'],
                ['km',     'KM',       'number'],
                ['preco_compra', 'Compra (R$)', 'number'],
                ['preco_venda',  'Venda (R$)',  'number'],
              ].map(([k, label, type]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[k]}
                    onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))}
                    className={INPUT}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-text-muted mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={editForm.obs}
                  onChange={e => setEditForm(p => ({ ...p, obs: e.target.value }))}
                  className={INPUT}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 gap-4">
              {([
                ['Placa',  veiculo.placa,            true],
                ['Ano',    String(veiculo.ano),       false],
                ['Marca',  veiculo.marca,              false],
                ['Modelo', veiculo.modelo,             false],
                ['Cor',    veiculo.cor,                false],
                ['KM',     fmtKm(veiculo.km),          false],
                ['Compra', fmt(veiculo.preco_compra),  false],
                ['Venda',  fmt(veiculo.preco_venda),   false],
              ] as [string, string, boolean][]).map(([l, v, mono]) => (
                <div key={l}>
                  <p className="text-xs text-text-muted">{l}</p>
                  <p className={cn('text-sm font-medium text-text-primary mt-0.5', mono && 'font-mono')}>{v}</p>
                </div>
              ))}
              {veiculo.obs && (
                <div className="col-span-2">
                  <p className="text-xs text-text-muted">Observações</p>
                  <p className="text-sm text-text-primary mt-0.5">{veiculo.obs}</p>
                </div>
              )}
              {isVendido && veiculo.preco_venda_final && (
                <>
                  <div>
                    <p className="text-xs text-text-muted">Vendido por</p>
                    <p className="text-sm font-semibold text-green-400">{fmt(veiculo.preco_venda_final)}</p>
                  </div>
                  {veiculo.data_venda && (
                    <div>
                      <p className="text-xs text-text-muted">Data da venda</p>
                      <p className="text-sm font-medium text-text-primary">
                        {veiculo.data_venda.split('-').reverse().join('/')}
                      </p>
                    </div>
                  )}
                  {veiculo.nome_vendedor && (
                    <div>
                      <p className="text-xs text-text-muted">Vendedor</p>
                      <p className="text-sm font-medium text-text-primary">{veiculo.nome_vendedor}</p>
                    </div>
                  )}
                  {veiculo.nome_comprador && (
                    <div>
                      <p className="text-xs text-text-muted">Comprador</p>
                      <p className="text-sm font-medium text-text-primary">{veiculo.nome_comprador}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Documentação */}
          <div className="border-t border-border px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Documentação</p>
              {!bloqueado && (
                <button
                  onClick={() => setEditandoDoc(v => !v)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {editandoDoc ? 'Fechar' : <><Edit2 size={11} className="inline mr-1" />Editar</>}
                </button>
              )}
            </div>
            {veiculo.documentacao ? (
              <div className="grid grid-cols-2 gap-2">
                {veiculo.documentacao.ipva_vencimento && (
                  <div className="col-span-2 flex items-center gap-2 px-1 py-1">
                    <AlertCircle size={14} className={new Date(veiculo.documentacao.ipva_vencimento) < new Date() ? 'text-red-400' : 'text-yellow-400'} />
                    <span className="text-sm text-text-primary">
                      IPVA vence em {new Date(veiculo.documentacao.ipva_vencimento).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {([
                  ['transferencia_ok', 'Transferência'],
                  ['laudo_vistoria_ok', 'Laudo vistoria'],
                  ['dut_ok', 'DUT'],
                  ['crlv_ok', 'CRLV'],
                ] as [keyof DocumentacaoVeiculo, string][]).map(([key, label]) => {
                  const ok = veiculo.documentacao![key] as boolean;
                  return (
                    <button
                      key={key}
                      disabled={!editandoDoc || salvandoDoc}
                      onClick={() => salvarDocumentacao({ [key]: !ok })}
                      className={cn(
                        'flex items-center gap-2 text-left transition-colors rounded-lg',
                        editandoDoc ? 'cursor-pointer hover:bg-white/5 px-2 py-1 -mx-2' : 'cursor-default',
                      )}
                    >
                      {ok
                        ? <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />
                        : <AlertCircle  size={15} className="text-yellow-400 flex-shrink-0" />}
                      <span className={cn('text-sm', ok ? 'text-text-primary' : 'text-text-muted')}>{label}</span>
                      {editandoDoc && (
                        <span className={cn('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full', ok ? 'bg-green-400/10 text-green-400' : 'bg-white/5 text-text-muted')}>
                          {ok ? 'OK' : 'Pendente'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Sem documentação cadastrada.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Custos ── */}
      {tab === 'custos' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-text-primary">Custos</span>
              <span className="ml-2 text-xs text-text-muted">{fmt(veiculo.total_custos)} total</span>
            </div>
          </div>

          {!bloqueado && (
            <form onSubmit={adicionarCusto} className="px-4 py-3 border-b border-border bg-white/5 space-y-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Lançar custo</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  value={custoForm.tipo}
                  onChange={e => setCustoForm(p => ({ ...p, tipo: e.target.value }))}
                  placeholder="Tipo (ex: IPVA, Reparo)"
                  className={INPUT}
                />
                <input
                  required
                  value={custoForm.valor}
                  onChange={e => setCustoForm(p => ({ ...p, valor: e.target.value }))}
                  placeholder="Valor (ex: 500 ou 1.500,00)"
                  className={INPUT}
                />
              </div>
              <input
                value={custoForm.descricao}
                onChange={e => setCustoForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição (opcional)"
                className={INPUT}
              />
              <button
                type="submit"
                disabled={salvandoCusto}
                className="w-full py-2 bg-primary hover:bg-primary-light text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors shadow-sm shadow-primary/20"
              >
                {salvandoCusto ? 'Salvando...' : 'Lançar custo'}
              </button>
            </form>
          )}

          {veiculo.custos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">Nenhum custo lançado.</p>
          ) : (
            <div className="divide-y divide-border">
              {veiculo.custos.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{c.tipo}</p>
                    {c.descricao && <p className="text-xs text-text-muted truncate">{c.descricao}</p>}
                    <p className="text-xs text-text-muted">{new Date(c.data_custo).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className="text-sm font-semibold text-red-400 flex-shrink-0">{fmt(c.valor)}</p>
                  {!bloqueado && (
                    <button onClick={() => deletarCusto(c.id)} className="text-text-muted hover:text-red-400 transition-colors p-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reativar (inativo) ── */}
      {isInativo && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Veículo inativo</p>
          <p className="text-xs text-text-muted">Este veículo foi inativado e não aparece no estoque ativo. Você pode reativá-lo para torná-lo disponível novamente.</p>
          <button
            onClick={reativar}
            className="w-full py-2.5 bg-green-400/10 hover:bg-green-400/20 text-green-400 border border-green-400/20 font-semibold rounded-xl text-sm transition-colors"
          >
            Reativar veículo
          </button>
        </div>
      )}

      {/* ── Tab: Vender ── */}
      {tab === 'vender' && !bloqueado && (
        <div className="space-y-3">
          <form onSubmit={registrarVenda} className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-text-primary">Registrar venda</p>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Preço final de venda (R$) <span className="text-primary">*</span>
              </label>
              <input
                required type="number" min={1}
                value={vendaForm.preco_venda_final}
                onChange={e => setVendaForm(p => ({ ...p, preco_venda_final: e.target.value }))}
                placeholder={String(veiculo.preco_venda)}
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Data da venda</label>
                <input
                  type="date"
                  value={vendaForm.data_venda}
                  onChange={e => setVendaForm(p => ({ ...p, data_venda: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Nome do comprador</label>
                <input
                  value={vendaForm.nome_comprador}
                  onChange={e => setVendaForm(p => ({ ...p, nome_comprador: e.target.value }))}
                  placeholder="Opcional"
                  className={INPUT}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-text-muted mb-1">Vendedor responsável</label>
                <input
                  value={vendaForm.nome_vendedor}
                  onChange={e => setVendaForm(p => ({ ...p, nome_vendedor: e.target.value }))}
                  placeholder="Nome do vendedor (opcional)"
                  className={INPUT}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={salvandoVenda}
              className="w-full py-3 bg-green-400/10 hover:bg-green-400/20 text-green-400 border border-green-400/20 font-semibold rounded-xl text-sm transition-colors disabled:opacity-60"
            >
              {salvandoVenda ? 'Registrando...' : 'Confirmar venda'}
            </button>
          </form>

          <button
            onClick={inativar}
            className="w-full py-2.5 bg-white/5 border border-border text-text-muted text-sm rounded-xl hover:bg-white/10 hover:text-text-primary transition-colors"
          >
            Inativar veículo
          </button>
        </div>
      )}
    </div>
  );
}

function FinCard({ label, value, green }: { label: string; value: string; green?: number }) {
  return (
    <div className="bg-white/5 border border-border rounded-xl p-3 text-center">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={cn(
        'text-sm font-bold mt-0.5',
        green === undefined ? 'text-text-primary' : green >= 0 ? 'text-green-400' : 'text-red-400',
      )}>
        {value}
      </p>
    </div>
  );
}

function FotoGaleria({
  veiculoId, fotos, bloqueado, onFotosChange,
}: {
  veiculoId: string;
  fotos: Foto[];
  bloqueado: boolean;
  onFotosChange: (fotos: Foto[]) => void;
}) {
  const inputRef              = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<number | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('fotos', f));
      const novas: Foto[] = await api.veiculos.fotos.upload(veiculoId, fd);
      onFotosChange([...fotos, ...novas]);
    } catch {
      alert('Erro ao enviar foto. Tente novamente.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDeletar(fotoId: string) {
    if (!confirm('Remover esta foto?')) return;
    try {
      await api.veiculos.fotos.deletar(fotoId);
      onFotosChange(fotos.filter(f => f.id !== fotoId));
    } catch {
      alert('Erro ao remover foto.');
    }
  }

  async function handleSetCapa(fotoId: string) {
    const idx = fotos.findIndex(f => f.id === fotoId);
    if (idx <= 0) return; // já é capa
    // Reordenar: a foto clicada vira ordem 0, as demais sobem
    const novaOrdem = [
      { id: fotoId, ordem: 0 },
      ...fotos.filter(f => f.id !== fotoId).map((f, i) => ({ id: f.id, ordem: i + 1 })),
    ];
    try {
      await api.veiculos.fotos.reordenar(veiculoId, novaOrdem);
      const novasFotos = [fotos[idx], ...fotos.filter(f => f.id !== fotoId)].map((f, i) => ({ ...f, ordem: i }));
      onFotosChange(novasFotos);
    } catch {
      alert('Erro ao definir foto de capa.');
    }
  }

  const fotoCapa = fotos[0]?.url;

  return (
    <div className="space-y-2">
      {/* Foto principal / placeholder */}
      <div
        className="aspect-video bg-white/5 rounded-2xl overflow-hidden border border-border relative cursor-pointer group"
        onClick={() => fotoCapa && setPreview(0)}
      >
        {fotoCapa ? (
          <>
            <img src={fotoCapa} alt="Foto principal" className="w-full h-full object-cover" />
            {fotos.length > 1 && (
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                +{fotos.length - 1} foto{fotos.length > 2 ? 's' : ''}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Car size={40} className="text-border" />
            {!bloqueado && (
              <p className="text-xs text-text-muted">Nenhuma foto. Clique em + para adicionar.</p>
            )}
          </div>
        )}
      </div>

      {/* Miniaturas + botão de upload */}
      {(fotos.length > 0 || !bloqueado) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {fotos.map((foto, i) => (
            <div key={foto.id} className="relative flex-shrink-0 group/thumb">
              <img
                src={foto.url}
                alt={`Foto ${i + 1}`}
                onClick={() => setPreview(i)}
                className={cn(
                  'w-16 h-16 object-cover rounded-lg border cursor-pointer transition-all',
                  i === 0 ? 'border-primary' : 'border-border hover:border-primary/50',
                )}
              />
              {!bloqueado && (
                <>
                  {i > 0 && (
                    <button
                      onClick={() => handleSetCapa(foto.id)}
                      className="absolute inset-0 rounded-lg bg-black/60 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                    >
                      <span className="text-[10px] font-semibold text-white leading-tight text-center px-1">
                        Definir<br />capa
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeletar(foto.id)}
                    className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow"
                  >
                    <X size={10} />
                  </button>
                </>
              )}
              {i === 0 && (
                <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-primary text-white px-1 rounded leading-4">
                  capa
                </span>
              )}
            </div>
          ))}

          {!bloqueado && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="w-16 h-16 flex-shrink-0 bg-white/5 border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-0.5 hover:bg-white/10 hover:border-primary/50 transition-colors disabled:opacity-40"
              >
                {uploading ? (
                  <span className="text-xs text-text-muted animate-pulse">...</span>
                ) : (
                  <>
                    <Plus size={16} className="text-text-muted" />
                    <span className="text-[10px] text-text-muted">Foto</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      {preview !== null && fotos[preview] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setPreview(null)}
          >
            <X size={28} />
          </button>
          <img
            src={fotos[preview].url}
            alt={`Foto ${preview + 1}`}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          {fotos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {fotos.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setPreview(i); }}
                  className={cn('w-2 h-2 rounded-full transition-colors', i === preview ? 'bg-white' : 'bg-white/30')}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
