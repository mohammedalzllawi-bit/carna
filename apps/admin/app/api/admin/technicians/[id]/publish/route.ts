import { proxyAdminApi } from '../../../../../../lib/api-proxy';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyAdminApi(`/v1/admin/technicians/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}
