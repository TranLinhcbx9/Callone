# Callone: đặc tả giao diện

Tài liệu này mô tả toàn bộ giao diện của app và module Chia tiền để m duyệt trước khi frontend dựng trang thật.

- Ảnh chụp mockup (điện thoại 390×844, sáng và tối, vài ảnh máy tính 1280×800): `docs/design/screenshots/`.
- Mockup chạy được: `npm run dev`, mở `/dev/mockups`. UI kit ở `/dev/ui`, so sánh font ở `/dev/fonts`.
- Chụp lại ảnh: bật dev server cổng 5180 rồi `npm run design:shots`.
- Kiểm tra độ tương phản của palette: `node scripts/design/contrast.mjs`.

## 1. Hướng thiết kế

Callone trông như một cuốn sổ tay giấy ấm: nền kem nhạt, thẻ trắng viền mảnh gần như không bóng, một màu nhấn chàm (xanh chàm, màu nhuộm quen thuộc của người Việt) dùng tiết chế cho nút chính, tab đang chọn và vòng focus. Chữ nhỏ vừa phải (thân bài 15px), font Plus Jakarta Sans tự host, số tiền canh thẳng cột. Số dư dùng xanh lá dịu cho "được nhận lại" và nâu đỏ dịu cho "còn nợ", không bao giờ là đỏ xanh chói. Thiết kế đi từ điện thoại: nút chính nằm trong tầm ngón cái, form khoản chi chiếm cả màn hình, trên máy tính là một cột giữa thoải mái kèm thanh bên mảnh.

Nguyên tắc:

1. **Thanh lịch, nhẹ nhàng.** Viền mảnh làm phần lớn việc tách lớp, bóng chỉ đủ nhận ra. Khoảng trắng rộng, không chồng nhiều thẻ lồng nhau.
2. **Một màu nhấn.** Mỗi màn hình chỉ một nút màu nhấn. Các nút còn lại là outline, secondary, ghost hoặc soft.
3. **Chữ nhỏ, thứ bậc nhẹ.** Chỉ dùng độ đậm 400, 500, 600. Không viết hoa toàn bộ nhãn vì dấu tiếng Việt xếp tầng khó đọc.
4. **Ngón cái trước.** Nút chính ở chân màn hình (nút nổi hoặc thanh Lưu), đích bấm tối thiểu 40px, nút chính 48px.
5. **Tiền luôn rõ.** Mọi số tiền qua `formatVnd` ("1.250.000 ₫"), số liền hàng (`tnum`), số âm dùng dấu trừ thật (−).
6. **Tiếng Việt tự nhiên, ngắn.** Câu như người nói: "Còn thiếu 50.000 ₫", "Bạn là ai trong nhóm?". Không viết tắt lạ, không emoji.
7. **Sáng và tối theo hệ thống.** Không có nút chuyển tay. Mọi màu có cặp sáng tối đã kiểm độ tương phản.
8. **Hai trạng thái luôn có.** Mỗi danh sách có trạng thái trống, mỗi trang tải dữ liệu có khung xương và trạng thái lỗi.

## 2. Màu

Màu định nghĩa bằng `oklch` trong `src/styles/globals.css`. Chế độ tối nằm trong `@media (prefers-color-scheme: dark)`, và `@custom-variant dark` của Tailwind cũng bám theo hệ điều hành, nên các lớp `dark:` và biến màu cùng đổi một lúc. Nền sáng nghiêng ấm (hue 85), nền tối là nâu đen ấm chứ không phải đen thuần.

### 2.1 Bảng token

| Token | Vai trò | Sáng | Tối |
|---|---|---|---|
| `background` | Nền trang | `oklch(0.975 0.004 85)` | `oklch(0.18 0.006 75)` |
| `foreground` | Chữ chính | `oklch(0.24 0.01 75)` | `oklch(0.94 0.006 85)` |
| `card` | Nền thẻ, ô nhập | `oklch(0.995 0.002 85)` | `oklch(0.22 0.007 75)` |
| `popover` | Nền menu, hộp thoại, ngăn kéo | `oklch(0.998 0.001 85)` | `oklch(0.255 0.008 75)` |
| `muted` | Nền nhạt: dải phân đoạn, khung xương | `oklch(0.953 0.005 85)` | `oklch(0.265 0.008 75)` |
| `muted-foreground` | Chữ phụ, nhãn, placeholder | `oklch(0.5 0.012 75)` | `oklch(0.72 0.01 80)` |
| `accent` | Nền khi rê chuột hoặc nhấn vào một dòng | `oklch(0.945 0.006 85)` | `oklch(0.3 0.008 75)` |
| `border` | Viền mảnh của thẻ, đường kẻ | `oklch(0.912 0.006 82)` | `oklch(0.95 0.01 85 / 0.1)` |
| `input` | Viền ô nhập | `oklch(0.885 0.007 82)` | `oklch(0.95 0.01 85 / 0.15)` |
| `primary` | Màu nhấn: nút chính, tab đang chọn, liên kết | `oklch(0.47 0.12 268)` | `oklch(0.76 0.1 268)` |
| `primary-foreground` | Chữ trên nút chính | `oklch(0.985 0.005 268)` | `oklch(0.2 0.04 268)` |
| `primary-soft` | Nền nhấn nhạt: chip đang chọn, nhãn "Bạn", dòng của mình | `oklch(0.951 0.026 268)` | `oklch(0.3 0.05 268)` |
| `primary-soft-foreground` | Chữ trên nền nhấn nhạt | `oklch(0.4 0.12 268)` | `oklch(0.87 0.07 268)` |
| `ring` | Vòng focus | `oklch(0.6 0.11 268)` | `oklch(0.7 0.1 268)` |
| `positive` | Chữ "được nhận lại", đã chia đủ | `oklch(0.49 0.1 158)` | `oklch(0.76 0.1 158)` |
| `positive-soft` | Nền thông báo tích cực | `oklch(0.955 0.03 158)` | `oklch(0.3 0.045 158)` |
| `negative` | Chữ "còn nợ" | `oklch(0.52 0.125 32)` | `oklch(0.76 0.095 30)` |
| `negative-soft` | Nền thông báo nợ | `oklch(0.962 0.026 35)` | `oklch(0.3 0.045 30)` |
| `warning` | Chữ "còn thiếu", "chia lố" | `oklch(0.5 0.1 68)` | `oklch(0.8 0.11 85)` |
| `warning-soft` | Nền thông báo cần chú ý | `oklch(0.962 0.045 88)` | `oklch(0.3 0.05 85)` |
| `destructive` | Hành động xóa, lỗi nhập liệu | `oklch(0.55 0.19 27)` | `oklch(0.72 0.16 25)` |
| `destructive-foreground` | Chữ trên nút xóa đặc | `oklch(0.985 0.005 27)` | `oklch(0.2 0.03 25)` |

Các lớp Tailwind tương ứng: `bg-background`, `text-muted-foreground`, `bg-primary-soft`, `text-positive`, `bg-negative-soft`... Ngoài ra còn `chart-1..5` và `sidebar*` (cho thanh bên desktop) lấy cùng bảng màu.

### 2.2 Quy tắc dùng màu

- Màu nhấn chỉ dùng cho: nút chính, tab đang chọn (gạch chân), chip đang chọn, vòng focus, liên kết, logo. Không tô nền cả khối bằng màu nhấn.
- Số dư: dương dùng `text-positive` kèm dấu `+`, âm dùng `text-negative` kèm dấu `−`, bằng 0 dùng chữ phụ và câu "Đã cân bằng". Nhãn nhỏ đi kèm ("được nhận lại", "còn nợ") để người đọc không phải nhớ quy ước màu.
- "Còn thiếu" và "chia lố" khi chia riêng dùng `warning` (hổ phách dịu), khác với lỗi. Chia đủ thì chuyển sang `positive`.
- `destructive` chỉ cho hành động xóa và lỗi nhập liệu. Nút xóa mặc định là dạng nền nhạt (`variant="destructive"`); nút xác nhận cuối cùng (gõ tên nhóm để xóa) dùng dạng đặc (`variant="danger"`).
- Mã QR luôn nền trắng chữ đen dù đang ở chế độ tối, để app ngân hàng quét được.

### 2.3 Avatar thành viên

Màu pastel sinh từ id: băm FNV-1a chọn một trong 8 góc màu (18, 62, 112, 168, 215, 262, 305, 350). Cùng một id luôn cùng một màu trên mọi máy. Chữ cái lấy từ **từ cuối** của tên theo cách gọi người Việt: "Nguyễn Văn Linh" thành "L", "Đức" thành "Đ". Xem `src/shared/ui/avatarUtils.ts`.

### 2.4 Độ tương phản

Kiểm bằng `node scripts/design/contrast.mjs` (công thức WCAG, có tính cả độ trong suốt). Kết quả hiện tại:

