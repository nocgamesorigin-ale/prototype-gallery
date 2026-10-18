// NOC Game — Prototype Gallery
// Routes: #/ (giới thiệu) · #/hub · #/wishlist · #/play/<slug>
import {
  CHECK_TEXT, decryptBytes, decryptText, deriveKey, exportRawKey, fromB64, importRawKey,
  injectFirst, storageShim, toB64,
} from './shared.js';
import {
  CUSTOM_ID, DEFAULT_DEVICE_ID, DEVICES, FILL_ID, GROUPS, deviceById, frameGeometry, parseSize, safeInsets, sizeLabel,
} from './devices.js';

const app = document.getElementById('app');
const textDecoder = new TextDecoder();
const STATUS_LABEL = { wip: 'Đang làm', playtest: 'Playtest', done: 'Xong', archived: 'Lưu trữ' };
const QR_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const MAX_SAVE_BYTES = 4 * 1024 * 1024;

// ------------------------------------------------------------------ small helpers

const safeStore = (area) => ({
  get(k) { try { return window[area].getItem(k); } catch { return null; } },
  set(k, v) { try { window[area].setItem(k, v); return true; } catch { return false; } },
  del(k) { try { window[area].removeItem(k); } catch { /* storage blocked */ } },
});
const local = safeStore('localStorage');
const session = safeStore('sessionStorage');

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  safe: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 6.5h12M6 17.5h12"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6h-3.5M14.5 20.5v-2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  gamepad: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4M15 12h.01M18 11h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** h('div', { class, text, html, onclick, ...attrs }, [children]) */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever our own icon markup
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const btn = (label, iconName, attrs = {}) => h('button', { class: 'btn', type: 'button', ...attrs, html: `${iconName ? icon(iconName) : ''}${label ? `<span>${label}</span>` : ''}` });

function hueOf(text) {
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
  return Math.abs(x) % 360;
}

function formatSize(n) {
  if (!n) return '—';
  return n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - then) / 86400000);
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'hôm qua';
  if (days > 1 && days < 7) return `${days} ngày trước`;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
const shortDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

let toastTimer = 0;
function toast(message) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status', text: message });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// ------------------------------------------------------------------ user (nickname) + wishlist

