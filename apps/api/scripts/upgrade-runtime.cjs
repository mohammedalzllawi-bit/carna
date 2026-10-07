const { MongoClient } = require('mongodb');
const dns = require('node:dns');
const { ensureUserEmailIndex } = require('./user-email-index.cjs');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(',').map((value) => value.trim()).filter(Boolean);
  if (dnsServers?.length) dns.setServers(dnsServers);
  const client = new MongoClient(process.env.DATABASE_URL);
  try {
    await client.connect();
    const db = client.db();
    await ensureUserEmailIndex(db);
    for (const [collection, fields] of [
      ['Vehicle', { auctionLocked: false, auctionVersion: 0 }],
      ['Auction', { version: 0 }], ['Order', { version: 0 }],
      ['InspectionRequest', { version: 0 }],
      ['AuctionResult', { winnerAttempt: 0, excludedWinnerIds: [] }],
    ]) {
      for (const [key, value] of Object.entries(fields)) {
        await db.collection(collection).updateMany({ [key]: { $exists: false } }, { $set: { [key]: value } });
      }
    }
    for (const name of ['Bid', 'WalletLedger', 'Payment']) {
      const records = db.collection(name).find({ idempotencyKey: { $exists: false } }, { projection: { _id: 1 } });
      for await (const record of records) await db.collection(name).updateOne({ _id: record._id }, { $set: { idempotencyKey: `legacy:${record._id}` } });
    }
    const activeAuctions = db.collection('Auction').find({ status: { $in: ['Scheduled', 'Live', 'Paused', 'PaymentPending', 'Sold'] } }, { projection: { vehicleId: 1 } });
    for await (const record of activeAuctions) await db.collection('Vehicle').updateOne({ _id: record.vehicleId }, { $set: { auctionLocked: true } });
    await db.collection('Bid').createIndex({ auctionId: 1, bidderId: 1, idempotencyKey: 1 }, { unique: true, name: 'Bid_auctionId_bidderId_idempotencyKey_key' });
    await db.collection('WalletLedger').createIndex({ idempotencyKey: 1 }, { unique: true, name: 'WalletLedger_idempotencyKey_key' });
    await db.collection('WalletLedger').createIndex({ userId: 1, currency: 1, createdAt: 1 }, { name: 'WalletLedger_userId_currency_createdAt_idx' });
    await db.collection('WalletAccount').createIndex({ userId: 1, currency: 1 }, { unique: true, name: 'WalletAccount_userId_currency_key' });
    await db.collection('Payment').createIndex({ idempotencyKey: 1 }, { unique: true, name: 'Payment_idempotencyKey_key' });
    await db.collection('RateLimitWindow').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'RateLimitWindow_expiry' });
    await db.collection('MemberSubscription').createIndex({ idempotencyKey: 1 }, { unique: true, name: 'MemberSubscription_idempotencyKey_key' });
    await db.collection('SaleRequest').createIndex({ vehicleId: 1, requesterId: 1 }, { unique: true, name: 'SaleRequest_vehicleId_requesterId_key' });
    await db.collection('WalletWithdrawal').createIndex({ idempotencyKey: 1 }, { unique: true, name: 'WalletWithdrawal_idempotencyKey_key' });
    await db.collection('MemberSubscription').createIndex({ userId: 1, status: 1, endsAt: 1 }, { name: 'MemberSubscription_userId_status_endsAt_idx' });
    await db.collection('SaleRequest').createIndex({ sellerId: 1, status: 1 }, { name: 'SaleRequest_sellerId_status_idx' });
    await db.collection('WalletWithdrawal').createIndex({ userId: 1, createdAt: 1 }, { name: 'WalletWithdrawal_userId_createdAt_idx' });
    await db.collection('Favorite').createIndex({ userId: 1, vehicleId: 1 }, { unique: true, name: 'Favorite_userId_vehicleId_key' });
    await db.collection('AuctionNotice').createIndex({ auctionId: 1, userId: 1, kind: 1 }, { unique: true, name: 'AuctionNotice_auctionId_userId_kind_key' });
    await db.collection('Term').createIndex({ code: 1, locale: 1, version: 1 }, { unique: true, name: 'Term_code_locale_version_key' });
    await db.collection('InspectionReport').createIndex({ inspectionRequestId: 1 }, { unique: true, name: 'InspectionReport_inspectionRequestId_key' });
    await db.collection('Setting').updateOne({ key: 'notifications.auction_reminder_minutes', value: [120, 60] }, { $set: { value: [60, 30, 15, 5], updatedAt: new Date() } });
    console.log('Runtime fields and indexes upgraded. No records deleted.');
    const legacyAuctions = await db.collection('Auction').countDocuments({ ruleSnapshot: { $exists: false }, status: { $in: ['Scheduled', 'Live', 'PaymentPending'] } });
    if (legacyAuctions) console.log(`${legacyAuctions} legacy auctions require explicit fee-rule review before settlement.`);
  } finally { await client.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
