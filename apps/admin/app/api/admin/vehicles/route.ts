import { proxyAdminApi } from '../../../../lib/api-proxy';

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyAdminApi(`/v1/admin/vehicles${query}`);
}

export async function POST(request: Request) {
  return proxyAdminApi('/v1/admin/vehicles', {
    method: 'POST',
    body: await request.text(),
  });
}
