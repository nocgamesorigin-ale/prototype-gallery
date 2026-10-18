import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CHECK_TEXT, decryptBytes, decryptText, deriveKey, encryptBytes, encryptText, exportRawKey, importRawKey,
  fromB64, toB64, slugify, htmlTitle, normalizeMeta, injectFirst, storageShim,
} from '../web/shared.js';
import { frameGeometry, deviceById, parseSize, safeInsets } from '../web/devices.js';
import { scanGames, titleConflict } from '../scripts/lib/catalog.mjs';
import { checkArt, imageSize } from '../scripts/lib/image.mjs';

/** Just enough of a PNG for the size reader: signature + IHDR with width/height. */
function pngHeader(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const salt = new Uint8Array(16).fill(7);

test('encrypt → decrypt round trip, wrong password fails', async () => {
  const key = await deriveKey('mat-khau-dung', salt, 1000, true);
  const data = new TextEncoder().encode('<html>xin chào 🎈</html>');
  const blob = await encryptBytes(key, data);
  assert.deepEqual(await decryptBytes(key, blob), data);
  const wrong = await deriveKey('mat-khau-sai', salt, 1000);
  await assert.rejects(decryptBytes(wrong, blob));
  const tampered = blob.slice(); tampered[20] ^= 1;
  await assert.rejects(decryptBytes(key, tampered));
});

test('raw key export/import keeps working (remember me)', async () => {
  const key = await deriveKey('abcdefgh', salt, 1000, true);
  const check = await encryptText(key, CHECK_TEXT);
  const again = await importRawKey(fromB64(toB64(await exportRawKey(key))));
  assert.equal(await decryptText(again, check), CHECK_TEXT);
});

test('base64 handles large buffers', () => {
  const big = new Uint8Array(200000).map((_, i) => i % 251);
  assert.deepEqual(fromB64(toB64(big)), big);
});

test('slugify Vietnamese names', () => {
  assert.equal(slugify('Tiệm Bánh Bao Bí Ẩn'), 'tiem-banh-bao-bi-an');
  assert.equal(slugify('Đường đua 3!'), 'duong-dua-3');
  assert.equal(slugify('  --Tangle_3--  '), 'tangle-3');
});

test('htmlTitle reads and unescapes <title>', () => {
  assert.equal(htmlTitle('<head><title>Tom &amp; Jerry</title></head>'), 'Tom & Jerry');
  assert.equal(htmlTitle('<body>no title</body>'), '');
});

test('normalizeMeta fills defaults and reports bad fields', () => {
  const { meta, warnings } = normalizeMeta({ title: 5, tags: 'Puzzle, casual,puzzle', orientation: 'sideways', status: 'nope', updated: 'yesterday' }, 'tangle-3', 'Tangle Three');
  assert.equal(meta.title, 'Tangle Three');
  assert.deepEqual(meta.tags, ['puzzle', 'casual']);
  assert.equal(meta.orientation, 'portrait');
  assert.equal(meta.status, '');
  assert.equal(meta.updated, '');
  assert.equal(warnings.length, 4);
  assert.equal(normalizeMeta(undefined, 'abc').meta.title, 'Abc');
});

test('injectFirst puts the shim before every game script', () => {
  const shim = '<script>/*shim*/</script>';
  assert.match(injectFirst('<!doctype html><html><head><script>a</script></head></html>', shim), /<head><script>\/\*shim\*\/<\/script><script>a/);
  assert.match(injectFirst('<html lang="vi"><body></body></html>', shim), /^<html lang="vi"><head><script>/);
  assert.match(injectFirst('<!DOCTYPE html><script>x</script>', shim), /^<!DOCTYPE html><script>\/\*shim/);
  assert.ok(injectFirst('<canvas></canvas>', shim).startsWith(shim));
});

test('storageShim cannot be broken out of with </script> in saved data', () => {
  const s = storageShim({ localStorage: { k: '</script><script>alert(1)</script>' } });
  assert.equal(s.match(/<\/script>/g).length, 1);
});

test('frame geometry fits and never scales up', () => {
  const d = deviceById('iphone-14');
  const g = frameGeometry(d, false, 2000, 2000);
  assert.equal(g.scale, 1);
  assert.equal(g.screenW, 390);
  const small = frameGeometry(d, false, 400, 500);
  assert.ok(small.scale < 1 && small.frameH * small.scale <= 500);
  const land = frameGeometry(d, true, 2000, 2000);
  assert.equal(land.screenW, 844);
  assert.deepEqual(parseSize('390 × 844'), { width: 390, height: 844 });
  assert.equal(parseSize('20x20'), null);
  assert.equal(safeInsets(d, false).top, 47);
  assert.equal(safeInsets(d, true).left, 47);
});

test('scanGames: skips bad folders, falls back to <title>', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pg-'));
  try {
    const games = path.join(root, 'games');
    await mkdir(path.join(games, 'good-one'), { recursive: true });
    await writeFile(path.join(games, 'good-one', 'index.html'), '<title>Good One</title><script></script>');
    await mkdir(path.join(games, 'Bad Name'), { recursive: true });
    await writeFile(path.join(games, 'Bad Name', 'index.html'), '<script></script>');
    await mkdir(path.join(games, 'no-html'), { recursive: true });
    await mkdir(path.join(games, 'broken-json'), { recursive: true });
    await writeFile(path.join(games, 'broken-json', 'index.html'), '<script></script>');
    await writeFile(path.join(games, 'broken-json', 'game.json'), '{ nope');
    await mkdir(path.join(games, '_draft'), { recursive: true });
    const { games: found, problems } = await scanGames(root, games);
    assert.deepEqual(found.map((g) => g.meta.slug).sort(), ['broken-json', 'good-one']);
    assert.equal(found.find((g) => g.meta.slug === 'good-one').meta.title, 'Good One');
    assert.ok(problems.some((p) => p.includes('Bad Name')));
    assert.ok(problems.some((p) => p.includes('no-html')));
    assert.ok(problems.some((p) => p.includes('JSON lỗi')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('imageSize reads PNG, JPEG and WebP headers', () => {
  assert.deepEqual(imageSize(pngHeader(512, 512)), { type: 'image/png', width: 512, height: 512 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x04, 0x00, 0x03, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(jpeg), { type: 'image/jpeg', width: 1024, height: 512 });
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(1023, 24, 3); webp.writeUIntLE(511, 27, 3);
  assert.deepEqual(imageSize(webp), { type: 'image/webp', width: 1024, height: 512 });
  assert.equal(imageSize(Buffer.from('not an image at all, really not')), null);
});

test('checkArt enforces icon 512×512 and banner 1024×512', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pg-art-'));
  try {
    const icon = path.join(dir, 'i.png');
    const banner = path.join(dir, 'b.png');
    await writeFile(icon, pngHeader(512, 512));
    await writeFile(banner, pngHeader(1024, 500));
    assert.equal((await checkArt('icon', icon)).ok, true);
    const bad = await checkArt('banner', banner);
    assert.equal(bad.ok, false);
    assert.match(bad.error, /1024×512.*1024×500/);
    assert.equal((await checkArt('icon', path.join(dir, 'x.gif'))).ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('titleConflict: same name in any spelling, but not the game itself', () => {
  const games = [{ meta: { slug: 'tangle-3', title: 'Tangle 3' } }, { meta: { slug: 'bong-bay', title: 'Bóng Bay' } }];
  assert.equal(titleConflict(games, 'TANGLE  3', 'new-game').meta.slug, 'tangle-3');
  assert.equal(titleConflict(games, 'tangle-3', '').meta.slug, 'tangle-3');
  assert.equal(titleConflict(games, 'Bong bay', 'x').meta.slug, 'bong-bay');
  assert.equal(titleConflict(games, 'Tangle 3', 'tangle-3'), null);
  assert.equal(titleConflict(games, 'Tangle 4', 'x'), null);
});

test('scanGames picks up icon and banner', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pg-'));
  try {
    const dir = path.join(root, 'games', 'with-art');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<title>Art</title><script></script>');
    await writeFile(path.join(dir, 'icon.png'), pngHeader(512, 512));
    await writeFile(path.join(dir, 'banner.png'), pngHeader(800, 400));
    const { games, problems } = await scanGames(root, path.join(root, 'games'));
    assert.deepEqual(Object.keys(games[0].art).sort(), ['banner', 'icon']);
    assert.equal(games[0].art.icon.type, 'image/png');
    assert.ok(problems.some((p) => p.includes('banner.png') && p.includes('1024×512')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
