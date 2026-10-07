const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { PaymentsService } = require('../dist/modules/payments/payments.service');

describe('PaymentsService', () => {
  it('returns a registered provider adapter', () => {
    const service = new PaymentsService();

    assert.equal(service.getProvider('yesser-pay').code, 'yesser-pay');
  });

  it('rejects providers that are not registered', () => {
    const service = new PaymentsService();

    assert.throws(
      () => service.getProvider('unknown-provider'),
      /Unsupported payment provider/,
    );
  });

  it('keeps unconfigured providers disabled', async () => {
    const service = new PaymentsService();
    const provider = service.getProvider('mobicash');

    await assert.rejects(
      provider.createPayment({}),
      /official provider documentation/,
    );
  });
});
