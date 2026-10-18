#!/usr/bin/env node
// Copy a game build into games/<slug>/ and write its game.json.
//
//   npm run submit -- ../tangle-3                      (thư mục dự án: dùng dist/index.html, tự build nếu chưa có)
//   npm run submit -- ../tangle-3 --build --push       (build lại, rồi commit + push luôn)
//   npm run submit -- ~/Downloads/game.html --title "Bóng bay" --tags casual,demo
//
// Options: --slug  --title  --author  --desc  --tags a,b  --status wip|playtest|done|archived
//          --landscape | --portrait  --device iphone-14  --thumb anh.png  --build  --push
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUG_RE, STATUSES, htmlTitle, normalizeMeta, slugify } from '../web/shared.js';
import { THUMB_NAMES } from './lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const name = a.slice(2);
  if (['build', 'push', 'landscape', 'portrait', 'help'].includes(name)) opts[name] = true;
  else opts[name] = argv[++i];
}

const die = (msg) => { console.error('✖ ' + msg); process.exit(1); };
const expand = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };
const isDir = async (p) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };

if (opts.help || positional.length !== 1) {
  console.log(`Cách dùng: npm run submit -- <thư mục game | file .html> [tuỳ chọn]

  --title "Tên game"     tên hiển thị (mặc định: <title> của trang)
  --author "Tên bạn"     người làm (mặc định: git config user.name)
  --desc "Mô tả"         một hai câu: game là gì, đang thử điều gì
  --tags puzzle,casual   nhãn để lọc
  --status wip           wip | playtest | done | archived
  --landscape            game chơi ngang (mặc định: dọc)
  --device iphone-14     máy mở mặc định trong khung preview
  --thumb cover.png      ảnh bìa (png/jpg/webp, ≤ 2 MB)
  --slug ten-thu-muc     tên thư mục trong games/ (mặc định: theo package.json)
  --build                chạy "npm run build" trong dự án trước khi lấy file
  --push                 git add + commit + push ngay sau khi chép`);
  process.exit(opts.help ? 0 : 1);
}

// ------------------------------------------------------------------ find the build
const source = path.resolve(expand(positional[0]));
let projectDir = null;
let htmlPath = null;

if (await isFile(source)) {
  if (!/\.html?$/i.test(source)) die(`${source} không phải file .html`);
  htmlPath = source;
} else if (await isDir(source)) {
  if (await isFile(path.join(source, 'package.json'))) projectDir = source;
  else if (await isFile(path.join(source, 'index.html'))) htmlPath = path.join(source, 'index.html');
  else die(`Không thấy package.json hay index.html trong ${source}`);
} else {
  die(`Không tìm thấy ${source}`);
}

