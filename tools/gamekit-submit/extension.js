// GameKit "Submit game" button.
//
// Adds a cloud-upload button to each project row in GameKit's Projects view. It opens a form
// (name — required and unique on the gallery, description, 512×512 icon, 1024×512 banner),
// then runs the gallery's own scripts/submit.mjs with --build --push. All rules (unique name,
// image sizes) live in the gallery repo; this file only collects input and shows progress.
'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LINKS_KEY = 'gamekitGallery.links'; // { [projectPath]: slug } — which gallery game a project replaces
let output;
const open = new Map(); // projectPath -> panel, one form per project

function activate(context) {
  output = vscode.window.createOutputChannel('GameKit Submit');
  context.subscriptions.push(output, vscode.commands.registerCommand('gamekitGallery.submit', (arg) => submitGame(context, arg)));
}

function deactivate() {}

// ------------------------------------------------------------------ helpers

const expand = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function slugify(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
}

/** Run a command; resolves { code, out } and streams each chunk to onData. Never rejects. */
function run(cmd, args, cwd, onData, env) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = cp.spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: false });
    } catch (err) {
      resolve({ code: -1, out: String(err), missing: true });
      return;
    }
    const take = (chunk) => { const s = chunk.toString(); out += s; if (onData) onData(s); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (err) => resolve({ code: -1, out: out + String(err), missing: err.code === 'ENOENT' }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** Node for the gallery scripts: `node` on PATH, else VS Code's own runtime. */
async function node(args, cwd, onData) {
  const r = await run('node', args, cwd, onData);
  if (!r.missing) return r;
  return run(process.execPath, args, cwd, onData, { ELECTRON_RUN_AS_NODE: '1' });
}

async function info(repo, ...args) {
  const r = await node([path.join(repo, 'scripts', 'gallery-info.mjs'), ...args], repo);
  try {
    return JSON.parse(r.out.trim().split('\n').pop());
  } catch {
    throw new Error(r.out.trim() || 'gallery-info.mjs không trả kết quả');
  }
}

async function siteUrl(repo) {
  const r = await run('git', ['remote', 'get-url', 'origin'], repo);
  const m = /github\.com[/:]([^/]+)\/([^/.\s]+)/.exec(r.out);
  return m ? `https://${m[1].toLowerCase()}.github.io/${m[2]}/` : '';
}

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

// ------------------------------------------------------------------ where things are

async function resolveProject(arg) {
  if (arg && typeof arg.path === 'string' && !(arg instanceof vscode.Uri)) return arg.path; // GameKit project row
  if (arg instanceof vscode.Uri) return arg.fsPath;
  const folders = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath)
    .filter((p) => isFile(path.join(p, 'package.json')) && !isFile(path.join(p, 'scripts', 'gallery-info.mjs'))); // not the gallery itself
  if (folders.length === 1) return folders[0];
  if (folders.length > 1) return vscode.window.showQuickPick(folders, { placeHolder: 'Submit game nào?' });
  const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Chọn thư mục game' });
  return picked && picked[0] ? picked[0].fsPath : undefined;
}

async function resolveRepo() {
  const config = vscode.workspace.getConfiguration('gamekitGallery');
  const repo = expand(config.get('repoPath') || '');
  if (repo && isFile(path.join(repo, 'scripts', 'gallery-info.mjs'))) return repo;
  const choice = await vscode.window.showWarningMessage(
    `Không thấy repo Prototype Gallery ở "${repo || '(chưa đặt)'}".`, { modal: true }, 'Chọn thư mục repo…');
  if (!choice) return undefined;
  const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Dùng repo này' });
  const dir = picked && picked[0] && picked[0].fsPath;
  if (!dir) return undefined;
  if (!isFile(path.join(dir, 'scripts', 'gallery-info.mjs'))) {
    vscode.window.showErrorMessage('Thư mục này không phải repo Prototype Gallery (thiếu scripts/gallery-info.mjs). Hãy git pull bản mới của gallery.');
    return undefined;
  }
  await config.update('repoPath', dir, vscode.ConfigurationTarget.Global);
  return dir;
}

// ------------------------------------------------------------------ the form

async function submitGame(context, arg) {
  const project = await resolveProject(arg);
  if (!project) return;
  if (!isFile(path.join(project, 'package.json')) && !isFile(path.join(project, 'index.html'))) {
    vscode.window.showErrorMessage(`${project} không có package.json hay index.html — không phải thư mục game.`);
    return;
  }
  if (open.has(project)) { open.get(project).reveal(); return; }
  const repo = await resolveRepo();
  if (!repo) return;

  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')); } catch { /* single html game */ }
  const projectName = (arg && arg.name) || pkg.name || path.basename(project);

  const panel = vscode.window.createWebviewPanel('gamekitGallery.submit', `Submit: ${projectName}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [],
  });
  open.set(project, panel);
  panel.onDidDispose(() => open.delete(project));
  const nonce = crypto.randomBytes(16).toString('base64');
  panel.webview.html = formHtml(panel.webview, nonce);

  const tmpDir = path.join(context.globalStorageUri.fsPath, 'drops');
  const post = (msg) => panel.webview.postMessage(msg);
  let games = [];
  let busy = false;

  async function load() {
    post({ type: 'status', text: 'Đang lấy danh sách game mới nhất trên gallery…' });
    const pull = await run('git', ['pull', '--rebase', '--autostash'], repo);
    try {
      games = (await info(repo, 'list')).games;
    } catch (err) {
      post({ type: 'fatal', text: `Không đọc được danh sách game: ${err.message}` });
      return;
    }
    const links = context.globalState.get(LINKS_KEY, {});
    const known = new Set(games.map((g) => g.slug));
    const target = known.has(links[project]) ? links[project]
      : [slugify(pkg.name || ''), slugify(path.basename(project))].find((s) => s && known.has(s)) || null;
    post({
      type: 'init',
      project: { path: project, name: projectName },
      games: games.map(({ slug, title, description }) => ({ slug, title, description })),
      target,
      site: await siteUrl(repo),
      warning: pull.code === 0 ? '' : 'Không cập nhật được từ GitHub (mất mạng?). Danh sách tên có thể chưa mới nhất.',
    });
  }

  async function checkImage(kind, file) {
    const r = await info(repo, 'image', kind, file);
    post({ type: 'image', kind, ok: r.ok, error: r.error, path: r.ok ? file : null, uri: r.ok ? dataUri(file) : null, width: r.width, height: r.height });
  }

  async function submit(form) {
    if (busy) return;
    busy = true;
    const log = (text) => { output.append(text); post({ type: 'log', text }); };
    const fail = (text) => { busy = false; post({ type: 'failed', text }); };
    output.appendLine(`\n=== Submit ${projectName} (${new Date().toLocaleString()}) ===`);
    try {
      post({ type: 'step', text: 'Lấy bản mới nhất của gallery…' });
      const pull = await run('git', ['pull', '--rebase', '--autostash'], repo, log);
      if (pull.code !== 0) return fail('Không cập nhật được repo gallery từ GitHub. Kiểm tra mạng rồi thử lại.');

      games = (await info(repo, 'list')).games;
      const target = form.target && games.some((g) => g.slug === form.target) ? form.target : null;
      const clash = (await info(repo, 'title', form.title, target || '')).conflict;
      if (clash) return fail(`Tên "${form.title}" trùng với game "${clash.title}" vừa có trên gallery. Hãy đặt tên khác.`);

      let slug = target;
      if (!slug) {
        const base = slugify(form.title) || slugify(pkg.name || '') || slugify(path.basename(project)) || 'game';
        slug = base;
        for (let i = 2; games.some((g) => g.slug === slug) || fs.existsSync(path.join(repo, 'games', slug)); i++) slug = `${base.slice(0, 60)}-${i}`;
      }

      const args = [path.join(repo, 'scripts', 'submit.mjs'), project, '--build', '--slug', slug, '--title', form.title, '--desc', form.description];
      for (const kind of ['icon', 'banner']) {
        const a = form[kind] || {};
        if (a.mode === 'new' && a.path) args.push('--' + kind, a.path);
        else if (a.mode === 'remove') args.push('--no-' + kind);
      }
      args.push('--push');

      post({ type: 'step', text: 'Build game và đưa lên gallery…' });
      const r = await node(args, repo, log);
      if (r.code !== 0) {
        const reason = (r.out.match(/✖ (.+)/) || [])[1];
        return fail(reason || 'Submit lỗi — xem log bên dưới.');
      }
      const links = context.globalState.get(LINKS_KEY, {});
      await context.globalState.update(LINKS_KEY, { ...links, [project]: slug });
      const unchanged = /Không có gì thay đổi/.test(r.out);
      const url = await siteUrl(repo);
      busy = false;
      post({ type: 'done', slug, url: url ? `${url}#/play/${slug}` : '', unchanged, updated: Boolean(target) });
      if (!panel.visible) {
        vscode.window.showInformationMessage(`Đã submit "${form.title}" lên gallery.`, ...(url ? ['Mở gallery'] : []))
          .then((c) => c && vscode.env.openExternal(vscode.Uri.parse(url)));
      }
    } catch (err) {
      fail(String(err.message || err));
    }
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === 'ready') await load();
      else if (msg.type === 'pick') {
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Ảnh': ['png', 'jpg', 'jpeg', 'webp'] }, openLabel: msg.kind === 'icon' ? 'Dùng làm icon' : 'Dùng làm banner' });
        if (files && files[0]) await checkImage(msg.kind, files[0].fsPath);
      } else if (msg.type === 'drop') {
        const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(msg.data || '');
        if (!m) { post({ type: 'image', kind: msg.kind, ok: false, error: 'Chỉ nhận ảnh .png, .jpg hoặc .webp' }); return; }
        fs.mkdirSync(tmpDir, { recursive: true });
        const file = path.join(tmpDir, `${msg.kind}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
        fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
        await checkImage(msg.kind, file);
      } else if (msg.type === 'existing') {
        const g = games.find((x) => x.slug === msg.slug);
        post({ type: 'existing', slug: msg.slug, icon: g && g.icon ? dataUri(g.icon) : null, banner: g && g.banner ? dataUri(g.banner) : null });
      } else if (msg.type === 'submit') await submit(msg.form);
      else if (msg.type === 'open' && msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
      else if (msg.type === 'log') output.show(true);
      else if (msg.type === 'close') panel.dispose();
    } catch (err) {
      post({ type: 'failed', text: String(err.message || err) });
    }
  });
}

// ------------------------------------------------------------------ webview

function formHtml(webview, nonce) {
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px 16px; font: 13px/1.5 var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .dialog { max-width: 560px; margin: 0 auto; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, transparent)); border-radius: 10px; box-shadow: 0 8px 28px var(--vscode-widget-shadow, rgb(0 0 0 / .3)); }
  header { padding: 18px 22px 14px; border-bottom: 1px solid var(--vscode-widget-border, rgb(128 128 128 / .2)); }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  .path { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 12px; word-break: break-all; }
  form { padding: 18px 22px 6px; display: grid; gap: 16px; }
  label.field { display: grid; gap: 6px; }
  .lab { font-weight: 600; }
  .lab small { font-weight: 400; color: var(--vscode-descriptionForeground); margin-left: 4px; }
  .req { color: var(--vscode-errorForeground); }
  input[type=text], textarea, select { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 6px 8px; }
  input[type=text]:focus, textarea:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input.bad { border-color: var(--vscode-inputValidation-errorBorder); }
  textarea { resize: vertical; min-height: 64px; }
  .hint { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .hint.err { color: var(--vscode-errorForeground); }
  .hint.ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  .target-note { padding: 8px 10px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); font-size: 12px; }
  .art { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; }
  .drop { position: relative; display: grid; place-items: center; border: 1.5px dashed var(--vscode-widget-border, rgb(128 128 128 / .45)); border-radius: 10px; overflow: hidden; background: var(--vscode-input-background); color: var(--vscode-descriptionForeground); font-size: 11px; text-align: center; cursor: pointer; }
  .drop.icon { width: 96px; height: 96px; border-radius: 20px; }
  .drop.banner { width: 192px; height: 96px; }
  .drop.over { border-color: var(--vscode-focusBorder); }
  .drop img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .art .side { display: grid; gap: 6px; justify-items: start; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font: inherit; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 5px 12px; cursor: pointer; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.link { background: none; border: 0; padding: 0; color: var(--vscode-textLink-foreground); }
  button:disabled { opacity: .5; cursor: default; }
  footer { display: flex; align-items: center; gap: 8px; padding: 14px 22px 18px; }
  footer .grow { flex: 1; color: var(--vscode-descriptionForeground); font-size: 12px; }
  .progress { margin: 0 22px 18px; display: grid; gap: 8px; }
  .progress .step { font-weight: 600; }
  .progress .result { padding: 10px 12px; border-radius: 6px; }
  .progress .result.ok { background: color-mix(in srgb, var(--vscode-testing-iconPassed, #3fb950) 15%, transparent); }
  .progress .result.err { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
  pre { margin: 0; max-height: 180px; overflow: auto; padding: 8px 10px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); font: 11.5px/1.45 var(--vscode-editor-font-family); white-space: pre-wrap; word-break: break-word; }
  [hidden] { display: none !important; }
  .spin { display: inline-block; width: 11px; height: 11px; margin-right: 6px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: s .8s linear infinite; vertical-align: -1px; }
  @keyframes s { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="dialog" role="dialog" aria-labelledby="h">
  <header>
    <h1 id="h">Submit game lên Gallery</h1>
    <div class="path" id="path"></div>
  </header>
  <div id="loading" class="progress" style="margin-top:18px"><div><span class="spin"></span><span id="loadingText">Đang tải…</span></div></div>
  <form id="form" hidden novalidate>
    <div id="warning" class="hint err" hidden></div>
    <label class="field">
      <span class="lab">Đưa lên như</span>
      <select id="target"></select>
      <div id="targetNote" class="target-note" hidden></div>
    </label>
    <label class="field">
      <span class="lab">Tên game <span class="req">*</span></span>
      <input type="text" id="title" maxlength="80" autocomplete="off" required>
      <div id="titleHint" class="hint">Bắt buộc. Không được trùng tên game đã có trên gallery.</div>
    </label>
    <label class="field">
      <span class="lab">Mô tả <small>không bắt buộc</small></span>
      <textarea id="desc" maxlength="600" rows="3" placeholder="Game là gì, bản này đang thử điều gì…"></textarea>
    </label>
    <div class="field">
      <span class="lab">Icon <small>512×512 · không bắt buộc</small></span>
      <div class="art">
        <div class="drop icon" id="iconDrop" tabindex="0" role="button" aria-label="Chọn icon"><span>Kéo ảnh<br>vào đây</span></div>
        <div class="side">
          <div class="row"><button type="button" id="iconPick">Chọn ảnh…</button><button type="button" id="iconClear" hidden>Bỏ icon</button></div>
          <div class="hint" id="iconHint">PNG, JPG hoặc WebP, đúng 512×512 px, tối đa 2 MB.</div>
        </div>
      </div>
    </div>
    <div class="field">
      <span class="lab">Banner <small>1024×512 · không bắt buộc</small></span>
      <div class="art">
        <div class="drop banner" id="bannerDrop" tabindex="0" role="button" aria-label="Chọn banner"><span>Kéo ảnh vào đây</span></div>
        <div class="side">
          <div class="row"><button type="button" id="bannerPick">Chọn ảnh…</button><button type="button" id="bannerClear" hidden>Bỏ banner</button></div>
          <div class="hint" id="bannerHint">PNG, JPG hoặc WebP, đúng 1024×512 px, tối đa 2 MB.</div>
        </div>
      </div>
    </div>
  </form>
  <div id="progress" class="progress" hidden>
    <div class="step" id="step"></div>
    <div class="result" id="result" hidden></div>
    <pre id="log"></pre>
  </div>
  <footer id="footer" hidden>
    <span class="grow" id="footNote">Game sẽ được build lại rồi push lên GitHub.</span>
    <button type="button" id="cancel">Huỷ</button>
    <button type="button" class="primary" id="submit" disabled>Submit game</button>
  </footer>
</div>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const st = { games: [], target: null, project: null, site: '', busy: false, done: false, art: { icon: blank(), banner: blank() } };
  function blank() { return { mode: 'none', path: null, uri: null, existing: null }; }

  function slugify(text) {
    return String(text).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  }
  const titleKey = (t) => slugify(t) || String(t || '').trim().toLowerCase();
  function conflict(title) {
    const key = titleKey(title);
    if (!key) return null;
    return st.games.find((g) => g.slug !== st.target && (titleKey(g.title) === key || g.slug === key)) || null;
  }

  // ---- validation
  function validate() {
    const title = $('title').value.trim();
    const clash = conflict(title);
    const hint = $('titleHint');
    let ok = false;
    if (!title) { hint.textContent = 'Bắt buộc. Không được trùng tên game đã có trên gallery.'; hint.className = 'hint'; }
    else if (clash) { hint.textContent = 'Trùng với game "' + clash.title + '" đã có trên gallery. Hãy đặt tên khác.'; hint.className = 'hint err'; }
    else { hint.textContent = 'Tên dùng được.'; hint.className = 'hint ok'; ok = true; }
    $('title').classList.toggle('bad', Boolean(title && clash));
    $('submit').disabled = !ok || st.busy;
    return ok;
  }

  // ---- target (new game or replace an existing one)
  function renderTarget() {
    const sel = $('target');
    sel.replaceChildren();
    const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.append(o); };
    add('', '— Game mới —');
    for (const g of st.games) add(g.slug, 'Thay thế: ' + g.title + '  (games/' + g.slug + ')');
    sel.value = st.target || '';
  }
  function applyTarget(prefill) {
    const g = st.games.find((x) => x.slug === st.target);
    const note = $('targetNote');
    if (g) {
      note.hidden = false;
      note.textContent = 'Bản mới sẽ thay thế "' + g.title + '" đang có trên gallery. Thông tin bên dưới là của bản hiện tại — sửa gì thì lưu nấy.';
      if (prefill) { $('title').value = g.title; $('desc').value = g.description || ''; }
      st.art = { icon: blank(), banner: blank() };
      vscode.postMessage({ type: 'existing', slug: g.slug });
      $('submit').textContent = 'Submit — thay bản cũ';
    } else {
      note.hidden = true;
      if (prefill) { $('title').value = st.project ? st.project.name : ''; $('desc').value = ''; }
      st.art = { icon: blank(), banner: blank() };
      $('submit').textContent = 'Submit game';
    }
    renderArt('icon'); renderArt('banner');
    validate();
  }

  // ---- images
  const HINT = { icon: 'PNG, JPG hoặc WebP, đúng 512×512 px, tối đa 2 MB.', banner: 'PNG, JPG hoặc WebP, đúng 1024×512 px, tối đa 2 MB.' };
  function renderArt(kind, error) {
    const a = st.art[kind];
    const drop = $(kind + 'Drop');
    const shown = a.mode === 'new' ? a.uri : a.mode === 'keep' ? a.existing : null;
    drop.replaceChildren();
    if (shown) { const img = document.createElement('img'); img.src = shown; img.alt = ''; drop.append(img); }
    else { const s = document.createElement('span'); s.innerHTML = kind === 'icon' ? 'Kéo ảnh<br>vào đây' : 'Kéo ảnh vào đây'; drop.append(s); }
    $(kind + 'Clear').hidden = !shown;
    $(kind + 'Clear').textContent = a.mode === 'new' && a.existing ? 'Dùng lại ảnh cũ' : kind === 'icon' ? 'Bỏ icon' : 'Bỏ banner';
    const hint = $(kind + 'Hint');
    if (error) { hint.textContent = error; hint.className = 'hint err'; }
    else if (a.mode === 'new') { hint.textContent = 'Ảnh mới — sẽ thay ảnh hiện tại khi submit.'; hint.className = 'hint ok'; }
    else if (a.mode === 'remove') { hint.textContent = 'Sẽ xoá ' + (kind === 'icon' ? 'icon' : 'banner') + ' hiện tại khi submit.'; hint.className = 'hint'; }
    else if (a.mode === 'keep') { hint.textContent = 'Đang dùng ảnh hiện tại trên gallery.'; hint.className = 'hint'; }
    else { hint.textContent = HINT[kind]; hint.className = 'hint'; }
  }
  function clearArt(kind) {
    const a = st.art[kind];
    if (a.mode === 'new' && a.existing) { a.mode = 'keep'; a.path = null; a.uri = null; }
    else if (a.mode === 'new') { a.mode = 'none'; a.path = null; a.uri = null; }
    else if (a.mode === 'keep') a.mode = 'remove';
    renderArt(kind);
  }
  for (const kind of ['icon', 'banner']) {
    const drop = $(kind + 'Drop');
    const pick = () => { if (!st.busy) vscode.postMessage({ type: 'pick', kind }); };
    $(kind + 'Pick').addEventListener('click', pick);
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    $(kind + 'Clear').addEventListener('click', () => clearArt(kind));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || st.busy) return;
      const reader = new FileReader();
      reader.onload = () => vscode.postMessage({ type: 'drop', kind, data: reader.result });
      reader.readAsDataURL(file);
    });
  }

  // ---- submit
  function lock(on) {
    st.busy = on;
    for (const el of document.querySelectorAll('#form input, #form textarea, #form select, #form button')) el.disabled = on;
    $('cancel').disabled = on;
    validate();
  }
  $('title').addEventListener('input', validate);
  $('target').addEventListener('change', (e) => { st.target = e.target.value || null; applyTarget(true); });
  $('cancel').addEventListener('click', () => vscode.postMessage({ type: 'close' }));
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('submit').click(); });
  $('submit').addEventListener('click', () => {
    if (st.done) { vscode.postMessage({ type: 'close' }); return; }
    if (!validate() || st.busy) return;
    const art = (kind) => ({ mode: st.art[kind].mode, path: st.art[kind].path });
    lock(true);
    $('progress').hidden = false;
    $('result').hidden = true;
    $('log').textContent = '';
    vscode.postMessage({ type: 'submit', form: { target: st.target, title: $('title').value.trim(), description: $('desc').value.trim(), icon: art('icon'), banner: art('banner') } });
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'status') $('loadingText').textContent = m.text;
    else if (m.type === 'fatal') { $('loadingText').textContent = m.text; document.querySelector('#loading .spin').hidden = true; }
    else if (m.type === 'init') {
      st.games = m.games; st.target = m.target; st.project = m.project; st.site = m.site;
      $('path').textContent = m.project.path;
      $('warning').textContent = m.warning; $('warning').hidden = !m.warning;
      $('loading').hidden = true; $('form').hidden = false; $('footer').hidden = false;
      renderTarget(); applyTarget(true);
      $('title').focus(); $('title').select();
    } else if (m.type === 'existing' && m.slug === st.target) {
      for (const kind of ['icon', 'banner']) {
        st.art[kind].existing = m[kind];
        if (m[kind] && st.art[kind].mode === 'none') st.art[kind].mode = 'keep';
        renderArt(kind);
      }
    } else if (m.type === 'image') {
      const a = st.art[m.kind];
      if (m.ok) { a.mode = 'new'; a.path = m.path; a.uri = m.uri; renderArt(m.kind); }
      else renderArt(m.kind, m.error);
    } else if (m.type === 'step') $('step').innerHTML = '<span class="spin"></span>' + m.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    else if (m.type === 'log') { const log = $('log'); log.textContent += m.text; log.scrollTop = log.scrollHeight; }
    else if (m.type === 'failed') {
      lock(false);
      $('step').textContent = 'Chưa submit được';
      const r = $('result'); r.hidden = false; r.className = 'result err'; r.textContent = m.text;
    } else if (m.type === 'done') {
      st.busy = false; st.done = true;
      $('step').textContent = m.unchanged ? 'Không có gì thay đổi' : 'Đã submit xong';
      const r = $('result'); r.hidden = false; r.className = 'result ok';
      r.textContent = m.unchanged ? 'Bản này giống hệt bản đang có trên gallery, nên không cần push.'
        : (m.updated ? 'Đã thay bản cũ trên gallery. ' : 'Đã thêm game mới vào gallery. ') + 'Web cập nhật sau khoảng 1–2 phút.';
      if (m.url) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = ' Mở trên gallery ↗';
        b.addEventListener('click', () => vscode.postMessage({ type: 'open', url: m.url }));
        r.append(b);
      }
      $('cancel').hidden = true;
      $('submit').disabled = false; $('submit').textContent = 'Đóng';
      $('footNote').textContent = 'Submit lại bất cứ lúc nào để thay bằng bản mới nhất.';
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
