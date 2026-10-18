# Prototype Gallery

Nơi lưu các prototype game HTML5 của team. Mỗi game là một thẻ trong thư viện, bấm vào là chơi ngay trong khung điện thoại (giống màn Preview của GameKit trong VS Code). Trên điện thoại thì game mở tràn màn hình.

- Chạy trên **GitHub Pages**: không có server, không có database.
- Khoá bằng **một mật khẩu chung**. Lúc build, mọi game, ảnh bìa và cả danh sách game đều được **mã hoá AES-256**, nên site công khai chỉ chứa dữ liệu đã mã hoá. Không có mật khẩu thì không xem được gì.
- Không cần `npm install`: chỉ dùng Node ≥ 20 có sẵn.

## Có gì trong trình chơi

| | |
|---|---|
| **Khung máy** | 20 máy (iPhone SE → 16 Pro Max, Galaxy, Pixel, iPad), có tai thỏ / Dynamic Island / lỗ camera đúng từng máy. Ngoài ra có **Vừa khung** và **Tuỳ chỉnh** (gõ `390x844`). |
| **Xoay** | Nút ⟳ hoặc phím `R`. Game có `"orientation": "landscape"` thì tự mở ngang. |
| **Vùng an toàn** | Tô đỏ vùng tai thỏ / thanh Home để kiểm tra HUD có bị che không. |
| **Level** | Game gọi `gamekit.registerLevels(...)` (template GameKit đã có sẵn) thì hiện dropdown và lưới nút level. Level đang chọn được giữ khi tải lại. |
| **Sự kiện** | Các `gamekit.emit(...)` hiện trực tiếp ở cột bên phải. |
| **Lưu tiến độ** | `localStorage` của game được giữ riêng cho từng game trên từng máy. Có nút **Xoá dữ liệu lưu** để chơi lại từ đầu. |
| **Mở trên điện thoại** | Nút QR: quét bằng camera để chơi trên máy thật. |

## Cài đặt (làm một lần)

1. **Tạo repo trên GitHub** từ thư mục này. Nên để **private**: repo chứa file game chưa mã hoá.
   ```bash
   git init && git add . && git commit -m "Prototype Gallery"
   gh repo create prototype-gallery --private --source . --push
   ```
   > GitHub Pages cho repo private cần gói GitHub **Pro / Team / Enterprise**. Với gói Free thì repo phải public. Khi đó site vẫn khoá, nhưng file game gốc trong repo ai cũng tải được.
2. **Đặt mật khẩu**: repo → *Settings → Secrets and variables → Actions → New repository secret*. Tên: `GALLERY_PASSWORD`, giá trị: mật khẩu chung (ít nhất 8 ký tự, nên dài).
3. **Bật Pages**: *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
4. Vào tab *Actions*, chạy lại workflow **Deploy gallery** (hoặc push một commit bất kỳ). Khoảng 1 phút sau, site có ở `https://<tên-org>.github.io/prototype-gallery/`.

Đổi tên/mô tả gallery trong `gallery.config.json`.

## Gửi game

Game làm bằng GameKit build ra **một file** `dist/index.html`, và gallery cần đúng file đó.

### Cách 1: lệnh `submit` (khuyên dùng)

Từ thư mục repo gallery:

```bash
npm run submit -- ../tangle-3 --push
```

Lệnh này sẽ:
- chạy `npm run build` trong dự án nếu chưa có `dist/index.html` (thêm `--build` để luôn build lại);
- chép file sang `games/tangle-3/index.html`;
- ghi `games/tangle-3/game.json`;
- commit và push (vì có `--push`).

Khoảng 1–2 phút sau, game có trên site.

Thêm thông tin cho thẻ game:

```bash
npm run submit -- ../tangle-3 \
  --title "Tangle 3" --desc "Gỡ rối dây. Đang thử 30 level đầu." \
  --tags puzzle,rope --status playtest --thumb ~/Desktop/tangle-cover.png --push
```

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--title` | Tên hiển thị (mặc định: thẻ `<title>` của game) |
| `--desc` | Mô tả ngắn: game là gì, đang thử điều gì |
| `--author` | Người làm (mặc định: `git config user.name`) |
| `--tags a,b` | Nhãn để lọc |
| `--status` | `wip` (Đang làm) · `playtest` · `done` (Xong) · `archived` (Lưu trữ) |
| `--landscape` | Game chơi ngang |
| `--device iphone-14` | Máy mở mặc định |
| `--thumb file.png` | Ảnh bìa png/jpg/webp ≤ 2 MB, nên dùng tỉ lệ 9:16 |
| `--slug ten-game` | Tên thư mục trong `games/` |
| `--build` | Luôn build lại trước khi gửi |
| `--push` | Commit + push luôn |

Gửi lại cùng một game sẽ **cập nhật** game đó: giữ thông tin cũ, đổi ngày cập nhật. Các bản cũ vẫn nằm trong lịch sử git.

### Cách 2: kéo thả trên github.com

Trên máy, tạo một thư mục tên `ten-game` (chữ thường, không dấu, nối bằng `-`) chứa `index.html`. Có thể thêm `game.json` và `thumb.png`. Trên github.com, mở thư mục `games/`, chọn *Add file → Upload files*, kéo **cả thư mục** vào rồi *Commit changes*. Không có `game.json` thì tên game lấy từ thẻ `<title>`.

### `game.json`

```json
{
  "title": "Tangle 3",
  "description": "Gỡ rối dây. Đang thử 30 level đầu.",
  "author": "Minh Anh",
  "tags": ["puzzle", "rope"],
  "status": "playtest",
  "orientation": "portrait",
  "device": "iphone-14",
  "created": "2026-10-18",
  "updated": "2026-10-18"
}
```

Mọi trường đều không bắt buộc. Trường sai kiểu sẽ bị bỏ qua và báo trong log build, không làm hỏng site.

### Xoá game

Xoá thư mục `games/<tên>/` rồi push. Thư mục bắt đầu bằng `_` (ví dụ `games/_nhap/`) sẽ không được đăng, tiện để nháp.

## Chạy thử trên máy

```bash
npm run dev                                        # build không khoá + mở http://localhost:5180
GALLERY_PASSWORD=matkhau npm run build && npm run serve   # thử bản có khoá
npm test
```

## Đổi mật khẩu

Sửa secret `GALLERY_PASSWORD`, rồi chạy lại workflow *Deploy gallery*. Máy nào đã "ghi nhớ" mật khẩu cũ sẽ được hỏi mật khẩu mới.

## Bảo mật: được gì và không được gì

- ✅ File game, ảnh bìa, tên và mô tả game trên site đều được mã hoá (AES-256-GCM, khoá sinh từ mật khẩu bằng PBKDF2-SHA256 310.000 vòng).
- ✅ Game chạy trong iframe `sandbox` có origin riêng, không đọc được mật khẩu đã lưu hay dữ liệu của game khác.
- ⚠ Ai có mật khẩu đều tải được game. Đổi mật khẩu khi có người rời team.
- ⚠ Tên và mô tả của chính gallery (`gallery.config.json`), số lượng file và dung lượng từng file thì không được mã hoá.
- ⚠ Mật khẩu chung nên đủ dài: site tĩnh không chặn được việc đoán mật khẩu nhiều lần.

## Giới hạn

- Chỉ chạy game **một file HTML**: ảnh và âm thanh phải nhúng sẵn trong file. Template GameKit đã làm việc này (vite-plugin-singlefile). Với game khác, bật plugin đó hoặc nhúng asset dạng data URI.
- Mỗi game tối đa 40 MB (sửa `maxGameSizeMB` trong `gallery.config.json`). GitHub chặn file trên 100 MB.
- Game chạy với origin "null", nên `fetch` tới file bên cạnh, `indexedDB` và cookie sẽ không hoạt động. `localStorage` và `sessionStorage` đã được giả lập.

## Cấu trúc

```
gallery.config.json        tên gallery, máy mặc định, giới hạn dung lượng
games/<slug>/              index.html (+ game.json, thumb.png)
scripts/submit.mjs         gửi game từ dự án
scripts/build.mjs          games/ + web/ → site/ (mã hoá)
scripts/serve.mjs          server tĩnh để thử trên máy
web/                       giao diện: app.js, app.css, devices.js, shared.js (mã hoá, shim localStorage)
.github/workflows/pages.yml  test → build → deploy GitHub Pages
test/                      unit test (node --test)
```