const nick = {
  get() { return (local.get('pg:nick') || session.get('pg:nick') || '').trim(); },
  set(v, remember) { (remember ? local : session).set('pg:nick', v); },
  clear() { local.del('pg:nick'); session.del('pg:nick'); },
};
const wish = {
  all() { try { const a = JSON.parse(local.get('pg:wish') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } },
  has(slug) { return wish.all().includes(slug); },
  toggle(slug) {
    const a = wish.all();
    const on = !a.includes(slug);
    local.set('pg:wish', JSON.stringify(on ? [...a, slug] : a.filter((s) => s !== slug)));
    return on;
  },
};

// ------------------------------------------------------------------ data + crypto

let site = null;
let key = null;
let catalog = [];
let team = {};
let featured = [];
const thumbUrls = new Map();

const bust = () => (site && site.builtAt ? `?v=${encodeURIComponent(site.builtAt)}` : '');

async function fetchBytes(path) {
  const res = await fetch(path + bust(), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function openBytes(bytes) {
  return site.locked ? decryptBytes(key, bytes) : bytes;
}

const keySlot = () => `pg:key:${site.kdf.salt}`;

async function keyWorks(candidate) {
  try {
    return (await decryptText(candidate, fromB64(site.check))) === CHECK_TEXT;
  } catch {
    return false;
  }
}

async function restoreKey() {
  const raw = session.get(keySlot()) || local.get(keySlot());
  if (!raw) return 'none';
  try {
    const candidate = await importRawKey(fromB64(raw));
    if (await keyWorks(candidate)) { key = candidate; return 'ok'; }
  } catch { /* fall through */ }
  session.del(keySlot());
  local.del(keySlot());
  return 'stale';
}

function forgetKey() {
  if (site && site.locked) {
    session.del(keySlot());
    local.del(keySlot());
  }
  nick.clear();
  key = null;
  catalog = [];
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

async function loadCatalog() {
  const bytes = await openBytes(await fetchBytes('data/catalog.bin'));
  const data = JSON.parse(textDecoder.decode(bytes));
  catalog = Array.isArray(data.games) ? data.games : [];
  team = data.team && typeof data.team === 'object' ? data.team : {};
  featured = Array.isArray(data.featured) ? data.featured : [];
}

/** Decrypted object URL for an encrypted file (game art or team photo). */
async function loadFile(file, type) {
  if (!file) return null;
  if (thumbUrls.has(file)) return thumbUrls.get(file);
  try {
    const bytes = await openBytes(await fetchBytes(file));
    const url = URL.createObjectURL(new Blob([bytes], { type: type || 'image/png' }));
    thumbUrls.set(file, url);
    return url;
  } catch {
    return null;
  }
}
const loadArt = (g, kind) => loadFile(g[kind], g[kind + 'Type']);
/** Best square-ish art for a tile: icon → thumb → banner. */
const tileKind = (g) => (g.icon ? 'icon' : g.thumb ? 'thumb' : g.banner ? 'banner' : null);

// ------------------------------------------------------------------ boot + routing

let view = null; // { name, destroy?() }

async function boot() {
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    site = await res.json();
  } catch (err) {
    fatal('Không tải được dữ liệu gallery', `data/site.json: ${err.message}. Site đã được build bằng scripts/build.mjs chưa?`);
    return;
  }
  document.title = site.title;
  if (site.logo) document.querySelector('link[rel=icon]')?.setAttribute('href', site.logo);
  if (site.locked) {
    const restored = await restoreKey();
    if (restored !== 'ok' || !nick.get()) {
      showLock(restored === 'stale' ? 'Mật khẩu team đã được đổi. Nhập mật khẩu mới.' : '');
      return;
    }
  } else if (!nick.get()) {
    showLock('');
    return;
  }
  await enter();
}

async function enter() {
  try {
    await loadCatalog();
  } catch (err) {
    fatal('Không đọc được danh sách game', String(err.message || err));
    return;
  }
  route();
}

function setView(next) {
  if (view && view.destroy) view.destroy();
  view = next;
}

const scrollMemory = {};
function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/play\/([a-z0-9][a-z0-9-]*)/);
  if (m) {
    const game = catalog.find((g) => g.slug === m[1]);
    if (game) { openPlayer(game); return; }
    toast('Không tìm thấy game này — có thể đã bị xoá.');
    history.replaceState(null, '', '#/hub');
  }
  if (hash.startsWith('#/hub')) showHub('hub');
  else if (hash.startsWith('#/wishlist')) showHub('wishlist');
  else showHome();
}

window.addEventListener('hashchange', () => {
  if (!site || (site.locked && !key) || !nick.get()) return;
  if (view && view.scrollKey) scrollMemory[view.scrollKey] = window.scrollY;
  route();
});

function fatal(title, detail) {
  setView(null);
  app.replaceChildren(h('div', { class: 'lock' }, h('div', { class: 'lock-card' }, [
    h('h1', { text: title }),
    h('p', { text: detail }),
    h('button', { class: 'btn', text: 'Thử lại', onclick: () => location.reload() }),
  ])));
}

const logoSrc = () => site.logo || 'icon.svg';

// ------------------------------------------------------------------ lock screen (nickname + team password)

function showLock(note = '') {
  setView({ name: 'lock' });
  const nameInput = h('input', { class: 'input', id: 'nick', type: 'text', autocomplete: 'nickname', placeholder: 'VD: Mèo Ú', maxlength: 32, required: true, value: nick.get() });
  const pwInput = site.locked ? h('input', { class: 'input', id: 'pw', type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu chung của team', required: true }) : null;
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: local.get('pg:remember') !== '0' });
  const error = h('p', { class: 'lock-error', role: 'alert', text: note });
  const submit = h('button', { class: 'btn primary lg', type: 'submit', text: 'Vào Game Hub' });
  const form = h('form', { class: 'lock-form', onsubmit: unlock }, [
    h('label', { class: 'field', for: 'nick' }, [h('span', { text: 'Tên / biệt danh' }), nameInput]),
    pwInput ? h('label', { class: 'field', for: 'pw' }, [h('span', { text: 'Mật khẩu team' }), pwInput]) : null,
    h('label', { class: 'check', for: 'remember' }, [remember, 'Ghi nhớ trên máy này']),
    submit,
    error,
  ]);

  async function unlock(e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { error.textContent = 'Nhập tên hoặc biệt danh để mọi người biết ai đang chơi.'; nameInput.focus(); return; }
    local.set('pg:remember', remember.checked ? '1' : '0');
    if (!site.locked) { nick.set(name, remember.checked); await enter(); return; }
    const pw = pwInput.value;
    if (!pw) { pwInput.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'Đang mở khoá…';
    error.textContent = '';
    try {
      const candidate = await deriveKey(pw, fromB64(site.kdf.salt), site.kdf.iterations, true);
      if (!(await keyWorks(candidate))) {
        error.textContent = 'Sai mật khẩu. Hỏi lại trưởng team nếu bạn chưa có.';
        pwInput.select();
        return;
      }
      key = candidate;
      const raw = toB64(await exportRawKey(candidate));
      if (remember.checked) local.set(keySlot(), raw);
      else session.set(keySlot(), raw);
      nick.set(name, remember.checked);
      await enter();
    } catch (err) {
      error.textContent = `Không mở khoá được: ${err.message || err}`;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Vào Game Hub';
    }
  }

  app.replaceChildren(h('main', { class: 'lock' }, h('div', { class: 'lock-card' }, [
    h('img', { class: 'lock-mark', src: logoSrc(), alt: '' }),
    h('div', { class: 'lock-head' }, [
      h('h1', { text: site.title }),
      h('p', { text: site.subtitle || 'Nhập tên và mật khẩu chung của team để chơi các prototype.' }),
    ]),
    form,
  ])));
  (nameInput.value ? pwInput || nameInput : nameInput).focus();
}

// ------------------------------------------------------------------ shared header

function header(active) {
  const name = nick.get() || 'Khách';
  const wishCount = wish.all().filter((s) => catalog.some((g) => g.slug === s)).length;
  const tab = (id, label, href) => h('a', { class: 'seg-item', href, 'aria-current': active === id ? 'page' : null, text: label });
  return h('header', { class: 'top' }, h('div', { class: 'wrap top-row' }, [
    h('a', { class: 'brand', href: '#/' }, [
      h('img', { src: logoSrc(), alt: '' }),
      h('div', { class: 'brand-text' }, [h('h1', { text: site.title }), site.subtitle ? h('p', { text: site.subtitle }) : null]),
    ]),
    h('nav', { class: 'seg', 'aria-label': 'Điều hướng' }, [
      tab('home', 'Giới thiệu', '#/'),
      tab('hub', 'Game Hub', '#/hub'),
      tab('wishlist', wishCount ? `Wishlist · ${wishCount}` : 'Wishlist', '#/wishlist'),
    ]),
    h('span', { class: 'spacer' }),
    h('div', { class: 'user' }, [
      h('span', { class: 'avatar', style: { '--h': String(hueOf(name)) }, text: (name.split(/\s+/).pop()[0] || '?').toUpperCase() }),
      h('div', { class: 'user-text' }, [h('strong', { text: name }), h('span', { text: `${catalog.length} game` })]),
      h('button', {
        class: 'btn icon ghost', type: 'button', title: 'Đăng xuất trên máy này', 'aria-label': 'Đăng xuất', html: icon('logout'),
        onclick: () => { forgetKey(); showLock(); },
      }),
    ]),
  ]));
}

// ------------------------------------------------------------------ tiles

let tileObserver = null;
function observeTiles() {
  if (tileObserver) tileObserver.disconnect();
  tileObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      tileObserver.unobserve(entry.target);
      fillTile(entry.target);
    }
  }, { rootMargin: '300px' }) : null;
  return tileObserver;
}

