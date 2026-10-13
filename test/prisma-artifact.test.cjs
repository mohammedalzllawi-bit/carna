const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');
const { packPrismaRuntime, prepareRuntime, restorePrismaRuntime } = require('../apps/api/scripts/prisma-artifact.cjs');

function fixture(generated = true) {
  const root = mkdtempSync(join(tmpdir(), 'carna-prisma-artifact-'));
  const api = join(root, 'apps/api');
  const installed = join(root, 'node_modules/.prisma/client');
  const clientPackage = join(root, 'node_modules/@prisma/client');
  const artifact = join(api, 'dist/prisma-runtime');
  const write = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  write(join(api, 'package.json'), '{}');
  write(join(api, 'prisma/schema.prisma'), 'generator client { provider = "prisma-client-js" }\n');
  write(join(clientPackage, 'package.json'), JSON.stringify({ version: '5.22.0', main: 'default.js' }));
  write(join(clientPackage, 'default.js'), "module.exports = require('.prisma/client/default');\n");
  if (generated) {
    write(join(installed, 'default.js'), "module.exports = require('./index');\n");
    write(join(installed, 'index.js'), 'module.exports = { VehicleCategory: { Car: "Car" } };\n');
    write(join(installed, 'package.json'), '{}');
    write(join(installed, 'schema.prisma'), 'generated schema\n');
    write(join(installed, 'query_engine-fixture.node'), 'unit test engine');
  }
  return { root, api, installed, artifact, clientPackage, write };
}

const readManifest = (f) => JSON.parse(readFileSync(join(f.artifact, 'manifest.json'), 'utf8'));
const writeManifest = (f, manifest) => f.write(join(f.artifact, 'manifest.json'), JSON.stringify(manifest));

test('the generated client and engine are packaged outside node_modules without temporary files', () => {
  const f = fixture();
  f.write(join(f.installed, 'query_engine-fixture.node.tmp123'), 'incomplete engine');
  packPrismaRuntime(f.api);
  const manifest = readManifest(f);
  assert.equal(manifest.clientVersion, '5.22.0');
  assert.equal(manifest.platform, process.platform);
  assert.equal(manifest.arch, process.arch);
  assert.equal(manifest.files.length, 5);
  assert.ok(manifest.files.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
  assert.equal(existsSync(join(f.artifact, 'client/query_engine-fixture.node.tmp123')), false);
  assert.equal(restorePrismaRuntime(f.api), 0);
});

test('runtime preparation restores overwritten install placeholders without rewriting healthy files', () => {
  const f = fixture();
  packPrismaRuntime(f.api);
  f.write(join(f.installed, 'index.js'), 'module.exports = {};\n');
  assert.equal(restorePrismaRuntime(f.api), 1);
  assert.equal(readFileSync(join(f.installed, 'index.js'), 'utf8'), 'module.exports = { VehicleCategory: { Car: "Car" } };\n');
  assert.equal(restorePrismaRuntime(f.api), 0);
});

test('an absent generated client directory is restored from the build artifact', () => {
  const built = fixture();
  packPrismaRuntime(built.api);
  const missing = fixture(false);
  cpSync(built.artifact, missing.artifact, { recursive: true });
  assert.equal(existsSync(missing.installed), false);
  assert.equal(restorePrismaRuntime(missing.api), 5);
  assert.equal(restorePrismaRuntime(missing.api), 0);
});

test('runtime preparation runs the existing verifier in a fresh process without a shell or generation', () => {
  const f = fixture();
  packPrismaRuntime(f.api);
  const calls = [];
  assert.equal(prepareRuntime((...args) => { calls.push(args); return { status: 0 }; }, f.api), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], [join(f.api, 'scripts/verify-runtime.cjs')]);
  assert.equal(calls[0][2].cwd, f.api);
  assert.notEqual(calls[0][2].shell, true);
});

test('runtime verifier failures, spawn errors, and termination cannot be reported as success', () => {
  const f = fixture();
  packPrismaRuntime(f.api);
  assert.equal(prepareRuntime(() => ({ status: 9 }), f.api), 9);
  assert.equal(prepareRuntime(() => ({ status: null, signal: 'SIGTERM' }), f.api), 1);
  const error = new Error('Cannot launch verifier');
  assert.throws(() => prepareRuntime(() => ({ error }), f.api), error);
});

