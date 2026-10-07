const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { AuctionLifecycleService } = require('../dist/modules/auctions/auction-lifecycle.service');

function fixture(bids, reservePrice = null) {
  const calls = { status: null, order: null, unlocked: false, broadcast: null, notices: [] };
  const auction = {
    id: 'a1', vehicleId: 'v1', version: 0, status: 'Live',
    startsAt: new Date(Date.now() - 180000), endsAt: new Date(Date.now() - 1000),
    startingPrice: 100000n, bidIncrement: 5000n, reservePrice, result: null,
    vehicle: { ownerUserId: 'owner', dealer: null },
    ruleSnapshot: { depositBasisPoints: 1000, buyerFeeMilli: 2000,
      paymentDeadlineMinutes: 120, fallbackWinners: 2, autoRelist: false },
  };
  const tx = {
    auction: {
      findUnique: async () => auction,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => { calls.status = data.status; },
    },
    bid: { findMany: async () => bids },
    auctionResult: { upsert: async () => ({}) },
    order: { create: async ({ data }) => { calls.order = data; } },
    notification: { create: async ({ data }) => { calls.notices.push(data); } },
    vehicle: { update: async () => { calls.unlocked = true; } },
    auditLog: { create: async () => ({}) },
  };
  const service = new AuctionLifecycleService(
    { $transaction: (fn) => fn(tx) }, {}, { broadcastStatus: (_id, event) => { calls.broadcast = event; } },
  );
  return { service, calls };
}

describe('auction settlement', () => {
  it('ends without a winner and releases the vehicle when nobody bids', async () => {
    const { service, calls } = fixture([]);
    assert.equal((await service.settle('a1')).status, 'NoWinner');
    assert.equal(calls.status, 'NoWinner');
    assert.equal(calls.unlocked, true);
    assert.equal(calls.order, null);
    assert.equal(calls.broadcast.status, 'NoWinner');
    assert.equal(calls.notices[0].userId, 'owner');
  });
  it('does not award a vehicle below its reserve', async () => {
    const { service, calls } = fixture([{ bidderId: 'buyer', amount: 120000n }], 150000n);
    assert.equal((await service.settle('a1')).status, 'NoWinner');
    assert.equal(calls.order, null);
    assert.equal(calls.unlocked, true);
  });
  it('creates a deposit order after the reserve is met', async () => {
    const { service, calls } = fixture([{ bidderId: 'buyer', amount: 200000n }], 150000n);
    assert.equal((await service.settle('a1')).status, 'PaymentPending');
    assert.equal(calls.order.total, 22000n);
    assert.equal(calls.order.userId, 'buyer');
    assert.equal(calls.unlocked, false);
  });
});
