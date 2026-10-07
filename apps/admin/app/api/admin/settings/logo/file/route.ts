import { proxyAdminApi } from '../../../../../../lib/api-proxy';

export async function GET() {
  const settingsResponse = await proxyAdminApi('/v1/settings/public');
  if (!settingsResponse.ok) return settingsResponse;
  const settings = await settingsResponse.json() as Record<string, unknown>;
  const logoUrl = settings['platform.logo_url'];
  if (typeof logoUrl !== 'string' || !logoUrl.startsWith('/v1/settings/logo/')) {
    return new Response(null, { status: 404 });
  }
  return proxyAdminApi(logoUrl);
}
