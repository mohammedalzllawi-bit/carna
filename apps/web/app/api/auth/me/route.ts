import { cookies } from 'next/headers';
import { authResponse, callAuthApi, forwardError, type AuthResult } from '../../../../lib/auth-server';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;
  if (accessToken) {
    const upstream = await callAuthApi('/v1/auth/me', undefined, accessToken);
    if (upstream?.ok) return Response.json(await upstream.json());
    if (upstream && upstream.status !== 401) return forwardError(upstream);
  }

  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (!refreshToken) {
    const guest = await callAuthApi('/v1/auth/guest', {});
    if (guest?.ok) return Response.json({ mode: 'guest' });
    return Response.json({ message: 'auth.session_required' }, { status: 401 });
  }
  const refreshed = await callAuthApi('/v1/auth/refresh', { refreshToken });
  if (!refreshed?.ok) return forwardError(refreshed);
  return authResponse((await refreshed.json()) as AuthResult, 200, true);
}
