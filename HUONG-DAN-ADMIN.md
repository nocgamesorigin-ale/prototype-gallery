# Hướng dẫn admin — NOC Game Prototype Gallery

Bản này thay giao diện cũ trong `web/` và `scripts/build.mjs`. Mọi thứ khác (games/, submit, extension GameKit, mã hoá) giữ nguyên.

## 1. Chép file vào repo
Ghi đè đúng các đường dẫn sau trong repo `prototype-gallery`:

```
web/app.js            (thay mới)
web/app.css           (thay mới)
web/index.html        (thay mới)
scripts/build.mjs     (thay mới — thêm logo, ảnh team, nội dung trang Giới thiệu)
gallery.config.json   (thay mới — nhớ GIỮ NGUYÊN giá trị "id" cũ của bạn)
brand/                (thư mục mới)
```
**Không** đụng tới `web/shared.js`, `web/devices.js`, `web/icon.svg`, `scripts/lib/`, `test/`.

> ⚠ `"id"` trong gallery.config.json quyết định khoá mã hoá. Đổi id = mọi người phải nhập lại mật khẩu.

## 2. Logo team & ảnh team
- `brand/logo.png` — logo vuông (hiện ở màn đăng nhập + header).
- `brand/team.jpg` — ảnh team 4:3 (trang Giới thiệu, được mã hoá).
Push lên là xong.

## 3. Mật khẩu team
Site chạy tĩnh trên GitHub Pages nên mật khẩu **không** nằm trong code — nó là khoá mã hoá lúc build.
1. Repo → **Settings → Secrets and variables → Actions**.
2. Sửa (hoặc tạo) secret **`GALLERY_PASSWORD`** — ít nhất 8 ký tự.
3. Tab **Actions → Deploy gallery → Run workflow**.
Máy nào đã ghi nhớ mật khẩu cũ sẽ được hỏi lại mật khẩu mới. Đổi mật khẩu khi có người rời team.

## 4. Nội dung trang Giới thiệu — `gallery.config.json`
```json
"title": "NOC Game",                         // tên hiện ở header + màn đăng nhập
"subtitle": "Prototype Gallery — bấm là chơi",
"team": {
  "eyebrow": "Team prototype · nội bộ",      // dòng nhỏ màu cam phía trên tên
  "name": "NOC Game",                        // tên lớn ở trang Giới thiệu
  "intro": "Giới thiệu ngắn về team…",       // xuống dòng bằng \n
  "stats": [{ "value": "12", "label": "thành viên" }]   // tối đa 4, bỏ trống thì ẩn
},
"featured": ["tangle-3", "lantern-glow"]     // slug game hiện ô lớn 2×2, xếp đầu Game Hub
```
Team intro/stats nằm trong danh sách game đã mã hoá; chỉ title/subtitle là công khai.

## 5. Đăng nhập
Nhân viên nhập **tên / biệt danh** + **mật khẩu team**. Biệt danh chỉ lưu trên máy (hiện ở header), không gửi đi đâu. Wishlist cũng lưu trên máy.

## 6. Icon game
Mosaic Game Hub dùng **icon 512×512** của game (`--icon` khi submit, hoặc `icon.png` trong thư mục game). Không có icon thì lấy ảnh bìa, rồi tới banner, cuối cùng là chữ cái đầu trên nền màu.

## 7. Thử trên máy
```bash
npm run dev                                              # không khoá
GALLERY_PASSWORD=matkhau123 npm run build && npm run serve   # có khoá
```