function fillTile(el) {
  const g = catalog.find((x) => x.slug === el.dataset.slug);
  const kind = g && tileKind(g);
  if (!kind) return;
  loadArt(g, kind).then((url) => {
    if (!url || el.querySelector('img')) return;
    el.prepend(h('img', { src: url, alt: '', decoding: 'async' }));
    const gen = el.querySelector('.gen');
    if (gen) gen.remove();
  });
}

function tile(g, big = false) {
  const el = h('a', { class: 'tile' + (big ? ' big' : ''), href: `#/play/${g.slug}`, 'data-slug': g.slug, 'aria-label': `Chơi ${g.title}`, title: g.title }, [
    h('span', { class: 'gen', style: { '--h': String(hueOf(g.slug)) } }, h('span', { text: (g.title.trim()[0] || '?').toUpperCase() })),
    wish.has(g.slug) ? h('span', { class: 'wished', html: icon('heart'), 'aria-label': 'Trong wishlist' }) : null,
    g.orientation === 'landscape' ? h('span', { class: 'orient', text: 'NGANG' }) : null,
    h('span', { class: 'tile-name', text: g.title }),
    h('span', { class: 'play', html: icon('play') }),
  ]);
  if (tileKind(g)) {
    const url = thumbUrls.get(g[tileKind(g)]);
    if (url) { el.prepend(h('img', { src: url, alt: '' })); el.querySelector('.gen').remove(); }
    else if (tileObserver) tileObserver.observe(el);
    else fillTile(el);
  }
  return el;
}

function randomGame(exceptSlug) {
  const pool = catalog.filter((g) => g.slug !== exceptSlug && g.status !== 'archived');
  const list = pool.length ? pool : catalog.filter((g) => g.slug !== exceptSlug);
  return list[Math.floor(Math.random() * list.length)];
}

// ------------------------------------------------------------------ home (giới thiệu)

function showHome() {
  observeTiles();
  const photo = h('div', { class: 'team-photo' + (team.photo ? '' : ' empty') }, team.photo ? [] : [
    h('span', { html: icon('users') }),
    h('strong', { text: 'Ảnh team' }),
    h('span', { text: 'Admin: thêm file brand/team.jpg vào repo' }),
  ]);
  if (team.photo) loadFile(team.photo, team.photoType).then((url) => url && photo.append(h('img', { src: url, alt: `Ảnh team ${site.title}` })));
  const recent = [...catalog].filter((g) => g.status !== 'archived').sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 10);
  const pick = randomGame();

  app.replaceChildren(header('home'), h('main', { class: 'wrap home' }, [
    h('section', { class: 'hero' }, [
      h('div', { class: 'hero-text' }, [
        h('span', { class: 'eyebrow', text: team.eyebrow || 'Team prototype · nội bộ' }),
        h('h2', { class: 'hero-title', text: team.name || site.title }),
        h('p', { class: 'hero-intro', text: team.intro || site.subtitle || '' }),
        h('div', { class: 'hero-actions' }, [
          h('a', { class: 'btn primary lg', href: '#/hub', html: `${icon('gamepad')}<span>Vào Game Hub</span>` }),
          pick ? h('a', { class: 'btn lg', href: `#/play/${pick.slug}`, html: `${icon('dice')}<span>Chơi ngẫu nhiên</span>` }) : null,
        ]),
        Array.isArray(team.stats) && team.stats.length ? h('dl', { class: 'hero-stats' }, team.stats.slice(0, 4).flatMap((s) => [h('dt', { text: String(s.value) }), h('dd', { text: String(s.label) })])) : null,
      ]),
      photo,
    ]),
    recent.length ? h('section', { class: 'home-hub' }, [
      h('div', { class: 'section-head' }, [
        h('h2', { text: 'Mới cập nhật' }), h('span', { class: 'count', text: `${catalog.length} game` }), h('span', { class: 'spacer' }),
        h('a', { class: 'btn ghost', href: '#/hub', html: `<span>Xem tất cả</span>${icon('arrow')}` }),
      ]),
      h('div', { class: 'mosaic row' }, recent.map((g) => tile(g))),
    ]) : emptyState(),
  ]));
  requestAnimationFrame(() => window.scrollTo(0, scrollMemory.home || 0));
  setView({ name: 'home', scrollKey: 'home', destroy() { if (tileObserver) tileObserver.disconnect(); } });
}

// ------------------------------------------------------------------ game hub

const filters = { q: '', status: '', tag: '', sort: 'featured' };