| Cặp | Sáng | Tối | Yêu cầu |
|---|---|---|---|
| Chữ chính trên nền | 15,3:1 | 15,8:1 | 12 |
| Chữ phụ trên nền / thẻ | 5,6 / 5,9 | 7,6 / 7,0 | 4,5 |
| Chữ trên nút chính | 6,7 | 8,4 | 4,5 |
| Màu nhấn làm chữ trên nền | 6,5 | 8,7 | 4,5 |
| Được nhận lại trên nền / nền nhạt | 5,5 / 5,3 | 9,1 / 6,5 | 4,5 |
| Còn nợ trên nền / nền nhạt | 5,4 / 5,2 | 8,4 / 6,2 | 4,5 |
| Còn thiếu trên nền / nền nhạt | 5,7 / 5,5 | 10,0 / 7,3 | 4,5 |
| Vòng focus trên nền | 3,7 | 7,0 | 3 |

Viền thẻ chỉ cao hơn nền khoảng 1,2:1 (cố ý, "viền mảnh"); thông tin không bao giờ chỉ dựa vào viền: mọi chữ và icon đều đạt bảng trên.

## 3. Chữ

### 3.1 Font: 3 ứng viên, đề xuất Plus Jakarta Sans

Cả ba đều tự host qua `@fontsource` (không gọi Google Fonts, chạy offline được cho PWA), chỉ nạp hai bộ ký tự `latin` và `vietnamese` nên build chỉ có 2 đến 6 file woff2. Mỗi font đã được kiểm bằng cách vẽ thử cả 134 chữ cái tiếng Việt dựng sẵn (hoa và thường) trong trình duyệt: cả ba đủ 134/134. Xem trực tiếp ở `/dev/fonts` (ảnh `19-fonts-desktop-light.png`).

| | Plus Jakarta Sans (đề xuất) | Be Vietnam Pro | Inter |
|---|---|---|---|
| Gói | `@fontsource-variable/plus-jakarta-sans` | `@fontsource/be-vietnam-pro` | `@fontsource-variable/inter` |
| Kiểu | Biến thiên 200 đến 800 | Tĩnh, nạp 400, 500, 600 | Biến thiên 100 đến 900 |
| Dung lượng nạp | khoảng 36 KB | khoảng 100 KB | khoảng 58 KB |
| Có vietnamese | có, đủ 134/134 chữ | có, đủ 134/134 chữ | có, đủ 134/134 chữ |
| Số liền hàng (`tnum`) | có | **không** (số luôn đổi bề rộng) | có |
| Cảm giác | Hình học mềm, thanh lịch, ít gặp | Do người Việt vẽ, dấu xếp gọn, hơi rộng | Trung tính, quen thuộc nhất |

Vì sao chọn Plus Jakarta Sans: gần Inter về độ rõ ở cỡ nhỏ nhưng có cá tính riêng (chữ `g`, `y`, `j` mềm, nét hơi tròn) nên không "đại trà"; có số liền hàng để cột tiền canh thẳng; nhẹ nhất; một file biến thiên cho mọi độ đậm. Be Vietnam Pro đẹp với dấu tiếng Việt nhưng không có số liền hàng và rộng hơn nên danh sách khoản chi bị cắt chữ sớm hơn. Inter là phương án an toàn nhất.

Geist (font mặc định của shadcn) cũng có bộ vietnamese và đủ 134/134 chữ, nhưng đã phổ biến trong hệ shadcn nên không đưa vào ứng viên.

**Đổi font bằng một dòng:** sửa dòng `@import` trong `src/styles/fonts.css` thành `./fonts/be-vietnam-pro.css` hoặc `./fonts/inter.css`. Cả ba file đều đặt tên font là "Callone Sans" nên `globals.css` không phải đổi gì. Khi cấu hình PWA nhớ cho `woff2` vào danh sách file precache.

### 3.2 Thang chữ

Thân bài 15px. Ô nhập một dòng, ô nhập tiền và textarea dùng `text-base` (16px) trên điện thoại và `md:text-sm` (14px) từ 768px, vì iOS Safari tự phóng to trang khi chữ trong ô nhập nhỏ hơn 16px.

| Lớp | Cỡ / dòng | Độ đậm | Dùng cho |
|---|---|---|---|
| `text-display` | 30/36, ôm −0,02em | 600 | Tổng chi, số tiền lớn trong mã QR |
| `text-headline` | 22/28 | 600 | "Xin chào" ở trang chủ |
| `text-title` | 17/24 | 600 | Tiêu đề header, tiêu đề hộp thoại, tên thẻ |
| `text-body` | 15/22 | 400, 500 cho tên trong danh sách | Thân bài, tên, tiêu đề khoản chi |
| `text-small` | 13/20 | 400, 500 cho nhãn | Dòng phụ, nhãn ô, ghi chú, tiêu đề nhóm danh sách |
| `text-caption` | 12/17 | 400, 500 | Số lượng, nhãn nhỏ trong badge |
| `text-base`, `text-sm` | 16, 14 | | Chỉ trong ô nhập và component shadcn |

Số tiền luôn có `tnum` (lớp `tnum` hoặc `MoneyText`). Dòng chữ có dấu cần `line-height` từ 1,3 trở lên để dấu của chữ hoa không bị cắt (đã kiểm với "ẮẰẲẴẶ", "ẾỀỂỄỆ").

## 4. Khoảng cách, bo góc, độ nổi, chuyển động

- **Lưới 4px** (thang Tailwind). Lề trang 16px, 24px từ `md`. Khoảng cách giữa các khối lớn 24 đến 32px (`gap-6`, `gap-8`), giữa tiêu đề khối và nội dung 10px, trong thẻ 16px, dòng danh sách cao tối thiểu 56px.
- **Đích bấm:** nút mặc định cao 40px, nút `lg` 48px, nút icon 40 hoặc 44px, dòng danh sách 56px. Checkbox 20px nhưng vùng bấm mở rộng thêm 10px mỗi phía.
- **Bo góc** (`--radius` 12px): nút, ô nhập `rounded-lg` 12px; thẻ `rounded-xl` 17px; ô module và ngăn kéo `rounded-2xl` đến `rounded-3xl`; chip, badge, avatar, nút nổi bo tròn hẳn.
- **Độ nổi:** viền 1px (`border-border`) là chính. `shadow-xs` cho thẻ và ô nhập, `shadow-sm` khi rê chuột, `shadow-md` cho menu và nút nổi, `shadow-lg` cho hộp thoại. Chế độ tối dựa vào viền và nền sáng hơn một bậc, bóng gần như không thấy.
- **Chuyển động:** 150ms cho rê chuột và nhấn (nút thu nhẹ 1,5% khi nhấn), 200 đến 250ms cho hộp thoại và ngăn kéo với đường cong `ease-soft` (`cubic-bezier(0.22, 1, 0.36, 1)`). Thanh tiến độ chia riêng chạy 300ms. Tôn trọng `prefers-reduced-motion` (tắt hết hoạt ảnh).

## 5. Biểu tượng

Bộ **lucide** (đã có sẵn), nét mặc định, kích thước: 16px trong chữ và nút nhỏ, 18px trong nút thường, 20px ở header, 24px trong trạng thái trống. Icon luôn đi kèm chữ hoặc có `aria-label` tiếng Việt. Logo: chữ C mở và một chấm ("the one") trên nền chàm, `public/favicon.svg`, sinh bằng `node scripts/design/make-icons.mjs` (cũng sinh `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` và `public/apple-touch-icon.png`).

## 6. Khung app và điều hướng

Điện thoại không có thanh điều hướng chung (tránh hai thanh tab chồng nhau). Trang chủ là launcher; mỗi module tự lo điều hướng bên trong, mỗi trang tự dựng header của mình.

```
Điện thoại (< 1024px)                 Máy tính (>= 1024px)
┌──────────────────────┐              ┌────────┬───────────────────────────┐
│ PageHeader (dính)    │              │ Callone│  PageHeader (dính)        │
│ [tab của module]     │              │        │  [tab của module]         │
├──────────────────────┤              │ Trang  ├───────────────────────────┤
│                      │              │ chủ    │      ┌───────────────┐    │
│ PageBody             │              │ Chia   │      │ PageBody      │    │
│  (lề 16px)           │              │ tiền   │      │ cột 44rem     │    │
│                      │              │ Nhật   │      └───────────────┘    │
│              (FAB)   │              │ ký     │                  (FAB)    │
├──────────────────────┤              │ (sắp   │                           │
│ BottomBar (form)     │              │ có)    │  BottomBar (form)         │
└──────────────────────┘              └────────┴───────────────────────────┘
```

