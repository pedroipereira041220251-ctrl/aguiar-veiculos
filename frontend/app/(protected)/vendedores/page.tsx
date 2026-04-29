'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, type VendedorResumo, type VendaVendedor, type Vendedor } from '@/lib/api';
import { fmt, cn } from '@/lib/utils';
import { RefreshCw, Plus, Trash2, Trophy, Users, ChevronDown, ChevronUp, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';

const PODIUM_COLOR = ['text-yellow-400', 'text-text-muted', 'text-amber-600'];
const PODIUM_BG    = ['bg-yellow-400/10 border-yellow-400/20', 'bg-white/5 border-border', 'bg-amber-600/10 border-amber-600/20'];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesLabel(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function mesAnterior(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesSeguinte(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<VendedorResumo[]>([]);
  const [cadastro, setCadastro]     = useState<Vendedor[]>([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(false);
  const [aberto, setAberto]         = useState<string | null>(null);
  const [vendas, setVendas]         = useState<Record<string, VendaVendedor[]>>({});
  const [loadingVendas, setLoadingVendas] = useState<string | null>(null);
  const [novoNome, setNovoNome]     = useState('');
  const [salvando, setSalvando]     = useState(false);
  const [tab, setTab]               = useState<'ranking' | 'gestao'>('ranking');
  const [mes, setMes]               = useState(mesAtual);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(false);
    try {
      const [data, cad] = await Promise.all([
        api.vendedores.listar(mes),
        api.vendedores.cadastro.listar(),
      ]);
      setVendedores(data);
      setCadastro(cad);
      setAberto(null);
      setVendas({});
    } catch { setErro(true); } finally { setLoading(false); }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleVendedor(nome: string) {
    if (aberto === nome) { setAberto(null); return; }
    setAberto(nome);
    if (vendas[nome]) return;
    setLoadingVendas(nome);
    try {
      const data = await api.vendedores.vendas(nome);
      setVendas(p => ({ ...p, [nome]: data }));
    } catch { /* silencia */ } finally { setLoadingVendas(null); }
  }

  async function adicionarVendedor(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setSalvando(true);
    try {
      const novo = await api.vendedores.cadastro.criar(novoNome.trim());
      setCadastro(p => [...p, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao cadastrar vendedor.');
    } finally { setSalvando(false); }
  }

  async function removerVendedor(id: string) {
    if (!confirm('Remover este vendedor da lista?')) return;
    try {
      await api.vendedores.cadastro.deletar(id);
      setCadastro(p => p.filter(v => v.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao remover vendedor.');
    }
  }

  const totalGeral    = vendedores.reduce((s, v) => s + v.total_vendas, 0);
  const comissaoGeral = vendedores.reduce((s, v) => s + v.comissao, 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-3 animate-pulse">
          <Users size={18} className="text-text-dim" />
        </div>
        <p className="text-sm text-text-muted">Carregando vendedores...</p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
        <RefreshCw size={20} className="text-text-dim" />
      </div>
      <p className="text-sm text-text-muted mb-3 font-medium">Não foi possível carregar os dados.</p>
      <button onClick={carregar} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
    </div>
  );

  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-hero">
        <p className="breadcrumb">
          <UserCheck size={10} />
          Painel / Vendedores
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">Equipe de Vendas</h1>
        <p className="text-sm text-text-muted mt-1">Ranking, comissões e cadastro de vendedores.</p>
      </div>

      {/* ── Stat bar ── */}
      <div className="border-b border-border">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-3 md:px-8 py-3 md:py-4">
            <p className="stat-label mb-1">Vendedores</p>
            <p className="stat-number text-xl md:text-2xl">{vendedores.length}</p>
          </div>
          <div className="px-3 md:px-8 py-3 md:py-4">
            <p className="stat-label mb-1">Receita</p>
            <p className="text-lg md:text-xl font-bold font-mono text-green-400 truncate">{fmt(totalGeral)}</p>
          </div>
          <div className="px-3 md:px-8 py-3 md:py-4">
            <p className="stat-label mb-1">Comissões</p>
            <p className="text-lg md:text-xl font-bold font-mono text-primary truncate">{fmt(comissaoGeral)}</p>
            <p className="text-2xs text-text-dim mt-0.5">10% / venda</p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-5">

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {[
            { id: 'ranking', label: 'Ranking de Vendas', icon: Trophy },
            { id: 'gestao',  label: 'Cadastro',          icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as 'ranking' | 'gestao')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all',
                tab === id ? 'bg-background text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Ranking ── */}
        {tab === 'ranking' && (
          <>
            {/* Seletor de mês */}
            <div className="flex items-center justify-between gap-3">
              <div className="chapter-heading mb-0 hidden sm:flex">
                <span className="chapter-bar bg-yellow-400" />
                <span className="chapter-title capitalize">{mesLabel(mes)}</span>
              </div>
              <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 mx-auto sm:mx-0">
                <button
                  onClick={() => setMes(mesAnterior(mes))}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-semibold text-text-primary px-2 min-w-[120px] text-center capitalize">
                  {mesLabel(mes)}
                </span>
                <button
                  onClick={() => setMes(mesSeguinte(mes))}
                  disabled={mes >= mesAtual()}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {vendedores.length === 0 ? (
              <div className="recipe-card py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-border flex items-center justify-center mx-auto mb-4">
                  <Trophy size={28} className="text-text-dim" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-text-muted">Nenhuma venda neste período.</p>
                <p className="text-xs text-text-dim mt-1">Tente outro mês ou informe o vendedor ao registrar uma venda.</p>
              </div>
            ) : (
              <div className="recipe-card">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="tbl-th w-8">#</th>
                      <th className="tbl-th">Vendedor</th>
                      <th className="tbl-th-right hidden sm:table-cell">Vendas</th>
                      <th className="tbl-th-right">Receita</th>
                      <th className="tbl-th-right hidden sm:table-cell">Comissão</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vendedores.map((v, i) => (
                      <>
                        <tr
                          key={v.nome_vendedor}
                          onClick={() => toggleVendedor(v.nome_vendedor)}
                          className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                        >
                          <td className="px-2 md:px-4 py-2.5 md:py-3.5">
                            {i < 3 ? (
                              <span className={cn('text-sm font-bold', PODIUM_COLOR[i])}>
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                              </span>
                            ) : (
                              <span className="text-sm font-mono font-bold text-text-dim">{String(i + 1).padStart(2, '0')}</span>
                            )}
                          </td>
                          <td className="px-2 md:px-4 py-2.5 md:py-3.5">
                            <div className="flex items-center gap-2 md:gap-3">
                              <div className={cn(
                                'w-6 h-6 md:w-8 md:h-8 rounded-full border flex items-center justify-center flex-shrink-0',
                                i < 3 ? PODIUM_BG[i] : 'bg-primary/10 border-primary/20',
                              )}>
                                <span className={cn('text-xs font-bold', i < 3 ? PODIUM_COLOR[i] : 'text-primary')}>
                                  {v.nome_vendedor.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-text-primary truncate">{v.nome_vendedor}</p>
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-right hidden sm:table-cell">
                            <span className="badge bg-white/5 border border-border text-text-muted">
                              {v.qtd_vendas} venda{v.qtd_vendas !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-right">
                            <p className="text-xs md:text-sm font-semibold font-mono text-green-400">{fmt(v.total_vendas)}</p>
                          </td>
                          <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-right hidden sm:table-cell">
                            <p className="text-sm font-bold font-mono text-primary">{fmt(v.comissao)}</p>
                          </td>
                          <td className="pr-2 md:pr-4 py-2.5 md:py-3.5 text-text-muted">
                            {aberto === v.nome_vendedor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </td>
                        </tr>
                        {aberto === v.nome_vendedor && (
                          <tr key={`${v.nome_vendedor}-detalhe`}>
                            <td colSpan={6} className="bg-white/[0.02] border-b border-border">
                              {loadingVendas === v.nome_vendedor ? (
                                <p className="text-xs text-text-muted text-center py-4">Carregando vendas...</p>
                              ) : (vendas[v.nome_vendedor] || []).length === 0 ? (
                                <p className="text-xs text-text-muted text-center py-4">Nenhuma venda encontrada.</p>
                              ) : (
                                <div className="divide-y divide-border">
                                  {(vendas[v.nome_vendedor] || []).map(venda => (
                                    <div key={venda.id} className="flex items-center gap-2 md:gap-4 px-3 md:px-5 py-2 md:py-2.5 hover:bg-white/[0.02] transition-colors">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-text-primary truncate">{venda.modelo} {venda.ano}</p>
                                        <p className="text-2xs font-mono text-text-muted truncate">{venda.placa} · {venda.data_venda ? venda.data_venda.split('-').reverse().join('/') : '—'}</p>
                                      </div>
                                      <p className="text-xs font-semibold font-mono text-green-400 flex-shrink-0">{venda.preco_venda_final ? fmt(venda.preco_venda_final) : '—'}</p>
                                      <p className={cn('text-xs font-bold font-mono flex-shrink-0 hidden sm:block', venda.comissao > 0 ? 'text-primary' : 'text-text-muted')}>
                                        {venda.comissao > 0 ? fmt(venda.comissao) : '—'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-white/[0.02]">
                      <td colSpan={3} className="px-2 md:px-4 py-2.5 md:py-3 text-2xs font-bold text-text-muted uppercase tracking-widest hidden sm:table-cell">Total do período</td>
                      <td colSpan={3} className="px-2 py-2.5 text-2xs font-bold text-text-muted uppercase tracking-widest sm:hidden">Total</td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3 text-right">
                        <p className="text-xs md:text-sm font-bold font-mono text-green-400">{fmt(totalGeral)}</p>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <p className="text-sm font-bold font-mono text-primary">{fmt(comissaoGeral)}</p>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Gestão / Cadastro ── */}
        {tab === 'gestao' && (
          <div className="space-y-4">
            <div className="recipe-card">
              <div className="recipe-card-header">
                <div className="flex items-center gap-2">
                  <Plus size={14} className="text-text-muted" />
                  <span className="text-sm font-semibold text-text-primary">Adicionar vendedor</span>
                </div>
              </div>
              <div className="p-5">
                <form onSubmit={adicionarVendedor} className="flex gap-2">
                  <input
                    value={novoNome}
                    onChange={e => setNovoNome(e.target.value)}
                    placeholder="Nome completo do vendedor"
                    className="input flex-1"
                  />
                  <button
                    type="submit"
                    disabled={salvando || !novoNome.trim()}
                    className="btn-primary disabled:opacity-50"
                  >
                    <Plus size={15} />
                    {salvando ? '...' : 'Adicionar'}
                  </button>
                </form>
              </div>
            </div>

            <div className="recipe-card">
              <div className="recipe-card-header">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-text-muted" />
                  <span className="text-sm font-semibold text-text-primary">Vendedores cadastrados</span>
                </div>
                <span className="badge bg-white/5 border border-border text-text-muted">{cadastro.length}</span>
              </div>
              {cadastro.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8 font-medium">Nenhum vendedor cadastrado.</p>
              ) : (
                <div className="divide-y divide-border">
                  {cadastro.map(v => (
                    <div key={v.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">{v.nome.charAt(0).toUpperCase()}</span>
                        </div>
                        <p className="text-sm font-medium text-text-primary">{v.nome}</p>
                      </div>
                      <button
                        onClick={() => removerVendedor(v.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-all"
                        title="Remover"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
