// Default page content. gallery.config.json overrides any key; admins edit it from the site.

export const DEFAULT_CONTENT = {
  title: 'NOC Game',
  subtitle: 'Prototype Gallery — bấm là chơi',
  team: {
    eyebrow: 'Team prototype · nội bộ',
    name: '',
    intro: 'Nơi team đưa các bản thử game HTML5 lên để cả nhà bấm vào chơi ngay, góp ý và chọn ra ý tưởng đáng làm tiếp.',
    stats: [],
  },
  downloads: {
    eyebrow: 'Tài nguyên',
    title: 'Tải về & hướng dẫn GameKit',
    intro: 'Mọi thứ cần để bắt đầu: bộ cài GameKit, cách cài đặt, cách build & submit game, và các lỗi thường gặp.',
    updated: '2026-10-16',
    labels: ['Tải về', 'Cài đặt', 'Hướng dẫn GameKit', 'Dùng trên điện thoại', 'Q&A khắc phục lỗi'],
    items: [
      { os: 'windows', label: 'Windows', version: '3.1.1', ext: 'exe', size: '163 MB', file: 'GameKit-3.1.1-win32-x64-setup.exe', url: '' },
      { os: 'macos', label: 'macOS', version: '3.1.2', ext: 'zip', size: '324 MB', file: 'GameKit-3.1.2-darwin-arm64.zip', url: '' },
      { os: 'linux', label: 'Linux', version: '3.1.1', ext: 'deb', size: '150 MB', file: 'GameKit-3.1.1-linux-amd64.deb', url: '' },
    ],
  },
  install: {
    windows: [
      { text: 'Chạy file **.exe** vừa tải.', code: '' },
      { text: 'Nếu Windows SmartScreen cảnh báo, bấm **More info → Run anyway**.', code: '' },
      { text: 'Làm theo trình cài đặt, giữ đường dẫn mặc định.', code: '' },
      { text: 'Mở **GameKit** từ Start menu.', code: '' },
    ],
    macos: [
      { text: 'Giải nén file **.zip** vừa tải (bấm đúp vào file).', code: '' },
      { text: 'Kéo **GameKit.app** vào thư mục **Applications**.', code: '' },
      { text: 'Mở **Terminal** và chạy lệnh sau để macOS không chặn ứng dụng tải từ Internet:', code: 'xattr -dr com.apple.quarantine "/Applications/GameKit.app"' },
      { text: 'Mở **GameKit** từ Applications (hoặc Launchpad).', code: '' },
    ],
    linux: [
      { text: 'Mở terminal ở thư mục chứa file **.deb** vừa tải và cài:', code: 'sudo apt install ./GameKit-3.1.1-linux-amd64.deb' },
      { text: 'Mở **GameKit** từ menu ứng dụng, hoặc gõ `gamekit` trong terminal.', code: '' },
    ],
  },
  guide: [
    { text: 'Mở project game trong GameKit, vào khung **GameKit → Projects**.', code: '' },
    { text: 'Bấm biểu tượng đám mây ↑ cạnh project để mở popup **Submit game**.', code: '' },
    { text: 'Điền **tên game** (bắt buộc, không trùng game khác), mô tả, icon **512×512** và banner **1024×512**.', code: '' },
    { text: 'Bấm **Submit**: game được build, đưa vào gallery và push lên. Khoảng 1–2 phút sau game có trên Game Hub.', code: '' },
    { text: 'Hoặc dùng lệnh từ thư mục repo gallery:', code: 'npm run submit -- ../ten-game --push' },
  ],
  mobile: [
    { text: 'Mở game trên máy tính, bấm nút **QR** ở thanh công cụ phía trên.', code: '' },
    { text: 'Quét mã bằng camera điện thoại.', code: '' },
    { text: 'Lần đầu mở, nhập **tên / biệt danh** và **mật khẩu team**.', code: '' },
    { text: 'Trên điện thoại game mở tràn màn hình; game chơi ngang sẽ nhắc bạn xoay máy.', code: '' },
  ],
  faq: [
    { q: 'Game không hiện ảnh hoặc âm thanh?', a: 'Gallery chỉ chạy game **một file HTML**: ảnh và âm thanh phải nhúng sẵn trong file. Template GameKit đã làm việc này (vite-plugin-singlefile).' },
    { q: 'Game báo lỗi fetch, indexedDB hoặc cookie?', a: 'Game chạy với origin "null" nên `fetch` tới file bên cạnh, indexedDB và cookie không hoạt động. localStorage và sessionStorage đã được giả lập.' },
    { q: 'Submit báo trùng tên?', a: '"Tangle 3", "tangle-3" và "TANGLE 3" bị coi là trùng nhau. Đổi tên khác, hoặc submit lại đúng project cũ để cập nhật.' },
    { q: 'Game quá nặng, không lên được?', a: 'Mỗi game tối đa **40 MB**. GitHub chặn file trên 100 MB.' },
    { q: 'Bị hỏi lại mật khẩu?', a: 'Admin vừa đổi mật khẩu team. Hỏi trưởng team mật khẩu mới.' },
    { q: 'Muốn chơi lại từ đầu?', a: 'Trong màn chơi, mở ⓘ **Thông tin game** → **Xoá dữ liệu lưu**.' },
  ],
  admin: { repo: '', branch: 'main' },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge: objects merge key by key, arrays and scalars from `over` replace. */
export function mergeContent(base, over) {
  if (!isObj(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue;
    out[k] = isObj(v) && isObj(out[k]) ? mergeContent(out[k], v) : structuredClone(v);
  }
  return out;
}
