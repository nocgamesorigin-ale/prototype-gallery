// "Tải về GameKit" page: installers per OS, install steps, GameKit guide, phone use, Q&A.
import { h, icon, btn, md, copyText, toast } from './ui.js';
import { C, ed, field, getPath, isEditing, markDirty, admin, setPath } from './admin.js';

const OS = [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']];
const SECTION_IDS = ['dl-download', 'dl-install', 'dl-guide', 'dl-mobile', 'dl-qa'];

export function detectOS() {
  const ua = navigator.userAgent || '';
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ua;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return '';
  if (/Mac/i.test(p)) return 'macos';
  if (/Win/i.test(p)) return 'windows';
  if (/Linux|X11/i.test(p)) return 'linux';
  return '';
}
const shortDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const today = () => new Date().toISOString().slice(0, 10);
const num = (n) => h('span', { class: 'sec-num', text: String(n).padStart(2, '0') });

let installTab = '';

export function showDownloads({ app, header, setView }) {
  const editing = isEditing();
  const c = C();
  const rec = detectOS();
  if (!installTab) installTab = rec || 'windows';
  const rerender = () => { const y = window.scrollY; showDownloads({ app, header, setView }); window.scrollTo(0, y); };

  // ---- 01 downloads
  const items = (c.downloads && c.downloads.items) || [];
  const updated = editing
    ? h('label', { class: 'afield inline' }, [h('span', { text: 'cập nhật' }), (() => {
      const i = h('input', { class: 'input', type: 'date', value: c.downloads.updated || '' });
      i.addEventListener('input', () => { setPath(admin.draft, 'downloads.updated', i.value); markDirty(); });
      return i;
    })()])
    : (c.downloads.updated ? h('span', { class: 'sec-meta', text: `cập nhật ${shortDate(c.downloads.updated)}` }) : null);

  const card = (item, i) => {
    const base = `downloads.items.${i}`;
    const isRec = item.os === rec;
    const head = h('div', { class: 'dl-card-head' }, [ed('h3', `${base}.label`, { placeholder: 'Hệ điều hành' }), isRec ? h('span', { class: 'badge', text: 'Gợi ý cho bạn' }) : null]);
    if (editing) {
      const bump = () => { setPath(admin.draft, 'downloads.updated', today()); };
      return h('article', { class: 'dl-card' + (isRec ? ' rec' : '') }, [
        head,
        h('div', { class: 'dl-fields' }, [
          field('Phiên bản', `${base}.version`, { placeholder: '3.1.2' }, bump),
          field('Định dạng', `${base}.ext`, { placeholder: 'zip' }),
          field('Dung lượng', `${base}.size`, { placeholder: '324 MB' }),
        ]),
        field('Tên file', `${base}.file`, { placeholder: 'GameKit-3.1.2-darwin-arm64.zip', class: 'input mono' }),
        field('Link tải', `${base}.url`, { placeholder: 'Dán link GitHub Release / Google Drive…', type: 'url' }),
        btn('Xoá bản này', 'trash', { class: 'btn sm ghost', onclick: () => { items.splice(i, 1); markDirty(); rerender(); } }),
      ]);
    }
    const meta = [item.version ? `Phiên bản ${item.version}` : '', item.ext, item.size].filter(Boolean).join(' · ');
    return h('article', { class: 'dl-card' + (isRec ? ' rec' : '') }, [
      head,
      meta ? h('p', { class: 'dl-meta', text: meta }) : null,
      item.file ? h('code', { class: 'dl-file', text: item.file }) : null,
      item.url
        ? h('a', { class: 'btn lg block ' + (isRec ? 'primary' : 'dark'), href: item.url, target: '_blank', rel: 'noopener', download: item.file || '', html: `${icon('download')}<span>Tải xuống</span>` })
        : h('button', { class: 'btn lg block', type: 'button', disabled: true, text: 'Chưa có link tải' }),
    ]);
  };
  const sec1 = section(1, 'dl-download', updated, [
    h('div', { class: 'dl-grid' }, [
      ...items.map(card),
      editing ? h('button', { class: 'dl-add', type: 'button', html: `${icon('plus')}<span>Thêm bản tải</span>`, onclick: () => { items.push({ os: '', label: 'Hệ điều hành', version: '', ext: '', size: '', file: '', url: '' }); markDirty(); rerender(); } }) : null,
    ]),
  ]);

  // ---- 02 install (per OS)
  const tabs = h('div', { class: 'seg', role: 'tablist' }, OS.map(([id, label]) => h('button', {
    class: 'seg-item', type: 'button', role: 'tab', 'aria-checked': installTab === id ? 'true' : 'false', text: label,
    onclick: () => { installTab = id; rerender(); },
  })));
  const sec2 = section(2, 'dl-install', null, [tabs, steps(`install.${installTab}`, rerender)]);

  // ---- 03 guide, 04 mobile
  const sec3 = section(3, 'dl-guide', null, [steps('guide', rerender)]);
  const sec4 = section(4, 'dl-mobile', null, [steps('mobile', rerender)]);

  // ---- 05 Q&A
  const faq = c.faq || [];
  const sec5 = section(5, 'dl-qa', null, [
    h('div', { class: 'faq' }, faq.map((f, i) => editing
      ? h('div', { class: 'faq-item open' }, [
        h('div', { class: 'faq-q' }, [ed('strong', `faq.${i}.q`, { placeholder: 'Câu hỏi' }), btn('', 'x', { class: 'btn icon ghost sm', title: 'Xoá câu hỏi', onclick: () => { faq.splice(i, 1); markDirty(); rerender(); } })]),
        ed('div', `faq.${i}.a`, { class: 'faq-a', multiline: true, placeholder: 'Câu trả lời — dùng **đậm** và `lệnh`' }),
      ])
      : h('details', { class: 'faq-item' }, [
        h('summary', { class: 'faq-q' }, [h('strong', { text: f.q }), h('span', { html: icon('chevron') })]),
        h('div', { class: 'faq-a', html: md(f.a) }),
      ]))),
    editing ? btn('Thêm câu hỏi', 'plus', { class: 'btn sm', onclick: () => { faq.push({ q: '', a: '' }); markDirty(); rerender(); } }) : null,
  ]);

  // ---- page
  const labels = (c.downloads && c.downloads.labels) || [];
  const nav = h('nav', { class: 'dl-nav', 'aria-label': 'Mục lục' }, SECTION_IDS.map((id, i) => h('a', {
    href: `#/download`, 'data-target': id, class: 'dl-nav-item',
    onclick: (e) => { e.preventDefault(); const s = document.getElementById(id); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - navOffset(), behavior: 'smooth' }); },
  }, [h('span', { class: 'n', text: String(i + 1).padStart(2, '0') }), h('span', { text: labels[i] || '' })])));

  app.replaceChildren(header('download'), h('main', { class: 'wrap dl' }, [
    h('div', { class: 'dl-hero' }, [
      ed('span', 'downloads.eyebrow', { class: 'eyebrow', placeholder: 'Dòng nhỏ phía trên' }),
      ed('h2', 'downloads.title', { class: 'dl-title', placeholder: 'Tiêu đề trang' }),
      ed('p', 'downloads.intro', { class: 'dl-intro', multiline: true, placeholder: 'Mô tả ngắn' }),
    ]),
    nav, sec1, sec2, sec3, sec4, sec5,
  ]));

  const top = document.querySelector('.top');
  if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
  // active stepper item follows scroll
  const onScroll = () => {
    const y = navOffset() + 24;
    let active = SECTION_IDS[0];
    for (const id of SECTION_IDS) { const s = document.getElementById(id); if (s && s.getBoundingClientRect().top <= y) active = id; }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = SECTION_IDS[SECTION_IDS.length - 1];
    nav.querySelectorAll('.dl-nav-item').forEach((a) => a.setAttribute('aria-current', a.dataset.target === active ? 'true' : 'false'));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  setView({ name: 'download', scrollKey: 'download', destroy() { window.removeEventListener('scroll', onScroll); } });
}

