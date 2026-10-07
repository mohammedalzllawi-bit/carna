import { proxyAdminApi } from '../../../../../lib/api-proxy';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyAdminApi(`/v1/admin/technicians/${encodeURIComponent(id)}`);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyAdminApi(`/v1/admin/technicians/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: await request.text(),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyAdminApi(`/v1/admin/technicians/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