- **`AppShell`** (`src/app/layout/AppShell.tsx`): chỉ là khung. Từ 1024px có thanh bên rộng 15rem liệt kê Trang chủ và các module (module "Sắp có" hiện mờ, không bấm được); dưới 1024px không có gì ngoài `<Outlet />`. Có liên kết "Bỏ qua tới nội dung" cho bàn phím. Biến CSS `--app-rail` (0 hoặc 15rem) và `--app-column` (44rem) là hợp đồng bố cục cho các thanh nổi.
- **`PageHeader`**: dính ở đầu, nền mờ, viền mảnh chỉ hiện khi đã cuộn, chừa tai thỏ (`env(safe-area-inset-top)`). Có nút quay lại hoặc đóng, tiêu đề một dòng, dòng phụ, nút bên phải, và chỗ cho thanh tab.
- **`PageBody`**: canh giữa theo cột 44rem, lề 16px (24px từ `md`). Header và thanh chân tự tràn hết bề ngang nên đặt ngoài `PageBody`. Truyền `padBottom` khi trang có nút nổi hoặc thanh chân, để dòng cuối không bị che.
- **`FloatingAction`**: nút nổi bo tròn ở góc dưới phải của cột nội dung, trong tầm ngón cái (ví dụ "Thêm khoản chi", "Tạo nhóm mới"). Canh theo cột nên trên desktop không trôi ra mép màn hình.
- **`BottomBar`**: thanh cố định ở chân cho form toàn màn hình (nút Lưu, nút Tạo nhóm). Nền mờ, viền trên mảnh, chừa vùng an toàn của thanh home iPhone.
- **`ResponsiveDialog`**: dưới 768px là ngăn kéo từ dưới lên (vuốt xuống để đóng, tối đa 90% chiều cao, footer luôn thấy), từ 768px là hộp thoại giữa màn hình. Có thể lồng nhau (chọn ngân hàng trong form thành viên).
- Điều hướng trong module Chia tiền: Home (`/`) → Chia tiền → Nhóm (ba tab Chi tiêu, Số dư, Thành viên) → Form khoản chi toàn màn hình. Hộp thoại (bạn là ai, mã QR, thành viên, xóa nhóm) mở chồng lên trang, không đổi đường dẫn.

## 7. Kho thành phần

Quy ước: component shadcn giữ tên file chữ thường (`button.tsx`), thành phần dựng thêm đặt tên PascalCase (`PageHeader.tsx`). `shared/ui` không import `app/` hay `modules/`. Component của module chỉ nhận props, không gọi Supabase, React Query, localStorage hay hook của router (đường dẫn truyền bằng `href`, hành động bằng callback).

### 7.1 shadcn (đã cài và chỉnh theo theme, preset radix-nova)

`button` (variant: default, soft, secondary, outline, ghost, destructive, danger, link; size: xs 28, sm 32, default 40, lg 48, icon 40, icon-xs, icon-sm, icon-lg), `input` (40px, 16px trên điện thoại), `textarea`, `label`, `card`, `badge` (secondary, soft, positive, negative, warning, destructive, outline), `dialog`, `alert-dialog`, `drawer` (vaul, có `DrawerNested`), `sheet`, `tabs` (variant default là dải phân đoạn, line là gạch chân), `toggle`, `toggle-group`, `checkbox`, `avatar`, `dropdown-menu`, `popover`, `command` (cmdk), `input-group`, `skeleton`, `separator`, `scroll-area`, `sonner`.

- `sonner.tsx` không dùng `next-themes` mà để `theme="system"`. Nhờ CSS trong `globals.css`, ngay cả `Toaster` nhập thẳng từ `sonner` ở `providers.tsx` cũng ăn màu theme; nên đổi import sang `@/shared/ui/sonner` để có thêm icon màu.
- Chữ "Close" trong dialog, sheet đã đổi thành "Đóng".

### 7.2 UI kit dùng chung (`src/shared/ui`)

| Component | Props chính | Ghi chú |
|---|---|---|
| `PageHeader` | `title`, `subtitle?`, `backHref?` hoặc `onBack?`, `backIcon?: 'back' \| 'close'`, `actions?`, `leading?`, `children?` (phần dính thêm, ví dụ tab) | Header dính của mọi trang |
| `PageBody` | `padBottom?` và props của div | Cột giữa 44rem, lề 16/24px |
| `BottomBar`, `FloatingAction` | `children` | Thanh chân và nút nổi, xem mục 6 |
| `MoneyText` | `amount`, `sign?: 'never' \| 'always'`, `tone?: 'neutral' \| 'muted' \| 'auto' \| 'positive' \| 'negative'`, `size?: 'sm' \| 'md' \| 'lg' \| 'xl' \| 'display'`, `weight?` | Dùng `formatVnd`; `auto` tô xanh lá dịu cho số dương, nâu đỏ dịu cho số âm |
| `MoneyInput` | `value` (chữ gõ nguyên), `onChange(text)`, `preview?` ("= 1.200.000 ₫"), `error?`, `hint?`, `size?: 'md' \| 'lg'`, `quickSuffixes?` (mặc định `k`, `tr`, `000`), `onBlur?`, `autoFocus?` | Chỉ hiển thị, không tự đọc số. `inputMode="text"` để gõ được "1tr2"; các nút gõ nhanh nối chữ vào cuối (chỉ ở size `lg`) |
| `MemberAvatar` | `name`, `colorKey?` (nên truyền id), `size?: 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'`, `ring?` | Chữ cái từ từ cuối của tên, màu theo id |
| `ResponsiveDialog` | `open`, `onOpenChange`, `title`, `description?`, `children`, `footer?` (viết `[Hủy, Nút chính]`), `size?`, `dismissible?`, `initialFocus?: 'first' \| 'content'`, `hideTitle?` | Ngăn kéo trên điện thoại, hộp thoại trên máy tính |
| `ListGroup`, `ListRow` | `leading`, `title`, `subtitle`, `trailing`, `trailingSub`, `href` hoặc `onClick`, `chevron`, `wrapTitle`, `selected` | `ListRow` tự chọn thẻ `a`, `button` hoặc `div` |
| `Section` | `title`, `count?`, `description?`, `action?` | Tiêu đề khối nhỏ, màu phụ |
| `Field` | `label`, `htmlFor`, `hint?`, `error?`, `optional?` | Nhãn, ghi chú, lỗi thống nhất cho form |
| `Notice` | `tone: 'neutral' \| 'info' \| 'positive' \| 'warning' \| 'danger'`, `action?`, `icon?` | Dải thông báo nền nhạt |
| `SegmentedControl` | `value`, `onValueChange`, `options`, `ariaLabel` | "Chia đều / Số tiền riêng" |
| `ChipInput` | `values`, `onValuesChange`, `maxItems?`, `maxLength?`, `renderLeading?`, `invalid?` | Enter, dấu phẩy hoặc nút + để thêm; bỏ tên trùng và rỗng |
| `CopyButton` | `value`, `label?`, `copiedLabel?`, `iconOnly?` + props của `Button` | Đổi nhãn thành "Đã chép" 2 giây |
| `EmptyState`, `ErrorState` | `icon?`, `title`, `description?`, `action?`; `onRetry?`, `retryLabel?` | Trạng thái trống và lỗi |
| `AppLink` | `href` + props của `Link` | Đường dẫn trong app qua router, địa chỉ ngoài mở bình thường |
| `Spinner` | `className?`, `label?` | Vòng xoay 16px |

Hooks (`src/shared/hooks`): `useMediaQuery(query)`, `useIsDesktop()` (từ 768px), `useCopyToClipboard()`, `useScrolled()`.

### 7.3 Khung app (`src/app/layout`)

| Component | Props | Ghi chú |
|---|---|---|
| `AppShell` | không | Thay cho khung tạm, vẫn render `<Outlet />`; đọc danh sách module từ registry để vẽ thanh bên |
| `LauncherView` | `modules: readonly AppModule[]` | Nội dung trang chủ; `HomePage` chỉ cần `<LauncherView modules={modules} />` |
| `ModuleTile` | `title`, `description`, `icon`, `href`, `soon?` | Ô module (có biến thể "Sắp có") |
| `BrandMark` | `className?`, `tile?` | Logo SVG, màu theo theme |
| `AppLoading` | không | Màn hình chờ toàn trang (logo và vòng xoay); dùng làm `HydrateFallback` của router hoặc fallback khi tải chunk |

### 7.4 Component của module Chia tiền (`src/modules/bill-split/components`)

Kiểu dữ liệu lấy từ `domain/types.ts` (không đổi). Thành phần nào cũng nhận `today?` (YYYY-MM-DD) để ngày "Hôm nay", "Hôm qua" ổn định khi chụp ảnh; bỏ trống thì lấy từ đồng hồ theo giờ Việt Nam.

