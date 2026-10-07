const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { FeesService } = require('../dist/modules/fees/fees.service');

describe('FeesService', () => {
  it('calculates a percentage fee and applies minimum and maximum limits', async () => {
    const prisma = { fee: { findUnique: async () => ({
      isActive: true, amount: null, rate: 10,
      rules: { minimumMilli: '20000', maximumMilli: '50000', planIds: [], userIds: [], dealerIds: [] },
    }) } };
    const fees = new FeesService(prisma);

    assert.equal(await fees.resolveMilli('auction.listing', { baseMilli: 100000n }), 20000n);
    assert.equal(await fees.resolveMilli('auction.listing', { baseMilli: 1000000n }), 50000n);
  });

  it('does not apply a scoped fee to another user', async () => {
    const prisma = { fee: { findUnique: async () => ({
      isActive: true, amount: 25000n, rate: null,
      rules: { userIds: ['allowed-user'], planIds: [], dealerIds: [] },
    }) } };
    const fees = new FeesService(prisma);

    assert.equal(await fees.resolveMilli('inspection.request', { userId: 'another-user' }), null);
  });
});
