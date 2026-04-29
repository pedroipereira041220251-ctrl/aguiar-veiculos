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

const links = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/estoque',       label: 'Estoque',        icon: Car },
  { href: '/crm',           label: 'CRM',            icon: Users },
  { href: '/financeiro',    label: 'Financeiro',     icon: DollarSign },
  { href: '/vendedores',    label: 'Vendedores',     icon: UserCheck },
  { href: '/alertas',       label: 'Alertas',        icon: Bell },
  { href: '/configuracoes', label: 'Configurações',  icon: Settings },
];

const mobileLinks = links.slice(0, 5);

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

  return (
    <>
      {/* ── Sidebar desktop ── */}
      <aside className="hidden md:flex flex-col w-[220px] bg-sidebar border-r border-border h-screen sticky top-0 flex-shrink-0">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="relative flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Aguiar Veículos"
              width={34}
              height={34}
              className="rounded-xl"
              priority
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-sidebar animate-pulse-dot" />
          </div>
          <div className="min-w-0">
            <p className="text-text-primary font-semibold text-sm leading-none truncate">Aguiar Veículos</p>
            <p className="text-text-muted text-2xs mt-1 font-medium tracking-wide">SISTEMA ONLINE</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-2xs font-semibold uppercase tracking-widest text-text-dim px-2 mb-3">Menu</p>
          {links.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:bg-sidebar-accent hover:text-text-primary',
                )}
              >
                {active && (
                  <span className="absolute left-0 inset-y-1.5 w-[3px] bg-primary rounded-r-full" />
                )}
                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:text-red-400 hover:bg-red-400/8 transition-all"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Bottom nav mobile ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-border z-40 safe-bottom">
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
