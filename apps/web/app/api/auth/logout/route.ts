import { cookies } from 'next/headers';
import { callAuthApi, clearAuthResponse } from '../../../../lib/auth-server';

export async function POST() {
  const refreshToken = (await cookies()).get('refresh_token')?.value;
  await callAuthApi('/v1/auth/logout', { refreshToken });
  const response = clearAuthResponse();
  response.cookies.set('guest_mode', '', { path: '/', maxAge: 0 });
  return response;
}
