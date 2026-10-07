import { proxyAdminApi } from '../../../../lib/api-proxy';

export async function GET() {
  return proxyAdminApi('/v1/admin/settings');
}

export async function PATCH(request: Request) {
  return proxyAdminApi('/v1/admin/settings', { method: 'PATCH', body: await request.text() });
}
