import { cookies } from 'next/headers';

const apiUrl = process.env.API_URL ?? 'http://localhost:4100';
type Tokens = { accessToken: string; refreshToken: string; accessExpiresIn: number; refreshExpiresIn: number };

export async function saveAdminSession(tokens: Tokens) {
  const store = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
  store.set('admin_access', tokens.accessToken, { ...options, maxAge: tokens.accessExpiresIn });
  store.set('admin_refresh', tokens.refreshToken, { ...options, maxAge: tokens.refreshExpiresIn });
}

export async function refreshAdminSession(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get('admin_refresh')?.value;
  if (!token) return;
  try {
    const response = await fetch(`${apiUrl}/v1/auth/refresh`, {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (!response.ok) return;
    const auth = await response.json() as Tokens;
    await saveAdminSession(auth);
    return auth.accessToken;
  } catch { return; }
}
