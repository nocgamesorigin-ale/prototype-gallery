// Image checks shared by submit.mjs, the catalog scan and the GameKit "Submit game" button.
// Reads width/height straight from the file header (PNG, JPEG, WebP) — no dependencies.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Card art kept next to each game: file base name, required size (null = any), label for messages. */
export const ART = {
  thumb: { base: 'thumb', size: null, label: 'Ảnh bìa' },
  icon: { base: 'icon', size: [512, 512], label: 'Icon' },
  banner: { base: 'banner', size: [1024, 512], label: 'Banner' },
};
export const artNames = (kind) => ['.png', '.jpg', '.jpeg', '.webp'].map((ext) => ART[kind].base + ext);

/** { type, width, height } or null when the bytes are not a PNG/JPEG/WebP we can read. */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'image/jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { type: 'image/webp', width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { type: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/**
 * Check an image file for one kind of card art. Returns { ok, error, type, width, height, bytes, ext }.
 * The error text is shown as-is to the person submitting.
 */
export async function checkArt(kind, file) {
  const spec = ART[kind];
  const ext = path.extname(file).toLowerCase();
  if (!IMAGE_TYPES[ext]) return { ok: false, error: `${spec.label} phải là file .png, .jpg hoặc .webp` };
  let bytes;
  try {
    if ((await stat(file)).size > MAX_IMAGE_BYTES) return { ok: false, error: `${spec.label} lớn hơn 2 MB` };
    bytes = await readFile(file);
  } catch {
    return { ok: false, error: `Không đọc được ${file}` };
  }
  const info = imageSize(bytes);
  if (!info) return { ok: false, error: `${spec.label}: không đọc được kích thước ảnh — file có bị hỏng không?` };
  const result = { ...info, bytes: bytes.length, ext: ext === '.jpeg' ? '.jpg' : ext };
  if (spec.size && (info.width !== spec.size[0] || info.height !== spec.size[1])) {
    return { ...result, ok: false, error: `${spec.label} phải đúng ${spec.size[0]}×${spec.size[1]} px (ảnh này ${info.width}×${info.height})` };
  }
  return { ...result, ok: true, error: '' };
}
