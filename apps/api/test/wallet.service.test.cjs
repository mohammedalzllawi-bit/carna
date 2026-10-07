const assert = require('node:assert/strict');
const { it } = require('node:test');
const { WalletService } = require('../dist/modules/wallet/wallet.service');

it('posts an admin wallet adjustment through the immutable ledger with audit and notification', async () => {
  let ledgerData;
  let auditData;
  let notificationData;
  let accountRead = 0;
  const transaction = {
    user: { findUnique: async () => ({ id: 'user-1' }) },
    walletLedger: {
      findUnique: async () => null,
      create: async ({ data }) => { ledgerData = data; return { id: 'ledger-1', ...data }; },
    },
    walletAccount: {
      findUnique: async () => {
        accountRead += 1;
        return accountRead === 1
          ? { id: 'wallet-1', userId: 'user-1', currency: 'LYD', balance: 1000n, version: 2 }
          : { id: 'wallet-1', userId: 'user-1', currency: 'LYD', balance: 13345n, version: 3 };
      },
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ id: 'wallet-1', balance: 13345n }),
    },
    auditLog: { create: async ({ data }) => { auditData = data; return data; } },
    notification: { create: async ({ data }) => { notificationData = data; return data; } },
  };
  const prisma = { $transaction: async (callback) => callback(transaction) };
  const service = new WalletService(prisma);
  service.adminSummary = async () => ({ summary: { balanceLyd: 13.345 } });

  const result = await service.adminAdjust('user-1', 'admin-1', {
    direction: 'Credit', amountLyd: 12.345, reason: 'تسوية مالية موثقة', idempotencyKey: '78a18485-7c68-4abe-b597-b9eaba8a943c',
  });

  assert.equal(ledgerData.amount, 12345n);
  assert.equal(ledgerData.type, 'AdminAdjustment');
  assert.equal(ledgerData.description, 'تسوية مالية موثقة');
  assert.equal(auditData.action, 'admin.wallet.credited');
  assert.equal(notificationData.userId, 'user-1');
  assert.equal(result.summary.balanceLyd, 13.345);
});

it('does not duplicate wallet side effects when an adjustment idempotency key is retried', async () => {
  const existing = { id: 'ledger-1', userId: 'user-1', amount: 5000n, direction: 'Credit', currency: 'LYD' };
  const transaction = {
    user: { findUnique: async () => ({ id: 'user-1' }) },
    walletLedger: { findUnique: async () => existing },
    auditLog: { create: async () => assert.fail('audit must not be duplicated') },
    notification: { create: async () => assert.fail('notification must not be duplicated') },
  };
  const service = new WalletService({ $transaction: async (callback) => callback(transaction) });
  service.adminSummary = async () => ({ summary: { balanceLyd: 5 } });

  const result = await service.adminAdjust('user-1', 'admin-1', {
    direction: 'Credit', amountLyd: 5, reason: 'إعادة نفس الطلب', idempotencyKey: '78a18485-7c68-4abe-b597-b9eaba8a943c',
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.summary.balanceLyd, 5);
});
