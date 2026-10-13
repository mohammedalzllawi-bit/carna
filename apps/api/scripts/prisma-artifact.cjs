const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, isAbsolute, join, resolve } = require('node:path');

const defaultApiDir = resolve(__dirname, '..');
const repair = 'Run npm run api:build, deploy the latest commit, and preserve apps/api/dist in the runtime image.';
const hash = (content) => createHash('sha256').update(content).digest('hex');
const schemaHash = (apiDir) => hash(readFileSync(join(apiDir, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n'));

function paths(apiDir) {
  const requireApi = createRequire(join(apiDir, 'package.json'));
  const packagePath = requireApi.resolve('@prisma/client/package.json');
  return {
    requireClient: createRequire(packagePath),
    clientVersion: JSON.parse(readFileSync(packagePath, 'utf8')).version,
    installed: resolve(dirname(packagePath), '../../.prisma/client'),
    artifact: join(apiDir, 'dist/prisma-runtime'),
  };
}

function listFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (/\.tmp\d*$/.test(entry.name)) return [];
    if (entry.isDirectory()) return listFiles(join(directory, entry.name), name);
    if (!entry.isFile()) throw new Error(`Unexpected Prisma artifact entry: ${name}`);
    return [name];
  }).sort();
}

function packPrismaRuntime(apiDir = defaultApiDir) {
  const { requireClient, clientVersion, artifact } = paths(apiDir);
  const source = dirname(requireClient.resolve('.prisma/client/default'));
  const files = listFiles(source).map((path) => ({ path, sha256: hash(readFileSync(join(source, path))) }));
  const manifest = { format: 1, clientVersion, platform: process.platform, arch: process.arch, schemaHash: schemaHash(apiDir), files };
  validateManifest(manifest);
  for (const { path } of files) {
    const target = join(artifact, 'client', path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, path), target);
  }
  writeFileSync(join(artifact, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function validateManifest(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error(`Invalid Prisma build artifact. ${repair}`);
  }
  const names = new Set();
  for (const file of manifest.files) {
    if (typeof file?.path !== 'string' || isAbsolute(file.path) || /[\\:]/.test(file.path) ||
        file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        !/^[a-f0-9]{64}$/.test(file.sha256) || names.has(file.path)) {
      throw new Error(`Invalid Prisma artifact file entry. ${repair}`);
    }
    names.add(file.path);
  }
  if (['default.js', 'index.js', 'schema.prisma', 'package.json'].some((name) => !names.has(name)) ||
      ![...names].some((name) => /^(?:libquery_engine-|query_engine-|query-engine-)/.test(name))) {
    throw new Error(`Prisma build artifact is missing client files or its native query engine. ${repair}`);
  }
}

function restorePrismaRuntime(apiDir = defaultApiDir) {
  const { artifact, installed, clientVersion } = paths(apiDir);
  const manifestPath = join(artifact, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Prisma build artifact is missing. ${repair}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateManifest(manifest);
  if (manifest.clientVersion !== clientVersion || manifest.platform !== process.platform ||
      manifest.arch !== process.arch || manifest.schemaHash !== schemaHash(apiDir)) {
    throw new Error(`Prisma build artifact does not match this application, platform, or installed client version. ${repair}`);
  }
  // Validate the entire build artifact before restoring any runtime dependency.
  for (const { path, sha256 } of manifest.files) {
    const source = join(artifact, 'client', path);
    if (!existsSync(source) || hash(readFileSync(source)) !== sha256) {
      throw new Error(`Prisma build artifact is missing or corrupted: ${path}. ${repair}`);
    }
  }
  let restored = 0;
  for (const { path, sha256 } of manifest.files) {
    const target = join(installed, path);
    if (existsSync(target) && hash(readFileSync(target)) === sha256) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(artifact, 'client', path), target);
    restored++;
  }
  return restored;
}

function prepareRuntime(run = spawnSync, apiDir = defaultApiDir) {
  const restored = restorePrismaRuntime(apiDir);
  console.log(`Prisma build artifact verified (${restored} runtime files restored).`);
  const result = run(process.execPath, [join(apiDir, 'scripts/verify-runtime.cjs')], {
    cwd: apiDir, env: process.env, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  try {
    if (process.argv[2] === 'pack') {
      packPrismaRuntime();
      console.log('Prisma client and native query engine packaged in apps/api/dist/prisma-runtime.');
    } else if (process.argv[2] === 'prepare') {
      process.exitCode = prepareRuntime();
    } else {
      throw new Error('Expected pack or prepare for the Prisma runtime artifact.');
    }
  } catch (error) {
    console.error(`API runtime preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { packPrismaRuntime, restorePrismaRuntime, prepareRuntime };
