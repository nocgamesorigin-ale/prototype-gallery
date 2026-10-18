// Reads games/<slug>/ folders into catalog entries. Used by build.mjs and the tests.
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SLUG_RE, htmlTitle, normalizeMeta, slugify } from '../../web/shared.js';
import { ART, IMAGE_TYPES, MAX_IMAGE_BYTES, artNames, imageSize } from './image.mjs';

export const THUMB_NAMES = artNames('thumb');

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Last commit date touching a folder (needs full history in CI: fetch-depth 0). */
function gitDate(root, rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out ? out.slice(0, 10) : '';
  } catch {
    return '';
  }
}

/**
 * Scan gamesDir. Returns { games: [{ meta, htmlPath, size, art: { thumb|icon|banner: { path, type } } }], problems: [string] }.
 * A folder without index.html is reported and skipped; other mistakes become warnings.
 */
export async function scanGames(root, gamesDir, { maxBytes = 40 * 1024 * 1024 } = {}) {
  const games = [];
  const problems = [];
  let entries = [];
  try {
    entries = await readdir(gamesDir, { withFileTypes: true });
  } catch {
    return { games, problems: [`Không thấy thư mục ${path.relative(root, gamesDir) || gamesDir}`] };
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const slug = entry.name;
    const dir = path.join(gamesDir, slug);
    if (!SLUG_RE.test(slug)) {
      problems.push(`games/${slug}: tên thư mục chỉ được dùng a-z, 0-9 và dấu gạch ngang (ví dụ "tangle-3") — bỏ qua`);
      continue;
    }
    const htmlPath = path.join(dir, 'index.html');
    if (!(await exists(htmlPath))) {
      problems.push(`games/${slug}: thiếu index.html — bỏ qua`);
      continue;
    }
    const size = (await stat(htmlPath)).size;
    if (size > maxBytes) {
      problems.push(`games/${slug}: index.html nặng ${(size / 1048576).toFixed(1)} MB, quá giới hạn ${(maxBytes / 1048576).toFixed(0)} MB — bỏ qua`);
      continue;
    }
    const html = await readFile(htmlPath, 'utf8');

    let raw;
    const metaPath = path.join(dir, 'game.json');
    if (await exists(metaPath)) {
      try {
        raw = JSON.parse(await readFile(metaPath, 'utf8'));
      } catch (err) {
        problems.push(`games/${slug}/game.json: JSON lỗi (${err.message}) — dùng thông tin mặc định`);
      }
    }
    const { meta, warnings } = normalizeMeta(raw, slug, htmlTitle(html));
    for (const w of warnings) problems.push(`games/${slug}/game.json: ${w}`);
    if (!meta.updated) meta.updated = gitDate(root, path.relative(root, dir)) || (await stat(htmlPath)).mtime.toISOString().slice(0, 10);
    if (!meta.created) meta.created = meta.updated;
    if (!/<script|<canvas/i.test(html)) problems.push(`games/${slug}/index.html: không thấy <script> hay <canvas> — có chắc đây là file build của game?`);

    const art = {};
    for (const kind of Object.keys(ART)) {
      for (const name of artNames(kind)) {
        const p = path.join(dir, name);
        if (!(await exists(p))) continue;
        const bytes = await readFile(p);
        const info = imageSize(bytes);
        const want = ART[kind].size;
        if (bytes.length > MAX_IMAGE_BYTES) problems.push(`games/${slug}/${name}: ${ART[kind].label.toLowerCase()} lớn hơn 2 MB — bỏ qua ảnh`);
        else if (!info) problems.push(`games/${slug}/${name}: không đọc được ảnh — bỏ qua`);
        else {
          if (want && (info.width !== want[0] || info.height !== want[1])) problems.push(`games/${slug}/${name}: nên là ${want[0]}×${want[1]} px (đang ${info.width}×${info.height})`);
          art[kind] = { path: p, type: IMAGE_TYPES[path.extname(name)] };
        }
        break;
      }
    }
    games.push({ meta, htmlPath, size, art });
  }
  games.sort((a, b) => (b.meta.updated || '').localeCompare(a.meta.updated || '') || a.meta.title.localeCompare(b.meta.title));
  return { games, problems };
}

/** Name used to compare titles: "Tangle 3", "tangle-3" and "TANGLE  3" are the same game name. */
export const titleKey = (title) => slugify(String(title || '')) || String(title || '').trim().toLowerCase();

/** The game (other than `slug`) that already uses this title, or null. */
export function titleConflict(games, title, slug) {
  const key = titleKey(title);
  if (!key) return null;
  return games.find((g) => g.meta.slug !== slug && (titleKey(g.meta.title) === key || g.meta.slug === key)) || null;
}
