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
import { scanGames } from '../scripts/lib/catalog.mjs';

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
