// Admin mode: edit page content in place, drop in a team photo / logo, then
// publish straight to the GitHub repo (gallery.config.json + brand/*) via the GitHub API.
// The site stays static: a push triggers the "Deploy gallery" workflow (~1 min).
import { h, icon, btn, md, toast } from './ui.js';
import { toB64, fromB64 } from './shared.js';

const store = { content: null, photoUrl: '', logoUrl: '' };
export const admin = { active: false, preview: false, draft: null, dirty: 0, pending: {}, rerender: () => {} };

export function setContent(c) { store.content = c; }
export const C = () => (admin.active ? admin.draft : store.content);
export const isEditing = () => admin.active && !admin.preview;
export const overrides = () => ({ photoUrl: admin.pending.photoUrl || store.photoUrl, logoUrl: admin.pending.logoUrl || store.logoUrl });

const safeGet = (area, k) => { try { return window[area].getItem(k); } catch { return null; } };
const safeSet = (area, k, v) => { try { window[area].setItem(k, v); } catch { /* blocked */ } };
const safeDel = (area, k) => { try { window[area].removeItem(k); } catch { /* blocked */ } };

/** The admin entry stays hidden from regular users until this browser opens #/admin once. */
export const adminUnlocked = () => safeGet('localStorage', 'pg:admin') === '1';
export const unlockAdmin = () => safeSet('localStorage', 'pg:admin', '1');

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export function markDirty() {
  admin.dirty++;
  document.querySelectorAll('[data-admin-count]').forEach((el) => { el.textContent = 'Có thay đổi chưa lưu'; el.classList.add('on'); });
}

export function enterAdmin(rerender) {
  admin.active = true;
  admin.preview = false;
  admin.draft = structuredClone(store.content);
  admin.dirty = 0;
  admin.pending = {};
  admin.rerender = rerender;
  rerender();
  toast('Chế độ admin: bấm vào các ô viền nét đứt để sửa.');
}

export function exitAdmin(force = false) {
  if (!force && admin.dirty && !confirm('Bỏ các thay đổi chưa lưu?')) return;
  for (const k of ['photoUrl', 'logoUrl']) if (admin.pending[k]) URL.revokeObjectURL(admin.pending[k]);
  admin.active = false;
  admin.preview = false;
  admin.draft = null;
  admin.dirty = 0;
  admin.pending = {};
  admin.rerender();
}

// ------------------------------------------------------------------ editable primitives

/** Text bound to a content path. Plain text for users; contenteditable for admins. */
export function ed(tag, path, attrs = {}) {
  const { md: isMd, multiline, placeholder, fallback, ...rest } = attrs;
  const raw = getPath(C(), path);
  const value = raw == null ? '' : String(raw);
  const el = h(tag, rest);
  if (!isEditing()) {
    const shown = value || fallback || '';
    if (isMd) el.innerHTML = md(shown); else el.textContent = shown;
    if (!shown) el.hidden = true;
    return el;
  }
  el.textContent = value;
  el.classList.add('editable');
  el.dataset.ph = placeholder || 'Nhập nội dung…';
  try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.spellcheck = false;
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('input', () => { setPath(admin.draft, path, el.innerText.replace(/\n+$/, '')); markDirty(); });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); } });
  return el;
}

/** Small labelled input bound to a content path (admin only). */
export function field(label, path, attrs = {}, onChange) {
  const input = h('input', { class: 'input', value: getPath(C(), path) ?? '', ...attrs });
  input.addEventListener('input', () => { setPath(admin.draft, path, input.value.trim()); markDirty(); if (onChange) onChange(input.value); });
  return h('label', { class: 'afield' }, [h('span', { text: label }), input]);
}

// ------------------------------------------------------------------ image drop zones

async function toBlob(file, kind) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Không đọc được ảnh này.'));
    i.src = URL.createObjectURL(file);
  });
  const max = kind === 'logo' ? 512 : 1920;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => c.toBlob(resolve, kind === 'logo' ? 'image/png' : 'image/jpeg', 0.86));
}