| Component | Props | Ghi chú |
|---|---|---|
| `GroupCard`, `GroupList` | `group: GroupSummary`, `href?` hoặc `onClick?`, `today?`; list: `groups`, `getHref?(group)`, `onSelect?(group)` | Thẻ nhóm: ô chữ cái (`GroupMark`), tên, "4 người · 6 khoản chi", tổng chi, "Hôm nay" |
| `CreateGroupForm` | `name`, `onNameChange`, `memberNames: string[]`, `onMemberNamesChange`, `onSubmit`, `isSubmitting?`, `errors?: { name?, members? }`, `maxMembers?` | Nút "Tạo nhóm" nằm trong `BottomBar`; trang bọc `<PageBody padBottom>` |
| `PasteLinkForm` | `value`, `onChange`, `onSubmit`, `isSubmitting?`, `error?` | Có nút dán từ clipboard |
| `GroupHeader` | `name`, `members: Member[]`, `meId?`, `backHref?`, `onShare?`, `onRename?`, `onChangeMe?`, `onDelete?`, `tabs?` | Chỉ hiện nút nào có callback |
| `GroupSections` | `header` (props của `GroupHeader` trừ `tabs`), `value: 'expenses' \| 'balances' \| 'members'`, `onValueChange`, `counts?`, `expenses`, `balances`, `members` (ReactNode), `actions?` (nút nổi theo tab) | Header dính + ba tab + nội dung + nút nổi |
| `SpendingSummary` | `total`, `expenseCount`, `myPaid?`, `myShare?` | Thẻ tổng chi đầu tab Chi tiêu |
| `ExpenseList` | `expenses: Expense[]`, `members`, `meId?`, `today?`, `getHref?(expense)`, `onSelect?(expense)`, `emptyAction?` | Gom theo ngày kèm tổng ngày; mỗi dòng: người trả, tiêu đề, "chia đều" / "chia riêng", số tiền, "Phần bạn …" khi có `meId` |
| `ExpenseFormView` | `members`, `draft: ExpenseDraft`, `preview: SplitPreview`, `onChange(patch: Partial<ExpenseDraft>)`, `onSubmit`, `onDelete?`, `isSaving?`, `showIssues?`, `today?` | Form toàn màn hình, nút Lưu trong `BottomBar`; đặt trong `<PageBody padBottom>` dưới `PageHeader` |
| `BalanceList` | `members`, `balances: MemberBalance[]`, `meId?` | Người được nhận nhiều nhất lên đầu |
| `TransferList` | `transfers: Transfer[]`, `members`, `meId?`, `onShowQr?(t)`, `onMarkPaid?(t)`, `onEditMember?(m)`, `busyKey?` | Nút "Mã QR" khóa khi người nhận chưa có tài khoản; giao dịch của mình được tô nhẹ |
| `SettlementList` | `settlements`, `members`, `meId?`, `today?`, `onDelete?(s)` | Menu ba chấm để xóa; nơi gọi nên hiện toast "Hoàn tác" |
| `MemberList` | `members`, `banks?`, `meId?`, `onEdit?(m)`, `onAdd?()`, `onChangeMe?()`, `canAdd?` | Tóm tắt tài khoản "TPBank · ••••6789" |
| `MemberForm` | `values: MemberFormValues`, `onChange(patch)`, `banks`, `bankFilter?`, `errors?`, `onSubmit`, `onCancel?`, `onDelete?`, `isSaving?`, `isNew?` | `MemberFormValues = { name, bankBin: string \| null, accountNumber, accountName }` (xuất từ `MemberForm.tsx`) |
| `BankPicker` | `banks: Bank[]`, `value: string \| null` (mã BIN), `onChange(bank)`, `filter?(banks, query)`, `placeholder?`, `invalid?` | Mặc định lọc không dấu theo tên, mã, BIN; có thể thay bằng hàm của domain |
| `VietQrCard` | `payload`, `amount`, `recipientName`, `bankName`, `accountNumber`, `accountName?`, `message` | Thẻ `<svg>` của mã QR có `data-payload` và `data-testid="vietqr-code"` (đúng một phần tử mang `data-payload`) |
| `WhoAmIPicker` | `members`, `value?`, `onSelect(id)`, `onSkip?` | Nội dung hộp "Bạn là ai trong nhóm?" |
| `ShareLinkCard` | `url`, `groupName`, `onRotate?`, `isRotating?`, `canShare?` | Nút "Chia sẻ" dùng `navigator.share` nếu có; "Đổi link mới" có hộp xác nhận |
| `DeleteGroupConfirm` | `open`, `onOpenChange`, `groupName`, `onConfirm`, `isDeleting?` | Phải gõ lại đúng tên nhóm mới mở khóa nút "Xóa nhóm" |

Hàm dùng chung: `moneyErrorMessage(error)` và `splitIssueMessage(issue)` trong `components/messages.ts` đổi lỗi của domain sang câu tiếng Việt (dùng cho form và toast).

## 8. Màn hình

Mỗi mục có bố cục, các trạng thái và ảnh tương ứng. Tên ảnh trong `docs/design/screenshots/` (hậu tố `-mobile-light`, `-mobile-dark`, `-desktop-light`).

### 8.1 Trang chủ (`01-home`)

```
┌──────────────────────────────┐
│ [C•] Callone                 │
│                              │
│ Xin chào                     │
│ Chọn một ứng dụng để bắt đầu.│
│ ┌────────────┐ ┌───────────┐ │
│ │ [ví]       │ │[sổ] Sắp có│ │
│ │ Chia tiền  │ │ Nhật ký   │ │
│ │ Chia tiền  │ │ Viết lại  │ │
│ │ đi chơi... │ │ một ngày..│ │
│ └────────────┘ └───────────┘ │
│ ┌────────────┐ ┌───────────┐ │
│ │ Học tiếng  │ │ Địa điểm  │ │
│ │ Anh Sắp có │ │   Sắp có  │ │
│ └────────────┘ └───────────┘ │
└──────────────────────────────┘
```

Lưới 2 cột trên điện thoại, 3 cột từ `md`. Module sẵn sàng là liên kết có hiệu ứng nâng nhẹ khi rê chuột; module "Sắp có" mờ hơn, có nhãn, không bấm được. Từ 1024px thương hiệu chuyển sang thanh bên. Không có trạng thái tải hay lỗi (danh sách tĩnh); module cần đăng nhập do `ModuleGate` hiện thông báo riêng.

### 8.2 Chia tiền: nhóm của bạn (`02-bill-split-home`, `03-bill-split-home-empty`)

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ ←  Chia tiền                   │   │ ←  Chia tiền                   │
│    Chia tiền đi chơi với hội   │   │                                │
│                                │   │            (ví)                │
│ Nhóm của bạn  3                │   │      Chưa có nhóm nào          │
│ ┌────────────────────────────┐ │   │  Tạo nhóm để chia tiền với     │
│ │ [Đ] Đà Lạt 3N2Đ 5.790.000₫ │ │   │  hội bạn, hoặc dán link nhóm   │
│ │     4 người · 6 khoản      │ │   │  được chia sẻ.                 │
│ └────────────────────────────┘ │   │      [+ Tạo nhóm mới]          │
│ ┌ [L] Lẩu thứ Sáu ... ┐       │   │                                │
│ ┌ [S] Sinh nhật Mai ... ┐      │   │ Mở nhóm có sẵn                 │
│                                │   │ ┌────────────────────────────┐ │
│ Mở nhóm có sẵn                 │   │ │ Đã có link nhóm?           │ │
│ ┌────────────────────────────┐ │   │ │ [Dán link nhóm ⎘] [Mở nhóm]│ │
│ │ Đã có link nhóm?           │ │   │ └────────────────────────────┘ │
│ │ [Dán link nhóm ⎘] [Mở nhóm]│ │   └────────────────────────────────┘
│ └────────────────────────────┘ │
│              (+ Tạo nhóm mới)  │  ← nút nổi
└────────────────────────────────┘
```

- Danh sách nhóm sắp theo cập nhật mới nhất (do nơi gọi quyết định), mỗi thẻ dẫn vào nhóm. Nhóm chưa mở trên máy này không có trong danh sách; người dùng dán link ở ô "Mở nhóm có sẵn".
- Đang tải: 2 thẻ khung xương. Lỗi dán link: dòng đỏ dưới ô ("Link này không đúng hoặc nhóm đã bị xóa.").

### 8.3 Tạo nhóm (`04-create-group`)

```
┌──────────────────────────────┐
│ ✕  Tạo nhóm mới              │
│ Tên nhóm                     │
│ [Đà Lạt 3N2Đ              ]  │
│ Thành viên 4                 │
│ (L Linh ✕) (H Hưng ✕)       │
│ (M Mai ✕)  (T Tú ✕)         │
│ [Tên một người        ] [+]  │
│ Gõ tên rồi bấm Enter. Nhớ... │
├──────────────────────────────┤
│ [          Tạo nhóm         ]│  ← BottomBar
└──────────────────────────────┘
```

Lỗi: tên nhóm trống, danh sách thành viên trống, tên trùng (bị bỏ qua khi thêm), quá 50 người (ô nhập khóa, chữ "Đã đủ số người tối đa"), nhóm bị giới hạn tốc độ ("Tạo nhóm hơi nhiều, thử lại sau ít phút." do nơi gọi hiện bằng toast). Đang tạo: nút hiện vòng xoay và "Đang tạo nhóm…".

### 8.4 Trang nhóm (`06-group-expenses`, `07-group-balances`, `08-group-members`)

Lần đầu mở nhóm trên máy này hiện hộp "Bạn là ai trong nhóm?" (mục 8.5). Header dính gồm tên nhóm, "4 người · Bạn là Hưng", nút chia sẻ và menu ba chấm (Đổi tên nhóm, Bạn là ai trong nhóm?, Xóa nhóm), bên dưới là ba tab. Đổi tab không đổi header.

```
  Tab Chi tiêu                  Tab Số dư                     Tab Thành viên             
┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
│ ←  Đà Lạt 3N2Đ       ⤴ ⋯  │ │ ←  Đà Lạt 3N2Đ       ⤴ ⋯  │ │ ←  Đà Lạt 3N2Đ       ⤴ ⋯  │
│    4 người · Bạn là Hưng  │ │    4 người · Bạn là Hưng  │ │    4 người · Bạn là Hưng  │
│ Chi tiêu│Số dư│Thành viên │ │ Chi tiêu│Số dư│Thành viên │ │ Chi tiêu│Số dư│Thành viên │
│ ━━━━━━━━                  │ │          ━━━━━            │ │                ━━━━━━━━━  │
│ ┌───────────────────────┐ │ │ Số dư                     │ │ Thành viên 4              │
│ │ Tổng chi · 6 khoản    │ │ │ ┌───────────────────────┐ │ │ (i) Bạn là Hưng.   [Đổi]  │
│ │ 5.790.000 ₫           │ │ │ │(L) Linh    +940.000 ₫ │ │ │ ┌───────────────────────┐ │
│ │ Bạn đã trả│Phần bạn   │ │ │ │(H) Hưng Bạn −150.000 ₫│ │ │ │(L) Linh  TPBank ••6789│ │
│ └───────────────────────┘ │ │ │(T) Tú      −380.000 ₫ │ │ │ │(H) Hưng Bạn MB •• 4321│ │
│ Hôm nay · 26/10  1.350.000│ │ │(M) Mai     −410.000 ₫ │ │ │ │(M) Mai  Chưa nhập TK  │ │
│ ┌───────────────────────┐ │ │ └───────────────────────┘ │ │ │(T) Tú   Chưa nhập TK  │ │
│ │(H) Lẩu gà lá é        │ │ │ Gợi ý chuyển khoản 3      │ │ └───────────────────────┘ │
│ │ Hưng trả · chia đều   │ │ │ ┌───────────────────────┐ │ │ [  + Thêm thành viên    ] │
│ │       1.200.000 ₫     │ │ │ │(M)(L) Mai → Linh      │ │ │ Chia sẻ nhóm              │
│ └───────────────────────┘ │ │ │ [ Mã QR ]  [ Đã trả ] │ │ │ ┌───────────────────────┐ │
│ Hôm qua · 25/10   480.000 │ │ ├───────────────────────┤ │ │ │ Link chia sẻ          │ │
│ ...                       │ │ │(H)(L) Bạn → Linh      │ │ │ │ https://callone.app.. │ │
│        (+ Thêm khoản chi) │ │ │ [Mã QR ●]  [ Đã trả ] │ │ │ │ [Chia sẻ] [Sao chép]  │ │
│                           │ │ └───────────────────────┘ │ │ │ ⟳ Đổi link mới        │ │
│                           │ │ Đã thanh toán 2           │ │ └───────────────────────┘ │
│                           │ │ (✓) Mai đã trả Linh   ⋯   │ │ Xóa nhóm                  │
└───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

- **Chi tiêu:** thẻ tổng chi (có "Bạn đã trả" và "Phần của bạn" khi biết mình là ai), rồi khoản chi gom theo ngày. Mỗi ngày có tổng. Bấm một dòng để sửa. Nút nổi "Thêm khoản chi". Trống: "Chưa có khoản chi nào" kèm nút thêm.
- **Số dư:** ba khối. "Số dư" sắp người được nhận nhiều nhất lên đầu, đủ "Đã trả" và "Phần chịu". "Gợi ý chuyển khoản": thẻ cho mỗi giao dịch, giao dịch của mình được tô nhạt và nút "Mã QR" là nút chính; nút "Mã QR" khóa nếu người nhận chưa nhập tài khoản và có lời nhắc "… chưa nhập tài khoản ngân hàng. Nhập ngay". "Đã thanh toán": lịch sử, menu ba chấm để xóa. Khi mọi người cân bằng: dải xanh "Mọi người đã cân bằng, không ai nợ ai." và không có khối gợi ý.
- **Thành viên:** danh sách kèm tóm tắt tài khoản, "Thêm thành viên", thẻ chia sẻ link, "Xóa nhóm" (chữ đỏ, mở hộp xác nhận).
- **Đang tải** (`18-group-loading`): khung xương đúng hình dạng (header, tab, thẻ, dòng) để trang không nhảy. **Lỗi** xem mục 8.10.

### 8.5 Bạn là ai trong nhóm? (`05-who-am-i`)

```
┌────────────────────────────────┐
│            ───                 │
│ Bạn là ai trong nhóm?          │
│ Chọn tên của bạn để app hiện   │
│ phần chi của riêng bạn.        │
│ ┌────────────────────────────┐ │
│ │ (L) Linh                   │ │
│ │ (H) Hưng                 ✓ │ │
│ │ (M) Mai                    │ │
│ │ (T) Tú                     │ │
│ └────────────────────────────┘ │
│            Để sau              │
└────────────────────────────────┘
```

Chọn xong đóng ngay và lưu trên máy (do nơi gọi). "Để sau" đóng hộp, lần sau mở lại vẫn hỏi. Mở lại bất cứ lúc nào từ menu ba chấm hoặc dòng "Bạn đang dùng nhóm này với tên …" ở tab Thành viên.

### 8.6 Form khoản chi (`09-expense-form-equal`, `10-expense-form-exact`, `11-expense-form-errors`)

