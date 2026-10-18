// Reads games/<slug>/ folders into catalog entries. Used by build.mjs and the tests.
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SLUG_RE, htmlTitle, normalizeMeta } from '../../web/shared.js';

export const THUMB_NAMES = ['thumb.png', 'thumb.jpg', 'thumb.jpeg', 'thumb.webp'];
const THUMB_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

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
 * Scan gamesDir. Returns { games: [{ meta, htmlPath, thumbPath, thumbType, size }], problems: [string] }.
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

    let thumbPath = null;
    let thumbType = null;
    for (const name of THUMB_NAMES) {
      const p = path.join(dir, name);
      if (await exists(p)) {
        if ((await stat(p)).size > MAX_THUMB_BYTES) {
          problems.push(`games/${slug}/${name}: ảnh bìa lớn hơn 2 MB — bỏ qua ảnh`);
          break;
        }
        thumbPath = p;
        thumbType = THUMB_TYPES[path.extname(name)];
        break;
      }
    }
    games.push({ meta, htmlPath, thumbPath, thumbType, size });
  }
  games.sort((a, b) => (b.meta.updated || '').localeCompare(a.meta.updated || '') || a.meta.title.localeCompare(b.meta.title));
  return { games, problems };
}
