const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ResalaClient, ResalaApiError } = require('../dist/modules/resala/resala.client');

const config = { baseUrl: 'https://dev.resala.ly/api/v1', token: 'unit-test-token', production: false, serviceName: 'Carna' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ResalaClient', () => {
  it('sends a non-production OTP in test mode with server-only bearer auth', async () => {
    const requests = [];
    const client = new ResalaClient(config, async (url, init) => {
      requests.push({ url, init });
      return json({ id: 'p1', pin: '123456', code: '218', number: '910001234', content: '', created_at: '' }, 201);
    });
    const result = await client.sendPin('+218910001234');
    assert.equal(result.pin, '123456');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/pins\?test&len=6&service_name=Carna$/);
    assert.equal(requests[0].init.headers.authorization, 'Bearer unit-test-token');
    assert.deepEqual(JSON.parse(requests[0].init.body), { phone: '218910001234' });
  });

  it('never retries POST when the connection fails', async () => {
    let calls = 0;
    const client = new ResalaClient(config, async () => { calls += 1; throw new Error('socket closed'); });
    await assert.rejects(client.sendPin('0910001234'), /network request failed/);
    assert.equal(calls, 1);
  });

  it('retries only a failed GET at most twice with exponential backoff', async () => {
    let calls = 0;
    const delays = [];
    const client = new ResalaClient(config, async (url) => {
      calls += 1;
      assert.equal(new URL(url).searchParams.get('filters'), 'source:pin');
      if (calls < 3) throw new Error('temporary network failure');
      return json({ data: [{ status: 'delivered' }], meta: { current_page: 1 } });
    }, async (ms) => { delays.push(ms); });
    const result = await client.sentView({ source: 'pin' });
    assert.equal(result.data[0].status, 'delivered');
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  it('sends approved template records with a template ID and test mode', async () => {
    let request;
    const client = new ResalaClient(config, async (url, init) => { request = { url, init }; return json({ id: 'm1' }, 201); });
    await client.sendTemplate('123e4567-e89b-12d3-a456-426614174000', [{ phone: '0910001234', '$1': 'Carna' }]);
    assert.match(request.url, /send-template\?test&sms_template_id=123e4567-e89b-12d3-a456-426614174000/);
    assert.equal(JSON.parse(request.init.body).records[0].phone, '218910001234');
  });

  it('does not retry insufficient credit, and surfaces validation fields', async () => {
    let calls = 0;
    const credit = new ResalaClient(config, async () => { calls += 1; return json({ message: 'insufficient credit' }, 400); });
    await assert.rejects(credit.sendPin('0910001234'), (error) => error instanceof ResalaApiError && error.status === 400 && /credit/.test(error.message));
    assert.equal(calls, 1);
    const invalid = new ResalaClient(config, async () => json({ errors: { phone: ['invalid number'] } }, 422));
    await assert.rejects(invalid.sendPin('0910001234'), (error) => error.status === 422 && error.fieldErrors.phone[0] === 'invalid number');
  });

  it('explains missing and invalid tokens without exposing them', async () => {
    const missing = new ResalaClient({ ...config, token: undefined }, async () => { throw new Error('must not call HTTP'); });
    await assert.rejects(missing.sendPin('0910001234'), /RESALA_API_TOKEN/);
    const invalid = new ResalaClient(config, async () => json({}, 401));
    await assert.rejects(invalid.sendPin('0910001234'), /RESALA_API_TOKEN/);
  });

  it('reports missing endpoint permission as 403', async () => {
    const forbidden = new ResalaClient(config, async () => json({ message: 'forbidden' }, 403));
    await assert.rejects(forbidden.sendPin('0910001234'), (error) => error instanceof ResalaApiError && error.status === 403 && /permission/.test(error.message));
  });

  it('omits test mode in production', async () => {
    let url;
    const client = new ResalaClient({ ...config, production: true }, async (requestUrl) => {
      url = requestUrl;
      return json({ id: 'p1', pin: '123456' }, 201);
    });
    await client.sendPin('218910001234');
    assert.equal(new URL(url).searchParams.has('test'), false);
  });
});
