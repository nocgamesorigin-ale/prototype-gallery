#!/usr/bin/env node
// Build the static site: web/ + games/ + brand/ -> site/
//
//   GALLERY_PASSWORD=... node scripts/build.mjs     locked build (what GitHub Actions runs)
//   node scripts/build.mjs --open                    no password: games are stored as-is (local testing)
//
// With a password, every game, cover image, the team photo and the catalog itself are
// encrypted with AES-256-GCM; the key comes from the password (PBKDF2-SHA256, 310k rounds).
// The team logo (brand/logo.*) stays public because the lock screen shows it.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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

// ------------------------------------------------------------------ brand (logo + team photo)
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
async function findBrand(base) {
  let files = [];
  try { files = await readdir(path.join(root, 'brand')); } catch { return null; }
  const matches = files.filter((f) => path.parse(f).name.toLowerCase() === base && IMAGE_TYPES[path.extname(f).toLowerCase()]);
  if (!matches.length) return null;
  // several formats (team.png + team.jpg)? prefer the one the admin page writes, then the newest
  const name = matches.find((f) => f.toLowerCase() === (base === 'logo' ? 'logo.png' : 'team.jpg')) || matches[0];
  const file = path.join(root, 'brand', name);
  const size = (await stat(file)).size;
  if (size > 5 * 1024 * 1024) { problems.push(`brand/${name} lớn hơn 5 MB — hãy nén ảnh lại.`); return null; }
  return { file, ext: path.extname(name).toLowerCase(), type: IMAGE_TYPES[path.extname(name).toLowerCase()] };
}
const logo = await findBrand('logo');
let logoPath = '';
if (logo) {
  logoPath = `brand-logo${logo.ext}`;
  await cp(logo.file, path.join(outDir, logoPath));
}
const teamPhoto = await findBrand('team');
const cfgTeam = config.team && typeof config.team === 'object' ? config.team : {};
const team = {
  name: String(cfgTeam.name || '').slice(0, 60),
  eyebrow: String(cfgTeam.eyebrow || '').slice(0, 60),
  intro: String(cfgTeam.intro || '').slice(0, 600),
  stats: Array.isArray(cfgTeam.stats) ? cfgTeam.stats.slice(0, 4).filter((s) => s && s.value !== undefined && s.label).map((s) => ({ value: String(s.value).slice(0, 12), label: String(s.label).slice(0, 40) })) : [],
};
if (teamPhoto) {
  team.photo = `data/${await fileId('__team__', ':photo')}.bin`;
  team.photoType = teamPhoto.type;
  await writeFile(path.join(outDir, team.photo), await seal(await readFile(teamPhoto.file)));
}
const featured = Array.isArray(config.featured) ? config.featured.filter((s) => typeof s === 'string').slice(0, 12) : [];

// ------------------------------------------------------------------ games
const catalog = [];
for (const g of games) {
  const file = `g/${await fileId(g.meta.slug)}.bin`;
  await writeFile(path.join(outDir, file), await seal(await readFile(g.htmlPath)));
  const images = {};
  for (const [kind, a] of Object.entries(g.art)) {
    images[kind] = `g/${await fileId(g.meta.slug, ':' + kind)}.bin`;
    images[kind + 'Type'] = a.type;
    await writeFile(path.join(outDir, images[kind]), await seal(await readFile(a.path)));
  }
  catalog.push({ ...g.meta, file, ...images, size: g.size });
}
for (const s of featured) if (!catalog.some((g) => g.slug === s)) problems.push(`gallery.config.json: "featured" có "${s}" nhưng không có game nào tên đó.`);

// Page content edited from the admin mode (Tải về GameKit, hướng dẫn, Q&A). Encrypted with the catalog.
const pages = {};
for (const k of ['downloads', 'install', 'guide', 'mobile', 'faq']) if (config[k] !== undefined) pages[k] = config[k];
if (JSON.stringify(pages).length > 200000) problems.push('gallery.config.json: nội dung trang quá dài (> 200 KB).');
const adminInfo = { repo: String((config.admin && config.admin.repo) || process.env.GITHUB_REPOSITORY || ''), branch: String((config.admin && config.admin.branch) || 'main') };

const catalogJson = JSON.stringify({ v: FORMAT_VERSION, games: catalog, team, featured, ...pages, admin: adminInfo });
await writeFile(path.join(outDir, 'data', 'catalog.bin'), locked ? await encryptText(key, catalogJson) : Buffer.from(catalogJson));

const site = {
  v: FORMAT_VERSION,
  title: String(config.title || 'Prototype Gallery').slice(0, 60),
  subtitle: String(config.subtitle || '').slice(0, 120),
  defaultDevice: config.defaultDevice || 'iphone-14',
  locked,
  builtAt: new Date().toISOString(),
};
if (logoPath) site.logo = logoPath;
if (locked) {
  site.kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toB64(salt) };
  site.check = toB64(await encryptText(key, CHECK_TEXT));
}
await writeFile(path.join(outDir, 'data', 'site.json'), JSON.stringify(site, null, 2));

// ------------------------------------------------------------------ report
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`${locked ? '🔒 Đã khoá bằng mật khẩu' : '🔓 KHÔNG khoá (chỉ dùng để thử trên máy)'} — ${games.length} game → ${path.relative(root, outDir)}/`);
console.log(`  logo: ${logo ? path.relative(root, logo.file) : '— (thêm brand/logo.png)'}   ảnh team: ${teamPhoto ? path.relative(root, teamPhoto.file) + ' (đã mã hoá)' : '— (thêm brand/team.jpg)'}`);
for (const g of catalog) console.log(`  • ${g.slug.padEnd(28)} ${g.title.slice(0, 32).padEnd(32)} ${g.updated}  ${mb(g.size)}${['thumb', 'icon', 'banner'].filter((k) => g[k]).map((k) => `  [${k}]`).join('')}`);
if (problems.length) {
  console.log('\nCần xem lại:');
  for (const p of problems) console.log('  ⚠ ' + p);
}