Toàn màn hình trên điện thoại (từ `md` vẫn là một cột giữa). Header có nút đóng (✕) và tên nhóm ở dòng phụ; nút Lưu nằm trong `BottomBar`. Khi mở để thêm mới, ô số tiền được focus sẵn.

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ ✕  Thêm khoản chi              │   │ Chia như thế nào?              │
│    Đà Lạt 3N2Đ                 │   │ [ Chia đều │ Số tiền riêng ]   │
│ Số tiền                        │   │ ┌────────────────────────────┐ │
│ ┌────────────────────────────┐ │   │ │ (L) Linh        [ 350k  ₫ ]│ │
│ │ 1tr2                     ₫ │ │   │ │ (H) Hưng        [ 300k  ₫ ]│ │
│ └────────────────────────────┘ │   │ │ (M) Mai         [ 250k  ₫ ]│ │
│ = 1.200.000 ₫                  │   │ │ (T) Tú          [ 250k  ₫ ]│ │
│ Gõ nhanh  (k) (tr) (000)       │   │ └────────────────────────────┘ │
│ Tiêu đề                        │   │ ┌────────────────────────────┐ │
│ [Lẩu gà lá é                ]  │   │ │ Đã chia: 1.150.000 ₫       │ │
│ Ai trả?                        │   │ │ ▰▰▰▰▰▰▰▰▰▰▰▰▰▱             │ │
│ (Linh) (●Hưng) (Mai) (Tú)      │   │ │ Còn thiếu 50.000 ₫         │ │
│ Ngày                           │   │ └────────────────────────────┘ │
│ [26/10/2026     ▾]   Hôm nay   │   │                                │
│ Chia như thế nào?              │   │                                │
│ [ Chia đều │ Số tiền riêng ]   │   │                                │
│ ...                            │   │                                │
│ Ghi chú · không bắt buộc       │   │                                │
│ [                            ] │   │                                │
│────────────────────────────────│   │                                │
│ [       Lưu khoản chi        ] │   │                                │
└────────────────────────────────┘   └────────────────────────────────┘
```

- **Số tiền:** ô lớn 28px ở trên cùng, bàn phím chữ (gõ được "150k", "1tr2", "2,5tr", "1 triệu"), dòng xem trước "= 1.200.000 ₫" ngay dưới, nút gõ nhanh `k`, `tr`, `000` nối chữ vào cuối (khóa khi ô trống). Lỗi đọc số chỉ hiện sau khi rời ô (hoặc sau khi bấm Lưu), để không nhấp nháy lúc đang gõ dở như "1t". Enter không gửi form: ở ô số tiền chuyển xuống tiêu đề, ở tiêu đề chỉ thu bàn phím, ở ô số riêng từng người chuyển sang người kế; việc lưu luôn qua nút ở chân màn hình (tạo nhóm cũng vậy: Enter ở tên nhóm chuyển sang ô thành viên).
- **Ai trả?** các chip có avatar, chọn một. **Ngày:** ô ngày gốc của hệ điều hành (bộ chọn quen thuộc trên điện thoại), nhãn "Hôm nay" hoặc "Hôm qua" bên cạnh.
- **Chia đều:** danh sách người tham gia có ô chọn; mỗi dòng hiện phần chia đã tính. "Chọn tất cả" và "Bỏ chọn tất cả". Phần lẻ đồng do domain xử lý, form chỉ hiện kết quả.
- **Số tiền riêng:** mỗi người một ô gọn (cũng hiểu "350k"); ô trống là 0. Thẻ tóm tắt bên dưới có thanh tiến độ: "Còn thiếu 50.000 ₫" (hổ phách), "Chia lố 50.000 ₫", hoặc "Đã chia đủ" (xanh lá). Chưa nhập số tiền thì hiện "Nhập số tiền ở trên trước, rồi chia riêng cho từng người."
- **Lỗi** (`showIssues`): tiêu đề trống, số tiền sai, chưa chọn người trả, chưa chọn ai chia, số riêng không đọc được; mỗi lỗi hiện dưới đúng trường, viền đỏ mảnh. Nút Lưu luôn bấm được để người dùng thấy lỗi nằm ở đâu.
- **Sửa khoản chi:** nút đổi thành "Lưu thay đổi" và có nút xóa (icon thùng rác, nền đỏ nhạt) bên trái. Xóa nên hiện toast "Đã xóa khoản chi" kèm "Hoàn tác". Xung đột phiên bản ("Người khác vừa sửa khoản chi này") hiện bằng `Notice` đỏ ở đầu form hoặc toast lỗi.
- **Đang lưu:** nút hiện vòng xoay và "Đang lưu…", các nút khác bị khóa.

### 8.7 Mã VietQR (`12-vietqr`)

```
┌────────────────────────────────┐
│            ───                 │
│ Mã QR chuyển khoản             │
│ Quét bằng app ngân hàng, mọi   │
│ thông tin đã điền sẵn.         │
│        Chuyển cho Linh         │
│         150.000 ₫              │
│       ┌──────────────┐         │
│       │   ▓▓ QR ▓▓   │         │
│       └──────────────┘         │
│ ┌────────────────────────────┐ │
│ │ Ngân hàng      TPBank      │ │
│ │ Số tài khoản   0123456789 ⎘│ │
│ │ Chủ tài khoản  NGUYEN VAN..│ │
│ │ Nội dung       DH123456  ⎘ │ │
│ └────────────────────────────┘ │
│ [✓ Đã chuyển xong]             │
│ [         Đóng        ]        │
└────────────────────────────────┘
```

Mã QR luôn nền trắng chữ đen. Nút "Đã chuyển xong" ghi nhận thanh toán và đóng hộp. Trên máy tính là hộp thoại giữa màn hình, hai nút nằm ngang (Đóng, Đã chuyển xong). Người nhận chưa có tài khoản thì không mở được hộp này (nút "Mã QR" khóa, xem 8.4).

### 8.8 Form thành viên và chọn ngân hàng (`13-member-form`, `14-bank-picker`)

```
┌────────────────────────────────┐  bấm ô Ngân hàng  ┌────────────────────────────────┐
│            ───                 │ ────────────────▶ │            ───                 │
│ Sửa thành viên                 │                   │ Chọn ngân hàng                 │
│ Nhập tài khoản ngân hàng để    │                   │ ┌────────────────────────────┐ │
│ bạn bè trả tiền cho người này  │                   │ │ ⌕ Tìm ngân hàng             │ │
│ bằng mã QR.                    │                   │ └────────────────────────────┘ │
│ Tên                            │                   │ Vietcombank                VCB │
│ [Linh                       ]  │                   │ Ngân hàng TMCP Ngoại Thương..  │
│ ┌ Nhận tiền qua mã QR ───────┐ │                   │ VietinBank                 ICB │
│ │ Ngân hàng                  │ │                   │ BIDV                      BIDV │
│ │ [TPBank              TPB ⇅]│ │                   │ ...  (cuộn)                    │
│ │ Số tài khoản               │ │                   └────────────────────────────────┘
│ │ [0123456789              ] │ │
│ │ Tên chủ tài khoản          │ │
│ │ [NGUYEN VAN LINH         ] │ │
│ └────────────────────────────┘ │
│ [            Lưu             ] │
│ [            Hủy             ] │
│        Xóa thành viên          │
└────────────────────────────────┘
```

Thêm thành viên dùng cùng form với tên nút "Thêm thành viên" và không có "Xóa". Danh sách ngân hàng là ngăn kéo lồng (điện thoại) hoặc hộp thoại lồng (máy tính); gõ không dấu cũng tìm ra ("ngoai thuong", "vcb", "970436"). Lỗi theo trường: tên trống hoặc trùng, "chọn ngân hàng thì phải có số tài khoản và ngược lại", số tài khoản sai định dạng. Người đã có khoản chi không xóa được: nơi gọi hiện toast "Không xóa được vì người này đã có khoản chi." (lỗi `BS_MEMBER_IN_USE`).

### 8.9 Chia sẻ link và xóa nhóm (`15-share-link`, `16-delete-group`)

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ Link chia sẻ                   │   │ Xóa nhóm?                      │
│ Ai có link này đều xem và sửa  │   │ Nhóm Đà Lạt 3N2Đ sẽ không mở   │
│ được nhóm. Chỉ gửi cho người   │   │ được nữa trên mọi máy giữ link.│
│ trong hội.                     │   │ Gõ lại tên nhóm để xác nhận.   │
│ ┌────────────────────────────┐ │   │ [Đà Lạt 3N2Đ                ]  │
│ │ https://callone.app/b… ⎘   │ │   │ [ Xóa nhóm ]  ← khóa tới khi   │
│ └────────────────────────────┘ │   │ [    Hủy   ]     gõ đúng tên   │
│ [ ⤴ Chia sẻ ] [ ⎘ Sao chép link]│  └────────────────────────────────┘
│ ──────────────────────────     │
│ ⟳ Đổi link mới                 │   Đổi link: hộp xác nhận "Đổi link mới?
└────────────────────────────────┘   Link cũ sẽ không mở được nữa. Bạn cần
                                     gửi lại link mới cho mọi người."
```

Nút "Chia sẻ" chỉ hiện khi trình duyệt có hộp chia sẻ (điện thoại); trên máy tính chỉ có "Sao chép link" làm nút chính. Sau khi sao chép nút đổi thành "Đã chép" hai giây. Xóa nhóm thành công thì về trang Chia tiền và hiện toast "Đã xóa nhóm".

### 8.10 Lỗi và đang tải (`17-group-not-found`, `18-group-loading`)

Không tìm thấy nhóm (`BS_GROUP_NOT_FOUND`): `ErrorState` với icon liên kết, "Không tìm thấy nhóm", "Link này không đúng, đã được đổi hoặc nhóm đã bị xóa. Hãy nhờ bạn bè gửi lại link mới." và hai nút "Dán link khác", "Về trang Chia tiền". Lỗi mạng: "Không tải được nhóm" + "Kiểm tra kết nối mạng rồi thử lại." + nút "Thử lại". Đang tải: khung xương giống hình dạng trang thật.

## 9. Câu chữ (microcopy)

Giọng: thân thiện, ngắn, xưng "bạn" khi cần, không cảm thán. Số tiền luôn `1.250.000 ₫`; ngày là "Hôm nay", "Hôm qua", thứ trong tuần, hoặc 26/10.

