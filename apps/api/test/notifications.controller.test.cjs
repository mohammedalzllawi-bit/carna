const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { AdminNotificationsController } = require('../dist/modules/notifications/notifications.module');

describe('admin notifications', () => {
  it('stores a targeted notice and an audit entry in one transaction', async () => {
    const writes = [];
    const prisma = {
      user: { findFirst: async () => ({ id: 'recipient-1' }) },
      $transaction: async (work) => work({
        notification: { create: async (value) => { writes.push(value); return { id: 'notice-1', pushState: 'Pending' }; } },
        auditLog: { create: async (value) => { writes.push(value); } },
      }),
    };
    const result = await new AdminNotificationsController(prisma, { get: async () => true }).send(
      { recipient: '0912345678', title: ' تحديث ', body: ' رسالة ' }, { user: { id: 'admin-1' } },
    );
    assert.deepEqual(result, { id: 'notice-1', recipientId: 'recipient-1', channel: 'InApp', pushState: 'Pending' });
    assert.equal(writes[0].data.userId, 'recipient-1');
    assert.equal(writes[0].data.title, 'تحديث');
    assert.equal(writes[1].data.actorId, 'admin-1');
  });

  it('does not send to a missing or ineligible account', async () => {
    const prisma = { user: { findFirst: async () => null }, $transaction: async () => assert.fail('must not write') };
    await assert.rejects(new AdminNotificationsController(prisma, { get: async () => true }).send(
      { recipient: 'missing', title: 'Test', body: 'Message' }, { user: { id: 'admin-1' } },
    ), /notifications.recipient_not_found/);
  });

  it('queues a dealer campaign with an audience count and audit entry', async () => {
    const writes = [];
    const prisma = {
      user: { count: async ({ where }) => {
        assert.equal(where.OR.length, 2);
        assert.deepEqual(where.AND[0].OR, [{ deletedAt: null }, { deletedAt: { isSet: false } }]);
        return 3;
      } },
      $transaction: async (work) => work({
        notificationCampaign: { create: async (value) => { writes.push(value); return { id: 'campaign-1', status: 'Scheduled', dueAt: value.data.dueAt }; } },
        auditLog: { create: async (value) => writes.push(value) },
      }),
    };
    const result = await new AdminNotificationsController(prisma, { get: async () => true }).send(
      { audience: 'dealers', title: 'تحديث', body: 'رسالة' }, { user: { id: 'admin-1' } },
    );
    assert.equal(result.recipientCount, 3);
    assert.equal(writes[0].data.audience, 'dealers');
    assert.equal(writes[0].data.mode, 'Instant');
    assert.equal(writes[1].data.after.recipientCount, 3);
  });

  it('rejects an empty audience rather than creating a campaign', async () => {
    const prisma = { user: { count: async () => 0 }, $transaction: () => assert.fail('must not write') };
    await assert.rejects(new AdminNotificationsController(prisma, { get: async () => true }).send(
      { audience: 'technicians', title: 'Title', body: 'Body' }, { user: { id: 'admin-1' } },
    ), /notifications.no_recipients/);
  });

  it('allows scheduling for a category with no current accounts', async () => {
    const prisma = {
      user: { count: async () => 0 },
      $transaction: async (work) => work({
        notificationCampaign: { create: async ({ data }) => ({ id: 'campaign-2', status: 'Scheduled', dueAt: data.dueAt }) },
        auditLog: { create: async () => {} },
      }),
    };
    const result = await new AdminNotificationsController(prisma, { get: async () => true }).schedule(
      { audience: 'technicians', title: 'Title', body: 'Body', dueAt: new Date(Date.now() + 60000).toISOString() },
      { user: { id: 'admin-1' } },
    );
    assert.equal(result.recipientCount, 0);
    assert.equal(result.audience, 'technicians');
  });

  it('looks up an individual account when its optional deletion field is absent', async () => {
    const prisma = {
      user: { findFirst: async ({ where }) => {
        assert.deepEqual(where.AND[0].OR, [{ deletedAt: null }, { deletedAt: { isSet: false } }]);
        return { id: 'user-1' };
      } },
      $transaction: async (work) => work({ notification: {
        create: async () => ({ id: 'notice-1', pushState: 'Pending' }),
      }, auditLog: { create: async () => {} } }),
    };
    const result = await new AdminNotificationsController(prisma, { get: async () => true }).send(
      { recipient: '0912345678', title: 'Title', body: 'Body' }, { user: { id: 'admin-1' } },
    );
    assert.equal(result.recipientId, 'user-1');
  });
});