/** Turn `el` into a drag-and-drop / click-to-pick image slot. kind: 'photo' | 'logo'. */
export function dropzone(el, kind, onPreview) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  el.classList.add('drop');
  el.append(input, h('span', { class: 'drop-hint', html: `${icon('upload')}<span>${kind === 'logo' ? 'Kéo thả logo vào đây' : 'Kéo thả ảnh team vào đây'}<small>hoặc bấm để chọn file · PNG/JPG</small></span>` }));
  const take = async (file) => {
    if (!file || !/^image\//.test(file.type)) { toast('Chỉ nhận file ảnh PNG, JPG hoặc WebP.'); return; }
    try {
      const blob = await toBlob(file, kind);
      const key = kind === 'logo' ? 'logo' : 'photo';
      if (admin.pending[key + 'Url']) URL.revokeObjectURL(admin.pending[key + 'Url']);
      admin.pending[key] = blob;
      admin.pending[key + 'Url'] = URL.createObjectURL(blob);
      markDirty();
      onPreview(admin.pending[key + 'Url']);
    } catch (err) { toast(err.message || String(err)); }
  };
  el.addEventListener('click', (e) => { if (e.target.closest('.editable, button, a')) return; input.click(); });
  input.addEventListener('change', () => take(input.files[0]));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); take(e.dataTransfer.files[0]); });
}

// ------------------------------------------------------------------ admin bar

