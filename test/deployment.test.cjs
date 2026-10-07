const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { buildApi } = require('../scripts/build-api.cjs');

const readJson = (file) => JSON.parse(readFileSync(resolve(__dirname, '..', file), 'utf8'));

test('the root exposes the API start command for Railpack discovery', () => {
  const root = readJson('package.json');
  assert.equal(root.scripts.start, 'npm run api:start');
  assert.equal(root.scripts['api:build'], 'node scripts/build-api.cjs');
});

test('each Railpack service builds and starts its own workspace', () => {
  const configurations = [
    ['railpack.json', 'npm run api:build', 'npm start'],
    ['deploy/railpack.web.json', 'npm run build --workspace @libya-auctions/web', 'npm run web:start'],
    ['deploy/railpack.admin.json', 'npm run build --workspace @libya-auctions/admin', 'npm run admin:start'],
  ];
  for (const [file, build, start] of configurations) {
    const config = readJson(file);
    assert.equal(config.provider, 'node');
    assert.equal(config.packages.node, '24');
    assert.deepEqual(config.steps.build.commands, [build]);
    assert.equal(config.deploy.startCommand, start);
  }
});

test('Railpack keeps provider manifest copies before installing dependencies', () => {
  for (const file of ['railpack.json', 'deploy/railpack.web.json', 'deploy/railpack.admin.json']) {
    const install = readJson(file).steps.install;
    assert.equal(install.commands, undefined, `${file} must not replace provider copy commands`);
    assert.equal(install.inputs, undefined, `${file} must keep provider input layers`);
    assert.equal(install.variables.MONGOMS_DISABLE_POSTINSTALL, '1');
  }
});

test('the API runtime does not publish install files over generated build dependencies', () => {
  const config = readJson('railpack.json');
  assert.deepEqual(config.steps.install.deployOutputs, []);
  assert.equal(config.deploy.inputs, undefined);
  const api = readJson('apps/api/package.json');
  assert.equal(api.scripts.prestart, 'npm run verify:runtime');
  assert.equal(api.scripts['verify:runtime'], 'node scripts/verify-runtime.cjs');
});

test('API builds generate Prisma, compile Nest and verify runtime without a shell', () => {
  const calls = [];
  assert.equal(buildApi((...args) => { calls.push(args); return { status: 0 }; }), 0);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], process.execPath);
  assert.equal(calls[0][1].at(-1), 'generate');
  assert.equal(calls[1][1].at(-1), 'build');
  assert.equal(calls[2][1][0], resolve(__dirname, '../apps/api/scripts/verify-runtime.cjs'));
  for (const [, , options] of calls) {
    assert.equal(options.cwd, resolve(__dirname, '../apps/api'));
    assert.equal(options.env, process.env);
    assert.notEqual(options.shell, true);
  }
});

test('a runtime verification failure cannot report a successful API build', () => {
  let calls = 0;
  assert.equal(buildApi(() => ({ status: ++calls === 3 ? 1 : 0 })), 1);
  assert.equal(calls, 3);
});

test('a failed Prisma generation prevents compilation and preserves the exit code', () => {
  let calls = 0;
  assert.equal(buildApi(() => { calls++; return { status: 7 }; }), 7);
  assert.equal(calls, 1);
});

test('spawn errors and terminated build commands cannot report success', () => {
  const error = new Error('Could not start build process');
  assert.throws(() => buildApi(() => ({ error })), error);
  assert.equal(buildApi(() => ({ status: null, signal: 'SIGTERM' })), 1);
});
