const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const { AuctionsService } = require('../dist/modules/auctions/auctions.service');
const { AuctionLifecycleService } = require('../dist/modules/auctions/auction-lifecycle.service');
const { WalletService } = require('../dist/modules/wallet/wallet.service');
const { PaymentsService } = require('../dist/modules/payments/payments.service');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { SettingsService } = require('../dist/modules/settings/settings.service');
const { DealersService } = require('../dist/modules/dealers/dealers.service');
const { CatalogService } = require('../dist/modules/catalog/catalog.service');

const databaseName = `lca_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const parsedUrl = new URL(process.env.DATABASE_URL);
parsedUrl.pathname = '/' + databaseName;
const url = parsedUrl.toString();
const mongo = new MongoClient(url);
const prisma = new PrismaClient({ datasources: { db: { url } } });
const realtime = { broadcastStatus: () => {}, broadcastBid: () => {} };
const settings = new SettingsService(prisma);
const auctions = new AuctionsService(prisma, realtime, settings);
const lifecycle = new AuctionLifecycleService(prisma, { get: () => 'off' }, realtime);
const wallet = new WalletService(prisma);
let first; let second; let city; let dealerOwnerRole;

before(async () => {
  await mongo.connect();
  const db = mongo.db(databaseName);
  await db.createCollection('Setting');
  await settings.update('auction.bid_wallet_fixed_milli', 0);
  for (const name of ['User', 'Role', 'UserRole', 'RolePermission', 'Permission', 'RefreshSession', 'Dealer', 'DealerPlan', 'DealerSubscription', 'DealerStaff', 'Review', 'City', 'Region', 'Vehicle', 'Auction', 'Bid', 'BidHistory', 'AuditLog', 'Notification', 'Order', 'AuctionResult', 'WalletAccount', 'WalletLedger', 'Payment', 'PaymentTransaction', 'PaymentProvider', 'FraudAlert', 'VehicleSnapshot']) await db.createCollection(name);
  await db.collection('Bid').createIndex({ auctionId: 1, bidderId: 1, idempotencyKey: 1 }, { unique: true });
  await db.collection('AuctionResult').createIndex({ auctionId: 1 }, { unique: true });
  await db.collection('WalletAccount').createIndex({ userId: 1, currency: 1 }, { unique: true });
  await db.collection('WalletLedger').createIndex({ idempotencyKey: 1 }, { unique: true });
  await db.collection('PaymentTransaction').createIndex({ providerEventId: 1 }, { unique: true });
  await db.collection('Dealer').createIndex({ ownerUserId: 1 }, { unique: true });
  await db.collection('Dealer').createIndex({ slug: 1 }, { unique: true });
  await db.collection('DealerPlan').createIndex({ code: 1 }, { unique: true });
  dealerOwnerRole = await prisma.role.create({ data: { code: 'DEALER_OWNER', name: 'Dealer Owner' } });
  city = await prisma.city.create({ data: { nameAr: 'بنغازي', nameEn: 'Benghazi' } });
  first = await prisma.user.create({ data: { passwordHash: 'test-only', status: 'Active', phoneVerifiedAt: new Date(), phone: '+218911111110' } });
  second = await prisma.user.create({ data: { passwordHash: 'test-only', status: 'Active', phoneVerifiedAt: new Date(), phone: '+218911111111' } });
});

after(async () => {
  await prisma.$disconnect();
  assert.match(databaseName, /^lca_test_[a-f0-9]{24}$/);
  await mongo.db(databaseName).dropDatabase();
  await mongo.close();
});

async function createAuction() {
  const vehicle = await prisma.vehicle.create({ data: { lotNumber: randomUUID(), make: 'Test', model: 'Fixture', year: 2025, approvalStatus: 'Published', auctionLocked: true } });
  return prisma.auction.create({ data: { vehicleId: vehicle.id, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000), startingPrice: 100000n, bidIncrement: 10000n, status: 'Live',
    ruleSnapshot: { depositBasisPoints: 1000, buyerFeeMilli: 2500, paymentDeadlineMinutes: 120, fallbackWinners: 2, autoRelist: false } } });
}

test('MongoDB admits exactly one of two simultaneous equal bids', async () => {
  const auction = await createAuction();
  const results = await Promise.allSettled([first, second].map((u) => auctions.placeBid({ auctionId: auction.id, bidderId: u.id, amount: 100000n, idempotencyKey: randomUUID() })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await prisma.bid.count({ where: { auctionId: auction.id } }), 1);
  const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
  assert.equal(stored.currentBidAmount, 100000n); assert.equal(stored.bidCount, 1);
});

test('retrying the same idempotency key does not increase bid count', async () => {
  const auction = await createAuction(); const key = randomUUID();
  const input = { auctionId: auction.id, bidderId: first.id, amount: 100000n, idempotencyKey: key };
  await auctions.placeBid(input); const duplicate = await auctions.placeBid(input);
  assert.equal(duplicate.duplicate, true); assert.equal(await prisma.bid.count({ where: { auctionId: auction.id } }), 1);
  await assert.rejects(auctions.placeBid({ ...input, amount: 110000n }), /idempotency_conflict/);
});

test('winner deadline moves to the second eligible bidder and preserves expired order', async () => {
  const auction = await createAuction();
  await auctions.placeBid({ auctionId: auction.id, bidderId: first.id, amount: 100000n });
  await auctions.placeBid({ auctionId: auction.id, bidderId: second.id, amount: 110000n });
  await prisma.auction.update({ where: { id: auction.id }, data: { endsAt: new Date(Date.now() - 1) } });
  await lifecycle.settle(auction.id);
  const result = await prisma.auctionResult.findUniqueOrThrow({ where: { auctionId: auction.id } });
  assert.equal(result.winnerId, second.id); assert.equal(result.depositAmount, 11000n);
  assert.equal((await prisma.order.findFirst({ where: { referenceId: auction.id } })).total, 13500n);
  await prisma.auctionResult.update({ where: { auctionId: auction.id }, data: { paymentDueAt: new Date(Date.now() - 1) } });
  await lifecycle.settle(auction.id);
  const fallback = await prisma.auctionResult.findUniqueOrThrow({ where: { auctionId: auction.id } });
  assert.equal(fallback.winnerId, first.id); assert.equal(fallback.winnerAttempt, 1);
  assert.equal(await prisma.order.count({ where: { referenceId: auction.id, status: 'Expired' } }), 1);
});

test('no bids creates NoWinner without a payment order', async () => {
  const auction = await createAuction(); await prisma.auction.update({ where: { id: auction.id }, data: { endsAt: new Date(Date.now() - 1) } });
  await lifecycle.settle(auction.id);
  assert.equal((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status, 'NoWinner');
  assert.equal(await prisma.order.count({ where: { referenceId: auction.id } }), 0);
});

test('wallet concurrent debits cannot overdraw the ledger', async () => {
  const userId = (await prisma.user.create({ data: { passwordHash: 'test-only', status: 'Active', phone: '+218911111119' } })).id;
  await prisma.$transaction((tx) => wallet.post(tx, { userId, direction: 'Credit', amount: 100000n, currency: 'LYD', type: 'TestFunding', referenceId: 'test', idempotencyKey: randomUUID() }));
  const results = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => wallet.post(tx, { userId, direction: 'Debit', amount: 80000n, currency: 'LYD', type: 'TestPurchase', referenceId: 'test', idempotencyKey: randomUUID() }))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId, currency: 'LYD' } } })).balance, 20000n);
});

test('verified duplicate payment event posts one receipt and exactly two ledger entries', async () => {
  const auction = await createAuction();
  await auctions.placeBid({ auctionId: auction.id, bidderId: second.id, amount: 100000n });
  await prisma.auction.update({ where: { id: auction.id }, data: { endsAt: new Date(Date.now() - 1) } }); await lifecycle.settle(auction.id);
  const order = await prisma.order.findFirstOrThrow({ where: { referenceId: auction.id, status: 'PaymentPending' } });
  const payment = await prisma.payment.create({ data: { orderId: order.id, userId: second.id, provider: 'test-only', providerTransactionId: 'receipt-1', amount: order.total, status: 'Processing' } });
  const service = new PaymentsService(prisma, wallet);
  service.providers.set('test-only', { code: 'test-only', verifyWebhook: async (input) => {
    if (input.headers['test-signature'] !== 'valid') throw new Error('invalid signature');
    return { providerEventId: 'event-1', providerTransactionId: 'receipt-1', status: 'Paid', amountMilli: order.total.toString(), currency: 'LYD', occurredAt: new Date(), rawEvent: {} };
  } });
  await assert.rejects(service.webhook('test-only', { headers: {}, rawBody: Buffer.from('{}'), parsedBody: {} }), /invalid signature/);
  const input = { headers: { 'test-signature': 'valid' }, rawBody: Buffer.from('{}'), parsedBody: {} };
  await service.webhook('test-only', input); const replay = await service.webhook('test-only', input);
  assert.equal(replay.duplicate, true); assert.equal(await prisma.walletLedger.count({ where: { referenceId: payment.id } }), 2);
  assert.equal((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status, 'Sold');
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'Paid');
});

test('concurrent refresh consumes a refresh token only once', async () => {
  const token = randomUUID().repeat(2);
  await prisma.refreshSession.create({ data: { userId: first.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 600000) } });
  const auth = new AuthService(prisma, { signAsync: async () => 'test-access' }, { get: () => undefined }, {});
  const attempts = await Promise.allSettled([auth.refresh(token, {}), auth.refresh(token, {})]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
});

test('legacy ledger without a reconciled account cannot silently start from zero', async () => {
  const user = await prisma.user.create({ data: { phone: '+218911111112', passwordHash: 'test-only' } });
  await prisma.walletLedger.create({ data: { userId: user.id, direction: 'Credit', amount: 5000n, currency: 'LYD', type: 'LegacyFunding' } });
  await assert.rejects(prisma.$transaction((tx) => wallet.post(tx, { userId: user.id, direction: 'Credit', amount: 1000n, currency: 'LYD', type: 'NewFunding', referenceId: 'test', idempotencyKey: randomUUID() })), /legacy_reconciliation_required/);
  assert.equal(await prisma.walletAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.walletLedger.count({ where: { userId: user.id } }), 1);
});

test('auction creation snapshots rules and uses the configured default increment', async () => {
  await prisma.setting.create({ data: { key: 'auction.bid_increment_milli', value: 75000 } });
  const vehicle = await prisma.vehicle.create({ data: { lotNumber: randomUUID(), make: 'Test', model: 'Defaults', year: 2025, approvalStatus: 'Published' } });
  const service = new AuctionsService(prisma, realtime, new SettingsService(prisma));
  const result = await service.create({ vehicleId: vehicle.id, startingPriceLyd: '1000', startsAt: new Date(Date.now() + 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(result.bidIncrementLyd, 75);
  assert.equal(result.costs.depositLyd, 100);
  assert.equal(await prisma.vehicleSnapshot.count({ where: { vehicleId: vehicle.id } }), 1);
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).auctionLocked, true);
});

test('admin-created dealer can log in and the active plan enforces its vehicle limit', async () => {
  const catalog = new CatalogService(prisma);
  const dealerService = new DealersService(prisma, new SettingsService(prisma), catalog);
  const plan = await prisma.dealerPlan.create({ data: { code: `basic-${randomUUID().slice(0, 6)}`, name: 'Basic', price: 100000n,
    durationDays: 30, vehicleLimit: 1, auctionLimit: 1, staffLimit: 1 } });
  const created = await dealerService.adminCreate({ name: 'معرض الاختبار', ownerName: 'مالك المعرض', phone: '0911111120',
    password: 'DealerPassword123', cityId: city.id, planId: plan.id, activateSubscription: true, status: 'Verified' }, first.id);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: created.owner.id }, include: { roles: { include: { role: true } } } });
  assert.notEqual(owner.passwordHash, 'DealerPassword123');
  assert.deepEqual(owner.roles.map((item) => item.role.code), ['DEALER_OWNER']);
  const auth = new AuthService(prisma, { signAsync: async () => 'dealer-access' }, { get: () => undefined }, new SettingsService(prisma));
  const login = await auth.login({ phone: '0911111120', password: 'DealerPassword123' }, {});
  assert.ok(login.user.roles.includes('DEALER_OWNER'));
  await dealerService.createVehicle(owner.id, { make: 'Toyota', model: 'Camry', year: 2024, cityId: city.id, saleType: 'FixedPrice', condition: 'Used' });
  await assert.rejects(dealerService.createVehicle(owner.id, { make: 'Kia', model: 'Sportage', year: 2023, cityId: city.id, saleType: 'FixedPrice', condition: 'Used' }), /vehicle_limit_reached/);
});

test('paid user auction-listing fee moves the vehicle to admin review exactly once', async () => {
  await prisma.setting.upsert({ where: { key: 'auction.listing_fee_milli' }, create: { key: 'auction.listing_fee_milli', value: 75000 }, update: { value: 75000 } });
  await prisma.setting.upsert({ where: { key: 'auction.publisher_subscription_required' }, create: { key: 'auction.publisher_subscription_required', value: false }, update: { value: false } });
  const listingSettings = new SettingsService(prisma);
  const { SubscriptionsService } = require('../dist/modules/subscriptions/subscriptions.service');
  const listingService = new AuctionsService(prisma, realtime, listingSettings, undefined, undefined, new SubscriptionsService(prisma, listingSettings));
  const listing = await listingService.requestListing(first.id, { make: 'Nissan', model: 'Altima', year: 2022, cityId: city.id,
    condition: 'Used', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), startingPriceLyd: '20000' });
  assert.equal(listing.order.totalLyd, 75);
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: listing.vehicle.id } })).approvalStatus, 'Draft');
  const order = await prisma.order.findUniqueOrThrow({ where: { id: listing.order.id } });
  const payment = await prisma.payment.create({ data: { orderId: order.id, userId: first.id, provider: 'test-listing',
    providerTransactionId: `listing-${randomUUID()}`, amount: order.total, status: 'Processing' } });
  const service = new PaymentsService(prisma, wallet);
  service.providers.set('test-listing', { code: 'test-listing', verifyWebhook: async () => ({ providerEventId: `event-${payment.id}`,
    providerTransactionId: payment.providerTransactionId, status: 'Paid', amountMilli: order.total.toString(), currency: 'LYD', occurredAt: new Date(), rawEvent: {} }) });
  const event = { headers: {}, rawBody: Buffer.from('{}'), parsedBody: {} };
  await service.webhook('test-listing', event);
  const replay = await service.webhook('test-listing', event);
  assert.equal(replay.duplicate, true);
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: listing.vehicle.id } })).approvalStatus, 'PendingReview');
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'Paid');
});
