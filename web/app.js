// Prototype Gallery — lock screen, game grid, and a phone-frame player.
// Hash routes: #/ (gallery) and #/play/<slug>.
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
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
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

// ------------------------------------------------------------------ data + crypto

let site = null;
let key = null;
let catalog = [];
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
  key = null;
  catalog = [];
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

async function loadCatalog() {
  const bytes = await openBytes(await fetchBytes('data/catalog.bin'));
  const data = JSON.parse(textDecoder.decode(bytes));
  catalog = Array.isArray(data.games) ? data.games : [];
}

// ------------------------------------------------------------------ boot + routing

let view = null; // { name: 'gallery'|'player', destroy?() }

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
  if (site.locked) {
    const restored = await restoreKey();
    if (restored !== 'ok') {
      showLock(restored === 'stale' ? 'Mật khẩu đã được đổi. Nhập mật khẩu mới.' : '');
      return;
    }
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

let galleryScroll = 0;
function route() {
  const m = location.hash.match(/^#\/play\/([a-z0-9][a-z0-9-]*)/);
  if (m) {
    const game = catalog.find((g) => g.slug === m[1]);
    if (game) { openPlayer(game); return; }
    toast('Không tìm thấy game này — có thể đã bị xoá.');
    history.replaceState(null, '', '#/');
  }
  showGallery();
}

window.addEventListener('hashchange', () => {
  if (!site || (site.locked && !key)) return;
  if (view && view.name === 'gallery') galleryScroll = window.scrollY;
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

// ------------------------------------------------------------------ lock screen

function showLock(note = '') {
  setView({ name: 'lock' });
  const input = h('input', { class: 'input', id: 'pw', type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu của team', required: true, 'aria-label': 'Mật khẩu' });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: local.get('pg:remember') !== '0' });
  const error = h('p', { class: 'lock-error', role: 'alert', text: note });
  const submit = h('button', { class: 'btn primary', type: 'submit', text: 'Mở khoá' });
  const form = h('form', { class: 'lock-form', onsubmit: unlock }, [
    input,
    h('label', { class: 'check', for: 'remember' }, [remember, 'Ghi nhớ trên máy này']),
    submit,
    error,
  ]);

  async function unlock(e) {
    e.preventDefault();
    const pw = input.value;
    if (!pw) return;
    submit.disabled = true;
    submit.textContent = 'Đang mở khoá…';
    error.textContent = '';
    try {
      const candidate = await deriveKey(pw, fromB64(site.kdf.salt), site.kdf.iterations, true);
      if (!(await keyWorks(candidate))) {
        error.textContent = 'Sai mật khẩu. Hỏi lại người quản lý gallery nếu bạn chưa có.';
        input.select();
        return;
      }
      key = candidate;
      const raw = toB64(await exportRawKey(candidate));
      local.set('pg:remember', remember.checked ? '1' : '0');
      if (remember.checked) local.set(keySlot(), raw);
      else session.set(keySlot(), raw);
      await enter();
    } catch (err) {
      error.textContent = `Không mở khoá được: ${err.message || err}`;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Mở khoá';
    }
  }

  app.replaceChildren(h('main', { class: 'lock' }, h('div', { class: 'lock-card' }, [
    h('img', { class: 'lock-mark', src: 'icon.svg', alt: '' }),
    h('div', {}, [
      h('h1', { text: site.title }),
      h('p', { text: site.subtitle || 'Nhập mật khẩu chung để xem và chơi các prototype.' }),
    ]),
    form,
  ])));
  input.focus();
}

// ------------------------------------------------------------------ gallery

const filters = { q: '', status: '', tag: '', sort: 'updated', view: 'all' };

// ---- personal data, kept in this browser only
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
const me = { get: () => local.get('pg:me') || '', set: (v) => local.set('pg:me', v.trim()) };
function wishSet() { try { return new Set(JSON.parse(local.get('pg:wish') || '[]')); } catch { return new Set(); } }
function toggleWish(slug) { const s = wishSet(); s.has(slug) ? s.delete(slug) : s.add(slug); local.set('pg:wish', JSON.stringify([...s])); return s.has(slug); }
const lastSeen = () => local.get('pg:seen') || '';
const isNew = (g) => { const seen = lastSeen(); return Boolean(seen && (g.updated || g.created || '') > seen); };
function markSeen() { const newest = catalog.reduce((m, g) => ((g.updated || '') > m ? g.updated : m), ''); if (newest) local.set('pg:seen', newest); }
function initials(name) { const w = String(name).trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }

function showGallery() {
  const searchInput = h('input', {
    class: 'input', id: 'search', type: 'search', placeholder: 'Tìm theo tên, người làm, mô tả…', value: filters.q, 'aria-label': 'Tìm game',
    oninput: (e) => { filters.q = e.target.value; update(); },
  });
  const filterRow = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Lọc' });
  const summary = h('div', { class: 'summary' });
  const grid = h('div', { class: 'grid' });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(onCoverVisible, { rootMargin: '200px' }) : null;

  if (!lastSeen()) markSeen(); // first visit: nothing counts as "new"
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Mục' });
  const bellBtn = h('button', { class: 'btn icon bell', title: 'Game mới từ lần xem trước', 'aria-label': 'Game mới', onclick: () => {
    const n = catalog.filter(isNew).length;
    filters.view = 'all'; filters.sort = 'updated'; filters.status = ''; filters.tag = '';
    markSeen(); update();
    toast(n ? `${n} game mới được xếp lên đầu.` : 'Chưa có game mới nào.');
  } });
  const meBtn = h('button', { class: 'me', title: 'Đặt tên của bạn (dùng cho mục "Của tôi")', onclick: askName });
  function askName() {
    const v = prompt('Tên bạn dùng khi submit game (trường author / git user.name):', me.get());
    if (v === null) return;
    me.set(v); update();
  }
  const header = h('header', { class: 'top' }, h('div', { class: 'wrap' }, [
    h('div', { class: 'top-row' }, [
      h('div', { class: 'brand' }, [
        h('img', { src: 'icon.svg', alt: '' }),
        h('div', { class: 'brand-text' }, [h('h1', { text: site.title }), site.subtitle ? h('p', { text: site.subtitle }) : null]),
      ]),
      tabs,
      h('div', { class: 'top-actions' }, [
        bellBtn,
        meBtn,
        site.locked ? h('button', {
          class: 'btn ghost icon', title: 'Khoá lại trên máy này', 'aria-label': 'Khoá', html: icon('lock'),
          onclick: () => { forgetKey(); showLock(); },
        }) : null,
      ]),
    ]),
  ]));
  const tools = h('div', { class: 'tools' }, [h('label', { class: 'search' }, [h('span', { html: icon('search') }), searchInput]), filterRow]);

  app.replaceChildren(header, h('main', { class: 'wrap' }, [tools, summary, grid]));

  function renderChrome() {
    const wishes = wishSet();
    const tab = (id, label, count) => h('button', { class: 'tab', 'aria-pressed': filters.view === id ? 'true' : 'false', onclick: () => { filters.view = id; if (id === 'mine' && !me.get()) askName(); update(); } },
      [label, count ? h('span', { class: 'tab-count', text: String(count) }) : null]);
    const mine = me.get() ? catalog.filter((g) => fold(g.author) === fold(me.get())).length : 0;
    tabs.replaceChildren(tab('all', 'Tất cả', 0), tab('wish', 'Wishlist', wishes.size), tab('mine', 'Của tôi', mine));
    const fresh = catalog.filter(isNew).length;
    bellBtn.innerHTML = icon('bell') + (fresh ? `<span class="badge">${fresh > 99 ? '99+' : fresh}</span>` : '');
    const name = me.get();
    meBtn.replaceChildren(h('span', { class: 'avatar', html: name ? '' : icon('user') }, name ? initials(name) : null), h('span', { class: 'me-name', text: name || 'Đặt tên' }));
  }

  function chip(label, pressed, onclick) {
    return h('button', { class: 'chip', 'aria-pressed': pressed ? 'true' : 'false', text: label, onclick });
  }

  function renderFilters() {
    const statuses = Object.keys(STATUS_LABEL).filter((s) => catalog.some((g) => g.status === s));
    const tagCount = new Map();
    for (const g of catalog) for (const t of g.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    const items = [chip('Tất cả', !filters.status && !filters.tag, () => { filters.status = ''; filters.tag = ''; update(); })];
    for (const s of statuses) items.push(chip(STATUS_LABEL[s], filters.status === s, () => { filters.status = filters.status === s ? '' : s; update(); }));
    if (tags.length) items.push(h('span', { class: 'sep', 'aria-hidden': 'true' }));
    for (const t of tags) items.push(chip('#' + t, filters.tag === t, () => { filters.tag = filters.tag === t ? '' : t; update(); }));
    const sort = h('select', { class: 'input', id: 'sort', 'aria-label': 'Sắp xếp', onchange: (e) => { filters.sort = e.target.value; update(); } }, [
      h('option', { value: 'updated', text: 'Mới cập nhật', selected: filters.sort === 'updated' }),
      h('option', { value: 'created', text: 'Mới thêm', selected: filters.sort === 'created' }),
      h('option', { value: 'title', text: 'Tên A → Z', selected: filters.sort === 'title' }),
    ]);
    items.push(sort);
    filterRow.replaceChildren(...items);
  }

  function matches(g) {
    if (filters.view === 'wish' && !wishSet().has(g.slug)) return false;
    if (filters.view === 'mine' && (!me.get() || fold(g.author) !== fold(me.get()))) return false;
    if (filters.status && g.status !== filters.status) return false;
    if (filters.tag && !(g.tags || []).includes(filters.tag)) return false;
    const q = filters.q.trim().toLowerCase().normalize('NFC');
    if (!q) return true;
    const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const hay = [g.title, g.author, g.description, g.slug, ...(g.tags || [])].join(' ').toLowerCase();
    return hay.includes(q) || strip(hay).includes(strip(q));
  }

  function update() {
    renderChrome();
    renderFilters();
    const list = catalog.filter(matches).sort((a, b) => {
      if (filters.sort === 'title') return a.title.localeCompare(b.title, 'vi');
      const k = filters.sort === 'created' ? 'created' : 'updated';
      return (b[k] || '').localeCompare(a[k] || '') || a.title.localeCompare(b.title, 'vi');
    });
    if (observer) observer.disconnect();
    document.querySelectorAll('.empty').forEach((e) => e.remove());
    if (!catalog.length) {
      summary.replaceChildren();
      grid.replaceChildren();
      grid.after(emptyState());
      return;
    }
    const newest = catalog.reduce((m, g) => ((g.updated || '') > m ? g.updated : m), '');
    summary.replaceChildren(
      h('strong', { text: list.length === catalog.length ? `${catalog.length} game` : `${list.length} / ${catalog.length} game` }),
      h('span', { text: newest ? `· cập nhật gần nhất ${formatDate(newest)}` : '' }),
    );
    grid.replaceChildren(...list.map(card));
    if (!list.length) grid.append(h('p', { class: 'card-sub none-match', text: filters.view === 'wish' ? 'Chưa có game nào trong Wishlist. Rê chuột lên một game và bấm biểu tượng tim để lưu.' : filters.view === 'mine' ? `Chưa có game nào có tác giả "${me.get()}". Tên phải khớp trường author khi submit.` : 'Không có game nào khớp bộ lọc.' }));
  }

  function card(g) {
    const cover = h('div', { class: 'cover', 'data-slug': g.slug }, [
      h('div', { class: 'gen', style: { '--h': String(hueOf(g.slug)) } }, h('span', { text: (g.title.trim()[0] || '?').toUpperCase() })),
      g.orientation === 'landscape' ? h('span', { class: 'orient', text: 'NGANG' }) : null,
      isNew(g) ? h('span', { class: 'new', text: 'MỚI' }) : null,
      h('span', { class: 'play', html: icon('play') }),
    ]);
    const wished = wishSet().has(g.slug);
    cover.append(h('button', {
      class: 'wish', 'aria-pressed': wished ? 'true' : 'false', 'aria-label': wished ? 'Bỏ khỏi Wishlist' : 'Thêm vào Wishlist', html: icon('heart'),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); const on = toggleWish(g.slug); toast(on ? 'Đã thêm vào Wishlist.' : 'Đã bỏ khỏi Wishlist.'); update(); },
    }));
    const coverKind = g.thumb ? 'thumb' : g.banner ? 'banner' : null;
    if (coverKind) {
      if (thumbUrls.has(g[coverKind])) setCover(cover, thumbUrls.get(g[coverKind]), coverKind);
      else if (observer) observer.observe(cover);
      else loadArt(g, coverKind).then((url) => url && setCover(cover, url, coverKind));
    }
    const appIcon = g.icon ? h('span', { class: 'app-icon', 'aria-hidden': 'true' }) : null;
    if (appIcon) loadArt(g, 'icon').then((url) => url && appIcon.append(h('img', { src: url, alt: '' })));
    const sub = [g.author, formatDate(g.updated)].filter(Boolean).join(' · ');
    return h('a', { class: 'card', href: `#/play/${g.slug}`, 'aria-label': `Chơi ${g.title}` }, [
      cover,
      h('div', { class: 'card-meta' }, [
        h('div', { class: 'card-title' }, [
          appIcon,
          h('h3', { text: g.title }),
          g.status ? h('span', { class: `status ${g.status}`, text: STATUS_LABEL[g.status] || g.status }) : null,
        ]),
        sub ? h('div', { class: 'card-sub', text: sub }) : null,
        g.tags && g.tags.length ? h('div', { class: 'card-tags' }, g.tags.slice(0, 4).map((t) => h('span', { class: 'tag', text: t }))) : null,
      ]),
    ]);
  }

  function onCoverVisible(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const g = catalog.find((x) => x.slug === entry.target.dataset.slug);
      const kind = g && (g.thumb ? 'thumb' : g.banner ? 'banner' : null);
      if (kind) loadArt(g, kind).then((url) => url && setCover(entry.target, url, kind));
    }
  }

  update();
  requestAnimationFrame(() => window.scrollTo(0, galleryScroll));

  setView({ name: 'gallery', destroy() { if (observer) observer.disconnect(); } });
}

function emptyState() {
  return h('section', { class: 'empty' }, [
    h('h2', { text: 'Chưa có game nào' }),
    h('p', { text: 'Gửi game đầu tiên từ thư mục repo gallery trên máy bạn:' }),
    h('pre', { text: 'npm run submit -- ../ten-game --push' }),
    h('p', { text: 'Hoặc trên github.com: Add file → Upload files, kéo file dist/index.html vào thư mục games/ten-game/. Xem README để biết thêm.' }),
  ]);
}

/** Decrypted object URL for one of a game's images: kind = thumb | icon | banner. */
async function loadArt(g, kind) {
  const file = g[kind];
  if (!file) return null;
  if (thumbUrls.has(file)) return thumbUrls.get(file);
  try {
    const bytes = await openBytes(await fetchBytes(file));
    const url = URL.createObjectURL(new Blob([bytes], { type: g[kind + 'Type'] || 'image/png' }));
    thumbUrls.set(file, url);
    return url;
  } catch {
    return null;
  }
}

function setCover(cover, url, kind = 'thumb') {
  if (cover.querySelector('img')) return;
  // A 2:1 banner in a 9:16 card: show it whole over a blurred, zoomed copy of itself.
  if (kind === 'banner') cover.prepend(h('img', { class: 'backdrop', src: url, alt: '' }), h('img', { class: 'banner', src: url, alt: '', decoding: 'async' }));
  else cover.prepend(h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  const gen = cover.querySelector('.gen');
  if (gen) gen.remove();
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
    landscape: game.orientation === 'landscape',
    safe: Boolean(prefs.safe),
    rail: compact ? false : prefs.rail !== false,
    levels: null,
    events: [],
    url: null,
    loading: false,
  };
  const saveSlot = `pg:save:${game.slug}`;
  const levelSlot = `pg:level:${game.slug}`;
  const device = () => (st.deviceId === CUSTOM_ID ? { ...deviceById(CUSTOM_ID), ...st.custom } : deviceById(st.deviceId));

  // ---- DOM
  const iframe = h('iframe', {
    title: game.title,
    sandbox: 'allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads',
    allow: 'autoplay; fullscreen; gamepad; accelerometer; gyroscope',
    referrerpolicy: 'no-referrer',
  });
  const cutout = h('div', { class: 'cutout', 'aria-hidden': 'true' });
  const safeBands = ['top', 'right', 'bottom', 'left'].map((side) => h('div', { class: `safe ${side}`, 'aria-hidden': 'true' }));
  const overlay = h('div', { class: 'overlay' });
  const screen = h('div', { class: 'screen' }, [iframe, cutout, ...safeBands, overlay]);
  const frame = h('div', { class: 'frame' }, screen);
  const rotateHint = h('div', { class: 'rotate-hint', text: 'Xoay ngang điện thoại để chơi game này', hidden: true });
  const stageInner = h('div', { class: 'stage-inner' }, frame);
  const stage = h('div', { class: 'stage' }, [stageInner, rotateHint]);

  const levelSelect = h('select', { class: 'input', id: 'level', 'aria-label': 'Chọn level', hidden: true, onchange: (e) => gotoLevel(Number(e.target.value)) });
  const deviceBtn = h('button', { class: 'btn device-btn', 'aria-haspopup': 'listbox', onclick: () => toggleDeviceMenu() });
  const rotateBtn = h('button', { class: 'btn icon', title: 'Xoay (R)', 'aria-label': 'Xoay ngang/dọc', html: icon('rotate'), onclick: () => rotate() });
  const safeBtn = h('button', { class: 'btn icon', title: 'Hiện vùng an toàn (tai thỏ, Dynamic Island, thanh Home)', 'aria-label': 'Vùng an toàn', html: icon('safe'), onclick: () => { st.safe = !st.safe; writePrefs({ safe: st.safe }); layout(); } });
  const reloadBtn = h('button', { class: 'btn icon', title: 'Tải lại game', 'aria-label': 'Tải lại game', html: icon('reload'), onclick: () => loadGame() });
  const fullBtn = h('button', { class: 'btn icon', title: 'Toàn màn hình', 'aria-label': 'Toàn màn hình', html: icon('full'), hidden: !document.fullscreenEnabled, onclick: () => stage.requestFullscreen().catch(() => toast('Trình duyệt không cho bật toàn màn hình.')) });
  const qrBtn = h('button', { class: 'btn icon', title: 'Mở trên điện thoại', 'aria-label': 'Mã QR để mở trên điện thoại', html: icon('qr'), onclick: () => toggleQr() });
  const railBtn = h('button', { class: 'btn icon', title: 'Thông tin game', 'aria-label': 'Thông tin game', html: icon('info'), onclick: () => { st.rail = !st.rail; if (!compact) writePrefs({ rail: st.rail }); renderRail(); layout(); } });

  const sub = [game.author, game.status ? STATUS_LABEL[game.status] : '', formatDate(game.updated)].filter(Boolean).join(' · ');
  const barIcon = game.icon ? h('span', { class: 'app-icon', 'aria-hidden': 'true' }) : null;
  if (barIcon) loadArt(game, 'icon').then((url) => url && barIcon.append(h('img', { src: url, alt: '' })));
  const railBanner = game.banner ? h('div', { class: 'rail-banner', 'aria-hidden': 'true' }) : null;
  if (railBanner) loadArt(game, 'banner').then((url) => url && railBanner.append(h('img', { src: url, alt: '' })));
  const bar = h('header', { class: 'bar' }, [
    h('a', { class: 'btn icon ghost', href: '#/', title: 'Về thư viện', 'aria-label': 'Về thư viện', html: icon('back') }),
    barIcon,
    h('div', { class: 'title' }, [h('h2', { text: game.title }), sub ? h('span', { text: sub }) : null]),
    h('span', { class: 'spacer' }),
    levelSelect,
    compact ? null : h('div', { class: 'group' }, [deviceBtn, rotateBtn, safeBtn]),
    compact ? null : h('span', { class: 'divider' }),
    h('div', { class: 'group' }, [reloadBtn, compact ? null : fullBtn, compact ? null : qrBtn, railBtn]),
  ]);

  const eventsList = h('ol', {});
  const levelButtons = h('div', { class: 'actions' });
  const levelSection = h('section', { hidden: true }, [h('h3', { text: 'Level' }), levelButtons]);
  const resetBtn = h('button', { class: 'btn', html: `${icon('trash')}<span>Xoá dữ liệu lưu</span>`, title: 'Xoá điểm, tiến độ… mà game đã lưu trên máy này', onclick: resetSave });
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
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn', html: `${icon('link')}<span>Sao chép link</span>`, onclick: async () => toast((await copyText(location.href)) ? 'Đã sao chép link.' : 'Không sao chép được — hãy copy từ thanh địa chỉ.') }),
        resetBtn,
      ]),
    ]),
    levelSection,
    h('section', { class: 'events' }, [
      h('div', { class: 'events-head' }, [h('h3', { text: 'Sự kiện game' }), h('button', { class: 'btn ghost', style: { height: '26px', fontSize: '12px' }, text: 'Xoá', onclick: () => { st.events = []; renderEvents(); } })]),
      eventsList,
    ]),
  ]);

  function fact(label, value) {
    return value ? [h('dt', { text: label }), h('dd', { text: value })] : [];
  }

  const root = h('div', { class: 'player' + (compact ? ' compact' : '') }, [bar, stage, rail]);
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
    frame.className = 'frame' + (free ? ' free' : '') + (fill ? ' fill' : '') + (landscape ? ' landscape' : '');
    frame.style.width = `${g.frameW}px`;
    frame.style.height = `${g.frameH}px`;
    frame.style.setProperty('--bz', `${g.bezel}px`);
    frame.style.setProperty('--r', `${free ? 0 : d.radius}px`);
    frame.style.transform = g.scale === 1 ? '' : `scale(${g.scale})`;
    // A scaled element keeps its layout size; negative margins stop it from forcing overflow.
    frame.style.margin = g.scale === 1 ? '' : `${(g.frameH * (g.scale - 1)) / 2}px ${(g.frameW * (g.scale - 1)) / 2}px`;

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
    deviceBtn.append(
      h('span', { class: 'name', text: d.label }),
      fill ? null : h('span', { class: 'size', text: landscape ? `${d.height} × ${d.width}` : sizeLabel(d) }),
      h('span', { html: icon('chevron') }),
    );
    rotateBtn.disabled = fill;
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
    st.loading = true;
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
      st.loading = false;
      showOverlay([
        h('strong', { text: 'Không mở được game' }),
        h('span', { text: String(err && err.name === 'OperationError' ? 'File game không giải mã được — thử tải lại trang.' : err.message || err) }),
        h('button', { class: 'btn', text: 'Thử lại', onclick: () => loadGame() }),
      ]);
    }
  }

  iframe.addEventListener('load', () => {
    if (!st.url) return;
    st.loading = false;
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
          class: 'btn', style: { minWidth: '36px', justifyContent: 'center' }, text: String(n), title: name || `Level ${n}`,
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
  function openPopup(anchor, panel, width) {
    closePopup();
    const backdrop = h('div', { class: 'backdrop', onclick: closePopup });
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${Math.round(r.bottom + 6)}px`;
    panel.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)))}px`;
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
      h('div', { class: 'custom' }, [customInput, h('button', { class: 'btn', text: 'Áp dụng', onclick: applyCustom })]),
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
          const btn = h('button', { class: 'item', role: 'option', 'aria-selected': d.id === st.deviceId ? 'true' : 'false', onclick: () => pick(d.id) }, [
            h('span', { class: 'check', text: d.id === st.deviceId ? '✓' : '' }),
            h('span', { text: d.label }),
            h('span', { class: 'size', text: d.id === FILL_ID ? '' : sizeLabel(shown) }),
          ]);
          items.push(btn);
          list.append(h('li', { role: 'presentation' }, btn));
        }
      }
      if (!items.length) list.append(h('li', { class: 'no-match', text: 'Không có thiết bị nào khớp.' }));
      active = Math.max(0, items.findIndex((b) => b.getAttribute('aria-selected') === 'true'));
      if (q) active = 0;
      mark();
    }
    function mark() {
      items.forEach((b, i) => b.classList.toggle('active', i === active));
      if (items[active]) items[active].scrollIntoView({ block: 'nearest' });
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
    openPopup(deviceBtn, panel, 290);
    filter.focus();
  }

  function toggleQr() {
    if (popup) { closePopup(); return; }
    const url = location.href;
    const canvas = h('canvas', { width: 200, height: 200, 'aria-label': 'Mã QR' });
    const panel = h('div', { class: 'pop' }, [
      canvas,
      h('p', { text: site.locked ? 'Quét bằng camera điện thoại. Lần đầu mở sẽ cần nhập mật khẩu.' : 'Quét bằng camera điện thoại để chơi trên máy thật.' }),
      h('code', { text: url }),
      h('button', { class: 'btn', html: `${icon('link')}<span>Sao chép link</span>`, onclick: async () => toast((await copyText(url)) ? 'Đã sao chép link.' : 'Không sao chép được.') }),
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
  loadGame();
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