function navOffset() {
  const top = document.querySelector('.top');
  const nav = document.querySelector('.dl-nav');
  return (top ? top.offsetHeight : 0) + (nav ? nav.offsetHeight + 16 : 0);
}

function section(n, id, meta, body) {
  return h('section', { class: 'dl-sec', id }, [
    h('div', { class: 'dl-sec-head' }, [num(n), ed('h3', `downloads.labels.${n - 1}`, { placeholder: 'Tên mục' }), meta]),
    ...body,
  ]);
}

function codeBlock(path, value) {
  if (isEditing()) return ed('pre', path, { class: 'code', multiline: true, placeholder: 'Lệnh (để trống nếu không cần)' });
  if (!value) return null;
  return h('div', { class: 'code' }, [
    h('pre', { text: value }),
    h('button', { class: 'code-copy', type: 'button', title: 'Sao chép lệnh', 'aria-label': 'Sao chép lệnh', html: icon('copy'), onclick: async () => toast((await copyText(value)) ? 'Đã sao chép lệnh.' : 'Không sao chép được.') }),
  ]);
}

function steps(path, rerender) {
  const editing = isEditing();
  let list = getPath(C(), path);
  if (!Array.isArray(list)) { list = []; if (editing) setPath(admin.draft, path, list); }
  const ol = h('ol', { class: 'steps' }, list.map((s, i) => h('li', {}, [
    h('span', { class: 'step-n', text: String(i + 1) }),
    h('div', { class: 'step-body' }, [
      ed('p', `${path}.${i}.text`, { md: true, multiline: true, placeholder: 'Nội dung bước — dùng **đậm** và `lệnh`' }),
      codeBlock(`${path}.${i}.code`, s.code),
    ]),
    editing ? btn('', 'x', { class: 'btn icon ghost sm', title: 'Xoá bước', onclick: () => { list.splice(i, 1); markDirty(); rerender(); } }) : null,
  ])));
  if (!list.length && !editing) return h('p', { class: 'sec-meta', text: 'Chưa có hướng dẫn cho mục này.' });
  return editing ? h('div', { class: 'steps-wrap' }, [ol, btn('Thêm bước', 'plus', { class: 'btn sm', onclick: () => { list.push({ text: '', code: '' }); markDirty(); rerender(); } })]) : ol;
}