function showHub(mode) {
  observeTiles();
  const searchInput = h('input', {
    class: 'input', id: 'search', type: 'search', placeholder: 'Tìm theo tên game, người làm, nhãn…', value: filters.q, 'aria-label': 'Tìm game',
    oninput: (e) => { filters.q = e.target.value; update(); },
  });
  const sort = h('select', { class: 'sort-select', id: 'sort', 'aria-label': 'Sắp xếp', onchange: (e) => { filters.sort = e.target.value; update(); } }, [
    ['featured', 'Đề xuất'], ['updated', 'Mới cập nhật'], ['created', 'Mới thêm'], ['title', 'Tên A → Z'],
  ].map(([v, t]) => h('option', { value: v, text: t, selected: filters.sort === v })));
  const chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Lọc' });
  const title = h('h2', { text: mode === 'wishlist' ? 'Wishlist của bạn' : 'Tất cả game' });
  const count = h('span', { class: 'count' });
  const grid = h('div', { class: 'mosaic' });

  app.replaceChildren(header(mode), h('main', { class: 'wrap hub' }, [
    h('div', { class: 'hub-tools' }, [
      h('label', { class: 'search' }, [h('span', { html: icon('search') }), searchInput]),
      h('label', { class: 'sort' }, [h('span', { text: 'Sắp xếp' }), sort, h('span', { html: icon('chevron') })]),
    ]),
    h('div', { class: 'section-head' }, [title, count, h('span', { class: 'spacer' }), chips]),
    grid,
  ]));

  function chip(label, pressed, onclick) {
    return h('button', { class: 'chip', type: 'button', 'aria-pressed': pressed ? 'true' : 'false', text: label, onclick });
  }

  function renderFilters() {
    const statuses = Object.keys(STATUS_LABEL).filter((s) => catalog.some((g) => g.status === s));
    const tagCount = new Map();
    for (const g of catalog) for (const t of g.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([t]) => t);
    const items = [chip('Tất cả', !filters.status && !filters.tag, () => { filters.status = ''; filters.tag = ''; update(); })];
    for (const s of statuses) items.push(chip(STATUS_LABEL[s], filters.status === s, () => { filters.status = filters.status === s ? '' : s; update(); }));
    if (tags.length) items.push(h('span', { class: 'sep', 'aria-hidden': 'true' }));
    for (const t of tags) items.push(chip('#' + t, filters.tag === t, () => { filters.tag = filters.tag === t ? '' : t; update(); }));
    chips.replaceChildren(...items);
  }

  function matches(g) {
    if (mode === 'wishlist' && !wish.has(g.slug)) return false;
    if (filters.status && g.status !== filters.status) return false;
    if (filters.tag && !(g.tags || []).includes(filters.tag)) return false;
    const q = filters.q.trim().toLowerCase().normalize('NFC');
    if (!q) return true;
    const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const hay = [g.title, g.author, g.description, g.slug, ...(g.tags || [])].join(' ').toLowerCase();
    return hay.includes(q) || strip(hay).includes(strip(q));
  }

  function update() {
    renderFilters();
    const rank = (g) => { const i = featured.indexOf(g.slug); return i < 0 ? 1e6 : i; };
    const list = catalog.filter(matches).sort((a, b) => {
      if (filters.sort === 'title') return a.title.localeCompare(b.title, 'vi');
      if (filters.sort === 'featured') return rank(a) - rank(b) || (b.updated || '').localeCompare(a.updated || '') || a.title.localeCompare(b.title, 'vi');
      const k = filters.sort === 'created' ? 'created' : 'updated';
      return (b[k] || '').localeCompare(a[k] || '') || a.title.localeCompare(b.title, 'vi');
    });
    if (tileObserver) tileObserver.disconnect();
    document.querySelectorAll('.empty').forEach((e) => e.remove());
    const total = mode === 'wishlist' ? catalog.filter((g) => wish.has(g.slug)).length : catalog.length;
    count.textContent = list.length === total ? `${total} game` : `${list.length} / ${total} game`;
    if (!catalog.length) { grid.replaceChildren(); grid.after(emptyState()); return; }
    const plain = Boolean(filters.q || filters.status || filters.tag) || filters.sort !== 'featured';
    grid.replaceChildren(...list.map((g) => tile(g, !plain && featured.includes(g.slug))));
    if (!list.length) {
      grid.append(h('p', { class: 'no-match', text: mode === 'wishlist' && !total ? 'Wishlist đang trống — bấm “Thêm vào wishlist” khi chơi một game.' : 'Không có game nào khớp bộ lọc.' }));
    }
  }

  update();
  requestAnimationFrame(() => window.scrollTo(0, scrollMemory[mode] || 0));
  setView({ name: mode, scrollKey: mode, destroy() { if (tileObserver) tileObserver.disconnect(); } });
}

function emptyState() {
  return h('section', { class: 'empty' }, [
    h('h2', { text: 'Chưa có game nào' }),
    h('p', { text: 'Gửi game đầu tiên từ thư mục repo gallery trên máy bạn:' }),
    h('pre', { text: 'npm run submit -- ../ten-game --push' }),
    h('p', { text: 'Hoặc trên github.com: Add file → Upload files, kéo file dist/index.html vào thư mục games/ten-game/. Xem README để biết thêm.' }),
  ]);
}

// ------------------------------------------------------------------ player

const compactQuery = window.matchMedia('(max-width: 720px)');

function readPrefs() {
  try { return JSON.parse(local.get('pg:prefs') || '{}') || {}; } catch { return {}; }
}
function writePrefs(patch) {
  local.set('pg:prefs', JSON.stringify({ ...readPrefs(), ...patch }));
}

