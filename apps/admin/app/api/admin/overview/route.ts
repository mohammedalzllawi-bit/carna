import { proxyAdminApi } from '../../../../lib/api-proxy';

export async function GET() {
  return proxyAdminApi('/v1/admin/overview');
}
