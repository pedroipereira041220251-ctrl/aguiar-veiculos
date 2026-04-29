'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [senha, setSenha]     = useState('');
  const [erro, setErro]       = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro('E-mail ou senha inválidos.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/5 blur-[140px]" />
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-primary/3 blur-[100px]" />
      </div>

      <div className="w-full max-w-[380px] animate-fade-in relative z-10">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-card border border-border shadow-glow-red mb-5 relative">
            <Image src="/logo.png" alt="Aguiar Veículos" width={56} height={56} className="rounded-xl" priority />
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent border-2 border-background animate-pulse-dot" />
          </div>
          <p className="text-2xs font-bold text-text-dim uppercase tracking-[0.2em] mb-2">Painel de Gestão</p>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Aguiar Veículos</h1>
          <p className="text-sm text-text-muted mt-1">Acesso restrito à equipe interna</p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Autenticação</p>
          </div>
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="senha" className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>

            {erro && (
              <div className="flex items-start gap-2 bg-red-400/8 border border-red-400/20 px-3 py-2.5 rounded-lg">
                <div className="w-1 h-full min-h-[16px] bg-red-400 rounded-full flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary hover:bg-primary-light text-white font-bold rounded-xl text-sm tracking-wide transition-all shadow-glow-red hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verificando...' : 'Entrar no painel'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-dim text-2xs mt-6 font-semibold tracking-widest uppercase">
          Aguiar Veículos · Sistema Interno
        </p>
      </div>
    </main>
  );
}
