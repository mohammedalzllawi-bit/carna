import { proxyAdminApi } from '../../../../lib/api-proxy';

export async function GET() {
  return proxyAdminApi('/v1/admin/cities');
}

export async function POST(request: Request) {
  return proxyAdminApi('/v1/admin/cities', {
    method: 'POST',
    body: await request.text(),
  });
}
