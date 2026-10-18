// Shared by the browser (web/app.js) and the build scripts (scripts/*.mjs).
// Only Web Platform APIs: crypto.subtle, TextEncoder, btoa/atob — all present in Node ≥ 20.

export const FORMAT_VERSION = 1;
export const KDF_ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ------------------------------------------------------------------ base64

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ crypto
// Key = PBKDF2-SHA256(password, salt, 310k) -> AES-256-GCM.
// Every encrypted blob is iv (12 bytes) || ciphertext+tag.

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? enc.encode(bytes) : bytes));
}

export async function deriveKey(password, salt, iterations = KDF_ITERATIONS, extractable = false) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function importRawKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function exportRawKey(key) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

/** Throws (OperationError) when the key is wrong or the data was changed. */
export async function decryptBytes(key, blob) {
  const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (u8.length < 28) throw new Error('Encrypted file is too short');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12)));
}

export const CHECK_TEXT = 'prototype-gallery:ok';

export async function encryptText(key, text) {
  return encryptBytes(key, enc.encode(text));
}

export async function decryptText(key, blob) {
  return dec.decode(await decryptBytes(key, blob));
}

// ------------------------------------------------------------------ games

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** "Tangle 3 — Bản thử!" -> "tangle-3-ban-thu" */
export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

/** "tangle-3" -> "Tangle 3" */
export function titleFromSlug(slug) {
  return String(slug).split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** The page's own <title>, if any. */
export function htmlTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const ORIENTATIONS = ['portrait', 'landscape'];
export const STATUSES = ['wip', 'playtest', 'done', 'archived'];

/**
 * Clean a game.json object. Unknown keys are dropped, wrong types fall back,
 * so one bad file never breaks the gallery. Returns { meta, warnings }.
 */
export function normalizeMeta(raw, slug, fallbackTitle = '') {
  const warnings = [];
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (raw !== undefined && src !== raw) warnings.push('game.json phải là một object { ... }');
  const str = (key, max) => {
    const v = src[key];
    if (v === undefined || v === null || v === '') return '';
    if (typeof v !== 'string') { warnings.push(`"${key}" phải là chuỗi chữ`); return ''; }
    return v.trim().slice(0, max);
  };
  let tags = [];
  if (Array.isArray(src.tags)) tags = src.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase().slice(0, 24)).slice(0, 8);
  else if (typeof src.tags === 'string') tags = src.tags.split(',').map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 8);
  else if (src.tags !== undefined) warnings.push('"tags" phải là danh sách, ví dụ ["puzzle", "casual"]');
  tags = [...new Set(tags)];

  let orientation = str('orientation', 20).toLowerCase() || 'portrait';
  if (!ORIENTATIONS.includes(orientation)) { warnings.push(`"orientation" chỉ nhận portrait hoặc landscape`); orientation = 'portrait'; }
  let status = str('status', 20).toLowerCase();
  if (status && !STATUSES.includes(status)) { warnings.push(`"status" chỉ nhận ${STATUSES.join(', ')}`); status = ''; }
  const date = (key) => {
    const v = str(key, 40);
    if (v && !DATE_RE.test(v)) { warnings.push(`"${key}" phải có dạng 2026-10-18`); return ''; }
    return v.slice(0, 10);
  };

  const meta = {
    slug,
    title: str('title', 80) || fallbackTitle || titleFromSlug(slug),
    description: str('description', 600),
    author: str('author', 60),
    tags,
    orientation,
    status,
    device: str('device', 40),
    created: date('created'),
    updated: date('updated'),
  };
  return { meta, warnings };
}

// ------------------------------------------------------------------ storage shim
// The game runs in a sandboxed iframe without allow-same-origin, so its own
// localStorage throws. This script, placed first in the game's <head>, swaps in
// a Storage-like object seeded with what the gallery saved last time and posts
// every change back to the gallery, which keeps it per game in its own storage.

export function storageShim(initial) {
  const data = JSON.stringify(initial && typeof initial === 'object' ? initial : {}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>(function(){
var seed=${data};
function make(kind,persist){var m=new Map(Object.keys(seed[kind]||{}).map(function(k){return [k,String(seed[kind][k])]}));var t=0;
function save(){if(!persist)return;clearTimeout(t);t=setTimeout(function(){var o={};m.forEach(function(v,k){o[k]=v});try{parent.postMessage({type:'gallery:storage',data:o},'*')}catch(e){}},150)}
var s={getItem:function(k){k=String(k);return m.has(k)?m.get(k):null},setItem:function(k,v){m.set(String(k),String(v));save()},removeItem:function(k){m.delete(String(k));save()},clear:function(){m.clear();save()},key:function(i){var a=Array.from(m.keys());return i>=0&&i<a.length?a[i]:null}};
Object.defineProperty(s,'length',{get:function(){return m.size}});
return typeof Proxy==='function'?new Proxy(s,{get:function(o,p){if(p in o)return o[p];if(typeof p==='string'&&m.has(p))return m.get(p);return undefined},set:function(o,p,v){if(p in o){return true}s.setItem(p,v);return true},deleteProperty:function(o,p){s.removeItem(p);return true}}):s}
function install(name,persist){var ok=false;try{ok=!!window[name]}catch(e){}if(ok)return;try{Object.defineProperty(window,name,{value:make(name,persist),configurable:true})}catch(e){}}
install('localStorage',true);install('sessionStorage',false);
})();</script>`;
}

/** Put a script before anything else runs in the page. */
export function injectFirst(html, snippet) {
  const s = String(html);
  const head = s.match(/<head(\s[^>]*)?>/i);
  if (head) {
    const at = head.index + head[0].length;
    return s.slice(0, at) + snippet + s.slice(at);
  }
  const root = s.match(/<html(\s[^>]*)?>/i);
  if (root) {
    const at = root.index + root[0].length;
    return s.slice(0, at) + '<head>' + snippet + '</head>' + s.slice(at);
  }
  const doctype = s.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return doctype[0] + snippet + s.slice(doctype[0].length);
  return snippet + s;
}
