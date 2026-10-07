import { proxyAdminApi } from '../../../../lib/api-proxy';

export async function GET() {
  return proxyAdminApi('/v1/admin/technicians');
}

export async function POST(request: Request) {
  return proxyAdminApi('/v1/admin/technicians', {
    method: 'POST',
    body: await request.text(),
  });
}
