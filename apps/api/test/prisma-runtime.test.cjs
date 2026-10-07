const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { verifyRuntime } = require('../scripts/verify-runtime.cjs');

const requireApi = createRequire(resolve(__dirname, '../package.json'));

test('the compiled application loads its generated Prisma enums and catalog decorators', () => {
  assert.doesNotThrow(() => verifyRuntime());
});

test('the actual Prisma install placeholder is rejected before catalog initialization', () => {
  const placeholder = requireApi('@prisma/client/scripts/default-index.js');
  assert.equal(placeholder.VehicleCategory, undefined);
  assert.throws(() => verifyRuntime((name) => {
    assert.equal(name, '@prisma/client');
    return placeholder;
  }), /Prisma Client is not generated/);
});
