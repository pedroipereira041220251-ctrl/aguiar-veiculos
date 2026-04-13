'use client';

import { useEffect, useState } from 'react';
import { api, type VendedorResumo, type VendaVendedor } from '@/lib/api';
import { fmt } from '@/lib/utils';
import { UserCheck, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<VendedorResumo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(false);
  const [aberto, setAberto]         = useState<string | null>(null);
  const [vendas, setVendas]         = useState<Record<string, VendaVendedor[]>>({});
  const [loadingVendas, setLoadingVendas] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setErro(false);
    try {
      const data = await api.vendedores.listar();
      setVendedores(data);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function toggleVendedor(nome: string) {
    if (aberto === nome) { setAberto(null); return; }
    setAberto(nome);
    if (vendas[nome]) return;
    setLoadingVendas(nome);
    try {
      const data = await api.vendedores.vendas(nome);
      setVendas(p => ({ ...p, [nome]: data }));
    } catch { /* silencia */ } finally {
      setLoadingVendas(null);
    }
  }

  const totalGeral = vendedores.reduce((s, v) => s + v.total_vendas, 0);
  const comissaoGeral = vendedores.reduce((s, v) => s + v.comissao, 0);

  if (loading) return (
    <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-text-muted">Carregando vendedores...</p>
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center">
      <RefreshCw size={32} className="mx-auto text-border mb-3" />
      <p className="text-sm text-text-muted mb-3">Não foi possível carregar os dados.</p>
      <button onClick={carregar} className="text-sm text-primary font-medium hover:underline">
        Tentar novamente
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Vendedores</h1>
          <p className="text-xs text-text-muted mt-0.5">Comissão = 10% do valor de venda</p>
        </div>
        {vendedores.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-text-muted">Total em comissões</p>
            <p className="text-base font-bold text-primary">{fmt(comissaoGeral)}</p>
          </div>
        )}
      </div>

      {vendedores.length === 0 ? (
        <div className="text-center py-16">
          <UserCheck size={48} className="mx-auto text-border mb-3" />
          <p className="text-sm text-text-muted">Nenhuma venda com vendedor cadastrado ainda.</p>
          <p className="text-xs text-text-muted/60 mt-1">Informe o nome do vendedor ao registrar uma venda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Totais gerais */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted">Vendedores</p>
              <p className="text-lg font-bold text-text-primary">{vendedores.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted">Vendas totais</p>
              <p className="text-lg font-bold text-text-primary">
                {vendedores.reduce((s, v) => s + v.qtd_vendas, 0)}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted">Receita total</p>
              <p className="text-sm font-bold text-green-400">{fmt(totalGeral)}</p>
            </div>
          </div>

          {/* Lista de vendedores */}
          {vendedores.map(v => (
            <div key={v.nome_vendedor} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header do vendedor */}
              <button
                onClick={() => toggleVendedor(v.nome_vendedor)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {v.nome_vendedor.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{v.nome_vendedor}</p>
                  <p className="text-xs text-text-muted">
                    {v.qtd_vendas} venda{v.qtd_vendas !== 1 ? 's' : ''} · {fmt(v.total_vendas)} em receita
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-text-muted">Comissão</p>
                  <p className="text-sm font-bold text-primary">{fmt(v.comissao)}</p>
                </div>
                <div className="ml-2 text-text-muted">
                  {aberto === v.nome_vendedor
                    ? <ChevronUp size={16} />
                    : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Vendas do vendedor */}
              {aberto === v.nome_vendedor && (
                <div className="border-t border-border">
                  {loadingVendas === v.nome_vendedor ? (
                    <p className="text-xs text-text-muted text-center py-4">Carregando...</p>
                  ) : (vendas[v.nome_vendedor] || []).length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-4">Nenhuma venda encontrada.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-white/5">
                        <p className="text-[10px] font-semibold text-text-muted uppercase">Veículo</p>
                        <p className="text-[10px] font-semibold text-text-muted uppercase">Data</p>
                        <p className="text-[10px] font-semibold text-text-muted uppercase text-right">Valor</p>
                        <p className="text-[10px] font-semibold text-text-muted uppercase text-right">Comissão</p>
                      </div>
                      {(vendas[v.nome_vendedor] || []).map(venda => (
                        <div key={venda.id} className="grid grid-cols-4 gap-2 px-4 py-2.5 hover:bg-white/5 transition-colors">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-primary truncate">
                              {venda.modelo} {venda.ano}
                            </p>
                            <p className="text-[10px] text-text-muted font-mono">{venda.placa}</p>
                          </div>
                          <p className="text-xs text-text-muted self-center">
                            {venda.data_venda
                              ? venda.data_venda.split('-').reverse().join('/')
                              : '—'}
                          </p>
                          <p className="text-xs font-semibold text-green-400 text-right self-center">
                            {venda.preco_venda_final ? fmt(venda.preco_venda_final) : '—'}
                          </p>
                          <p className={cn(
                            'text-xs font-bold text-right self-center',
                            venda.comissao > 0 ? 'text-primary' : 'text-text-muted',
                          )}>
                            {venda.comissao > 0 ? fmt(venda.comissao) : '—'}
                          </p>
                        </div>
                      ))}
                      {/* Subtotal do vendedor */}
                      <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-white/5">
                        <p className="col-span-2 text-xs font-bold text-text-primary">Total</p>
                        <p className="text-xs font-bold text-green-400 text-right">{fmt(v.total_vendas)}</p>
                        <p className="text-xs font-bold text-primary text-right">{fmt(v.comissao)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
