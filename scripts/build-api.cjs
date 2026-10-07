const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');

const cwd = resolve(__dirname, '../apps/api');
const requireApi = createRequire(resolve(cwd, 'package.json'));

function buildApi(run = spawnSync) {
  const steps = [
    ['--env-file-if-exists=../../.env', requireApi.resolve('prisma/build/index.js'), 'generate'],
    [requireApi.resolve('@nestjs/cli/bin/nest.js'), 'build'],
  ];
  for (const args of steps) {
    const result = run(process.execPath, args, { cwd, env: process.env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = buildApi();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildApi };
