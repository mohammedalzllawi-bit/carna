const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateEnvironment } = require('../dist/config/environment');

const s3Keys = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];

function cloudinaryEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'mongodb+srv://cluster.example.test/carna',
    REDIS_URL: 'rediss://cache.example.test:6380',
    AUCTION_WORKER_MODE: 'redis',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    PAYMENT_WEBHOOK_SECRET: 'c'.repeat(64),
    CORS_ORIGINS: 'https://carna.example.test',
    MEDIA_STORAGE_PROVIDER: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'cloud-name',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'd'.repeat(64),
    ...overrides,
  };
}

function s3Environment() {
  return {
    S3_ENDPOINT: 'https://storage.example.test',
    S3_REGION: 'region-1',
    S3_BUCKET: 'private-documents',
    S3_ACCESS_KEY: 'storage-access-key',
    S3_SECRET_KEY: 'e'.repeat(64),
  };
}

test('production Cloudinary configuration does not require any S3 variables', () => {
  const environment = validateEnvironment(cloudinaryEnvironment());
  for (const key of s3Keys) assert.equal(environment[key], undefined);
  assert.equal(environment.MEDIA_STORAGE_PROVIDER, 'cloudinary');
  assert.equal(environment.CLOUDINARY_CLOUD_NAME, 'cloud-name');
});

test('Cloudinary URL credentials work without the separate keys or S3', () => {
  const environment = validateEnvironment(cloudinaryEnvironment({
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
    CLOUDINARY_URL: `cloudinary://123456:${'d'.repeat(64)}@cloud-name`,
  }));
  assert.ok(environment.CLOUDINARY_URL);
});

test('local development storage does not require S3 or Cloudinary credentials', () => {
  const environment = validateEnvironment(cloudinaryEnvironment({
    NODE_ENV: 'development',
    DATABASE_URL: 'mongodb://127.0.0.1:27017/carna',
    REDIS_URL: 'redis://127.0.0.1:6379',
    MEDIA_STORAGE_PROVIDER: 'local',
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
  }));
  assert.equal(environment.MEDIA_STORAGE_PROVIDER, 'local');
});

test('existing complete optional S3 configuration is preserved', () => {
  const configuration = s3Environment();
  const environment = validateEnvironment(cloudinaryEnvironment(configuration));
  for (const key of s3Keys) assert.equal(environment[key], configuration[key]);
});

test('partial S3 configuration fails with an actionable message', () => {
  for (const missing of s3Keys) {
    const configuration = s3Environment();
    delete configuration[missing];
    assert.throws(() => validateEnvironment(cloudinaryEnvironment(configuration)),
      /all five S3_\* variables/);
  }
});

test('optional S3 still rejects empty fields, invalid URLs and short secrets', () => {
  for (const invalid of [
    { S3_ENDPOINT: 'not-a-url' }, { S3_REGION: '' }, { S3_BUCKET: '' },
    { S3_ACCESS_KEY: '' }, { S3_SECRET_KEY: 'short' },
  ]) {
    assert.throws(() => validateEnvironment(cloudinaryEnvironment({ ...s3Environment(), ...invalid })));
  }
});

test('Cloudinary credentials remain required when it is the selected provider', () => {
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    const environment = cloudinaryEnvironment();
    delete environment[key];
    assert.throws(() => validateEnvironment(environment), /Cloudinary storage requires/);
  }
});

test('production checks remain enforced without S3', () => {
  for (const invalid of [
    { JWT_ACCESS_SECRET: 'change-me-access-secret' },
    { JWT_REFRESH_SECRET: 'local-development-refresh-secret' },
    { PAYMENT_WEBHOOK_SECRET: 'replace-with-payment-secret' },
    { CLOUDINARY_API_SECRET: 'replace-with-cloudinary-secret' },
    { DATABASE_URL: 'mongodb://localhost:27017/carna' },
    { REDIS_URL: 'redis://127.0.0.1:6379' },
    { AUCTION_WORKER_MODE: 'off' },
    { ALLOW_LEGACY_ADMIN_KEY: 'true', ADMIN_API_KEY: 'f'.repeat(64) },
  ]) {
    assert.throws(() => validateEnvironment(cloudinaryEnvironment(invalid)));
  }
});

test('development credentials in optional S3 are still rejected in production', () => {
  assert.throws(() => validateEnvironment(cloudinaryEnvironment({
    ...s3Environment(), S3_ACCESS_KEY: 'minioadmin', S3_SECRET_KEY: 'minioadmin',
  })), /development credentials/);
});

test('production Resala still requires its separate OTP secret and explicit URL', () => {
  assert.throws(() => validateEnvironment(cloudinaryEnvironment({
    RESALA_API_TOKEN: 'g'.repeat(64), RESALA_BASE_URL: 'https://sms.example.test/api/v1',
  })), /dedicated RESALA_OTP_SECRET/);
  assert.throws(() => validateEnvironment(cloudinaryEnvironment({
    RESALA_API_TOKEN: 'g'.repeat(64), RESALA_OTP_SECRET: 'h'.repeat(64),
  })), /explicit RESALA_BASE_URL/);
});
