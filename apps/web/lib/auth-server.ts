import { NextResponse } from 'next/server';

const apiUrl = process.env.API_URL ?? 'http://localhost:4100';

export type AuthResult = {
  user: Record<string, unknown>;
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
};

export async function callAuthApi(path: string, body?: unknown, accessToken?: string) {
  try {
    return await fetch(`${apiUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export function authResponse(auth: AuthResult, status = 200, flat = false) {
  const response = NextResponse.json(flat ? auth.user : { user: auth.user }, { status });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set('access_token', auth.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: auth.accessExpiresIn,
  });
  response.cookies.set('refresh_token', auth.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: auth.refreshExpiresIn,
  });
  response.cookies.set('guest_mode', '', { path: '/', maxAge: 0 });
  return response;
}

export function clearAuthResponse(body: Record<string, unknown> = { success: true }) {
  const response = NextResponse.json(body);
  response.cookies.set('access_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  response.cookies.set('refresh_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

export async function forwardError(response: Response | null) {
  if (!response) return NextResponse.json({ message: 'تعذر الاتصال بخادم المنصة' }, { status: 503 });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
