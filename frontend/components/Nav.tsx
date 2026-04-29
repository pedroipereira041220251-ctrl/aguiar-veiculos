'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Car, Users, Bell, Settings,
  LogOut, UserCheck, DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase-browser';

const mainLinks = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/estoque',    label: 'Estoque',     icon: Car },
  { href: '/crm',        label: 'CRM',         icon: Users },
  { href: '/financeiro', label: 'Financeiro',  icon: DollarSign },
  { href: '/vendedores', label: 'Vendedores',  icon: UserCheck },
  { href: '/alertas',    label: 'Alertas',     icon: Bell },
];

const systemLinks = [
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const mobileLinks = [
  { href: '/dashboard',  label: 'Painel',   icon: LayoutDashboard },
  { href: '/estoque',    label: 'Estoque',  icon: Car },
  { href: '/crm',        label: 'CRM',      icon: Users },
  { href: '/alertas',    label: 'Alertas',  icon: Bell },
  { href: '/financeiro', label: 'Finanças', icon: DollarSign },
];

export default function Nav() {
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
    window.location.replace('/login');
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-sidebar-accent hover:text-text-primary',
        )}
      >
        {active && (
          <span className="absolute left-0 inset-y-2 w-[3px] bg-primary rounded-r-full" />
        )}
        <span className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
          active ? 'bg-primary/15' : 'group-hover:bg-white/5',
        )}>
          <Icon className="w-[16px] h-[16px]" strokeWidth={active ? 2.2 : 1.8} />
        </span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <>
      {/* ── Sidebar desktop ── */}
      <aside className="hidden md:flex flex-col w-[240px] bg-sidebar border-r border-border h-screen sticky top-0 flex-shrink-0">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="relative flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Aguiar Veículos"
              width={36}
              height={36}
              className="rounded-xl"
              priority
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-sidebar animate-pulse-dot" />
          </div>
          <div className="min-w-0">
            <p className="text-text-primary font-bold text-sm leading-none truncate">Aguiar Veículos</p>
            <p className="text-text-dim text-2xs mt-1 font-semibold tracking-widest uppercase">Painel de Gestão</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-2xs font-bold uppercase tracking-[0.15em] text-text-dim px-3 mb-2.5">Menu Principal</p>
          {mainLinks.map(link => (
            <NavLink key={link.href} {...link} />
          ))}

          <div className="my-4 border-t border-border" />

          <p className="text-2xs font-bold uppercase tracking-[0.15em] text-text-dim px-3 mb-2.5">Sistema</p>
          {systemLinks.map(link => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-red-400 hover:bg-red-400/8 transition-all group"
          >
            <span className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:bg-red-400/10 transition-colors">
              <LogOut className="w-[16px] h-[16px]" strokeWidth={1.8} />
            </span>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Bottom nav mobile ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-border z-40 nav-safe-bottom">
        <div className="flex">
          {mobileLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center pt-3 pb-4 gap-1 transition-colors min-w-0',
                  active ? 'text-primary' : 'text-text-muted',
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] font-medium truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
