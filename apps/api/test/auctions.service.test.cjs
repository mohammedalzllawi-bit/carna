const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { AuctionsService } = require('../dist/modules/auctions/auctions.service');

function fixture(override = {}, userOverride = {}) {
  const auction = { id: 'a1', vehicleId: 'v1', version: 0, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 30000),
    status: 'Live', startingPrice: 10000n, currentBidAmount: 10000n, bidIncrement: 500n, maxBidAmount: null,
    antiSnipingWindowSeconds: 60, antiSnipingExtensionSeconds: 120, bidCount: 1,
    vehicle: { ownerUserId: 'owner', dealer: null, approvalStatus: 'Published', deletedAt: null }, ...override };
  let update;
  const tx = {
    bid: { findUnique: async () => null, updateMany: async () => ({ count: 1 }), create: async ({ data }) => ({ id: 'b1', ...data }) },
    user: { findUnique: async () => ({ status: 'Active', phoneVerifiedAt: new Date(), deletedAt: null, ...userOverride }) },
    walletAccount: { findUnique: async () => ({ id: 'w1', version: 0, balance: 100000n }), updateMany: async () => ({ count: 1 }) },
    auction: { findUnique: async () => auction, updateMany: async ({ data }) => { update = data; return { count: 1 }; }, findUniqueOrThrow: async () => ({ ...auction, endsAt: update.endsAt, bidCount: 2 }) },
    vehicle: { update: async () => ({}) }, bidHistory: { create: async () => ({}) }, auditLog: { create: async () => ({}) }, notification: { create: async () => ({}) },
  };
  return { auction, service: new AuctionsService({ $transaction: (fn) => fn(tx) }), tx, update: () => update };
}

describe('auction eligibility and money', () => {
  it('extends an ending auction inside the transaction', async () => {
    const f = fixture(); const result = await f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n });
    assert.equal(result.extended, true); assert.equal(f.update().endsAt.getTime(), f.auction.endsAt.getTime() + 120000);
  });
  it('rejects the vehicle owner', async () => { const f = fixture(); await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'owner', amount: 10500n }), /owner_cannot_bid/); });
  it('rejects dealer staff', async () => { const f = fixture({ vehicle: { approvalStatus: 'Published', dealer: { status: 'Verified', ownerUserId: 'owner', staff: [{ userId: 'staff' }] } } }); await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'staff', amount: 10500n }), /owner_cannot_bid/); });
  it('rejects blocked users', async () => { const f = fixture({}, { status: 'Banned' }); await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n }), /bidder_not_eligible/); });
  it('rejects a closed auction', async () => { const f = fixture({ endsAt: new Date(Date.now() - 1) }); await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n }), /auction.ended/); });
  it('rejects a bid under the minimum increment', async () => { const f = fixture(); await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10499n }), /below_minimum_increment/); });
  it('accepts the starting price for the first bid', async () => { const f = fixture({ currentBidAmount: null, bidCount: 0 }); assert.equal((await f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10000n })).amountLyd, 10); });
  it('uses exact three-decimal money', () => { const f = fixture(); assert.equal(f.service.lydToMilli('0.029'), 29n); assert.throws(() => f.service.lydToMilli('1.0001'), /money.invalid/); });
  it('resets a rolling round to two minutes after each accepted bid', async () => {
    const f = fixture({ ruleSnapshot: { rollingRound: true, roundSeconds: 120 } });
    const before = Date.now();
    await f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n });
    assert.ok(f.update().endsAt.getTime() >= before + 120000);
    assert.ok(f.update().endsAt.getTime() <= Date.now() + 120000);
  });
  it('requires the configured wallet balance before accepting a bid', async () => {
    const f = fixture();
    f.tx.walletAccount.findUnique = async () => ({ balance: 99999n });
    await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n }), /wallet_balance_required/);
    assert.equal(f.update(), undefined);
  });
  it('rejects a wallet balance changed during the bid transaction', async () => {
    const f = fixture();
    f.tx.walletAccount.updateMany = async () => ({ count: 0 });
    await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n }), /wallet_balance_changed/);
    assert.equal(f.update(), undefined);
  });
  it('uses the reserve price for percentage-based wallet eligibility', async () => {
    const f = fixture({ reservePrice: 200000n });
    f.service.settings = { get: async (key) => ({
      'auction.section_state': 'Open', 'auction.bid_wallet_mode': 'Percentage',
      'auction.bid_wallet_fixed_milli': 100000, 'auction.bid_wallet_basis_points': 5000,
    })[key] };
    f.tx.walletAccount.findUnique = async () => ({ balance: 99999n });
    await assert.rejects(f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n }), /wallet_balance_required/);
    f.tx.walletAccount.findUnique = async () => ({ id: 'w1', version: 0, balance: 100000n });
    await f.service.placeBid({ auctionId: 'a1', bidderId: 'bidder', amount: 10500n });
    assert.equal(f.update().currentBidAmount, 10500n);
  });
});

describe('seller cancellation after settlement', () => {
  function cancellationFixture(status = 'NoWinner') {
    let changed = false;
    const auction = { id: 'a1', status, version: 2, result: { reserveMet: false },
      vehicle: { ownerUserId: 'owner', dealer: null } };
    const tx = {
      auction: { findUnique: async () => auction, updateMany: async () => { changed = true; return { count: 1 }; } },
      auctionResult: { update: async () => ({}) }, auditLog: { create: async () => ({}) },
    };
    return { service: new AuctionsService({ $transaction: (fn) => fn(tx) }), changed: () => changed };
  }
  it('lets only the seller cancel a settled auction without a winner', async () => {
    const f = cancellationFixture();
    await assert.rejects(f.service.cancelNoWinner('a1', 'bidder'), /seller_required/);
    assert.equal(f.changed(), false);
    assert.equal((await f.service.cancelNoWinner('a1', 'owner')).status, 'Cancelled');
    assert.equal(f.changed(), true);
  });
  it('does not let the seller cancel a result awaiting payment', async () => {
    const f = cancellationFixture('PaymentPending');
    await assert.rejects(f.service.cancelNoWinner('a1', 'owner'), /cannot_cancel_result/);
    assert.equal(f.changed(), false);
  });
});