function openPlayer(game) {
  const prefs = readPrefs();
  const compact = compactQuery.matches;
  const st = {
    deviceId: compact ? FILL_ID : (prefs.device && DEVICES.some((d) => d.id === prefs.device) ? prefs.device : (game.device && DEVICES.some((d) => d.id === game.device) ? game.device : site.defaultDevice || DEFAULT_DEVICE_ID)),
    custom: prefs.custom && parseSize(`${prefs.custom.width}x${prefs.custom.height}`) ? prefs.custom : { width: 360, height: 640 },
    zoom: ['fit', '75', '50'].includes(prefs.zoom) ? prefs.zoom : 'fit',
    landscape: game.orientation === 'landscape',
    safe: Boolean(prefs.safe),
    rail: compact ? false : prefs.rail === true,
    levels: null,
    events: [],
    url: null,
    started: false,
  };
  const saveSlot = `pg:save:${game.slug}`;
  const levelSlot = `pg:level:${game.slug}`;
  const device = () => (st.deviceId === CUSTOM_ID ? { ...deviceById(CUSTOM_ID), ...st.custom } : deviceById(st.deviceId));

  // ---- DOM: stage
  const iframe = h('iframe', {
    title: game.title,
    sandbox: 'allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads',
    allow: 'autoplay; fullscreen; gamepad; accelerometer; gyroscope',
    referrerpolicy: 'no-referrer',
  });
  const cutout = h('div', { class: 'cutout', 'aria-hidden': 'true' });
  const safeBands = ['top', 'right', 'bottom', 'left'].map((side) => h('div', { class: `safe ${side}`, 'aria-hidden': 'true' }));
  const overlay = h('div', { class: 'overlay' });
  const splashIcon = h('span', { class: 'splash-icon', style: { '--h': String(hueOf(game.slug)) } }, h('span', { text: (game.title.trim()[0] || '?').toUpperCase() }));
  const splash = h('div', { class: 'splash', style: { '--h': String(hueOf(game.slug)) } }, [
    splashIcon,
    h('strong', { text: game.title }),
    h('button', { class: 'play-disc', type: 'button', 'aria-label': `Bắt đầu chơi ${game.title}`, html: icon('play'), onclick: () => loadGame() }),
    h('span', { text: 'Bấm để bắt đầu chơi' }),
  ]);
  const screen = h('div', { class: 'screen' }, [iframe, cutout, ...safeBands, overlay, splash]);
  const frame = h('div', { class: 'frame' }, screen);
  const rotateHint = h('div', { class: 'rotate-hint', text: 'Xoay ngang điện thoại để chơi game này', hidden: true });
  const stageArt = h('div', { class: 'stage-art', 'aria-hidden': 'true', style: { '--h': String(hueOf(game.slug)) } });
  const stageInner = h('div', { class: 'stage-inner' }, frame);
  const stage = h('div', { class: 'stage' }, [stageArt, stageInner, rotateHint]);
  const art = tileKind(game);
  if (art) loadArt(game, art).then((url) => { if (!url) return; stageArt.append(h('img', { src: url, alt: '' })); });
  if (game.icon) loadArt(game, 'icon').then((url) => { if (url) splashIcon.replaceChildren(h('img', { src: url, alt: '' })); });

  // ---- DOM: toolbar
  const levelSelect = h('select', { class: 'input', id: 'level', 'aria-label': 'Chọn level', hidden: true, onchange: (e) => gotoLevel(Number(e.target.value)) });
  const deviceBtn = h('button', { class: 'btn device-btn', type: 'button', 'aria-haspopup': 'listbox', onclick: () => toggleDeviceMenu() });
  const zoomSeg = h('div', { class: 'seg sm', role: 'radiogroup', 'aria-label': 'Thu phóng' }, [['fit', 'Vừa khung'], ['75', '75%'], ['50', '50%']].map(([id, label]) =>
    h('button', { class: 'seg-item', type: 'button', role: 'radio', 'data-zoom': id, text: label, onclick: () => { st.zoom = id; writePrefs({ zoom: id }); layout(); } })));
  const rotateBtn = btn('Xoay', 'rotate', { title: 'Xoay (R)', onclick: () => rotate() });
  const safeBtn = btn('', 'safe', { class: 'btn icon', title: 'Hiện vùng an toàn (tai thỏ, Dynamic Island, thanh Home)', 'aria-label': 'Vùng an toàn', onclick: () => { st.safe = !st.safe; writePrefs({ safe: st.safe }); layout(); } });
  const qrBtn = btn('', 'qr', { class: 'btn icon', title: 'Mở trên điện thoại', 'aria-label': 'Mã QR để mở trên điện thoại', onclick: () => toggleQr() });
  const railBtn = btn('', 'info', { class: 'btn icon', title: 'Thông tin game', 'aria-label': 'Thông tin game', onclick: () => { st.rail = !st.rail; if (!compact) writePrefs({ rail: st.rail }); renderRail(); layout(); } });
  const spec = h('span', { class: 'spec mono' });

  const bar = h('header', { class: 'bar' }, [
    h('a', { class: 'btn icon ghost', href: '#/hub', title: 'Về Game Hub', 'aria-label': 'Về Game Hub', html: icon('back') }),
    compact ? h('div', { class: 'title' }, [h('h2', { text: game.title })]) : null,
    compact ? null : deviceBtn,
    compact ? null : zoomSeg,
    compact ? null : rotateBtn,
    compact ? null : safeBtn,
    levelSelect,
    h('span', { class: 'spacer' }),
    compact ? null : spec,
    compact ? null : qrBtn,
    railBtn,
  ]);

  // ---- DOM: bottom bar
  const footIcon = h('span', { class: 'app-icon' });
  if (game.icon) loadArt(game, 'icon').then((url) => url && footIcon.append(h('img', { src: url, alt: '' })));
  else footIcon.style.setProperty('--h', String(hueOf(game.slug)));
  const wishBtn = h('button', { class: 'btn outline lg wish', type: 'button', onclick: () => {
    const on = wish.toggle(game.slug);
    renderWish();
    toast(on ? `Đã thêm ${game.title} vào wishlist.` : 'Đã bỏ khỏi wishlist.');
  } });
  function renderWish() {
    const on = wish.has(game.slug);
    wishBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    wishBtn.innerHTML = `${icon('heart')}<span>${on ? 'Đã trong wishlist' : 'Thêm vào wishlist'}</span>`;
  }
  const shareLink = async () => toast((await copyText(location.href)) ? 'Đã sao chép link.' : 'Không sao chép được — hãy copy từ thanh địa chỉ.');
  const fullBtn = btn('', 'full', { class: 'btn icon lg', title: 'Toàn màn hình', 'aria-label': 'Toàn màn hình', hidden: !document.fullscreenEnabled, onclick: () => stage.requestFullscreen().catch(() => toast('Trình duyệt không cho bật toàn màn hình.')) });
  const sub = [game.author, game.updated ? `Cập nhật ${shortDate(game.updated)}` : ''].filter(Boolean).join(' · ');
  const foot = h('footer', { class: 'foot' }, [
    footIcon,
    h('div', { class: 'foot-title' }, [h('strong', { text: game.title }), sub ? h('span', { text: sub }) : null]),
    h('span', { class: 'spacer' }),
    wishBtn,
    btn('Chơi lại', 'reload', { class: 'btn lg', title: 'Tải lại game', onclick: () => loadGame() }),
    btn('Ngẫu nhiên', 'dice', { class: 'btn lg', title: 'Chơi một game ngẫu nhiên', onclick: () => { const g = randomGame(game.slug); if (g) location.hash = `#/play/${g.slug}`; } }),
    btn('', 'share', { class: 'btn icon lg', title: 'Sao chép link game', 'aria-label': 'Chia sẻ', onclick: shareLink }),
    fullBtn,
  ]);
  renderWish();

  // ---- DOM: rail
  const eventsList = h('ol', {});
  const levelButtons = h('div', { class: 'actions' });
  const levelSection = h('section', { hidden: true }, [h('h3', { text: 'Level' }), levelButtons]);
  const resetBtn = btn('Xoá dữ liệu lưu', 'trash', { title: 'Xoá điểm, tiến độ… mà game đã lưu trên máy này', onclick: resetSave });
  const railBanner = game.banner ? h('div', { class: 'rail-banner', 'aria-hidden': 'true' }) : null;
  if (railBanner) loadArt(game, 'banner').then((url) => url && railBanner.append(h('img', { src: url, alt: '' })));
  const rail = h('aside', { class: 'rail', 'aria-label': 'Thông tin game' }, [
    h('section', {}, [
      railBanner,
      h('h3', { text: 'Giới thiệu' }),
      h('p', { class: 'desc' + (game.description ? '' : ' none'), text: game.description || 'Chưa có mô tả.' }),
      h('dl', { class: 'facts' }, [
        ...fact('Người làm', game.author),
        ...fact('Trạng thái', game.status ? STATUS_LABEL[game.status] : ''),
        ...fact('Hướng', game.orientation === 'landscape' ? 'Ngang' : 'Dọc'),
        ...fact('Cập nhật', game.updated ? `${formatDate(game.updated)}${/\d{2}\/\d{2}/.test(formatDate(game.updated)) ? '' : ` (${game.updated})`}` : ''),
        ...fact('Thêm lúc', game.created && game.created !== game.updated ? game.created : ''),
        ...fact('Dung lượng', formatSize(game.size)),
        ...fact('Nhãn', (game.tags || []).join(', ')),
      ]),
      h('div', { class: 'actions' }, [btn('Sao chép link', 'link', { onclick: shareLink }), resetBtn]),
    ]),
    levelSection,
    h('section', { class: 'events' }, [
      h('div', { class: 'events-head' }, [h('h3', { text: 'Sự kiện game' }), h('button', { class: 'btn ghost sm', type: 'button', text: 'Xoá', onclick: () => { st.events = []; renderEvents(); } })]),
      eventsList,
    ]),
  ]);

  function fact(label, value) {
    return value ? [h('dt', { text: label }), h('dd', { text: value })] : [];
  }

  const root = h('div', { class: 'player' + (compact ? ' compact' : '') }, [bar, stage, foot, rail]);
  app.replaceChildren(root);
  window.scrollTo(0, 0);

  // ---- layout
  function layout() {
    const d = device();
    const free = d.kind === 'free';
    const fill = d.id === FILL_ID;
    const landscape = st.landscape && !fill;
    const rect = stageInner.getBoundingClientRect();
    const g = frameGeometry(d, landscape, rect.width, rect.height);
    const scale = fill ? 1 : st.zoom === '75' ? 0.75 : st.zoom === '50' ? 0.5 : g.scale;
    frame.className = 'frame' + (free ? ' free' : '') + (fill ? ' fill' : '') + (landscape ? ' landscape' : '');
    frame.style.width = `${g.frameW}px`;
    frame.style.height = `${g.frameH}px`;
    frame.style.setProperty('--bz', `${g.bezel}px`);
    frame.style.setProperty('--r', `${free ? 0 : d.radius}px`);
    frame.style.transform = scale === 1 ? '' : `scale(${scale})`;
    frame.style.margin = scale === 1 ? '' : `${(g.frameH * (scale - 1)) / 2}px ${(g.frameW * (scale - 1)) / 2}px`;

    cutout.className = 'cutout ' + (free ? '' : d.cutout);
    cutout.hidden = free || d.cutout === 'none';
    const ins = safeInsets(d, landscape);
    const showSafe = st.safe && !free;
    safeBands[0].style.height = `${ins.top}px`;
    safeBands[1].style.width = `${ins.right}px`;
    safeBands[2].style.height = `${ins.bottom}px`;
    safeBands[3].style.width = `${ins.left}px`;
    safeBands[0].hidden = !showSafe || !ins.top;
    safeBands[1].hidden = !showSafe || !ins.right;
    safeBands[2].hidden = !showSafe || !ins.bottom;
    safeBands[3].hidden = !showSafe || !ins.left;

    deviceBtn.innerHTML = '';
    deviceBtn.append(h('span', { class: 'name', text: d.label }), h('span', { html: icon('chevron') }));
    for (const b of zoomSeg.children) b.setAttribute('aria-checked', b.dataset.zoom === st.zoom ? 'true' : 'false');
    zoomSeg.hidden = fill;
    const w = landscape ? d.height : d.width;
    const hgt = landscape ? d.width : d.height;
    spec.textContent = fill ? `${d.label} · ${Math.round(rect.width)}×${Math.round(rect.height)} · HTML5` : `${d.label} · ${w}×${hgt} · ${Math.round(scale * 100)}% · HTML5`;
    rotateBtn.disabled = fill;
    rotateBtn.setAttribute('aria-pressed', landscape ? 'true' : 'false');
    safeBtn.disabled = free;
    safeBtn.setAttribute('aria-pressed', st.safe && !free ? 'true' : 'false');
    railBtn.setAttribute('aria-pressed', st.rail ? 'true' : 'false');
    rotateHint.hidden = !(compact && game.orientation === 'landscape' && rect.height > rect.width);
  }

  function rotate() {
    if (st.deviceId === FILL_ID) return;
    st.landscape = !st.landscape;
    layout();
  }

  function renderRail() {
    rail.hidden = !st.rail;
    root.classList.toggle('with-rail', st.rail);
  }

  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => layout()) : null;
  if (resize) resize.observe(stageInner);
  else window.addEventListener('resize', layout);
  document.addEventListener('fullscreenchange', layout);

  // ---- game loading
  function showOverlay(content) {
    overlay.replaceChildren(...[].concat(content));
    overlay.hidden = false;
  }

  async function loadGame() {
    st.started = true;
    splash.hidden = true;
    setLevels(null);
    showOverlay([h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { text: 'Đang tải game…' })]);
    try {
      const bytes = await openBytes(await fetchBytes(game.file));
      if (view !== playerView) return;
      let seed = {};
      try { seed = JSON.parse(local.get(saveSlot) || '{}') || {}; } catch { seed = {}; }
      const html = injectFirst(textDecoder.decode(bytes), storageShim({ localStorage: seed }));
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      if (st.url) URL.revokeObjectURL(st.url);
      st.url = url;
      iframe.src = url;
    } catch (err) {
      showOverlay([
        h('strong', { text: 'Không mở được game' }),
        h('span', { text: String(err && err.name === 'OperationError' ? 'File game không giải mã được — thử tải lại trang.' : err.message || err) }),
        h('button', { class: 'btn', type: 'button', text: 'Thử lại', onclick: () => loadGame() }),
      ]);
    }
  }
  overlay.hidden = true;

  iframe.addEventListener('load', () => {
    if (!st.url) return;
    overlay.hidden = true;
    setTimeout(() => toGame({ type: 'gamekit:hello' }), 50);
  });

  function toGame(message) {
    try { iframe.contentWindow.postMessage(message, '*'); } catch { /* frame gone */ }
  }

  // ---- levels (same protocol as the GameKit preview)
  function setLevels(info) {
    st.levels = info;
    levelSelect.hidden = !(info && info.count > 0);
    levelSelect.replaceChildren();
    levelButtons.replaceChildren();
    levelSection.hidden = !(info && info.count > 0);
    if (!info) return;
    for (let n = 1; n <= info.count; n++) {
      const name = info.names && info.names[n - 1];
      levelSelect.append(h('option', { value: String(n), text: name ? `${n}. ${name}` : `Level ${n}`, selected: n === info.current }));
      if (n <= 200) {
        levelButtons.append(h('button', {
          class: 'btn sm', type: 'button', style: { minWidth: '36px', justifyContent: 'center' }, text: String(n), title: name || `Level ${n}`,
          'aria-pressed': n === info.current ? 'true' : 'false', 'data-level': String(n), onclick: () => gotoLevel(n),
        }));
      }
    }
  }

  function markLevel(n) {
    if (!st.levels) return;
    st.levels.current = n;
    levelSelect.value = String(n);
    for (const b of levelButtons.children) b.setAttribute('aria-pressed', Number(b.dataset.level) === n ? 'true' : 'false');
  }

  function gotoLevel(n) {
    if (!st.levels || !n) return;
    session.set(levelSlot, String(n));
    toGame({ type: 'gamekit:goto', level: n });
    markLevel(n);
  }

  function addEvent(name, data, ts) {
    let dataText = '';
    if (data !== undefined) {
      try { dataText = JSON.stringify(data); } catch { dataText = String(data); }
      if (dataText === '{}') dataText = '';
      if (dataText.length > 240) dataText = dataText.slice(0, 240) + '…';
    }
    st.events.push({ name: String(name).slice(0, 80), dataText, ts: Number(ts) || Date.now() });
    if (st.events.length > 300) st.events.shift();
    renderEvents();
  }

  function renderEvents() {
    if (!st.events.length) {
      eventsList.replaceChildren(h('li', { class: 'none', text: 'Game gọi gamekit.emit(...) thì sự kiện hiện ở đây.' }));
      return;
    }
    eventsList.replaceChildren(...st.events.map((e) => h('li', {}, [
      h('span', { class: 't', text: new Date(e.ts).toTimeString().slice(0, 8) }),
      h('span', { class: 'n', text: e.name }),
      e.dataText ? h('span', { class: 'd', text: e.dataText }) : null,
    ])));
    eventsList.scrollTop = eventsList.scrollHeight;
  }

  function onMessage(e) {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const m = e.data;
    if (!m || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'gallery:storage': {
        if (!m.data || typeof m.data !== 'object') return;
        const clean = {};
        for (const [k, v] of Object.entries(m.data)) if (typeof v === 'string') clean[k] = v;
        const json = JSON.stringify(clean);
        if (json.length > MAX_SAVE_BYTES) return;
        if (json === '{}') local.del(saveSlot);
        else local.set(saveSlot, json);
        return;
      }
      case 'gamekit:levels': {
        const count = Math.max(0, Math.min(10000, Math.floor(Number(m.count) || 0)));
        const current = Math.max(1, Math.floor(Number(m.current) || 1));
        const names = Array.isArray(m.names) ? m.names.slice(0, count).map((x) => (x == null ? '' : String(x).slice(0, 60))) : undefined;
        setLevels({ count, current, names });
        const wanted = Number(session.get(levelSlot));
        if (wanted && wanted !== current && wanted <= count) gotoLevel(wanted);
        return;
      }
      case 'gamekit:level':
        markLevel(Math.max(1, Math.floor(Number(m.current) || 1)));
        return;
      case 'gamekit:event':
        if (typeof m.name === 'string') addEvent(m.name, m.data, m.ts);
        return;
    }
  }
  window.addEventListener('message', onMessage);

  let resetArmed = 0;
  function resetSave() {
    const label = resetBtn.querySelector('span');
    if (!resetArmed) {
      label.textContent = 'Bấm lần nữa để xoá';
      resetArmed = setTimeout(() => { resetArmed = 0; label.textContent = 'Xoá dữ liệu lưu'; }, 3000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = 0;
    label.textContent = 'Xoá dữ liệu lưu';
    local.del(saveSlot);
    session.del(levelSlot);
    loadGame();
    toast('Đã xoá dữ liệu lưu của game trên máy này.');
  }

  // ---- popovers
  let popup = null;
  function closePopup() {
    if (!popup) return;
    popup.remove();
    popup = null;
  }
  function openPopup(anchor, panel, width, alignLeft = false) {
    closePopup();
    const backdrop = h('div', { class: 'backdrop', onclick: closePopup });
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${Math.round(r.bottom + 6)}px`;
    const left = alignLeft ? r.left : r.right - width;
    panel.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - width - 8, left)))}px`;
    popup = h('div', {}, [backdrop, panel]);
    document.body.append(popup);
  }

  function toggleDeviceMenu() {
    if (popup) { closePopup(); return; }
    const filter = h('input', { class: 'input', id: 'device-filter', type: 'search', placeholder: 'Lọc thiết bị…', 'aria-label': 'Lọc thiết bị' });
    const list = h('ul', { role: 'listbox', 'aria-label': 'Thiết bị' });
    const customInput = h('input', { class: 'input', id: 'custom-size', value: `${st.custom.width}x${st.custom.height}`, 'aria-label': 'Kích thước tuỳ chỉnh (rộng x cao)' });
    const applyCustom = () => {
      const size = parseSize(customInput.value);
      if (!size) { customInput.focus(); toast('Nhập dạng 390x844 (100–4000 px).'); return; }
      st.custom = size;
      writePrefs({ custom: size });
      pick(CUSTOM_ID);
    };
    const panel = h('div', { class: 'menu' }, [
      h('div', { class: 'menu-filter' }, filter),
      list,
      h('div', { class: 'custom' }, [customInput, h('button', { class: 'btn', type: 'button', text: 'Áp dụng', onclick: applyCustom })]),
    ]);
    customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCustom(); });
    let items = [];
    let active = 0;
    function draw() {
      const q = filter.value.trim().toLowerCase();
      list.replaceChildren();
      items = [];
      for (const grp of GROUPS) {
        const ds = DEVICES.filter((d) => d.group === grp.id && (!q || d.label.toLowerCase().includes(q) || sizeLabel(d).includes(q)));
        if (!ds.length) continue;
        list.append(h('li', { class: 'group-label', role: 'presentation', text: grp.label }));
        for (const d of ds) {
          const shown = d.id === CUSTOM_ID ? st.custom : d;
          const b = h('button', { class: 'item', type: 'button', role: 'option', 'aria-selected': d.id === st.deviceId ? 'true' : 'false', onclick: () => pick(d.id) }, [
            h('span', { class: 'check', text: d.id === st.deviceId ? '✓' : '' }),
            h('span', { text: d.label }),
            h('span', { class: 'size', text: d.id === FILL_ID ? '' : sizeLabel(shown) }),
          ]);
          items.push(b);
          list.append(h('li', { role: 'presentation' }, b));
        }
      }
      if (!items.length) list.append(h('li', { class: 'no-match', text: 'Không có thiết bị nào khớp.' }));
      active = Math.max(0, items.findIndex((b) => b.getAttribute('aria-selected') === 'true'));
      if (q) active = 0;
      mark();
    }
    function mark() {
      items.forEach((b, i) => b.classList.toggle('active', i === active));
      const el = items[active];
      if (el) {
        const top = el.offsetTop - list.offsetTop;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + el.offsetHeight - list.clientHeight;
      }
    }
    filter.addEventListener('input', draw);
    filter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) items[active].click(); }
    });
    function pick(id) {
      st.deviceId = id;
      writePrefs({ device: id });
      closePopup();
      layout();
      deviceBtn.focus();
    }
    draw();
    openPopup(deviceBtn, panel, 290, true);
    filter.focus();
  }

  function toggleQr() {
    if (popup) { closePopup(); return; }
    const url = location.href;
    const canvas = h('canvas', { width: 200, height: 200, 'aria-label': 'Mã QR' });
    const panel = h('div', { class: 'pop' }, [
      canvas,
      h('p', { text: site.locked ? 'Quét bằng camera điện thoại. Lần đầu mở sẽ cần nhập tên và mật khẩu team.' : 'Quét bằng camera điện thoại để chơi trên máy thật.' }),
      h('code', { text: url }),
      btn('Sao chép link', 'link', { onclick: async () => toast((await copyText(url)) ? 'Đã sao chép link.' : 'Không sao chép được.') }),
    ]);
    openPopup(qrBtn, panel, 280);
    loadQrLib().then((qrcode) => {
      if (!qrcode) { canvas.hidden = true; return; }
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      const ctx = canvas.getContext('2d');
      const cell = Math.floor(200 / n);
      canvas.width = canvas.height = cell * n;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect(x * cell, y * cell, cell, cell);
    });
  }

  function onKey(e) {
    if (e.key === 'Escape' && popup) { closePopup(); return; }
    const t = e.target;
    if (popup || e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))) return;
    if ((e.key === 'r' || e.key === 'R') && !compact) rotate();
  }
  document.addEventListener('keydown', onKey);

  const onCompactChange = () => openPlayer(game);
  compactQuery.addEventListener('change', onCompactChange);

  const playerView = {
    name: 'player',
    destroy() {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', layout);
      compactQuery.removeEventListener('change', onCompactChange);
      if (resize) resize.disconnect();
      else window.removeEventListener('resize', layout);
      closePopup();
      clearTimeout(resetArmed);
      iframe.src = 'about:blank';
      if (st.url) URL.revokeObjectURL(st.url);
      st.url = null;
    },
  };
  setView(playerView);

  renderRail();
  renderEvents();
  layout();
}

let qrPromise = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrPromise) {
    qrPromise = new Promise((resolve) => {
      const s = h('script', { src: QR_SRC, crossorigin: 'anonymous' });
      s.onload = () => resolve(window.qrcode || null);
      s.onerror = () => { qrPromise = null; resolve(null); };
      document.head.append(s);
    });
  }
  return qrPromise;
}

boot();