test('a missing build artifact fails with a rebuild instruction, not a network fallback', () => {
  const f = fixture();
  assert.throws(() => restorePrismaRuntime(f.api), /build artifact is missing.*npm run api:build/);
});

test('all artifact files are validated before any overwritten runtime file is restored', () => {
  const f = fixture();
  packPrismaRuntime(f.api);
  f.write(join(f.installed, 'index.js'), 'placeholder');
  f.write(join(f.artifact, 'client/query_engine-fixture.node'), 'corrupt engine');
  assert.throws(() => restorePrismaRuntime(f.api), /missing or corrupted: query_engine-fixture.node/);
  assert.equal(readFileSync(join(f.installed, 'index.js'), 'utf8'), 'placeholder');
});

test('an artifact from another schema, client version, architecture, or platform is rejected', () => {
  for (const field of ['schemaHash', 'clientVersion', 'arch', 'platform']) {
    const f = fixture();
    packPrismaRuntime(f.api);
    const manifest = readManifest(f);
    manifest[field] = 'wrong';
    writeManifest(f, manifest);
    assert.throws(() => restorePrismaRuntime(f.api), /does not match this application/);
  }
});

test('a changed application schema rejects an otherwise valid artifact', () => {
  const f = fixture();
  packPrismaRuntime(f.api);
  f.write(join(f.api, 'prisma/schema.prisma'), 'a newer schema\n');
  assert.throws(() => restorePrismaRuntime(f.api), /does not match this application/);
});

test('incomplete manifests, path traversal, duplicate files, and invalid hashes are rejected', () => {
  const mutations = [
    (m) => { m.format = 99; },
    (m) => { m.files = []; },
    (m) => { m.files = m.files.filter((f) => !f.path.startsWith('query_engine-')); },
    (m) => { m.files[0].path = '../outside.js'; },
    (m) => { m.files[0].path = 'C:\\outside.js'; },
    (m) => { m.files[0].path = '/outside.js'; },
    (m) => { m.files.push(m.files[0]); },
    (m) => { m.files[0].sha256 = 'invalid'; },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    packPrismaRuntime(f.api);
    const manifest = readManifest(f);
    mutate(manifest);
    writeManifest(f, manifest);
    assert.throws(() => restorePrismaRuntime(f.api), /Invalid Prisma|missing client files or its native query engine/);
  }
});

test('a real generated client and native engine survive a runtime install-placeholder overlay', () => {
  const f = fixture(false);
  const packageDir = dirname(require.resolve('@prisma/client/package.json'));
  const generatedDir = dirname(require.resolve('.prisma/client/default'));
  cpSync(packageDir, f.clientPackage, { recursive: true });
  cpSync(generatedDir, f.installed, { recursive: true, filter: (path) => !/\.tmp\d*$/.test(path) });
  packPrismaRuntime(f.api);
  cpSync(join(packageDir, 'scripts/default-index.js'), join(f.installed, 'index.js'));
  cpSync(join(packageDir, 'scripts/default-index.js'), join(f.installed, 'default.js'));
  const load = (script) => spawnSync(process.execPath, ['-e', script, f.clientPackage], { encoding: 'utf8' });
  const broken = load('new (require(process.argv[1]).PrismaClient)();');
  assert.notEqual(broken.status, 0);
  assert.match(broken.stderr, /did not initialize yet/);
  assert.equal(restorePrismaRuntime(f.api), 2);
  const manifest = readManifest(f);
  const engine = manifest.files.find(({ path }) => /(?:\.node|\.exe)$/.test(path));
  assert.ok(engine);
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const client = require(process.argv[1]);
    assert.equal(client.VehicleCategory.Car, 'Car');
    assert.ok(client.Prisma.dmmf.datamodel.models.length > 0);
    const prisma = new client.PrismaClient();
    assert.equal(typeof require(process.argv[2]).QueryEngine, 'function');
    prisma.$disconnect();
  `, f.clientPackage, resolve(f.installed, engine.path)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
