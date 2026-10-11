const assert = require('node:assert/strict');
const { test } = require('node:test');
const { publicApiOrigin, checkMobileApi } = require('../scripts/check-mobile-api.cjs');

test('online API configuration requires an explicit public HTTPS origin', () => {
  assert.equal(publicApiOrigin('https://api.example.com/'), 'https://api.example.com');
  for (const value of [undefined, '', 'not-a-url', 'http://api.example.com', 'https://localhost',
    'https://api.local', 'https://api.railway.internal', 'https://192.168.50.129', 'https://[::1]',
    'https://user:password@api.example.com', 'https://api.example.com/v1', 'https://api.example.com?key=secret']) {
    assert.throws(() => publicApiOrigin(value));
  }
});

test('the preflight verifies API routes with a read-only HTTPS request', async () => {
  const origin = await checkMobileApi('https://api.example.com/', async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/docs-json');
    assert.equal(options.method, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ paths: { '/v1/auth/login': { post: {} }, '/v1/catalog/home': { get: {} } } });
  });
  assert.equal(origin, 'https://api.example.com');
});

test('a Web/Admin page, missing API and unrelated JSON cannot pass verification', async () => {
  for (const response of [
    new Response('<html>Web application</html>', { headers: { 'content-type': 'text/html' } }),
    Response.json({ message: 'Not Found' }, { status: 404 }),
    Response.json({ paths: { '/': { get: {} } } }),
    new Response('{invalid', { headers: { 'content-type': 'application/json' } }),
  ]) {
    await assert.rejects(checkMobileApi('https://api.example.com', async () => response));
  }
});

test('a failed network request is not retried and does not expose its details', async () => {
  let calls = 0;
  await assert.rejects(checkMobileApi('https://api.example.com', async () => {
    calls++;
    throw new Error('private network detail');
  }), (error) => !error.message.includes('private network detail'));
  assert.equal(calls, 1);
});

test('invalid configuration never makes a network request', async () => {
  let calls = 0;
  await assert.rejects(checkMobileApi('http://localhost:4100', async () => {
    calls++;
    return Response.json({});
  }));
  assert.equal(calls, 0);
});
