const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { rm } = require('node:fs/promises');
const { MongoClient } = require('mongodb');
const { Prisma } = require('@prisma/client');
const argon2 = require('argon2');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, VersioningType } = require('@nestjs/common');
const { io } = require('socket.io-client');

const databaseName = `lca_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + databaseName;
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.AUCTION_WORKER_MODE = 'off';
process.env.ALLOW_LEGACY_ADMIN_KEY = 'false';
process.env.MEDIA_STORAGE_PROVIDER = 'local';
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.RESALA_OTP_SECRET = randomUUID().repeat(2);
const brandingStorageDir = join(tmpdir(), `libya-auctions-branding-${randomUUID()}`);
process.env.BRANDING_STORAGE_DIR = brandingStorageDir;
const mediaStorageDir = join(tmpdir(), `libya-auctions-listings-${randomUUID()}`);
process.env.MEDIA_STORAGE_DIR = mediaStorageDir;
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { requestContext } = require('../dist/common/request-context');
const prisma = new PrismaService();
const mongo = new MongoClient(url.toString());
const password = randomUUID() + '!Aa1';
let app; let base; let admin; let customer; let limited;

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(base + '/v1' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function account(phone, codes) {
  const permissions = [];
  for (const code of codes) permissions.push(await prisma.permission.upsert({ where: { code }, create: { code, description: code }, update: {} }));
  const role = await prisma.role.create({ data: { code: `TEST_${phone}`, name: 'HTTP test role', permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } });
  const user = await prisma.user.create({ data: { phone, passwordHash: await argon2.hash(password), status: 'Active', phoneVerifiedAt: new Date(), roles: { create: { roleId: role.id } } } });
  const login = await request('/auth/login', { method: 'POST', body: { phone, password } });
  assert.equal(login.status, 200);
  return { ...user, roleId: role.id, token: login.body.accessToken, refreshToken: login.body.refreshToken };
}

before(async () => {
  await mongo.connect();
  const db = mongo.db(databaseName);
  for (const model of Prisma.dmmf.datamodel.models) await db.createCollection(model.dbName || model.name);
  for (const [collection, index] of [
    ['User', { phone: 1 }], ['Role', { code: 1 }], ['Permission', { code: 1 }], ['Setting', { key: 1 }],
    ['RefreshSession', { tokenHash: 1 }], ['UserRole', { userId: 1, roleId: 1 }],
    ['Favorite', { userId: 1, vehicleId: 1 }],
  ]) await db.collection(collection).createIndex(index, { unique: true });
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
  app = module.createNestApplication({ logger: false, rawBody: true });
  app.use((req, _res, next) => requestContext.run({ ipAddress: req.ip }, next));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  admin = await account('+218911111120', ['admin.access', 'users.manage', 'permissions.manage', 'settings.manage', 'audit.read', 'payments.read']);
  customer = await account('+218911111121', ['auctions.bid', 'wallet.read_own']);
  limited = await account('+218911111122', ['admin.access', 'users.manage']);
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
  assert.match(databaseName, /^lca_test_[a-f0-9]{24}$/);
  await mongo.db(databaseName).dropDatabase();
  await mongo.close();
  await rm(brandingStorageDir, { recursive: true, force: true });
  await rm(mediaStorageDir, { recursive: true, force: true });
});

test('HTTP direct listing requires a photo, enters review, publishes by admin and permits buyer chat', async () => {
  const seller = await account('+218911111123', ['vehicles.create_own']);
  const reviewer = await account('+218911111124', ['admin.access', 'vehicles.approve']);
  const buyer = await account('+218911111125', []);
  const city = await prisma.city.create({ data: { nameAr: 'بنغازي', isActive: true } });
  const created = await request('/listings', { token: seller.token, method: 'POST', body: {
    category: 'Truck', make: 'MAN', model: 'TGS', year: 2021, cityId: city.id,
    saleType: 'FixedPrice', condition: 'Used', priceLyd: 150000,
  } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await request(`/listings/${id}/submit`, { token: seller.token, method: 'POST' })).status, 400);
  assert.equal((await request(`/catalog/vehicles/${id}`)).status, 404);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('images', new Blob([png], { type: 'image/png' }), 'truck.png');
  const uploaded = await fetch(base + `/v1/listings/${id}/images`, { method: 'POST', headers: { authorization: `Bearer ${seller.token}` }, body: form });
  assert.equal(uploaded.status, 201);
  assert.equal((await request(`/listings/${id}/submit`, { token: buyer.token, method: 'POST' })).status, 403);
  assert.equal((await request(`/listings/${id}/submit`, { token: seller.token, method: 'POST' })).status, 201);
  assert.equal((await request(`/catalog/vehicles/${id}`)).status, 404);
  assert.equal((await request(`/admin/vehicles/${id}/publish`, { token: reviewer.token, method: 'POST' })).status, 201);
  const search = await request('/catalog/vehicles?category=Truck&q=MAN&sort=newest');
  assert.equal(search.status, 200);
  assert.ok(search.body.some((item) => item.id === id));
  const detail = await request(`/catalog/vehicles/${id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.contactPhone, seller.phone);
  assert.equal((await request('/listing-chats', { token: seller.token, method: 'POST', body: { vehicleId: id } })).status, 403);
  const chat = await request('/listing-chats', { token: buyer.token, method: 'POST', body: { vehicleId: id } });
  assert.equal(chat.status, 201);
  assert.equal((await request(`/listing-chats/${chat.body.id}`, { token: reviewer.token })).status, 404);
  assert.equal((await request(`/listing-chats/${chat.body.id}/messages`, { token: buyer.token, method: 'POST', body: { body: 'هل العرض متاح؟' } })).status, 201);
  const inbox = await request('/listing-chats', { token: seller.token });
  assert.equal(inbox.status, 200);
  assert.ok(inbox.body.some((item) => item.id === chat.body.id));
});

