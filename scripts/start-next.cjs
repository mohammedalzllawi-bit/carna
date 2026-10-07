const { spawn } = require('node:child_process');

function parsePort(value, fallback) {
  const raw = value === undefined || value === '' ? String(fallback) : value;
  if (!/^\d+$/.test(raw)) throw new Error('PORT must be an integer');
  const port = Number(raw);
  if (port < 1 || port > 65535 || port === 3000) throw new Error('PORT must be 1-65535 and must not use reserved port 3000');
  return port;
}

if (require.main === module) {
  const port = parsePort(process.env.PORT, process.argv[2]);
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0', '-p', String(port)], { stdio: 'inherit', env: process.env });
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}
module.exports = { parsePort };
