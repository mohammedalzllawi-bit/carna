const { MongoClient } = require('mongodb');

async function ensureUserEmailIndex(db) {
  const users = db.collection('User');
  // Install the replacement first so populated email addresses remain protected.
  await users.createIndex({ email: 1 }, {
    name: 'User_email_present_key', unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  });
  const legacy = (await users.indexes()).find((index) => index.name === 'User_email_key');
  if (legacy) {
    if (!legacy.unique || Object.keys(legacy.key).length !== 1 || legacy.key.email !== 1) {
      throw new Error('Unexpected User_email_key definition; manual review required.');
    }
    await users.dropIndex(legacy.name);
  }
}

module.exports = { ensureUserEmailIndex };

if (require.main === module) {
  const client = new MongoClient(process.env.DATABASE_URL);
  (async () => {
    try {
      await client.connect();
      await ensureUserEmailIndex(client.db());
      console.log('Email index upgraded; no user records changed.');
    } finally { await client.close(); }
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
