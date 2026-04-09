'use client';

import { useState } from 'react';
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
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg shadow-primary/30">
            <span className="text-white text-3xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Aguiar Veículos</h1>
          <p className="text-sm text-text-muted mt-1">Painel de gestão</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">
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
              className="w-full px-3.5 py-2.5 bg-white/5 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-text-primary mb-1.5">
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
              className="w-full px-3.5 py-2.5 bg-white/5 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-xl">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary hover:bg-primary-light text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
