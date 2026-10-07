import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ message: 'admin.invalid_origin' }, { status: 403 });
  }
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/admin-session/')) return NextResponse.next();
  const hasSession = Boolean(request.cookies.get('admin_access')?.value || request.cookies.get('admin_refresh')?.value);
  if (!hasSession) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ message: 'admin.session_required' }, { status: 401 });
    const login = new URL('/login', request.url);
    login.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
