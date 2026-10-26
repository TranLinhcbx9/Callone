/**
 * Cập nhật mục "Danh mục ảnh chụp" cuối docs/design/ui-spec.md từ các file trong docs/design/screenshots.
 * capture.mjs tự gọi sau khi chụp đủ bộ; cũng chạy riêng được: node scripts/design/gallery.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const dir = `${ROOT}docs/design/screenshots`
const titles = {
  '01-home': 'Trang chủ', '02-bill-split-home': 'Chia tiền: nhóm của bạn', '03-bill-split-home-empty': 'Chia tiền: chưa có nhóm',
  '04-create-group': 'Tạo nhóm', '05-who-am-i': 'Bạn là ai trong nhóm?', '06-group-expenses': 'Nhóm: Chi tiêu',
  '07-group-balances': 'Nhóm: Số dư', '08-group-members': 'Nhóm: Thành viên', '09-expense-form-equal': 'Khoản chi: chia đều',
  '10-expense-form-exact': 'Khoản chi: số tiền riêng', '11-expense-form-errors': 'Khoản chi: lỗi nhập', '12-vietqr': 'Mã VietQR',
  '13-member-form': 'Sửa thành viên', '14-bank-picker': 'Chọn ngân hàng', '15-share-link': 'Chia sẻ link nhóm',
  '16-delete-group': 'Xóa nhóm', '17-group-not-found': 'Không tìm thấy nhóm', '18-group-loading': 'Đang tải nhóm',
  '19-fonts': 'So sánh 3 font', '20-ui-kit': 'UI kit',
}
export function updateGallery() {
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
const groups = new Map()
for (const f of files) {
  const m = /^(\d\d-.+?)-(mobile|desktop)-(light|dark)\.png$/.exec(f)
  if (!m) continue
  const [, key, size, scheme] = m
  if (!groups.has(key)) groups.set(key, {})
  groups.get(key)[`${size}-${scheme}`] = f
}
const cell = (f, w) => (f ? `<img src="screenshots/${f}" width="${w}" alt="${f}">` : '')
let out = '\n## 13. Danh mục ảnh chụp\n\nẢnh nằm trong `docs/design/screenshots/` (điện thoại 390×844 ở độ phân giải gấp đôi, máy tính 1280×800). Ảnh dài là cả trang cuộn, thanh cố định ở chân nằm cuối ảnh.\n\n'
out += '| Màn hình | Điện thoại, sáng | Điện thoại, tối | Máy tính |\n|---|---|---|---|\n'
for (const [key, v] of groups) {
  const desktop = v['desktop-light'] ? cell(v['desktop-light'], 260) : ''
  out += `| ${titles[key] ?? key}<br><sub>${key}</sub> | ${cell(v['mobile-light'], 170)} | ${cell(v['mobile-dark'], 170)} | ${desktop} |\n`
}
const file = `${ROOT}docs/design/ui-spec.md`
let text = readFileSync(file, 'utf8')
const marker = '\n## 13. Danh mục ảnh chụp'
if (text.includes(marker)) text = text.slice(0, text.indexOf(marker))
writeFileSync(file, text.replace(/\n+$/, '\n') + out)
console.log(`Đã cập nhật danh mục ảnh trong ui-spec.md: ${groups.size} màn hình, ${files.length} file`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) updateGallery()
