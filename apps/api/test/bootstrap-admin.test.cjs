const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readAdminPassword } = require('../scripts/bootstrap-admin.cjs');

function promptFixture(answers) {
  const prompts = [];
  const messages = [];
  return {
    prompts, messages,
    askHidden: async (prompt) => {
      prompts.push(prompt);
      assert.ok(answers.length, 'Unexpected extra password prompt');
      return answers.shift();
    },
    write: (message) => messages.push(message),
  };
}

test('bootstrap retries empty, short and oversized passwords before confirmation', async () => {
  const password = 'fixture-only-Password!';
  const fixture = promptFixture(['', 'short', 'x'.repeat(73), password, password]);
  assert.equal(await readAdminPassword(fixture.askHidden, fixture.write), password);
  assert.equal(fixture.prompts.length, 5);
  assert.equal(fixture.messages.filter((message) => message.includes('Please try again')).length, 3);
  assert.ok(fixture.messages.every((message) => !message.includes(password)));
});

test('bootstrap retries a confirmation mismatch without echoing either password', async () => {
  const password = 'fixture-only-Password!';
  const mismatch = 'fixture-only-Different!';
  const fixture = promptFixture([password, mismatch, password, password]);
  assert.equal(await readAdminPassword(fixture.askHidden, fixture.write), password);
  assert.equal(fixture.prompts.length, 4);
  assert.ok(fixture.messages.some((message) => message.includes('Passwords do not match')));
  assert.ok(fixture.messages.every((message) => !message.includes(password) && !message.includes(mismatch)));
});

test('bootstrap accepts both password length boundaries', async () => {
  for (const length of [12, 72]) {
    const password = 'x'.repeat(length);
    const fixture = promptFixture([password, password]);
    assert.equal(await readAdminPassword(fixture.askHidden, fixture.write), password);
  }
});

test('bootstrap validates environment passwords without an interactive fallback', async () => {
  for (const password of ['', 'short', 'x'.repeat(73)]) {
    const fixture = promptFixture([]);
    await assert.rejects(readAdminPassword(fixture.askHidden, fixture.write, password), /BOOTSTRAP_ADMIN_PASSWORD must be 12 to 72 characters/);
    assert.equal(fixture.prompts.length, 0);
  }
  const fixture = promptFixture([]);
  const password = 'fixture-only-Password!';
  assert.equal(await readAdminPassword(fixture.askHidden, fixture.write, password), password);
  assert.equal(fixture.prompts.length, 0);
});

test('bootstrap stops if the hidden prompt fails', async () => {
  await assert.rejects(readAdminPassword(async () => { throw new Error('Input closed'); }, () => {}), /Input closed/);
});
