const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { NotificationDispatchService } = require('../dist/modules/notifications/notification-dispatch.service');

describe('notification dispatcher', () => {
  it('creates one notice per eligible campaign recipient and marks the campaign sent', async () => {
    const campaign = { id: 'campaign-1', audience: 'users', actorId: 'admin-1', mode: 'Instant',
      title: 'Title', body: 'Body', status: 'Scheduled', cursor: null, processedCount: 0, recipientId: null };
    const deliveries = [];
    const notices = [];
    const prisma = {
      notificationCampaign: {
        findMany: async () => campaign.status === 'Scheduled' ? [campaign] : [],
        updateMany: async () => { campaign.status = 'Processing'; return { count: 1 }; },
      },
      user: { findMany: async ({ where }) => {
        assert.equal(where.AND[0].roles.some.role.code, 'CUSTOMER');
        assert.equal(where.AND[0].NOT.roles.some.role.code.in.includes('SUPER_ADMIN'), true);
        return [{ id: 'user-1' }, { id: 'user-2' }];
      } },
      notificationCampaignDelivery: { count: async () => deliveries.length },
      $transaction: async (work) => work({
        user: { findFirst: async () => ({ id: 'eligible' }) },
        notificationCampaignDelivery: { create: async ({ data }) => deliveries.push(data) },
        notification: { create: async ({ data }) => notices.push(data) },
        notificationCampaign: { updateMany: async ({ data }) => { Object.assign(campaign, data); return { count: 1 }; } },
        auditLog: { create: async () => {} },
      }),
    };
    const worker = new NotificationDispatchService(prisma, { get: async () => true }, {});
    await worker.deliverCampaigns();
    await worker.deliverCampaigns();
    assert.equal(notices.length, 2);
    assert.equal(campaign.status, 'Sent');
    assert.equal(campaign.deliveredCount, 2);
    assert.equal(notices[0].data.campaignId, 'campaign-1');
  });

  it('does not deliver bulk notices while instant and scheduled channels are disabled', async () => {
    const worker = new NotificationDispatchService({ notificationCampaign: { findMany: () => assert.fail('must not read') } },
      { get: async (key) => key === 'notifications.custom_enabled' }, {});
    await worker.deliverCampaigns();
  });

  it('claims a scheduled notification once and writes its in-app notice atomically', async () => {
    let status = 'Scheduled';
    const writes = [];
    const prisma = {
      scheduledNotification: { findMany: async () => [{ id: 'scheduled-1', recipientId: 'user-1', actorId: 'admin-1', title: 'Test', body: 'Message' }] },
      $transaction: async (callback) => callback({
        scheduledNotification: { updateMany: async () => {
          if (status !== 'Scheduled') return { count: 0 };
          status = 'Sent'; return { count: 1 };
        } },
        notification: { create: async (input) => writes.push(input) },
        auditLog: { create: async () => {} },
      }),
    };
    const worker = new NotificationDispatchService(prisma, { get: async () => true }, { status: () => ({ configured: false }) });
    await worker.deliverScheduled();
    await worker.deliverScheduled();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.userId, 'user-1');
    assert.equal(status, 'Sent');
  });

  it('does not deliver scheduled notices when disabled', async () => {
    const worker = new NotificationDispatchService({ scheduledNotification: { findMany: () => assert.fail('must not read') } },
      { get: async () => false }, { status: () => ({ configured: false }) });
    await worker.deliverScheduled();
  });

  it('records a missing device instead of marking push as sent', async () => {
    const writes = [];
    const prisma = {
      notification: {
        findMany: async ({ where }) => {
          assert.equal(where.OR[0].OR[1].pushNextAttemptAt.isSet, false);
          return [{ id: 'notice-1', userId: 'user-1', pushState: 'Pending', pushAttempts: 0, data: { type: 'admin_message' } }];
        },
        updateMany: async () => ({ count: 1 }),
        update: async (input) => writes.push(input),
      },
      pushDevice: { findMany: async () => [] },
      user: { findUnique: async () => ({ status: 'Active', preferences: null }) },
    };
    const worker = new NotificationDispatchService(prisma, { get: async () => true },
      { status: () => ({ configured: true }), send: () => assert.fail('must not send') });
    await worker.deliverPush();
    assert.equal(writes[0].data.pushState, 'NoDevice');
  });

  it('sends message push to a registered device with the conversation route', async () => {
    const sent = [];
    const writes = [];
    const conversationId = 'a1234567-89ab-4cde-8f01-123456789abc';
    const prisma = {
      notification: {
        findMany: async () => [{ id: 'notice-1', userId: 'user-1', title: 'New message', body: 'Hello',
          pushState: 'Pending', pushAttempts: 0, data: { type: 'listing_message', conversationId } }],
        updateMany: async () => ({ count: 1 }),
        update: async (input) => writes.push(input),
      },
      pushDevice: { findMany: async () => [{ token: 'device-token' }] },
      user: { findUnique: async () => ({ status: 'Active', preferences: null }) },
    };
    const worker = new NotificationDispatchService(prisma, { get: async () => true },
      { status: () => ({ configured: true }), send: async (...args) => sent.push(args) });
    await worker.deliverPush();
    assert.equal(sent.length, 1);
    assert.notEqual(sent[0][2], 'Hello');
    assert.equal(sent[0][3].conversationId, conversationId);
    assert.equal(writes[0].data.pushState, 'Sent');
  });

  it('skips message push when the admin disables that category', async () => {
    const writes = [];
    const prisma = {
      notification: {
        findMany: async () => [{ id: 'notice-1', userId: 'user-1', pushState: 'Pending', pushAttempts: 0,
          data: { type: 'listing_message' } }],
        updateMany: async () => ({ count: 1 }),
        update: async (input) => writes.push(input),
      },
      pushDevice: { findMany: () => assert.fail('must not load devices') },
      user: { findUnique: async () => ({ status: 'Active', preferences: null }) },
    };
    const worker = new NotificationDispatchService(prisma, { get: async (key) => key !== 'notifications.messages_enabled' },
      { status: () => ({ configured: true }), send: () => assert.fail('must not send') });
    await worker.deliverPush();
    assert.equal(writes[0].data.pushState, 'Skipped');
  });
});