| Chỗ | Chữ |
|---|---|
| Trang chủ | "Xin chào", "Chọn một ứng dụng để bắt đầu.", nhãn "Sắp có" |
| Chia tiền | "Nhóm của bạn", "Mở nhóm có sẵn", "Đã có link nhóm?", "Dán link bạn bè gửi để mở nhóm trên máy này.", "Dán link nhóm", "Mở nhóm", "Tạo nhóm mới" |
| Trống | "Chưa có nhóm nào" / "Tạo nhóm để chia tiền với hội bạn, hoặc dán link nhóm được chia sẻ."; "Chưa có khoản chi nào" / "Thêm khoản chi đầu tiên để bắt đầu chia tiền." |
| Tạo nhóm | "Tạo nhóm mới", "Tên nhóm", "Ví dụ: Đà Lạt 3N2Đ", "Thành viên", "Gõ tên rồi bấm Enter. Nhớ thêm cả bạn. Có thể thêm hoặc bớt sau.", "Tạo nhóm", "Đang tạo nhóm…" |
| Tab | "Chi tiêu", "Số dư", "Thành viên" |
| Chi tiêu | "Tổng chi · 6 khoản", "Bạn đã trả", "Phần của bạn", "chia đều", "chia đều 3/4", "chia riêng", "Phần bạn 300.000 ₫", "Bạn không tham gia", "Thêm khoản chi" |
| Số dư | "Số dư", "Số dương là được nhận lại, số âm là còn nợ.", "Đã trả …", "Phần chịu …", "được nhận lại", "còn nợ", "Đã cân bằng", "Mọi người đã cân bằng, không ai nợ ai." |
| Chuyển khoản | "Gợi ý chuyển khoản", "Ít lần chuyển nhất để mọi người huề nhau.", "Mai chuyển cho Linh", "Bạn chuyển cho Linh", "Mai chuyển cho bạn", "Mã QR", "Đã trả", "Linh chưa nhập tài khoản ngân hàng. Nhập ngay", "Đã thanh toán", "Mai đã trả Linh", "Xóa lần trả này" |
| Thành viên | "Bạn đang dùng nhóm này với tên Hưng.", "Đổi", "Chưa nhập tài khoản", "Thêm thành viên", "Chia sẻ nhóm", "Xóa nhóm" |
| Bạn là ai | "Bạn là ai trong nhóm?", "Chọn tên của bạn để app hiện phần chi của riêng bạn.", "Để sau" |
| Form khoản chi | "Thêm khoản chi", "Sửa khoản chi", "Số tiền", "Gõ 150k, 1tr2 hoặc 1.200.000", "Gõ nhanh", "Tiêu đề", "Ví dụ: Lẩu gà lá é", "Ai trả?", "Ngày", "Chia như thế nào?", "Chia đều", "Số tiền riêng", "Chọn tất cả", "Bỏ chọn tất cả", "Đã chia", "Còn thiếu 50.000 ₫", "Chia lố 50.000 ₫", "Đã chia đủ", "Ghi chú", "Không bắt buộc", "Lưu khoản chi", "Lưu thay đổi", "Đang lưu…", "Xóa khoản chi" |
| Lỗi nhập | "Nhập số tiền.", "Chưa hiểu số tiền này. Thử 150k, 1tr2 hoặc 1.200.000.", "Số tiền không có phần lẻ dưới 1 đồng.", "Số tiền phải lớn hơn 0.", "Số tiền quá lớn, tối đa 999 tỷ.", "Nhập tiêu đề cho khoản chi.", "Chọn người trả.", "Chọn ít nhất một người chia." |
| Mã QR | "Mã QR chuyển khoản", "Quét bằng app ngân hàng, mọi thông tin đã điền sẵn.", "Chuyển cho Linh", "Ngân hàng", "Số tài khoản", "Chủ tài khoản", "Nội dung", "Sao chép", "Đã chép", "Đã chuyển xong" |
| Thành viên (form) | "Sửa thành viên", "Thêm thành viên", "Tên", "Nhận tiền qua mã QR (không bắt buộc)", "Ngân hàng", "Số tài khoản", "Tên chủ tài khoản", "Viết hoa không dấu, ví dụ NGUYEN VAN LINH.", "Chọn ngân hàng", "Tìm ngân hàng", "Không thấy ngân hàng nào khớp.", "Xóa thành viên" |
| Chia sẻ, xóa | "Link chia sẻ", "Ai có link này đều xem và sửa được nhóm. Chỉ gửi cho người trong hội.", "Chia sẻ", "Sao chép link", "Đổi link mới", "Đổi link mới?", "Link cũ sẽ không mở được nữa. Bạn cần gửi lại link mới cho mọi người trong nhóm.", "Xóa nhóm?", "Gõ lại tên nhóm để xác nhận." |
| Toast gợi ý | "Đã lưu khoản chi", "Đã xóa khoản chi" + nút "Hoàn tác", "Đã ghi nhận Hưng trả Linh 150.000 ₫", "Đã đổi link mới. Nhớ gửi lại cho mọi người.", "Đã xóa nhóm", "Đã chép link" |
| Lỗi hệ thống | "Không tìm thấy nhóm", "Có lỗi xảy ra", "Không tải được nhóm", "Kiểm tra kết nối mạng rồi thử lại.", "Người khác vừa sửa khoản chi này. Tải lại rồi thử lại.", "Không xóa được vì người này đã có khoản chi.", "Tạo nhóm hơi nhiều, thử lại sau ít phút." |

## 10. Trang dev và ảnh chụp

Chỉ có khi chạy `npm run dev` (route `/dev/*` không vào bản build). Mã nằm ở `src/app/dev/`.

- `/dev`: mục lục. `/dev/ui`: UI kit (màu, chữ, nút, ô nhập, danh sách, hộp thoại, toast). `/dev/fonts`: so sánh 3 font, kèm số chữ tiếng Việt đủ (đo thật trong trình duyệt) và đang dùng font nào.
- `/dev/mockups/<tên>`: 18 màn hình với dữ liệu giả gõ theo model thật (`src/app/dev/fixtures.ts`: nhóm Đà Lạt 3N2Đ, Linh, Hưng, Mai, Tú; "mình" là Hưng, nợ Linh 150.000 ₫, khớp mã VietQR mẫu). Mockup dùng luôn domain thật của frontend để chắc chắn component khớp dữ liệu thật: `computeSplitPreview` (form khoản chi gõ thật được: đọc "1tr2", chia đều, chia riêng), `computeBalances` và `suggestTransfers` (số dư, gợi ý chuyển khoản), `BANKS` (danh sách ngân hàng đầy đủ) và `searchBanks` (tìm không dấu).
- Ảnh chụp: `npm run design:shots` (cần dev server cổng 5180, dùng Edge có sẵn). Có thể lọc: `npm run design:shots -- group`.

## 11. Hướng dẫn nối dữ liệu (cho frontend)

Bản cài đặt tham khảo chạy được nằm ở `src/app/dev/mockups/` (đặc biệt `GroupPageDemo.tsx`, `GroupTabs.tsx`, `ExpenseFormMockup.tsx`): sao chép khung rồi thay dữ liệu giả bằng hook thật. Các mockup đã gọi domain thật (`computeSplitPreview`, `computeBalances`, `suggestTransfers`, `searchBanks`) nên cách nối đã được kiểm về kiểu dữ liệu.

1. **Trang chủ:** `HomePage` chỉ còn `return <LauncherView modules={modules} />`.
2. **Providers:** đổi `import { Toaster } from 'sonner'` thành `import { Toaster } from '@/shared/ui/sonner'`.
3. **Trang Chia tiền:** `PageHeader title="Chia tiền" backHref="/"`, `PageBody padBottom`, `GroupList` (tạo `getHref`), `PasteLinkForm`, và `FloatingAction` chứa nút "Tạo nhóm mới". Danh sách rỗng thì `EmptyState` (xem `BillSplitHomeMockup`).
4. **Trang nhóm:** một `GroupSections` duy nhất; tab đang chọn nên nằm trên URL (`?tab=so-du`) hoặc state. Mỗi tab dựng bằng component tương ứng (`ExpenseList`, `BalanceList` + `TransferList` + `SettlementList`, `MemberList` + `ShareLinkCard`). Các hộp thoại (bạn là ai, mã QR, thành viên, xóa nhóm) là `ResponsiveDialog` mở bằng state, không đổi đường dẫn.
5. **Form khoản chi:** `PageHeader backIcon="close" backHref=…` rồi `<PageBody padBottom><ExpenseFormView … /></PageBody>`. State là `ExpenseDraft`; `preview = computeSplit(draft, members)`; `onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}`. Khi bấm Lưu mà `preview.issues.length > 0` thì bật `showIssues`, ngược lại gọi API. Form không tự chặn nút Lưu.
6. **`MoneyInput`:** `value` là chữ người dùng gõ; component không đọc số. Nơi gọi đọc bằng domain và truyền `preview` ("= 1.200.000 ₫") hoặc `error`.
7. **Mã QR:** `ResponsiveDialog size="sm" initialFocus="content"` chứa `VietQrCard`; footer `[Đóng, Đã chuyển xong]`. Chỉ mở khi người nhận có `bank`.
8. **`ResponsiveDialog` footer:** luôn viết theo thứ tự `[Hủy, Nút chính]`, component tự đảo thứ tự trên điện thoại.
9. **Ngày giờ:** không truyền `today` ở bản thật; chỉ truyền khi chụp ảnh hoặc viết test.
10. **Chỗ bám cho E2E:** mã QR có `data-testid="vietqr-code"` và `data-payload`. Mọi ô nhập có nhãn gắn bằng `htmlFor`, nên `getByLabel('Số tiền')`, `getByLabel('Tiêu đề')`, `getByLabel('Tên nhóm')`, `getByLabel('Số tài khoản')` dùng được. Các id cố định: `expense-amount`, `expense-title`, `expense-date`, `expense-note`, `group-name`, `group-members`, `member-name`, `member-bank`, `member-account`, `member-holder`. Nút bấm theo tên: "Lưu khoản chi", "Lưu thay đổi", "Tạo nhóm", "Mã QR", "Đã trả", "Đã chuyển xong", "Thêm khoản chi", "Thêm thành viên", "Xóa nhóm".
11. **Đích bấm nhỏ:** checkbox và chip đã mở rộng vùng bấm; đừng thu nhỏ thêm.

