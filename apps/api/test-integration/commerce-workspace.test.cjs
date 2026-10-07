const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const { SubscriptionsService } = require('../dist/modules/subscriptions/subscriptions.service');
const { WalletService } = require('../dist/modules/wallet/wallet.service');
const { PaymentsService } = require('../dist/modules/payments/payments.service');
const { WorkspaceService } = require('../dist/modules/workspace/workspace.service');
const { AuctionsService } = require('../dist/modules/auctions/auctions.service');
const { SettingsService } = require('../dist/modules/settings/settings.service');
const name = `lca_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`;
const mongo = new MongoClient(url.toString());
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const settings = new SettingsService(prisma);
const wallet = new WalletService(prisma), payments = new PaymentsService(prisma, wallet);
const subscriptions = new SubscriptionsService(prisma, settings);
const workspace = new WorkspaceService(prisma, wallet, settings);
let seller, buyer, stranger, techUser, technician, city, plan;
before(async () => {
  await mongo.connect(); const db = mongo.db(name);
  for (const model of Prisma.dmmf.datamodel.models) await db.createCollection(model.dbName || model.name);
  for (const [collection, index] of [['MemberSubscription', { idempotencyKey: 1 }], ['WalletWithdrawal', { idempotencyKey: 1 }], ['SaleRequest', { vehicleId: 1, requesterId: 1 }], ['WalletLedger', { idempotencyKey: 1 }], ['WalletAccount', { userId: 1, currency: 1 }], ['Payment', { idempotencyKey: 1 }], ['PaymentTransaction', { providerEventId: 1 }], ['InspectionReport', { inspectionRequestId: 1 }], ['Setting', { key: 1 }], ['Favorite', { userId: 1, vehicleId: 1 }], ['Page', { slug: 1 }], ['Term', { code: 1, locale: 1, version: 1 }]]) await db.collection(collection).createIndex(index, { unique: true });
  [seller, buyer, stranger, techUser] = await Promise.all([1,2,3,4].map((n) => prisma.user.create({ data: { passwordHash: 'test-only', fullName: `Fixture ${n}`, phone: `+21891333333${n}0`, status: 'Active', phoneVerifiedAt: new Date() } })));
  city = await prisma.city.create({ data: { nameAr: 'بنغازي' } });
  technician = await prisma.technician.create({ data: { userId: techUser.id, name: 'Fixture Technician', specialty: 'Electrician', cityId: city.id, basePrice: 15000n, approvalStatus: 'Published', serviceRegions: [] } });
  plan = await prisma.dealerPlan.create({ data: { code: 'fixture-member', name: 'Fixture Plan', price: 50000n, durationDays: 30, auctionLimit: 1, features: { audience: 'Customer', permissions: ['CAN_CREATE_AUCTION'] } } });
});
after(async () => { await prisma.$disconnect(); assert.match(name, /^lca_test_[a-f0-9]{24}$/); await mongo.db(name).dropDatabase(); await mongo.close(); });
async function vehicle(ownerUserId = seller.id, saleType = 'FixedPrice') { return prisma.vehicle.create({ data: { ownerUserId, lotNumber: randomUUID(), make: 'Fixture', model: 'Car', year: 2024, cityId: city.id, saleType, approvalStatus: 'Published' } }); }
async function fund(userId, amount = 200000n) { await prisma.$transaction((tx) => wallet.post(tx, { userId, amount, direction: 'Credit', currency: 'LYD', type: 'FixtureFunding', referenceId: 'fixture', idempotencyKey: randomUUID() })); }

test('only an approved technician can change their own availability', async () => {
  await assert.rejects(workspace.availability(buyer.id, 'unavailable'), /approved_technician_required/);
  await workspace.availability(techUser.id, 'unavailable');
  assert.equal((await prisma.technician.findUniqueOrThrow({ where: { id: technician.id } })).availabilityStatus, 'unavailable');
  await workspace.availability(techUser.id, 'available');
});

