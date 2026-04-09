import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Deixa passar: rotas de API e arquivos estáticos
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const isLoginPage = pathname === '/login';

  // Verifica presença de cookie de sessão do Supabase
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.includes('auth-token'),
  );

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|icons?|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
