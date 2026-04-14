'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Car, Users, Bell, Settings, LogOut, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase-browser';
import { useState } from 'react';

const links = [
  { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/estoque',       label: 'Estoque',      icon: Car },
  { href: '/crm',           label: 'CRM',          icon: Users },
  { href: '/vendedores',    label: 'Vendedores',   icon: UserCheck },
  { href: '/alertas',       label: 'Alertas',      icon: Bell },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Deletar cookies sb-* manualmente para garantir que o middleware não veja sessão
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
    window.location.replace('/login');
  }

  return (
    <>
      {/* ── Sidebar desktop ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-sidebar border-r border-border transition-all duration-200 h-screen sticky top-0 flex-shrink-0',
          collapsed ? 'w-[60px]' : 'w-56',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center border-b border-border',
          collapsed ? 'justify-center px-2 py-4' : 'px-4 py-4',
        )}>
          <div className={cn(
            'flex items-center gap-2.5 overflow-hidden',
            collapsed && 'justify-center',
          )}>
            <Image src="/logo.png" alt="Aguiar Veículos" width={32} height={32} className="rounded-lg flex-shrink-0" />
            {!collapsed && (
              <div>
                <p className="font-semibold text-text-primary text-sm leading-tight">Aguiar Veículos</p>
                <p className="text-xs text-text-muted">Painel de gestão</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 py-2.5 rounded-lg transition-all text-sm relative group',
                  collapsed ? 'justify-center px-2' : 'px-3',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-muted hover:bg-sidebar-accent hover:text-text-primary',
                )}
              >
                {active && !collapsed && (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
                )}
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}

                {collapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-card border border-border rounded-md text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border">
          <button
            onClick={handleLogout}
            title={collapsed ? 'Sair' : undefined}
            className={cn(
              'flex items-center gap-3 w-full py-3 text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors text-sm',
              collapsed ? 'justify-center px-2' : 'px-4',
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center gap-3 w-full py-3 border-t border-border text-text-muted hover:text-text-primary transition-colors',
              collapsed ? 'justify-center' : 'px-4',
            )}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <>
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-xs">Recolher</span>
                </>
            }
          </button>
        </div>
      </aside>

      {/* ── Bottom nav mobile ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-border flex z-40">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-text-muted',
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