test('paid wallet subscription activates once and a retry cannot double-charge', async () => {
  await fund(seller.id);
  const key = randomUUID(), request = await subscriptions.request(seller.id, { planId: plan.id, idempotencyKey: key });
  assert.equal((await prisma.memberSubscription.findUniqueOrThrow({ where: { id: request.subscriptionId } })).status, 'Pending');
  const paymentKey = randomUUID();
  await payments.payFromWallet(seller.id, request.order.id, paymentKey);
  assert.equal((await payments.payFromWallet(seller.id, request.order.id, paymentKey)).duplicate, true);
  assert.equal((await subscriptions.request(seller.id, { planId: plan.id, idempotencyKey: key })).reused, true);
  assert.equal((await prisma.memberSubscription.findUniqueOrThrow({ where: { id: request.subscriptionId } })).status, 'Active');
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: seller.id, currency: 'LYD' } } })).balance, 150000n);
  await assert.rejects(payments.payFromWallet(stranger.id, request.order.id, paymentKey), /idempotency_conflict/);
});
test('two concurrent publications can consume only one available subscription slot', async () => {
  const results = await Promise.allSettled([1,2].map(() => prisma.$transaction((tx) => subscriptions.consumeAuction(tx, seller.id))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await prisma.memberSubscription.findFirstOrThrow({ where: { userId: seller.id, status: 'Active' } })).usedAuctions, 1);
});
test('subscription is enforced in the auction listing endpoint transaction', async () => {
  const auctions = new AuctionsService(prisma, undefined, settings, undefined, undefined, subscriptions);
  const count = await prisma.vehicle.count();
  await assert.rejects(auctions.requestListing(stranger.id, { make: 'Fixture', model: 'Car', year: 2024, cityId: city.id, condition: 'Used', startingPriceLyd: '1000', startsAt: new Date(Date.now()+3600000).toISOString(), endsAt: new Date(Date.now()+7200000).toISOString() }), /active_publishing_subscription_required/);
  assert.equal(await prisma.vehicle.count(), count);
});
test('withdrawal reserves funds exactly once and rejecting releases them exactly once', async () => {
  await fund(buyer.id);
  const input = { amountLyd: '100', reason: 'Fixture refund', idempotencyKey: randomUUID() };
  const r = await wallet.requestWithdrawal(buyer.id, input);
  assert.equal((await wallet.requestWithdrawal(buyer.id, input)).duplicate, true);
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyer.id, currency: 'LYD' } } })).balance, 100000n);
  await wallet.resolveWithdrawal(r.id, seller.id, { action: 'reject', reason: 'Fixture rejection' });
  await assert.rejects(wallet.resolveWithdrawal(r.id, seller.id, { action: 'reject', reason: 'Repeat' }), /already_resolved/);
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyer.id, currency: 'LYD' } } })).balance, 200000n);
});
test('wallet topup is credited only by verified event and duplicate is harmless', async () => {
  const order = await payments.topup(stranger.id, '100', randomUUID());
  assert.equal((await wallet.own(stranger.id)).accounts.length, 0);
  await assert.rejects(payments.payFromWallet(stranger.id, order.id, randomUUID()), /wallet_order_not_supported/);
  const payment = await prisma.payment.create({ data: { userId: stranger.id, orderId: order.id, provider: 'fixture', amount: 100000n, providerTransactionId: randomUUID(), status: 'Processing' } });
  payments.providers.set('fixture', { verifyWebhook: async () => ({ providerEventId: payment.id, providerTransactionId: payment.providerTransactionId, amountMilli: '100000', currency: 'LYD', status: 'Paid' }) });
  const event = { headers: {}, rawBody: Buffer.from('{}'), parsedBody: {} };
  await payments.webhook('fixture', event); await payments.webhook('fixture', event);
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: stranger.id, currency: 'LYD' } } })).balance, 100000n);
  assert.equal(await prisma.walletLedger.count({ where: { referenceId: payment.id } }), 1);
});
test('only the buyer can confirm sale completion after delivery and no second sale is possible', async () => {
  const v = await vehicle(), r = await workspace.createSale(buyer.id, { vehicleId: v.id });
  await assert.rejects(workspace.saleAction(r.id, stranger.id, 'accept'), /not_yours/);
  await assert.rejects(workspace.saleAction(r.id, buyer.id, 'complete'), /invalid_transition/);
  await workspace.saleAction(r.id, seller.id, 'accept'); await workspace.saleAction(r.id, seller.id, 'deliver');
  await workspace.saleAction(r.id, buyer.id, 'complete');
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).approvalStatus, 'Archived');
  await assert.rejects(workspace.createSale(stranger.id, { vehicleId: v.id }), /not_available/);
});
test('inspection uses server price, requires payment and assigned technician, then accepts buyer completion', async () => {
  const v = await vehicle();
  const r = await workspace.createInspection(buyer.id, { vehicleId: v.id, technicianId: technician.id, scheduledAt: new Date(Date.now()+86400000).toISOString(), idempotencyKey: randomUUID() });
  assert.equal(r.totalLyd, 15);
  await assert.rejects(workspace.inspectionAction(r.id, techUser.id, 'accept'), /invalid_transition/);
  await payments.payFromWallet(buyer.id, r.orderId, randomUUID());
  await assert.rejects(workspace.inspectionAction(r.id, stranger.id, 'accept'), /not_yours/);
  await workspace.inspectionAction(r.id, techUser.id, 'accept'); await workspace.inspectionAction(r.id, techUser.id, 'start');
  await workspace.inspectionAction(r.id, techUser.id, 'report', { technicianNotes: 'Fixture notes long enough', recommendations: 'Fixture recommendation', overallScore: 80, engine: 'Good', transmission: 'Good', electric: 'Good', chassis: 'Good' });
  await assert.rejects(workspace.inspectionAction(r.id, techUser.id, 'complete'), /invalid_transition/);
  await workspace.inspectionAction(r.id, buyer.id, 'complete');
  assert.equal((await prisma.technician.findUniqueOrThrow({ where: { id: technician.id } })).completedInspections, 1);
});
test('rejecting a paid inspection refunds the wallet once without fabricating a provider refund', async () => {
  const v = await vehicle(); const r = await workspace.createInspection(buyer.id, { vehicleId: v.id, technicianId: technician.id, scheduledAt: new Date(Date.now()+86400000).toISOString(), idempotencyKey: randomUUID() });
  await payments.payFromWallet(buyer.id, r.orderId, randomUUID());
  const before = (await wallet.own(buyer.id)).accounts[0].balanceLyd;
  await workspace.inspectionAction(r.id, techUser.id, 'reject');
  assert.equal((await wallet.own(buyer.id)).accounts[0].balanceLyd, before + 15);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: r.orderId } })).status, 'Refunded');
  await assert.rejects(workspace.inspectionAction(r.id, techUser.id, 'reject'), /invalid_transition/);
});
test('terms publication retains immutable versions and admin rating edits retain before and after', async () => {
  const content = { slug: 'terms', locale: 'ar', title: 'Fixture terms', body: 'Original fixture terms text', published: true };
  await workspace.saveContent(content, seller.id); await workspace.saveContent({ ...content, body: 'Changed fixture terms text' }, seller.id);
  assert.equal(await prisma.term.count({ where: { code: 'terms' } }), 2);
  assert.equal((await workspace.content('terms')).body, 'Changed fixture terms text');
  const review = await prisma.review.create({ data: { reviewerId: buyer.id, technicianId: technician.id, rating: 4, comment: 'Original' } });
  await workspace.editReview(review.id, seller.id, { rating: 3, comment: 'Moderated', hidden: false, reason: 'Fixture moderation' });
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: review.id, action: 'admin.review.edited' } });
  assert.equal(audit.before.comment, 'Original'); assert.equal(audit.after.comment, 'Moderated');
  assert.equal((await prisma.technician.findUniqueOrThrow({ where: { id: technician.id } })).ratingAverage, 3);
});

