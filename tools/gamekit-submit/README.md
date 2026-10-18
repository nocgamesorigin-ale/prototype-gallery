# GameKit — Submit game

Thêm nút **Submit game** (biểu tượng đám mây ↑) vào từng dòng project trong khung **GameKit → Projects** của VS Code.

Bấm nút sẽ mở một popup:

| Ô | Bắt buộc | Ghi chú |
|---|---|---|
| Đưa lên như | — | *Game mới*, hoặc *Thay thế* một game đã có. Project đã submit lần trước sẽ tự chọn đúng game của nó. |
| Tên game | **Có** | Không được trùng tên game khác trên gallery. "Tangle 3", "tangle-3" và "TANGLE 3" bị coi là trùng nhau. |
| Mô tả | Không | Tối đa 600 ký tự. |
| Icon | Không | PNG/JPG/WebP, đúng **512×512**, ≤ 2 MB. |
| Banner | Không | PNG/JPG/WebP, đúng **1024×512**, ≤ 2 MB. |

Khi bấm **Submit**, extension sẽ:
1. `git pull` repo gallery để lấy danh sách tên mới nhất;
2. kiểm tra lại tên;
3. chạy `scripts/submit.mjs --build --push`, tức là build game, chép vào `games/<slug>/`, commit rồi push.

Submit lại cùng một project sẽ **thay bản trên gallery bằng bản mới nhất**. Các bản cũ vẫn còn trong lịch sử git.

## Cài đặt

```bash
cd ~/Downloads/prototype-gallery
node tools/gamekit-submit/pack.mjs
code --install-extension tools/gamekit-submit/gamekit-gallery-submit-0.1.0.vsix
```

Sau đó chạy *Developer: Reload Window*.

Repo gallery mặc định nằm ở `~/Downloads/prototype-gallery`. Nếu bạn để repo ở chỗ khác, đổi trong *Settings → GameKit — Submit game → Repo Path*. Lần đầu không tìm thấy repo, extension sẽ hỏi.

Máy cần có `git` đã đăng nhập vào GitHub với quyền push lên repo gallery.
