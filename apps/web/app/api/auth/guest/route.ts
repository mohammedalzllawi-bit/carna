import { NextResponse } from 'next/server';
import { callAuthApi, forwardError } from '../../../../lib/auth-server';

export async function POST() {
  const upstream = await callAuthApi('/v1/auth/guest', {});
  if (!upstream?.ok) return forwardError(upstream);
  const response = NextResponse.json(await upstream.json());
  response.cookies.set('guest_mode', '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  response.cookies.set('access_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  response.cookies.set('refresh_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