test('HTTP denies anonymous, forged-token, customer and legacy-key admin access', async () => {
  assert.equal((await request('/admin/users')).status, 401);
  assert.equal((await request('/admin/users', { token: 'not-a-jwt' })).status, 401);
  assert.equal((await request('/admin/users', { token: customer.token })).status, 403);
  assert.equal((await request('/admin/users', { headers: { 'x-admin-key': process.env.ADMIN_API_KEY || 'disabled' } })).status, 401);
  const allowed = await request('/admin/users', { token: admin.token });
  assert.equal(allowed.status, 200);
  assert.ok(allowed.body.every((u) => !('passwordHash' in u)));
});

test('HTTP checks resource permissions and prevents unauthorized role assignment', async () => {
  assert.equal((await request('/admin/users', { token: limited.token })).status, 200);
  assert.equal((await request('/admin/settings', { token: limited.token })).status, 403);
  assert.equal((await request(`/admin/users/${customer.id}`, { token: limited.token, method: 'PATCH', body: { roles: ['ADMIN'] } })).status, 403);
  assert.equal((await request(`/admin/users/${customer.id}`, { token: admin.token, method: 'PATCH', body: { roles: ['SUPER_ADMIN'] } })).status, 403);
});

test('HTTP settings validate types, reject unavailable features and record actor atomically', async () => {
  for (const body of [{ key: 'platform.guest_mode_enabled', value: 'false' }, { key: 'notifications.auction_reminder_minutes', value: [-1] }, { key: 'constructor', value: true }]) {
    assert.equal((await request('/admin/settings', { token: admin.token, method: 'PATCH', body })).status, 400);
  }
  assert.equal((await request('/admin/settings', { token: admin.token, method: 'PATCH', body: { key: 'comments.enabled', value: true } })).status, 200);
  assert.equal((await request('/admin/settings', { token: admin.token, method: 'PATCH', body: { key: 'notifications.auction_reminder_minutes', value: [60, 30, 15, 5] } })).status, 200);
  assert.equal((await request('/admin/settings', { token: admin.token, method: 'PATCH', body: { key: 'auction.deposit_basis_points', value: 1500 } })).status, 200);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'admin.setting.updated' }, orderBy: { createdAt: 'desc' } });
  assert.equal(log.actorId, admin.id);
  assert.equal(log.after.value, 1500);
  await assert.rejects(prisma.auditLog.delete({ where: { id: log.id } }), /append_only/);
});

test('HTTP new account areas reject guests and restricted staff cannot manage finance or reviews', async () => {
  for (const path of ['/workspace/requests', '/subscriptions/me', '/wallet', '/account/favorites/vehicles']) {
    assert.equal((await request(path)).status, 401);
  }
  for (const path of ['/admin/requests', '/admin/reviews', '/admin/subscriptions', '/admin/content', '/admin/wallet/withdrawals']) {
    assert.equal((await request(path, { token: customer.token })).status, 403);
    assert.equal((await request(path, { token: limited.token })).status, 403);
  }
  assert.equal((await request('/workspace/technician/availability', { token: customer.token, method: 'PATCH', body: { status: 'unavailable' } })).status, 403);
});