let pkg = {};
if (projectDir) {
  pkg = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
  const dist = path.join(projectDir, 'dist', 'index.html');
  if (opts.build || !(await isFile(dist))) {
    if (!pkg.scripts || !pkg.scripts.build) die(`${pkg.name || projectDir} không có script "build" trong package.json`);
    console.log(`▸ npm run build trong ${path.basename(projectDir)}…`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const r = spawnSync(npm, ['run', 'build'], { cwd: projectDir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) die('Build lỗi — sửa lỗi rồi chạy lại.');
  }
  if (!(await isFile(dist))) die('Build xong nhưng không thấy dist/index.html');
  htmlPath = dist;
  const others = (await readdir(path.dirname(dist), { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && !(e.name === 'index.html' && path.resolve(e.parentPath ?? e.path) === path.dirname(dist)));
  if (others.length) {
    console.warn(`⚠ dist/ còn ${others.length} file khác ngoài index.html (${others.slice(0, 3).map((e) => e.name).join(', ')}${others.length > 3 ? '…' : ''}).`);
    console.warn('  Gallery chỉ chạy game một file. Template GameKit đã gộp sẵn bằng vite-plugin-singlefile;');
    console.warn('  với game khác, hãy nhúng ảnh/âm thanh vào HTML (data URI) hoặc bật plugin đó.');
  }
}

const html = await readFile(htmlPath, 'utf8');
const size = Buffer.byteLength(html);
const config = JSON.parse(await readFile(path.join(root, 'gallery.config.json'), 'utf8'));
const maxMB = Number(config.maxGameSizeMB) || 40;
if (size > maxMB * 1048576) die(`File nặng ${(size / 1048576).toFixed(1)} MB, vượt giới hạn ${maxMB} MB (gallery.config.json → maxGameSizeMB).`);

// ------------------------------------------------------------------ slug + metadata
const slug = opts.slug || slugify(pkg.name || (projectDir ? path.basename(projectDir) : htmlTitle(html) || path.basename(path.dirname(htmlPath))));
if (!SLUG_RE.test(slug)) die(`Tên thư mục "${slug}" không hợp lệ — dùng --slug ten-game (a-z, 0-9, dấu gạch ngang).`);
if (opts.status && !STATUSES.includes(opts.status)) die(`--status chỉ nhận: ${STATUSES.join(', ')}`);

const dest = path.join(root, 'games', slug);
const metaPath = path.join(dest, 'game.json');
let previous = {};
const isUpdate = await isFile(metaPath);
if (isUpdate) {
  try { previous = JSON.parse(await readFile(metaPath, 'utf8')); } catch { previous = {}; }
}

const gitName = () => {
  try { return execFileSync('git', ['config', 'user.name'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
};
const pkgDesc = typeof pkg.description === 'string' && !/made with GameKit/i.test(pkg.description) ? pkg.description : '';
const today = new Date().toISOString().slice(0, 10);

const merged = {
  title: opts.title ?? previous.title ?? htmlTitle(html),
  description: opts.desc ?? previous.description ?? pkgDesc,
  author: opts.author ?? previous.author ?? gitName(),
  tags: opts.tags !== undefined ? opts.tags : previous.tags ?? [],
  status: opts.status ?? previous.status ?? 'wip',
  orientation: opts.landscape ? 'landscape' : opts.portrait ? 'portrait' : previous.orientation ?? 'portrait',
  device: opts.device ?? previous.device ?? '',
  created: previous.created || today,
  updated: today,
};
const { meta, warnings } = normalizeMeta(merged, slug, htmlTitle(html));
for (const w of warnings) console.warn('⚠ ' + w);
const { slug: _omit, ...stored } = meta;
for (const k of Object.keys(stored)) if (stored[k] === '' || (Array.isArray(stored[k]) && !stored[k].length)) delete stored[k];

// ------------------------------------------------------------------ write
await mkdir(dest, { recursive: true });
await copyFile(htmlPath, path.join(dest, 'index.html'));
await writeFile(metaPath, JSON.stringify(stored, null, 2) + '\n');
if (opts.thumb) {
  const thumb = path.resolve(expand(opts.thumb));
  const ext = path.extname(thumb).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) die('Ảnh bìa phải là .png, .jpg hoặc .webp');
  if (!(await isFile(thumb))) die(`Không thấy ảnh ${thumb}`);
  if ((await stat(thumb)).size > 2 * 1048576) die('Ảnh bìa lớn hơn 2 MB');
  for (const name of THUMB_NAMES) await rm(path.join(dest, name), { force: true });
  await copyFile(thumb, path.join(dest, 'thumb' + (ext === '.jpeg' ? '.jpg' : ext)));
}

console.log(`✔ ${isUpdate ? 'Cập nhật' : 'Thêm'} games/${slug}/ — "${meta.title}", ${(size / 1048576).toFixed(2)} MB`);

if (opts.push) {
  const git = (...a) => {
    const r = spawnSync('git', a, { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) die(`git ${a[0]} lỗi`);
  };
  git('add', path.join('games', slug));
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root });
  if (staged.status === 0) {
    console.log('Không có gì thay đổi so với bản đã gửi.');
  } else {
    git('commit', '-m', `${isUpdate ? 'Cập nhật' : 'Thêm'} game: ${meta.title}`);
    git('push');
    console.log('✔ Đã push. GitHub Actions sẽ deploy trong khoảng 1–2 phút.');
  }
} else {
  console.log(`  Tiếp theo: git add games/${slug} && git commit -m "${isUpdate ? 'Cập nhật' : 'Thêm'} ${meta.title}" && git push`);
  console.log('  (hoặc chạy lại với --push)');
}
