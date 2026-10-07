const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SubscriptionsService } = require('../dist/modules/subscriptions/subscriptions.service');
const { WorkspaceService } = require('../dist/modules/workspace/workspace.service');
const { WalletService } = require('../dist/modules/wallet/wallet.service');
const { PaymentsService } = require('../dist/modules/payments/payments.service');
const { NotificationDispatchService } = require('../dist/modules/notifications/notification-dispatch.service');
const setting = { get: async () => true };
const baseSubscription = { id: 's', version: 2, usedAuctions: 0, plan: { auctionLimit: 1, features: { audience: 'Customer', permissions: ['CAN_CREATE_AUCTION'] } } };
function quotaTx(s = baseSubscription, count = 1) { return {
  memberSubscription: { findFirst: async () => s, updateMany: async ({ where, data }) => { assert.equal(where.version, 2); assert.equal(data.usedAuctions.increment, 1); return { count }; } },
  planCapability: { findUnique: async () => null }, capabilityOverride: { findFirst: async () => null },
}; }
test('auction publication requires an active publishing subscription', async () => {
  await assert.rejects(new SubscriptionsService({}, setting).consumeAuction(quotaTx(null), 'user'), /active_publishing_subscription_required/);
});
test('publishing quota uses a versioned atomic update', async () => { await new SubscriptionsService({}, setting).consumeAuction(quotaTx(), 'user'); });
test('exhausted and concurrently claimed quotas cannot publish', async () => {
  const service = new SubscriptionsService({}, setting);
  await assert.rejects(service.consumeAuction(quotaTx({ ...baseSubscription, usedAuctions: 1 }), 'user'), /quota_exhausted/);
  await assert.rejects(service.consumeAuction(quotaTx(baseSubscription, 0), 'user'), /concurrent_quota_update/);
});
test('admin can explicitly disable the subscription requirement', async () => {
  await new SubscriptionsService({}, { get: async () => false }).consumeAuction({ memberSubscription: { findFirst: () => assert.fail('no quota required') } }, 'user');
});
test('user deny and globally disabled capability override a paid plan', async () => {
  const service = new SubscriptionsService({}, setting);
  const denied = quotaTx(); denied.capabilityOverride.findFirst = async () => ({ effect: 'Deny' });
  await assert.rejects(service.consumeAuction(denied, 'user'), /permission_required/);
  const global = quotaTx(); global.planCapability.findUnique = async () => ({ isActive: false });
  await assert.rejects(service.consumeAuction(global, 'user'), /permission_required/);
});
test('sale request is inaccessible to a non-participant', async () => {
  const tx = { saleRequest: { findUnique: async () => ({ requesterId: 'buyer', sellerId: 'seller', status: 'Pending' }), updateMany: () => assert.fail('must not write') } };
  await assert.rejects(new WorkspaceService({ $transaction: (f) => f(tx) }).saleAction('id', 'stranger', 'accept'), /not_yours/);
});
test('a buyer cannot accept their own request or complete before seller delivery', async () => {
  const tx = { saleRequest: { findUnique: async () => ({ requesterId: 'buyer', sellerId: 'seller', status: 'Pending' }), updateMany: () => assert.fail('must not write') } };
  const service = new WorkspaceService({ $transaction: (f) => f(tx) });
  await assert.rejects(service.saleAction('id', 'buyer', 'accept'), /invalid_transition/);
  await assert.rejects(service.saleAction('id', 'buyer', 'complete'), /invalid_transition/);
});
test('inspection reports require the assigned technician and InProgress state', async () => {
  const tx = { inspectionRequest: { findUnique: async () => ({ requesterId: 'buyer', technician: { userId: 'tech' }, status: 'Paid' }) } };
  const service = new WorkspaceService({ $transaction: (f) => f(tx) });
  await assert.rejects(service.inspectionAction('id', 'other-tech', 'report', {}), /not_yours/);
  await assert.rejects(service.inspectionAction('id', 'tech', 'report', {}), /invalid_transition/);
});
test('an active auction commitment blocks withdrawal before any wallet write', async () => {
  const tx = { walletWithdrawal: { findUnique: async () => null, create: () => assert.fail('must not create') }, bid: { findFirst: async () => ({ id: 'bid' }) } };
  await assert.rejects(new WalletService({ $transaction: (f) => f(tx) }).requestWithdrawal('user', { amountLyd: '100', reason: 'refund', idempotencyKey: 'key' }), /commitment_active/);
});
test('withdrawal cannot be marked paid without a real transfer reference', async () => {
  await assert.rejects(new WalletService({}).resolveWithdrawal('id', 'admin', { action: 'paid', reason: 'processed' }), /transfer_reference_required/);
});
test('wallet recharge cannot be paid using wallet funds', async () => {
  const tx = { payment: { findUnique: async () => null }, order: { findFirst: async () => ({ type: 'WalletRecharge', status: 'PaymentPending', userId: 'user' }) } };
  await assert.rejects(new PaymentsService({ $transaction: (f) => f(tx) }, {}).payFromWallet('user', 'order', 'key'), /wallet_order_not_supported/);
});
test('wallet payments reject another user idempotency key', async () => {
  const tx = { payment: { findUnique: async () => ({ userId: 'other', orderId: 'order', provider: 'wallet', status: 'Paid' }) } };
  await assert.rejects(new PaymentsService({ $transaction: (f) => f(tx) }, {}).payFromWallet('user', 'order', 'key'), /idempotency_conflict/);
});
test('each reminder is delivered only in its own minute window', async () => {
  const emitted = [];
  const tx = { auctionNotice: { create: async ({ data }) => emitted.push(data.kind) }, notification: { create: async () => {} } };
  const prisma = { auction: { findMany: async () => [{ id: 'auction', vehicleId: 'vehicle', startsAt: new Date(Date.now() + 29.5 * 60000), vehicle: { make: 'Test', model: 'Fixture' } }] }, watchlist: { findMany: async () => [{ userId: 'user' }, { userId: 'user' }] }, $transaction: (f) => f(tx) };
  await new NotificationDispatchService(prisma, { get: async (key) => key === 'notifications.auction_reminder_minutes' ? [60, 30, 15, 5] : true }, {}).deliverAuctionReminders();
  assert.deepEqual(emitted, ['reminder_30']);
});
test('a user who opted out does not receive push even with a registered device', async () => {
  const saved = [];
  const prisma = { notification: { findMany: async () => [{ id: 'n', userId: 'u', pushState: 'Pending', data: { type: 'auction_reminder' } }], updateMany: async () => ({ count: 1 }), update: async ({ data }) => saved.push(data) },
    user: { findUnique: async () => ({ status: 'Active', preferences: { auctionNotifications: false } }) }, pushDevice: { findMany: () => assert.fail('must not load') } };
  await new NotificationDispatchService(prisma, setting, { status: () => ({ configured: true }) }).deliverPush();
  assert.equal(saved[0].pushState, 'Skipped');
});
