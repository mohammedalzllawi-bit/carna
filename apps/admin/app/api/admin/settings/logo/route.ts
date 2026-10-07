import { proxyAdminApi } from '../../../../../lib/api-proxy';

export async function POST(request: Request) {
  return proxyAdminApi('/v1/admin/settings/logo', {
    method: 'POST',
    body: await request.formData(),
  });
}

export async function DELETE() {
  return proxyAdminApi('/v1/admin/settings/logo', { method: 'DELETE' });
}
