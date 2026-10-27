# Callone

Super app cá nhân gồm nhiều module độc lập, dùng trên điện thoại và máy tính, cài ra màn hình chính như một ứng dụng (PWA). Module đầu tiên là Chia tiền: chia tiền đi chơi với hội bạn qua một link bí mật, không cần đăng nhập, trả nợ bằng mã VietQR.

## Công nghệ

| Lớp | Dùng |
|---|---|
| Giao diện | Vite 8, React 19, TypeScript 6, Tailwind CSS 4, shadcn/ui (Radix), sonner |
| Điều hướng và dữ liệu | React Router 7, TanStack Query 5 |
| Backend | Supabase (Postgres, gọi qua các hàm RPC), không có server riêng |
| PWA | vite-plugin-pwa 2 (Workbox), có hỏi người dùng trước khi cập nhật |
| Test | Vitest, pgTAP (Supabase CLI), Playwright |
| Lint | oxlint, kèm luật chặn import sai tầng giữa các module |
| Deploy | Vercel cho frontend, Supabase cloud cho database |

## Yêu cầu

- Node.js 20.19 trở lên.
- Docker Desktop đang chạy, để chạy Supabase ở máy. Lần đầu tải vài GB image.
- Microsoft Edge để chạy `npm run e2e` (Playwright dùng Edge có sẵn trên Windows).

## Chạy ở máy

```bash
npm install
npm run db:start                # bật Supabase local
npm run db:status               # xem URL và Publishable key
cp .env.example .env.local      # rồi điền URL và key vừa xem
npm run dev
```

