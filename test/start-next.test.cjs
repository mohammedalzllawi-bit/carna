const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePort } = require('../scripts/start-next.cjs');
test('hosting PORT overrides the local web and admin defaults', () => {
  assert.equal(parsePort('8080', 3100), 8080);
  assert.equal(parsePort(undefined, 3101), 3101);
  assert.equal(parsePort('', 3100), 3100);
});
test('invalid and reserved ports fail before starting another server', () => {
  for (const port of ['0', '65536', '3000', '31e2', 'abc', '3100;cmd', '-1']) assert.throws(() => parsePort(port, 3100));
});
