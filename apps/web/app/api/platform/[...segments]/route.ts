import { cookies } from 'next/headers';

type Context = { params: Promise<{ segments: string[] }> };
const api = process.env.API_URL ?? 'http://localhost:4100';

async function handle(request: Request, context: Context) {
  const { segments } = await context.params;
  const phoneOtp = segments.length === 3 && segments[0] === 'auth' && segments[1] === 'phone' &&
    ['request-otp', 'verify-otp'].includes(segments[2]);
  if ((!phoneOtp && !['catalog', 'auctions', 'auction-listings', 'dealer', 'dealers', 'technicians', 'settings', 'media', 'wallet', 'payments', 'notifications', 'account', 'listings', 'listing-chats', 'workspace', 'subscriptions', 'content'].includes(segments[0])) || segments.includes('webhooks')) {
    return Response.json({ message: 'not_found' }, { status: 404 });
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ message: 'invalid_origin' }, { status: 403 });
  }
  const store = await cookies();
  let token = store.get('access_token')?.value;
  const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data') === true;
  const rawBody = ['GET', 'HEAD'].includes(request.method) ? undefined : multipart ? await request.formData() : await request.text();
  const body = rawBody === '' ? undefined : rawBody;
  const send = () => {
    const headers = new Headers(token ? { authorization: `Bearer ${token}` } : undefined);
    if (!multipart && body !== undefined) headers.set('content-type', 'application/json');
    return fetch(`${api}/v1/${segments.map(encodeURIComponent).join('/')}${new URL(request.url).search}`, {
      method: request.method, body, cache: 'no-store', headers,
    });
  };
  try {
    let upstream = await send();
    const refreshToken = store.get('refresh_token')?.value;
    const failure = upstream.status === 401 ? await upstream.clone().json().catch(() => null) as { message?: string } | null : null;
    const refreshable = ['auth.access_token_invalid', 'auth.access_token_required', 'auth.session_revoked', 'auth.session_required'];
    if (upstream.status === 401 && refreshToken && refreshable.includes(failure?.message ?? '')) {
      const response = await fetch(`${api}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }), cache: 'no-store' });
      if (response.ok) {
        const auth = await response.json();
        token = auth.accessToken;
        const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
        store.set('access_token', auth.accessToken, { ...options, maxAge: auth.accessExpiresIn });
        store.set('refresh_token', auth.refreshToken, { ...options, maxAge: auth.refreshExpiresIn });
        upstream = await send();
      }
    }
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': upstream.headers.get('cache-control') ?? 'no-store',
    } });
  } catch { return Response.json({ message: 'platform.unavailable' }, { status: 503 }); }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