test('dealer review requires a completed purchase and user edits cannot undo admin hiding', async () => {
  const { DealersService } = require('../dist/modules/dealers/dealers.service');
  const dealers = new DealersService(prisma, settings);
  const dealer = await prisma.dealer.create({ data: { ownerUserId: seller.id, name: 'Fixture Dealer', slug: randomUUID(), status: 'Verified' } });
  const v = await vehicle();
  await prisma.vehicle.update({ where: { id: v.id }, data: { dealerId: dealer.id } });
  await assert.rejects(dealers.review(dealer.id, buyer.id, { rating: 5, comment: 'Before purchase' }), /completed_purchase/);
  const r = await workspace.createSale(buyer.id, { vehicleId: v.id });
  await workspace.saleAction(r.id, seller.id, 'accept');
  await workspace.saleAction(r.id, seller.id, 'deliver');
  await workspace.saleAction(r.id, buyer.id, 'complete');
  await dealers.review(dealer.id, buyer.id, { rating: 5, comment: 'After purchase' });
  const review = await prisma.review.findFirstOrThrow({ where: { dealerId: dealer.id, reviewerId: buyer.id } });
  await workspace.editReview(review.id, seller.id, { rating: 4, comment: 'Hidden by moderator', hidden: true, reason: 'Fixture reason' });
  await dealers.review(dealer.id, buyer.id, { rating: 3, comment: 'Changed by buyer' });
  assert.equal((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).isHidden, true);
  assert.equal((await prisma.dealer.findUniqueOrThrow({ where: { id: dealer.id } })).ratingCount, 0);
});
