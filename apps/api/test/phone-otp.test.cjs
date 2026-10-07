const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { PhoneOtpService } = require('../dist/modules/resala/phone-otp.service');

function fixture() {
  let challenge = null;
  let sent = 0;
  let verified = false;
  const user = { id: 'u1', phone: '+218910001234', status: 'PendingVerification', phoneVerifiedAt: null, deletedAt: null };
  const otp = {
    findUnique: async () => challenge,
    create: async ({ data }) => { challenge = { ...data, version: 0, attempts: 0 }; return challenge; },
    updateMany: async ({ where, data }) => {
      if (!challenge || challenge.version !== where.version) return { count: 0 };
      if (data.version) challenge.version += 1;
      if (data.attempts) challenge.attempts += 1;
      if ('pinHash' in data) challenge.pinHash = data.pinHash;
      if (data.expiresAt) challenge.expiresAt = data.expiresAt;
      if (data.lastSentAt) challenge.lastSentAt = data.lastSentAt;
      return { count: 1 };
    },
    deleteMany: async ({ where }) => {
      if (!challenge || challenge.version !== where.version) return { count: 0 };
      challenge = null;
      return { count: 1 };
    },
  };
  const prisma = {
    user: { findUnique: async () => user, update: async ({ data }) => { Object.assign(user, data); verified = true; } },
    phoneOtpChallenge: otp,
    auditLog: { create: async () => ({}) },
    $transaction: async (fn) => fn(prisma),
  };
  const resala = { ensureConfigured: () => {}, sendPin: async () => { sent += 1; return { pin: '123456', code: '218', number: '910001234' }; } };
  const config = { get: (key) => key === 'RESALA_OTP_SECRET' ? 'a-dedicated-unit-test-secret-32-bytes' : undefined };
  return { service: new PhoneOtpService(prisma, resala, config), resala, getChallenge: () => challenge, sent: () => sent, verified: () => verified };
}

describe('PhoneOtpService', () => {
  it('stores only a hash, enforces cooldown, and verifies the account', async () => {
    const f = fixture();
    const result = await f.service.requestOtp('+218910001234');
    assert.equal(result.sent, true);
    assert.equal('pin' in result, false);
    assert.notEqual(f.getChallenge().pinHash, '123456');
    await assert.rejects(f.service.requestOtp('+218910001234'), /resend_cooldown/);
    assert.equal(f.sent(), 1);
    assert.deepEqual(await f.service.verifyOtp('+218910001234', '123456'), { verified: true });
    assert.equal(f.verified(), true);
    assert.equal(f.getChallenge(), null);
  });

  it('limits the code to five wrong attempts', async () => {
    const f = fixture();
    await f.service.requestOtp('+218910001234');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(f.service.verifyOtp('+218910001234', '000000'), /invalid_code/);
    }
    assert.equal(f.getChallenge().attempts, 5);
    await assert.rejects(f.service.verifyOtp('+218910001234', '123456'), /too_many_attempts/);
    assert.equal(f.verified(), false);
  });

  it('rejects expired codes', async () => {
    const f = fixture();
    await f.service.requestOtp('+218910001234');
    f.getChallenge().expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(f.service.verifyOtp('+218910001234', '123456'), /invalid_or_expired/);
  });

  it('does not reserve the resend cooldown when the API token is missing', async () => {
    const f = fixture();
    f.resala.ensureConfigured = () => { throw new Error('Check RESALA_API_TOKEN'); };
    await assert.rejects(f.service.requestOtp('+218910001234'), /RESALA_API_TOKEN/);
    assert.equal(f.getChallenge(), null);
  });
});
