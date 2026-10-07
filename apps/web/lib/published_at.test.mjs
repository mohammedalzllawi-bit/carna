import assert from 'node:assert/strict';
import test from 'node:test';
import { publishedDateDetailed, publishedDateRelative } from './published_at.ts';

const now = new Date('2026-01-20T12:00:00');

test('relative date changes from hours to days to calendar date', () => {
  assert.equal(publishedDateRelative(new Date(now.getTime() - 7 * 3_600_000).toISOString(), now), 'منذ 7 ساعات');
  assert.equal(publishedDateRelative(new Date(now.getTime() - 2 * 86_400_000).toISOString(), now), 'منذ يومين');
  assert.equal(publishedDateRelative(new Date(now.getTime() - 9 * 86_400_000).toISOString(), now), 'منذ 9 أيام');
  assert.equal(publishedDateRelative('2026-01-10T12:00:00', now), 'منذ 10 يناير');
  assert.equal(publishedDateRelative('2025-12-30T12:00:00', now), 'منذ 30 ديسمبر 2025');
});

test('invalid dates are omitted and details contain the time', () => {
  assert.equal(publishedDateRelative('invalid', now), null);
  assert.equal(publishedDateDetailed(null), null);
  const detailed = publishedDateDetailed('2026-01-06T14:35:00');
  assert.match(detailed, /6 يناير 2026/);
  assert.match(detailed, /2:35/);
});
