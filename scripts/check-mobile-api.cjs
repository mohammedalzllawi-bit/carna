const { isIP } = require('node:net');

function publicApiOrigin(value) {
  if (!value) throw new Error('Provide the public API origin as an argument or API_BASE_URL.');
  let url;
  try { url = new URL(value); } catch { throw new Error('API_BASE_URL must be a valid HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a public HTTPS origin without credentials, query parameters or a path.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host) || isIP(host)) {
    throw new Error('Online builds require a public API hostname, not a laptop, emulator or IP address.');
  }
  return url.origin;
}

async function checkMobileApi(value, request = fetch) {
  const origin = publicApiOrigin(value);
  let response;
  try {
    response = await request(`${origin}/api/docs-json`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new Error('Cannot reach the public API over HTTPS. Check its Railway deployment and domain.');
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`GET /api/docs-json did not return API JSON (HTTP ${response.status}). This may be a Web/Admin URL, not the backend.`);
  }
  let specification;
  try { specification = await response.json(); } catch { throw new Error('The API returned invalid JSON.'); }
  if (!specification?.paths?.['/v1/auth/login']?.post || !specification?.paths?.['/v1/catalog/home']?.get) {
    throw new Error('The public service does not expose the authentication and catalog API used by the mobile app.');
  }
  return origin;
}

if (require.main === module) {
  checkMobileApi(process.argv[2] || process.env.API_BASE_URL)
    .then((origin) => {
      console.log(`Mobile API verified: ${origin}`);
      console.log(`Rebuild Flutter with --dart-define=API_BASE_URL=${origin}; updating .env or Railway does not update an installed APK.`);
    })
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { publicApiOrigin, checkMobileApi };
