#!/usr/bin/env node
// Build the static site: web/ + games/ -> site/
//
//   GALLERY_PASSWORD=... node scripts/build.mjs     locked build (what GitHub Actions runs)
//   node scripts/build.mjs --open                    no password: games are stored as-is (local testing)
//
// With a password, every game, cover image and the catalog itself are encrypted
// with AES-256-GCM; the key comes from the password (PBKDF2-SHA256, 310k rounds).
// The published site holds only ciphertext, so the shared password is a real lock
// even on a public GitHub Pages URL.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECK_TEXT, FORMAT_VERSION, KDF_ITERATIONS, deriveKey, encryptBytes, encryptText, sha256, toB64,
} from '../web/shared.js';
import { scanGames } from './lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const outDir = path.resolve(root, option('--out', 'site'));
const config = JSON.parse(await readFile(path.join(root, 'gallery.config.json'), 'utf8'));
const password = process.env.GALLERY_PASSWORD || '';

if (!password && config.requirePassword !== false && !flag('--open')) {
  console.error([
    '✖ Chưa có mật khẩu.',
    '  Trên GitHub: Settings → Secrets and variables → Actions → New repository secret,',
    '  tên GALLERY_PASSWORD, giá trị là mật khẩu chung của team.',
    '  Chạy thử trên máy không cần mật khẩu: npm run dev  (hoặc node scripts/build.mjs --open)',
  ].join('\n'));
  process.exit(1);
}
if (password && password.length < 8) {
  console.error('✖ GALLERY_PASSWORD quá ngắn — dùng ít nhất 8 ký tự.');
  process.exit(1);
}

const locked = Boolean(password);
const salt = (await sha256(`prototype-gallery|${config.id || 'default'}`)).slice(0, 16);
const key = locked ? await deriveKey(password, salt, KDF_ITERATIONS) : null;
const seal = async (bytes) => (locked ? encryptBytes(key, bytes) : bytes);
const fileId = async (slug, suffix = '') => Buffer.from((await sha256(`${toB64(salt)}|${slug}${suffix}`)).slice(0, 8)).toString('hex');

const maxBytes = Math.max(1, Number(config.maxGameSizeMB) || 40) * 1024 * 1024;
const { games, problems } = await scanGames(root, path.join(root, 'games'), { maxBytes });

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'g'), { recursive: true });
await mkdir(path.join(outDir, 'data'), { recursive: true });
await cp(path.join(root, 'web'), outDir, { recursive: true });
await writeFile(path.join(outDir, '.nojekyll'), '');

const catalog = [];
for (const g of games) {
  const file = `g/${await fileId(g.meta.slug)}.bin`;
  await writeFile(path.join(outDir, file), await seal(await readFile(g.htmlPath)));
  let thumb = null;
  if (g.thumbPath) {
    thumb = `g/${await fileId(g.meta.slug, ':thumb')}.bin`;
    await writeFile(path.join(outDir, thumb), await seal(await readFile(g.thumbPath)));
  }
  catalog.push({ ...g.meta, file, thumb, thumbType: g.thumbType, size: g.size });
}

const catalogJson = JSON.stringify({ v: FORMAT_VERSION, games: catalog });
await writeFile(path.join(outDir, 'data', 'catalog.bin'), locked ? await encryptText(key, catalogJson) : Buffer.from(catalogJson));

const site = {
  v: FORMAT_VERSION,
  title: String(config.title || 'Prototype Gallery').slice(0, 60),
  subtitle: String(config.subtitle || '').slice(0, 120),
  defaultDevice: config.defaultDevice || 'iphone-14',
  locked,
  builtAt: new Date().toISOString(),
};
if (locked) {
  site.kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toB64(salt) };
  site.check = toB64(await encryptText(key, CHECK_TEXT));
}
await writeFile(path.join(outDir, 'data', 'site.json'), JSON.stringify(site, null, 2));

// ------------------------------------------------------------------ report
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`${locked ? '🔒 Đã khoá bằng mật khẩu' : '🔓 KHÔNG khoá (chỉ dùng để thử trên máy)'} — ${games.length} game → ${path.relative(root, outDir)}/`);
for (const g of catalog) console.log(`  • ${g.slug.padEnd(28)} ${g.title.slice(0, 32).padEnd(32)} ${g.updated}  ${mb(g.size)}${g.thumb ? '  [ảnh bìa]' : ''}`);
if (problems.length) {
  console.log('\nCần xem lại:');
  for (const p of problems) console.log('  ⚠ ' + p);
}
