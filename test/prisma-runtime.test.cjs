const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyRuntime } = require('../apps/api/scripts/verify-runtime.cjs');

function fixture() {
  const names = ['ApprovalStatus', 'VehicleCategory', 'VehicleCondition', 'VehicleSaleType'];
  const client = {
    PrismaClient: class {},
    Prisma: { dmmf: { datamodel: { models: [{ name: 'Vehicle' }],
      enums: names.map((name) => ({ name, values: [{ name: 'Example' }] })) } } },
  };
  for (const name of names) client[name] = { Example: 'Example' };
  const imports = [];
  const load = (name) => { imports.push(name); return name === '@prisma/client' ? client : {}; };
  return { client, imports, load };
}

test('runtime verification loads generated enums and catalog DTOs without database access', () => {
  const { load, imports } = fixture();
  verifyRuntime(load);
  assert.deepEqual(imports, ['@prisma/client', 'reflect-metadata', './dist/modules/catalog/dto/catalog.dto.js']);
});

test('an ungenerated Prisma placeholder fails with an actionable error', () => {
  assert.throws(() => verifyRuntime(() => ({ PrismaClient: class {}, Prisma: {} })), /not generated.*npm run api:build/);
});

test('missing and invalid runtime enums fail before DTO decorators are evaluated', () => {
  for (const replacement of [undefined, { Example: 'Wrong' }]) {
    const { client, load, imports } = fixture();
    client.VehicleCategory = replacement;
    assert.throws(() => verifyRuntime(load), /runtime enum VehicleCategory is missing or invalid/);
    assert.deepEqual(imports, ['@prisma/client']);
  }
});

test('a generated client from an older schema without VehicleCategory is rejected', () => {
  const { client, load } = fixture();
  client.Prisma.dmmf.datamodel.enums = client.Prisma.dmmf.datamodel.enums.filter((entry) => entry.name !== 'VehicleCategory');
  assert.throws(() => verifyRuntime(load), /schema is missing VehicleCategory/);
});

test('compiled DTO import errors propagate instead of passing the runtime check', () => {
  const { load } = fixture();
  const error = new Error('Cannot load compiled catalog DTO');
  assert.throws(() => verifyRuntime((name) => {
    if (name.startsWith('./dist/')) throw error;
    return load(name);
  }), error);
});