test('HTTP favorites and auction bell are private, repeatable and removable', async () => {
  const vehicle = await prisma.vehicle.create({ data: { lotNumber: randomUUID(), make: 'Test', model: 'Watch', year: 2025, approvalStatus: 'Published' } });
  const auction = await prisma.auction.create({ data: { vehicleId: vehicle.id, status: 'Scheduled', startsAt: new Date(Date.now()+3600000), endsAt: new Date(Date.now()+7200000), startingPrice: 100000n, bidIncrement: 10000n } });
  for (let n = 0; n < 2; n++) {
    assert.equal((await request(`/account/favorites/${vehicle.id}`, { token: customer.token, method: 'POST' })).status, 201);
    const watch = await request(`/workspace/watches/${auction.id}`, { token: customer.token, method: 'POST' });
    assert.equal(watch.status, 201);
    assert.deepEqual(watch.body.reminderMinutes, [60,30,15,5]);
  }
  assert.equal(await prisma.favorite.count({ where: { userId: customer.id, vehicleId: vehicle.id } }), 1);
  assert.equal(await prisma.watchlist.count({ where: { userId: customer.id, auctionId: auction.id } }), 1);
  assert.equal((await request('/account/favorites/vehicles', { token: customer.token })).body.some((v) => v.id === vehicle.id), true);
  assert.equal((await request('/account/favorites', { token: limited.token })).body.length, 0);
  assert.equal((await request('/workspace/watches', { token: limited.token })).body.length, 0);
  await request(`/account/favorites/${vehicle.id}`, { token: customer.token, method: 'DELETE' });
  await request(`/workspace/watches/${auction.id}`, { token: customer.token, method: 'DELETE' });
  assert.equal(await prisma.favorite.count({ where: { userId: customer.id, vehicleId: vehicle.id } }), 0);
  assert.equal(await prisma.watchlist.count({ where: { userId: customer.id, auctionId: auction.id } }), 0);
});

