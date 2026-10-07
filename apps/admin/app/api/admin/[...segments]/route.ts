import { proxyAdminApi } from '../../../../lib/api-proxy';

type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: Request, context: Context) {
  const { segments } = await context.params;
  if (!['auctions', 'auction-listings', 'dealers', 'roles', 'audit', 'payments', 'wallet', 'technicians', 'notifications', 'messages', 'subscriptions', 'content', 'requests', 'reviews'].includes(segments[0])) return Response.json({ message: 'not_found' }, { status: 404 });
  const path = `/v1/admin/${segments.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
  return proxyAdminApi(path, { method: request.method, ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: await request.text() }) });
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
