const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { Writable } = require('node:stream');

async function readAdminPassword(askHidden, write, configuredPassword) {
  const validLength = (password) => password.length >= 12 && password.length <= 72;
  if (configuredPassword !== undefined) {
    if (!validLength(configuredPassword)) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be 12 to 72 characters.');
    return configuredPassword;
  }

  write('Choose a password with 12 to 72 characters. Input is hidden while typing.\n');
  while (true) {
    const password = await askHidden('Admin password (hidden): ');
    if (!validLength(password)) {
      write('Password must be 12 to 72 characters. Please try again.\n');
      continue;
    }
    const confirmation = await askHidden('Confirm admin password (hidden): ');
    if (password !== confirmation) {
      write('Passwords do not match. Please try again.\n');
      continue;
    }
    return password;
  }
}

async function main() {
  const prisma = new PrismaClient();
  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!muted) stdout.write(chunk, encoding); done(); } });
  const rl = readline.createInterface({ input: stdin, output, terminal: Boolean(stdout.isTTY) });
  try {
    const existing = await prisma.user.findFirst({ where: { roles: { some: { role: { code: 'SUPER_ADMIN' } } }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } });
    if (existing) throw new Error('A Super Admin already exists. Manage accounts from the dashboard.');
    const phoneInput = (process.env.BOOTSTRAP_ADMIN_PHONE || await rl.question('Admin phone (09xxxxxxxx): ')).trim();
    const phone = phoneInput.startsWith('0') ? '+218' + phoneInput.slice(1) : phoneInput;
    if (!/^\+2189[1-6]\d{7}$/.test(phone)) throw new Error('Invalid Libyan mobile phone.');
    const askHidden = async (prompt) => {
      stdout.write(prompt);
      muted = true;
      try { return await rl.question(''); }
      finally { muted = false; stdout.write('\n'); }
    };
    const password = await readAdminPassword(askHidden, (message) => stdout.write(message), process.env.BOOTSTRAP_ADMIN_PASSWORD);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { phone, fullName: 'Platform Administrator', passwordHash, status: 'Active', phoneVerifiedAt: new Date(), roles: { create: { roleId: role.id } } } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'admin.bootstrap', entityType: 'User', entityId: user.id } });
    });
    stdout.write('Administrator created. Sign in at http://localhost:3101/login\n');
  } finally { rl.close(); await prisma.$disconnect(); }
}
module.exports = { readAdminPassword };
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