export function adminBar() {
  return h('div', { class: 'admin-bar' + (admin.preview ? ' preview' : '') }, h('div', { class: 'wrap admin-row' }, [
    h('span', { class: 'admin-dot', 'aria-hidden': 'true' }),
    h('strong', { text: admin.preview ? 'Đang xem như người dùng' : 'Chế độ admin' }),
    h('span', { class: 'admin-hint', text: admin.preview ? 'Bấm “Sửa tiếp” để quay lại chỉnh.' : 'Bấm vào ô viền nét đứt để sửa · kéo thả ảnh vào khung ảnh' }),
    h('span', { class: 'admin-count' + (admin.dirty ? ' on' : ''), 'data-admin-count': '', text: admin.dirty ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi' }),
    h('span', { class: 'spacer' }),
    btn(admin.preview ? 'Sửa tiếp' : 'Xem như người dùng', admin.preview ? 'edit' : 'eye', { class: 'btn sm ghost-dark', onclick: () => { admin.preview = !admin.preview; admin.rerender(); } }),
    btn('Thoát', 'x', { class: 'btn sm ghost-dark', onclick: () => exitAdmin() }),
    btn('Lưu & đăng', 'upload', { class: 'btn sm primary', onclick: () => publish() }),
  ]));
}

// ------------------------------------------------------------------ GitHub publishing

const enc = new TextEncoder();
const dec = new TextDecoder();
const creds = () => ({
  token: safeGet('sessionStorage', 'pg:gh-token') || safeGet('localStorage', 'pg:gh-token') || '',
  repo: safeGet('localStorage', 'pg:gh-repo') || (C() && C().admin && C().admin.repo) || '',
  branch: safeGet('localStorage', 'pg:gh-branch') || (C() && C().admin && C().admin.branch) || 'main',
});

async function gh({ token, repo }, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `GitHub ${res.status}`;
    try { msg += ': ' + (await res.json()).message; } catch { /* no body */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
async function getFile(c, path) {
  try { return await gh(c, `contents/${encPath(path)}?ref=${encodeURIComponent(c.branch)}`); }
  catch (e) { if (e.status === 404) return null; throw e; }
}
async function putFile(c, path, bytes, message) {
  const cur = await getFile(c, path);
  return gh(c, `contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify({ message, content: toB64(bytes), branch: c.branch, sha: cur ? cur.sha : undefined }) });
}

function credsDialog() {
  return new Promise((resolve) => {
    const c = creds();
    const repo = h('input', { class: 'input', value: c.repo, placeholder: 'ten-org/prototype-gallery' });
    const branch = h('input', { class: 'input', value: c.branch, placeholder: 'main' });
    const token = h('input', { class: 'input', type: 'password', value: c.token, placeholder: 'github_pat_…', autocomplete: 'off' });
    const remember = h('input', { type: 'checkbox', checked: Boolean(safeGet('localStorage', 'pg:gh-token')) });
    const error = h('p', { class: 'lock-error', role: 'alert' });
    const ok = h('button', { class: 'btn primary lg', type: 'submit', text: 'Xác nhận & đăng' });
    const close = (v) => { wrap.remove(); resolve(v); };
    const form = h('form', { class: 'modal-card', onsubmit: async (e) => {
      e.preventDefault();
      const next = { repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() };
      if (!/^[\w.-]+\/[\w.-]+$/.test(next.repo) || !next.token) { error.textContent = 'Cần repo dạng ten-org/ten-repo và token.'; return; }
      ok.disabled = true; ok.textContent = 'Đang kiểm tra…'; error.textContent = '';
      try {
        const info = await gh(next, '');
        if (info.permissions && !info.permissions.push) throw new Error('Tài khoản này không có quyền ghi vào repo.');
        safeSet('localStorage', 'pg:gh-repo', next.repo);
        safeSet('localStorage', 'pg:gh-branch', next.branch);
        safeDel('localStorage', 'pg:gh-token'); safeDel('sessionStorage', 'pg:gh-token');
        safeSet(remember.checked ? 'localStorage' : 'sessionStorage', 'pg:gh-token', next.token);
        close(next);
      } catch (err) {
        error.textContent = err.status === 401 ? 'Token không hợp lệ hoặc đã hết hạn.' : err.status === 404 ? 'Không thấy repo — kiểm tra tên repo và quyền của token.' : String(err.message || err);
      } finally { ok.disabled = false; ok.textContent = 'Xác nhận & đăng'; }
    } }, [
      h('div', { class: 'lock-head' }, [h('h1', { text: 'Đăng lên GitHub' }), h('p', { html: 'Thay đổi được ghi vào <code>gallery.config.json</code> và <code>brand/</code> trong repo, sau ~1 phút site tự cập nhật. Cần <strong>fine-grained token</strong> có quyền <strong>Contents: Read and write</strong> cho repo này.' })]),
      h('label', { class: 'field' }, [h('span', { text: 'Repo' }), repo]),
      h('label', { class: 'field' }, [h('span', { text: 'Nhánh' }), branch]),
      h('label', { class: 'field' }, [h('span', { text: 'GitHub token' }), token]),
      h('label', { class: 'check' }, [remember, 'Ghi nhớ token trên máy này']),
      ok,
      h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', class: 'modal-link', text: 'Tạo token mới trên GitHub ↗' }),
      error,
      h('button', { class: 'btn icon ghost modal-x', type: 'button', 'aria-label': 'Đóng', html: icon('x'), onclick: () => close(null) }),
    ]);
    const wrap = h('div', { class: 'modal', onclick: (e) => { if (e.target === wrap) close(null); } }, form);
    document.body.append(wrap);
    (c.repo ? token : repo).focus();
  });
}

/** Strip build-generated fields so they are never written back into the config. */
function contentForConfig(d) {
  const team = { ...(d.team || {}) };
  delete team.photo; delete team.photoType;
  return { title: d.title, subtitle: d.subtitle, team, downloads: d.downloads, install: d.install, guide: d.guide, mobile: d.mobile, faq: d.faq };
}

let publishing = false;
export async function publish() {
  if (publishing) return;
  if (!admin.dirty) { toast('Chưa có thay đổi nào để đăng.'); return; }
  let c = creds();
  if (!c.token || !c.repo) { c = await credsDialog(); if (!c) return; }
  publishing = true;
  const bar = document.querySelector('[data-admin-count]');
  const say = (t) => { if (bar) bar.textContent = t; };
  try {
    const who = (safeGet('localStorage', 'pg:nick') || safeGet('sessionStorage', 'pg:nick') || 'admin').slice(0, 40);
    if (admin.pending.photo) { say('Đang tải ảnh team…'); await putFile(c, 'brand/team.jpg', new Uint8Array(await admin.pending.photo.arrayBuffer()), `Ảnh team mới (${who})`); }
    if (admin.pending.logo) { say('Đang tải logo…'); await putFile(c, 'brand/logo.png', new Uint8Array(await admin.pending.logo.arrayBuffer()), `Logo team mới (${who})`); }
    say('Đang lưu nội dung…');
    const cur = await getFile(c, 'gallery.config.json');
    if (!cur) throw new Error('Không thấy gallery.config.json trong repo.');
    const config = JSON.parse(dec.decode(fromB64(cur.content.replace(/\s/g, ''))));
    Object.assign(config, contentForConfig(admin.draft));
    await gh(c, 'contents/gallery.config.json', { method: 'PUT', body: JSON.stringify({ message: `Cập nhật nội dung gallery (${who})`, content: toB64(enc.encode(JSON.stringify(config, null, 2) + '\n')), branch: c.branch, sha: cur.sha }) });
    store.content = structuredClone(admin.draft);
    if (admin.pending.photoUrl) store.photoUrl = admin.pending.photoUrl;
    if (admin.pending.logoUrl) store.logoUrl = admin.pending.logoUrl;
    admin.pending = {};
    admin.dirty = 0;
    toast('Đã đăng! Site sẽ cập nhật cho mọi người sau khoảng 1 phút.');
    admin.rerender();
  } catch (err) {
    if (err.status === 401) { safeDel('localStorage', 'pg:gh-token'); safeDel('sessionStorage', 'pg:gh-token'); }
    say('Đăng chưa thành công');
    toast(`Không đăng được: ${err.message || err}`);
  } finally {
    publishing = false;
  }
}
