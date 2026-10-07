const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { ensureUserEmailIndex } = require('../scripts/user-email-index.cjs');

test('email index upgrade permits phone-only accounts while preserving email uniqueness and existing users', async () => {
  const databaseName = `lca_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/' + databaseName;
  const client = new MongoClient(url.toString());
  try {
    await client.connect();
    const db = client.db(databaseName);
    const users = db.collection('User');
    await users.createIndex({ email: 1 }, { unique: true, name: 'User_email_key' });
    await users.insertOne({ _id: 'existing-user', phone: 'test-original' });
    await assert.rejects(users.insertOne({ _id: 'second-user', phone: 'test-second' }), (error) => error.code === 11000);
    await ensureUserEmailIndex(db);
    await ensureUserEmailIndex(db);
    assert.equal((await users.findOne({ _id: 'existing-user' })).phone, 'test-original');
    await users.insertOne({ _id: 'second-user', phone: 'test-second' });
    await users.insertOne({ _id: 'null-email', email: null });
    await users.insertOne({ _id: 'another-null-email', email: null });
    await users.insertOne({ _id: 'with-email', email: 'fixture@example.test' });
    await assert.rejects(users.insertOne({ _id: 'duplicate-email', email: 'fixture@example.test' }), (error) => error.code === 11000);
    assert.equal(await users.countDocuments(), 5);
  } finally {
    assert.match(databaseName, /^lca_test_[a-f0-9]{24}$/);
    await client.db(databaseName).dropDatabase();
    await client.close();
  }
});
