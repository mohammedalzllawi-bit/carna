import { cookies } from 'next/headers';
import { refreshAdminSession } from './admin-session';

const apiUrl = process.env.API_URL ?? 'http://localhost:4100';

export async function proxyAdminApi(path: string, init: RequestInit = {}) {
  const store = await cookies();
  let accessToken = store.get('admin_access')?.value;
  if (!accessToken && store.get('admin_refresh')?.value) accessToken = await refreshAdminSession();
  if (!accessToken) {
    return Response.json({ message: 'admin.session_required' }, { status: 401 });
  }

  try {
    const send = (token: string) => {
      const headers = new Headers(init.headers);
      if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      headers.set('authorization', `Bearer ${token}`);
      return fetch(`${apiUrl}${path}`, { ...init, cache: 'no-store', headers });
    };
    let response = await send(accessToken);
    if (response.status === 401) {
      const rotated = await refreshAdminSession();
      if (rotated) response = await send(rotated);
    }
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
        'cache-control': response.headers.get('cache-control') ?? 'no-store',
      },
    });
  } catch {
    return Response.json({ message: 'تعذر الاتصال بخادم API' }, { status: 503 });
  }
}
