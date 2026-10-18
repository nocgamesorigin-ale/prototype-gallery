#!/usr/bin/env node
// Machine-readable answers for the GameKit "Submit game" button (tools/gamekit-submit). Prints one JSON object.
//
//   node scripts/gallery-info.mjs list                       games on the gallery: slug, title, description, art files
//   node scripts/gallery-info.mjs image <icon|banner> <file> size check for one image
//   node scripts/gallery-info.mjs title "<name>" [slug]      { conflict: { slug, title } | null }
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanGames, titleConflict } from './lib/catalog.mjs';
import { ART, checkArt } from './lib/image.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const list = async () => (await scanGames(root, path.join(root, 'games'), { maxBytes: Infinity })).games;

if (cmd === 'list') {
  out({
    games: (await list()).map((g) => ({
      slug: g.meta.slug,
      title: g.meta.title,
      description: g.meta.description,
      icon: g.art.icon?.path || null,
      banner: g.art.banner?.path || null,
    })),
    spec: Object.fromEntries(Object.entries(ART).map(([k, v]) => [k, v.size])),
  });
} else if (cmd === 'image' && ART[rest[0]] && rest[1]) {
  out(await checkArt(rest[0], path.resolve(rest[1])));
} else if (cmd === 'title' && rest[0] !== undefined) {
  const clash = titleConflict(await list(), rest[0], rest[1] || '');
  out({ conflict: clash ? { slug: clash.meta.slug, title: clash.meta.title } : null });
} else {
  console.error('Cách dùng: gallery-info.mjs list | image <icon|banner> <file> | title "<tên>" [slug]');
  process.exit(1);
}
