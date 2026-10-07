import { cookies } from 'next/headers';

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get('admin_refresh')?.value;
  if (refreshToken) {
    await fetch(`${process.env.API_URL ?? 'http://localhost:4100'}/v1/auth/logout`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }),
    }).catch(() => null);
  }
  store.delete('admin_access');
  store.delete('admin_refresh');
  return Response.json({ success: true });
}