test('HTTP admin uploads, serves and removes a validated platform logo', async () => {
  const invalid = new FormData();
  invalid.append('logo', new Blob(['not-an-image'], { type: 'image/png' }), 'logo.png');
  assert.equal((await fetch(base + '/v1/admin/settings/logo', {
    method: 'POST',
    headers: { authorization: `Bearer ${admin.token}` },
    body: invalid,
  })).status, 400);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('logo', new Blob([png], { type: 'image/png' }), 'platform-logo.png');
  const upload = await fetch(base + '/v1/admin/settings/logo', {
    method: 'POST',
    headers: { authorization: `Bearer ${admin.token}` },
    body: form,
  });
  assert.equal(upload.status, 201);
  const uploaded = await upload.json();
  assert.match(uploaded.value, /^\/v1\/settings\/logo\/logo-[a-zA-Z0-9.-]+\.png$/);

  const publicSettings = await (await fetch(base + '/v1/settings/public')).json();
  assert.equal(publicSettings['platform.logo_url'], uploaded.value);
  const image = await fetch(base + uploaded.value);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);

  const removed = await fetch(base + '/v1/admin/settings/logo', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${admin.token}` },
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).value, '');
  assert.equal((await fetch(base + uploaded.value)).status, 404);
});

test('HTTP guest and maintenance policies are enforced by API including account routes', async () => {
  const change = (key, value) => request('/admin/settings', { token: admin.token, method: 'PATCH', body: { key, value } });
  await change('platform.guest_mode_enabled', false);
  try {
    assert.equal((await request('/auctions')).status, 401);
    assert.equal((await request('/auctions', { token: customer.token })).status, 200);
    assert.equal((await request('/auth/guest', { method: 'POST' })).status, 503);
    await change('platform.maintenance_mode', true);
    assert.equal((await request('/auctions', { token: customer.token })).status, 503);
    assert.equal((await request('/account/summary', { token: customer.token })).status, 503);
    assert.equal((await request('/admin/settings', { token: admin.token })).status, 200);
  } finally {
    await change('platform.guest_mode_enabled', true);
    await change('platform.maintenance_mode', false);
  }
});

test('HTTP invalid bids are rejected before entering the auction engine', async () => {
  assert.equal((await request('/auctions/invalid/bids', { method: 'POST', body: {} })).status, 401);
  const invalid = await request('/auctions/invalid/bids', { token: customer.token, method: 'POST', body: { amountLyd: '-10', idempotencyKey: 'invalid', bidderId: admin.id } });
  assert.equal(invalid.status, 400);
});

test('Socket.IO joins a published auction and receives a committed HTTP bid', async () => {
  const { WalletService } = require('../dist/modules/wallet/wallet.service');
  await prisma.$transaction((tx) => new WalletService(prisma).post(tx, { userId: customer.id, direction: 'Credit', amount: 100000n, currency: 'LYD', type: 'FixtureFunding', referenceId: 'fixture', idempotencyKey: randomUUID() }));
  const vehicle = await prisma.vehicle.create({ data: { lotNumber: randomUUID(), make: 'Test', model: 'Realtime', year: 2025, approvalStatus: 'Published' } });
  const auction = await prisma.auction.create({ data: { vehicleId: vehicle.id, status: 'Live', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 300000), startingPrice: 100000n, bidIncrement: 10000n, ruleSnapshot: { depositBasisPoints: 1000, buyerFeeMilli: 0, paymentDeadlineMinutes: 120, fallbackWinners: 0, autoRelist: false } } });
  const socket = io(base + '/auctions', { autoConnect: false, transports: ['websocket'], reconnection: false, timeout: 3000 });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
    const joined = await socket.timeout(3000).emitWithAck('auction:join', { auctionId: auction.id });
    assert.equal(joined.ok, true);
    const event = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bid broadcast timed out')), 10000);
      socket.once('auction:bid-accepted', (data) => { clearTimeout(timer); resolve(data); });
    });
    const [response, broadcast] = await Promise.all([
      request(`/auctions/${auction.id}/bids`, { token: customer.token, method: 'POST', body: { amountLyd: '100', idempotencyKey: randomUUID() } }), event,
    ]);
    assert.equal(response.status, 201);
    assert.equal(broadcast.auctionId, auction.id);
    assert.equal(await prisma.bid.count({ where: { auctionId: auction.id } }), 1);
  } finally { socket.disconnect(); }
});

test('HTTP role grant changes take effect without waiting for JWT expiry', async () => {
  const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'users.manage' } });
  await prisma.rolePermission.deleteMany({ where: { roleId: limited.roleId, permissionId: permission.id } });
  assert.equal((await request('/admin/users', { token: limited.token })).status, 403);
});

test('HTTP suspension revokes an existing authenticated session', async () => {
  assert.equal((await request('/auth/me', { token: customer.token })).status, 200);
  assert.equal((await request(`/admin/users/${customer.id}`, { token: admin.token, method: 'PATCH', body: { status: 'Suspended' } })).status, 200);
  assert.equal((await request('/auth/me', { token: customer.token })).status, 401);
  assert.equal((await request('/auth/refresh', { method: 'POST', body: { refreshToken: customer.refreshToken } })).status, 401);
});

test('HTTP finance records require permission, redact provider payloads and cannot be marked paid', async () => {
  const order = await prisma.order.create({ data: { userId: customer.id, type: 'AuctionDeposit', subtotal: 10000n, total: 10000n, status: 'PaymentPending' } });
  const payment = await prisma.payment.create({ data: { userId: customer.id, orderId: order.id, provider: 'test-only', amount: 10000n, checkoutUrl: 'https://private.example/checkout', idempotencyKey: randomUUID() } });
  await prisma.paymentTransaction.create({ data: { paymentId: payment.id, status: 'Processing', amount: 10000n, rawResponse: { secret: 'not-for-the-dashboard' } } });
  assert.equal((await request('/admin/payments', { token: limited.token })).status, 403);
  assert.equal((await request('/admin/payments?status=Invalid', { token: admin.token })).status, 400);
  const list = await request('/admin/payments', { token: admin.token });
  assert.equal(list.status, 200); assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].amountLyd, 10);
  assert.equal('checkoutUrl' in list.body.items[0], false);
  const detail = await request(`/admin/payments/${payment.id}`, { token: admin.token });
  assert.equal(detail.status, 200);
  assert.equal('rawResponse' in detail.body.transactions[0], false);
  assert.equal((await request(`/admin/payments/${payment.id}`, { token: admin.token, method: 'PATCH', body: { status: 'Paid' } })).status, 404);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'Pending');
});

test('HTTP logout invalidates the access token as well as the refresh token', async () => {
  assert.equal((await request('/auth/logout', { method: 'POST', body: { refreshToken: admin.refreshToken } })).status, 200);
  assert.equal((await request('/admin/users', { token: admin.token })).status, 401);
});