## 12. Ghi chú và câu hỏi mở

Đã chốt ngày 27/10/2026: giữ nguyên tất cả như thiết kế (Plus Jakarta Sans, màu chàm, tab trên cùng và nút nổi, giữ thanh bên desktop; mục 4 đến 6 giữ như hiện tại). Danh sách câu hỏi để lại làm ngữ cảnh:

1. **Font:** Plus Jakarta Sans (đề xuất), Be Vietnam Pro hay Inter. Đổi bằng một dòng.
2. **Màu nhấn chàm** (`oklch(0.47 0.12 268)`, xanh chàm hơi tím) có hợp không, hay muốn xanh lục bảo, nâu đất…
3. **Điều hướng nhóm:** đang dùng tab trên cùng và nút nổi "Thêm khoản chi" ở góc dưới phải. Phương án khác: thanh tab dưới đáy của riêng module Chia tiền kèm nút giữa.
4. **Dòng "Phần bạn …"** ở mỗi khoản chi: giữ như hiện tại, hay đổi thành "Bạn nợ …" / "Bạn được nhận …" cho từng khoản?
5. **Bàn phím số tài khoản:** đang là bàn phím số (nhanh, nhưng không gõ được chữ). Số tài khoản có chữ rất hiếm; nếu cần thì đổi sang bàn phím chữ.
6. **Ô ngày** dùng bộ chọn gốc của máy nên định dạng hiển thị theo ngôn ngữ máy (điện thoại tiếng Việt sẽ là 26/10/2026).
7. **Thanh bên desktop** liệt kê module: giữ hay bỏ (chỉ còn cột giữa)?

Đề nghị với người điều phối (ngoài phạm vi file của ui-design):

- `src/app/providers.tsx`: đổi sang `Toaster` của `@/shared/ui/sonner`; `src/app/pages/HomePage.tsx`: dùng `LauncherView`.
- `src/app/router.tsx`: thêm `HydrateFallback: AppLoading` cho route gốc để hết cảnh báo "No HydrateFallback element provided" khi chạy dev (cảnh báo này đang xuất hiện ở mọi trang vì route dùng `lazy`).
- `.oxlintrc.json`: tắt `react/only-export-components` cho `src/shared/ui/**` (còn 2 cảnh báo ở `button.tsx`, `toggle.tsx` do xuất `buttonVariants`, `toggleVariants` theo kiểu shadcn).
- Cấu hình PWA: thêm `woff2` vào danh sách file precache (build hiện chỉ có 2 file font, tổng khoảng 36 KB).
- Gói đã thêm: `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans`, `@fontsource/be-vietnam-pro`, `vaul`, `cmdk`. Đã gỡ `@fontsource-variable/geist` (không dùng nữa). `next-themes` do `shadcn add sonner` kéo về đã được gỡ.

## 13. Danh mục ảnh chụp

Ảnh nằm trong `docs/design/screenshots/` (điện thoại 390×844 ở độ phân giải gấp đôi, máy tính 1280×800). Ảnh dài là cả trang cuộn, thanh cố định ở chân nằm cuối ảnh.

| Màn hình | Điện thoại, sáng | Điện thoại, tối | Máy tính |
|---|---|---|---|
| Trang chủ<br><sub>01-home</sub> | <img src="screenshots/01-home-mobile-light.png" width="170" alt="01-home-mobile-light.png"> | <img src="screenshots/01-home-mobile-dark.png" width="170" alt="01-home-mobile-dark.png"> | <img src="screenshots/01-home-desktop-light.png" width="260" alt="01-home-desktop-light.png"> |
| Chia tiền: nhóm của bạn<br><sub>02-bill-split-home</sub> | <img src="screenshots/02-bill-split-home-mobile-light.png" width="170" alt="02-bill-split-home-mobile-light.png"> |  |  |
| Chia tiền: chưa có nhóm<br><sub>03-bill-split-home-empty</sub> | <img src="screenshots/03-bill-split-home-empty-mobile-light.png" width="170" alt="03-bill-split-home-empty-mobile-light.png"> |  |  |
| Tạo nhóm<br><sub>04-create-group</sub> | <img src="screenshots/04-create-group-mobile-light.png" width="170" alt="04-create-group-mobile-light.png"> |  |  |
| Bạn là ai trong nhóm?<br><sub>05-who-am-i</sub> | <img src="screenshots/05-who-am-i-mobile-light.png" width="170" alt="05-who-am-i-mobile-light.png"> | <img src="screenshots/05-who-am-i-mobile-dark.png" width="170" alt="05-who-am-i-mobile-dark.png"> |  |
| Nhóm: Chi tiêu<br><sub>06-group-expenses</sub> | <img src="screenshots/06-group-expenses-mobile-light.png" width="170" alt="06-group-expenses-mobile-light.png"> | <img src="screenshots/06-group-expenses-mobile-dark.png" width="170" alt="06-group-expenses-mobile-dark.png"> | <img src="screenshots/06-group-expenses-desktop-light.png" width="260" alt="06-group-expenses-desktop-light.png"> |
| Nhóm: Số dư<br><sub>07-group-balances</sub> | <img src="screenshots/07-group-balances-mobile-light.png" width="170" alt="07-group-balances-mobile-light.png"> | <img src="screenshots/07-group-balances-mobile-dark.png" width="170" alt="07-group-balances-mobile-dark.png"> |  |
| Nhóm: Thành viên<br><sub>08-group-members</sub> | <img src="screenshots/08-group-members-mobile-light.png" width="170" alt="08-group-members-mobile-light.png"> |  |  |
| Khoản chi: chia đều<br><sub>09-expense-form-equal</sub> | <img src="screenshots/09-expense-form-equal-mobile-light.png" width="170" alt="09-expense-form-equal-mobile-light.png"> | <img src="screenshots/09-expense-form-equal-mobile-dark.png" width="170" alt="09-expense-form-equal-mobile-dark.png"> |  |
| Khoản chi: số tiền riêng<br><sub>10-expense-form-exact</sub> | <img src="screenshots/10-expense-form-exact-mobile-light.png" width="170" alt="10-expense-form-exact-mobile-light.png"> | <img src="screenshots/10-expense-form-exact-mobile-dark.png" width="170" alt="10-expense-form-exact-mobile-dark.png"> |  |
| Khoản chi: lỗi nhập<br><sub>11-expense-form-errors</sub> | <img src="screenshots/11-expense-form-errors-mobile-light.png" width="170" alt="11-expense-form-errors-mobile-light.png"> |  |  |
| Mã VietQR<br><sub>12-vietqr</sub> | <img src="screenshots/12-vietqr-mobile-light.png" width="170" alt="12-vietqr-mobile-light.png"> | <img src="screenshots/12-vietqr-mobile-dark.png" width="170" alt="12-vietqr-mobile-dark.png"> | <img src="screenshots/12-vietqr-desktop-light.png" width="260" alt="12-vietqr-desktop-light.png"> |
| Sửa thành viên<br><sub>13-member-form</sub> | <img src="screenshots/13-member-form-mobile-light.png" width="170" alt="13-member-form-mobile-light.png"> |  |  |
| Chọn ngân hàng<br><sub>14-bank-picker</sub> | <img src="screenshots/14-bank-picker-mobile-light.png" width="170" alt="14-bank-picker-mobile-light.png"> |  |  |
| Chia sẻ link nhóm<br><sub>15-share-link</sub> | <img src="screenshots/15-share-link-mobile-light.png" width="170" alt="15-share-link-mobile-light.png"> |  |  |
| Xóa nhóm<br><sub>16-delete-group</sub> | <img src="screenshots/16-delete-group-mobile-light.png" width="170" alt="16-delete-group-mobile-light.png"> |  |  |
| Không tìm thấy nhóm<br><sub>17-group-not-found</sub> | <img src="screenshots/17-group-not-found-mobile-light.png" width="170" alt="17-group-not-found-mobile-light.png"> |  |  |
| Đang tải nhóm<br><sub>18-group-loading</sub> | <img src="screenshots/18-group-loading-mobile-light.png" width="170" alt="18-group-loading-mobile-light.png"> |  |  |
| So sánh 3 font<br><sub>19-fonts</sub> |  |  | <img src="screenshots/19-fonts-desktop-light.png" width="260" alt="19-fonts-desktop-light.png"> |
| UI kit<br><sub>20-ui-kit</sub> |  |  | <img src="screenshots/20-ui-kit-desktop-light.png" width="260" alt="20-ui-kit-desktop-light.png"> |
