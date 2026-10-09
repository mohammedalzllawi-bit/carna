const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { Test } = require('@nestjs/testing');
const { VersioningType } = require('@nestjs/common');
const { APP_GUARD } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const helmet = require('helmet');
const { SystemModule } = require('../dist/modules/system/system.module');
const { PlatformAccessGuard } = require('../dist/modules/settings/platform-access.guard');

let app;
let base;
const unavailable = () => { throw new Error('System routes must not access settings, authentication or databases'); };

before(async () => {
  const module = await Test.createTestingModule({
    imports: [SystemModule],
    providers: [{ provide: APP_GUARD, useValue: new PlatformAccessGuard(
      { get: unavailable }, { canActivate: unavailable },
    ) }],
  }).compile();
  app = module.createNestApplication(new ExpressAdapter(), { logger: false });
  app.use(helmet());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => { if (app) await app.close(); });

test('GET / identifies the backend without authentication or leaking configuration', async () => {
  const response = await fetch(base + '/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    service: 'Carna API',
    type: 'backend',
    message: 'This is the API service. The web and admin applications use separate URLs.',
    documentation: '/api/docs',
    health: '/health',
  });
});

test('GET /health is version-neutral and works without external services or platform settings', async () => {
  const response = await fetch(base + '/health?probe=railway');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { service: 'Carna API', status: 'ok', check: 'liveness' });
});

test('HEAD /health returns 200 without a response body', async () => {
  const response = await fetch(base + '/health', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('system responses keep Helmet security headers and do not broaden the CSP', async () => {
  for (const path of ['/', '/health']) {
    const response = await fetch(base + path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.doesNotMatch(policy, /media-src[^;]*(?:\*|data:)/);
    await response.body.cancel();
  }
});

test('system routes do not swallow missing URLs, wrong versions or unsupported methods', async () => {
  for (const path of ['/not-a-route', '/v1/health', '/v1']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    await response.body.cancel();
  }
  const response = await fetch(base + '/health', { method: 'POST' });
  assert.equal(response.status, 404);
  await response.body.cancel();
});