Mở địa chỉ Vite in ra (mặc định http://localhost:5173). Database local có hai nhóm mẫu (chạy `npm run db:reset` nếu chưa thấy), ví dụ http://localhost:5173/bill-split/g/dalat-demo-token-2026-ok.

`.env.local` không được commit. Chi tiết về Supabase local ở [docs/supabase.md](docs/supabase.md).

Service worker chỉ có ở bản build, `npm run dev` không có. Muốn thử PWA ở máy thì chạy `npm run build` rồi `npm run preview`.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở máy |
| `npm run build` | Kiểm tra kiểu rồi build production vào `dist` |
| `npm run preview` | Chạy thử bản build, có đủ header bảo mật như khi deploy |
| `npm run check` | Lint, typecheck, unit test |
| `npm run lint`, `npm run typecheck`, `npm test` | Từng bước của `check` |
| `npm run test:int` | Test tích hợp với Supabase local |
| `npm run e2e` | Playwright, tự build vào `dist-e2e` rồi chạy trên bản build đó |
| `npm run db:start`, `db:stop`, `db:status` | Bật, tắt, xem Supabase local |
| `npm run db:reset` | Chạy lại toàn bộ migration và seed |
| `npm run db:test`, `db:lint` | Test pgTAP, lint hàm plpgsql |
| `npm run db:new -- ten_ngan_gon` | Tạo migration mới |
| `npm run db:types` | Sinh lại `src/shared/types/database.types.ts` |
| `npm run db:push` | Đẩy migration lên Supabase cloud |
| `npm run deploy` | Deploy lên production trên Vercel |
| `npm run deploy:preview` | Deploy bản preview để xem thử |

## Cấu trúc thư mục

```
src/app/        khung app: danh sách module, router, PWA
src/modules/    mỗi module một thư mục, hiện có bill-split
src/shared/     dùng chung: ui, lib, hooks, types
supabase/       migration, test pgTAP, seed
e2e/            Playwright
public/         icon và favicon
docs/           kiến trúc, hợp đồng API, thiết kế, Supabase
vercel.json     rewrite SPA, header bảo mật, cache
```

Quy tắc phụ thuộc, hợp đồng module và cách thêm module mới ở [docs/architecture.md](docs/architecture.md).

## Đưa lên mạng

Kết quả cuối cùng là một link production công khai để bạn bè mở và cài như ứng dụng. Frontend chạy trên Vercel, database trên Supabase cloud. Làm Supabase trước vì Vercel cần URL và key của nó.

### 1. Supabase cloud

1. Vào https://supabase.com, tạo project tên `callone`, chọn region gần Việt Nam (Singapore hoặc Seoul). Tự đặt và giữ mật khẩu database.
2. Ở terminal của bạn, đăng nhập và liên kết project (project ref nằm trong URL của dashboard):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
   CLI hỏi mật khẩu database ở bước `link`.
3. Đẩy migration lên cloud:
   ```bash
   npm run db:push
   ```
   `db push` chỉ chạy migration, không chạy `seed.sql`, nên cloud không có nhóm mẫu.
4. Lấy Project URL (`https://<project-ref>.supabase.co`) và publishable key (`sb_publishable_...`) ở Dashboard > Project Settings > API Keys. Không bao giờ đưa secret key hay `service_role` vào frontend.

Gói Free của Supabase tự tạm dừng sau khoảng 7 ngày không dùng. Cảnh báo bảo mật có chủ đích và cách xử lý nằm trong [docs/supabase.md](docs/supabase.md#đưa-lên-supabase-cloud).

### 2. Vercel

Project Vercel nối với repo GitHub. **Push lên `main` là Vercel tự build và đưa lên production.** Push nhánh khác thì Vercel tạo bản preview.

Thiết lập một lần, bằng Vercel CLI (đã có sẵn trong `devDependencies`):

```bash
npx vercel login
npx vercel link
npx vercel env add VITE_SUPABASE_URL "production,preview"
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY "production,preview"
```

- `vercel link`: chọn tài khoản của bạn, tạo project mới tên `callone`, thư mục `./`. CLI tự nối project với repo GitHub trong `git remote`. Nếu CLI hỏi có muốn sửa cấu hình build không thì trả lời không, vì `vercel.json` đã khai báo framework Vite, lệnh `npm run build` và thư mục `dist`.
- `vercel env add`: CLI hỏi giá trị, dán Project URL rồi publishable key ở bước trên.

Từ đó mỗi lần deploy chỉ là:

```bash
git push origin main
```

Lưu ý:

- `main` là production, nên chỉ push code đã qua `npm run check` và e2e. Muốn xem thử thì push nhánh khác để có link preview.
- Vite nhúng hai biến môi trường vào bản build, nên đổi giá trị thì phải deploy lại (push lại, hoặc Redeploy trong dashboard Vercel).
- Với bảo vệ mặc định của Vercel (Standard Protection), địa chỉ preview và địa chỉ riêng của từng lần deploy cần đăng nhập Vercel. Gửi cho bạn bè địa chỉ production, dạng `https://callone.vercel.app`. Nếu bạn bè thấy trang đăng nhập Vercel ở địa chỉ production thì vào Settings > Deployment Protection để kiểm tra.
- Không qua GitHub cũng deploy được bằng CLI: `npm run deploy` (production) hoặc `npm run deploy:preview`. Khi đó `.vercelignore` giữ những thứ như `.cache`, `.env*`, `dist` không bị tải lên, vì Vercel CLI không đọc `.gitignore`.
- Vercel đã tắt Node.js 20 từ 1/10/2026 nên bản build trên Vercel chạy Node mới hơn: `engines.node` là `>=20.19.0`, Vercel chọn bản mới nhất còn hỗ trợ (hiện là 24.x). Máy bạn vẫn dùng Node 20.19 bình thường.
- Header bảo mật (CSP, Referrer-Policy...) nằm trong `vercel.json`. CSP chỉ cho kết nối tới chính app và project Supabase đang dùng (`https://alnlxjpjwksphndikymq.supabase.co`). Đổi sang project khác hay dùng tên miền riêng thì sửa origin trong `connect-src` của `vercel.json`.

## Cài như một ứng dụng

Mở link production rồi cài ra màn hình chính. App mở được cả khi mất mạng, nhưng dữ liệu nhóm vẫn cần mạng. Khi có bản mới, app hiện thông báo "Đã có phiên bản mới" kèm nút "Cập nhật". App không tự tải lại để khỏi mất khoản chi đang nhập dở.

**iPhone**

1. Mở link bằng Safari. Không dùng trình duyệt trong Zalo hay Messenger vì không cài được.
2. Bấm nút Chia sẻ, chọn "Thêm vào MH chính" (Add to Home Screen), bấm Thêm.

**Android**

1. Mở link bằng Chrome.
2. Bấm menu ba chấm, chọn "Cài đặt ứng dụng" (hoặc "Thêm vào màn hình chính").

**Máy tính**: Chrome hoặc Edge hiện nút cài ở cuối thanh địa chỉ.

App cài trên màn hình chính iPhone không dùng chung bộ nhớ với Safari, nên nhóm đã mở trong Safari sẽ không có sẵn trong app. Dán link nhóm vào ô "Dán link nhóm" ở trang Chia tiền để mở lại.

## Link nhóm là bí mật

Chia tiền không có đăng nhập. Ai có link nhóm đều xem và sửa được nhóm đó, giống Tricount, nên chỉ gửi link cho người trong hội.

- Database chỉ lưu mã băm của token trong link, không lưu token gốc. Mất link là không khôi phục được.
- Link lộ ra ngoài thì vào tab Thành viên, mục chia sẻ, bấm "Đổi link mới". Link cũ mất hiệu lực ngay.
- App đặt `Referrer-Policy: no-referrer` để link không bị gửi kèm sang trang khác khi bấm vào liên kết ngoài.

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Cấu trúc, quy tắc phụ thuộc, hợp đồng module, thêm module mới, PWA |
| [docs/supabase.md](docs/supabase.md) | Supabase local và cloud, migration, bảo mật, gỡ rối |
| [docs/contracts/bill-split-api.md](docs/contracts/bill-split-api.md) | Hợp đồng API của module Chia tiền |
| [docs/design/ui-spec.md](docs/design/ui-spec.md) | Đặc tả giao diện |
