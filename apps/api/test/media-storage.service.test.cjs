const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { rm } = require('node:fs/promises');
const { ConfigService } = require('@nestjs/config');
const { MediaStorageService } = require('../dist/modules/media/media-storage.service');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test('local media storage validates, serves and deletes image bytes', async () => {
  const directory = join(tmpdir(), `libya-auctions-media-${randomUUID()}`);
  const service = new MediaStorageService(new ConfigService({ MEDIA_STORAGE_PROVIDER: 'local', MEDIA_STORAGE_DIR: directory }));
  try {
    const stored = await service.storeImage({ buffer: png, size: png.length, mimetype: 'image/png' }, { folder: 'vehicle-test' });
    assert.equal(stored.provider, 'local');
    assert.match(stored.storageKey, /^local:vehicle-test-/);
    assert.match(stored.url, /^\/v1\/media\/images\/vehicle-test-/);
    const opened = await service.openLocal(stored.storageKey.slice('local:'.length));
    const chunks = [];
    for await (const chunk of opened.stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), png);
    await service.delete(stored.storageKey);
    await assert.rejects(service.openLocal(stored.storageKey.slice('local:'.length)), /media.image_not_found/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('media storage rejects a forged image MIME type', async () => {
  const service = new MediaStorageService(new ConfigService({ MEDIA_STORAGE_PROVIDER: 'local', MEDIA_STORAGE_DIR: join(tmpdir(), randomUUID()) }));
  await assert.rejects(
    service.storeImage({ buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/png' }, { folder: 'vehicle-test' }),
    /media.image_invalid_type/,
  );
});
