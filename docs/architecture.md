# Kiến trúc Callone

Callone là super app cá nhân gồm nhiều module độc lập. Frontend là SPA Vite + React chạy được như PWA. Backend là Supabase, không có server riêng.

## Cấu trúc thư mục

```
src/
  main.tsx                  # điểm vào
  app/                      # khung app, nơi duy nhất biết danh sách module
    registry.ts             # danh sách module: thêm module = thêm 1 dòng
    router.tsx              # sinh routes từ registry, lazy-load từng trang
    ModuleGate.tsx          # chặn module 'soon' và module 'private' khi chưa đăng nhập
    providers.tsx           # React Query, Toaster
    layout/                 # AppShell
    pages/                  # Home, NotFound, RouteError
    dev/                    # /dev: UI kit và mockup, chỉ có khi chạy dev
  modules/
    <id>/
      index.ts              # manifest AppModule, cửa chính duy nhất của module
      routes.ts             # route con, mọi trang lazy-load
      api/                  # hợp đồng API, gọi RPC, dịch lỗi
      domain/               # logic thuần có test, kiểu model
      hooks/                # React Query hooks
      components/           # component hiển thị, chỉ nhận props
      pages/                # trang: lấy dữ liệu qua hooks, ghép component
  shared/                   # dùng chung cho mọi module
    ui/                     # component shadcn/ui và UI kit
    lib/                    # supabase client, env, errors, format, date, id, storage
    hooks/
    types/                  # AppModule, database.types.ts
  styles/globals.css        # Tailwind và theme
supabase/
  migrations/               # mỗi thay đổi schema là 1 file SQL
  tests/database/           # test pgTAP
  seed.sql                  # dữ liệu mẫu, chỉ chạy ở local
e2e/                        # Playwright
docs/
  contracts/                # hợp đồng API từng module
  design/                   # design spec, ảnh chụp
```

## Quy tắc phụ thuộc

oxlint chặn các vi phạm sau, chạy `npm run lint` để kiểm:

- `shared/` không import từ `app/` hay `modules/`.
- Một module chỉ import từ `shared/` và chính nó, không import module khác.
- `app/` chỉ import module qua cửa chính `@/modules/<id>`. Riêng `app/dev/` được import sâu để làm mockup.
- Luôn import bằng alias `@/`. Cấm `../`.

Nhờ vậy xóa hay thêm một module không ảnh hưởng module khác.

## Hợp đồng module

Mỗi module export một `AppModule` từ `index.ts`, kiểu ở `src/shared/types/module.ts`:

| Trường | Ý nghĩa |
|---|---|
| `id` | kebab-case, dùng làm tiền tố cho query key và key localStorage |
| `title`, `description`, `icon` | Hiển thị trên Home |
| `basePath` | Ví dụ `/bill-split` |
| `access` | `public` ai cũng dùng được. `private` phải đăng nhập và được cấp quyền module, làm ở bước sau |
| `status` | `ready` hoặc `soon` |
| `routes` | Route con, đường dẫn tương đối, mọi trang lazy-load |
| `loadHomeWidget` | Tùy chọn, widget nhỏ trên Home |

Mỗi module có error boundary riêng trong router, lỗi một module không làm sập cả app.

## Database theo module

- Mỗi module có schema Postgres riêng chứa bảng, ví dụ `bill_split`. Schema này không lộ ra API.
- API công khai của module là các hàm `public.<tiền tố>_*`, ví dụ `bs_*` cho Chia tiền.
- Module cần đăng nhập ở bước sau sẽ dùng RLS theo người dùng và bảng phân quyền module.

## Quy ước chung

- **Chữ hiển thị bằng tiếng Việt.** Code, tên biến, tên file bằng tiếng Anh.
- **Tiền** là số nguyên đồng. Hiển thị bằng `formatVnd` trong `shared/lib/format.ts`.
- **Ngày** dạng `YYYY-MM-DD` theo giờ Việt Nam, lấy bằng `todayIsoDate()` trong `shared/lib/date.ts`.
- **Id** của bản ghi do client sinh bằng `newId()` để gửi lại khi rớt mạng không tạo bản ghi trùng.
- **Lỗi** đi qua `toAppError` và `getErrorMessage` trong `shared/lib/errors.ts`. Mỗi module có bảng dịch mã lỗi riêng.
- **localStorage** đi qua `createModuleStorage(moduleId)` trong `shared/lib/storage.ts`.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở máy |
| `npm run check` | Lint, typecheck, unit test |
| `npm run build` | Build production |
| `npm run test:int` | Test tích hợp với Supabase local |
| `npm run e2e` | Playwright |
| `npm run db:start`, `db:stop`, `db:status` | Bật, tắt, xem Supabase local |
| `npm run db:reset` | Chạy lại toàn bộ migration và seed |
| `npm run db:test` | Test pgTAP |
| `npm run db:types` | Sinh lại `database.types.ts` |
| `npm run db:push` | Đẩy migration lên Supabase cloud |
