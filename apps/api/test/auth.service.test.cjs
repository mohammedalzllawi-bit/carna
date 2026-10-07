const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const argon2 = require('argon2');
const { AuthService } = require('../dist/modules/auth/auth.service');

function createConfig() {
  return {
    get: (key) => ({ JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '30d' })[key],
  };
}

function userFixture(overrides = {}) {
  return {
    id: 'user-1',
    phone: '+218912345678',
    fullName: 'مستخدم بنغازي',
    status: 'PendingVerification',
    phoneVerifiedAt: null,
    deletedAt: null,
    roles: [{ role: { code: 'CUSTOMER' } }],
    ...overrides,
  };
}

describe('AuthService', () => {
  it('registers a customer with Argon2 and stores only a refresh-token hash', async () => {
    let userCreateData;
    let refreshCreateData;
    const prisma = {
      user: {
        findUnique: async () => null,
        create: async ({ data }) => {
          userCreateData = data;
          return userFixture({ passwordHash: data.passwordHash });
        },
      },
      role: { findUnique: async () => ({ id: 'customer-role' }) },
      refreshSession: {
        create: async ({ data }) => {
          refreshCreateData = data;
          return data;
        },
      },
      auditLog: { create: async ({ data }) => data },
    };
    const jwt = { signAsync: async () => 'signed-access-token' };
    const service = new AuthService(prisma, jwt, createConfig());

    const result = await service.register(
      { fullName: ' مستخدم بنغازي ', phone: '0912345678', password: 'StrongPass123' },
      { ipAddress: '127.0.0.1' },
    );

    assert.notEqual(userCreateData.passwordHash, 'StrongPass123');
    assert.equal(await argon2.verify(userCreateData.passwordHash, 'StrongPass123'), true);
    assert.equal(userCreateData.phone, '+218912345678');
    assert.equal(refreshCreateData.tokenHash.length, 64);
    assert.notEqual(refreshCreateData.tokenHash, result.refreshToken);
    assert.equal(result.accessToken, 'signed-access-token');
    assert.deepEqual(result.user.roles, ['CUSTOMER']);
  });

  it('rotates a refresh token and revokes the previous session', async () => {
    let revokedAt;
    let nextSession;
    const currentUser = userFixture();
    const prisma = {
      refreshSession: {
        findUnique: async () => ({
          id: 'session-1',
          userId: currentUser.id,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: currentUser,
        }),
        updateMany: async ({ data }) => {
          revokedAt = data.revokedAt;
          return { count: 1 };
        },
        create: async ({ data }) => {
          nextSession = data;
          return { id: 'next-session', ...data };
        },
      },
      $transaction: async (callback) => callback(prisma),
    };
    const jwt = { signAsync: async () => 'next-access-token' };
    const service = new AuthService(prisma, jwt, createConfig());

    const result = await service.refresh('a'.repeat(64), { userAgent: 'test' });

    assert.ok(revokedAt instanceof Date);
    assert.equal(nextSession.userId, 'user-1');
    assert.equal(nextSession.tokenHash.length, 64);
    assert.notEqual(result.refreshToken, 'a'.repeat(64));
    assert.equal(result.accessToken, 'next-access-token');
  });
});
