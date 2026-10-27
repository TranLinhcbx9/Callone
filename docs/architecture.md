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
    pwa.ts                  # đăng ký service worker, nhắc cập nhật khi có bản mới
    preloadError.ts         # tải lại một lần khi chunk cũ bị xóa sau deploy
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
public/                     # icon, favicon (được precache)
docs/
  contracts/                # hợp đồng API từng module
  design/                   # design spec, ảnh chụp
vite.config.ts              # Vite, PWA (manifest, precache), header cho `vite preview`
vercel.json                 # rewrite SPA, header bảo mật, cache
.vercelignore               # thứ không đưa lên Vercel khi `npm run deploy`
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

## Thêm module mới

Ví dụ dưới đây thêm module Nhật ký với id `journal` và tiền tố hàm database `jn`. Mỗi bước có một chỗ tham chiếu thật trong module `bill-split`.

### 1. Thư mục và cửa chính

Tạo `src/modules/journal/` theo bố cục ở trên. Tối thiểu cần `index.ts` và `routes.ts`; `api/`, `domain/`, `hooks/`, `components/`, `pages/` thêm khi cần. Module chỉ import từ `@/shared/...` và chính nó (`@/modules/journal/...`).

`index.ts` export một `AppModule` và là file duy nhất `app/` được import. Không import trang ở đây, để cả module nằm ở chunk riêng:

```ts
import { BookOpen } from 'lucide-react'
import { journalRoutes } from '@/modules/journal/routes'
import type { AppModule } from '@/shared/types/module'

export const journalModule: AppModule = {
  id: 'journal',
  title: 'Nhật ký',
  description: 'Ghi lại một ngày của bạn.',
  icon: BookOpen,
  basePath: '/journal',
  access: 'private',
  status: 'soon',
  routes: journalRoutes,
}
```

Muốn giữ chỗ trên Home trước khi làm xong thì để `status: 'soon'` và `routes: []`.

### 2. Route

`routes.ts` khai báo route con, đường dẫn tương đối so với `basePath`, mọi trang lazy-load (xem `src/modules/bill-split/routes.ts`):

```ts
import type { RouteObject } from 'react-router'

export const journalRoutes: RouteObject[] = [
  {
    index: true,
    lazy: () => import('@/modules/journal/pages/JournalHomePage').then((m) => ({ Component: m.JournalHomePage })),
  },
]
```

Không phải sửa `router.tsx`: nó sinh route từ registry, bọc mỗi module trong `ModuleGate` và error boundary riêng. Khi đặt đường dẫn, đừng để đoạn cuối có đuôi dạng `.abc` (ví dụ `/journal/2026.10`): `vercel.json` và service worker coi đó là file chứ không phải trang của app.

### 3. Đăng ký

Một dòng trong `src/app/registry.ts`. Ô module trên Home tự xuất hiện từ danh sách này:

```ts
import { billSplitModule } from '@/modules/bill-split'
import { journalModule } from '@/modules/journal'

export const modules: readonly AppModule[] = [billSplitModule, journalModule]
```

### 4. Chặn import chéo

Luật chung chỉ chặn `shared/` và `app/`. Luật "module không import module khác" nằm trong từng khối riêng của `.oxlintrc.json`, nên module mới phải có khối của nó. Chép khối `src/modules/bill-split/**` rồi đổi id:

```json
{
  "files": ["src/modules/journal/**"],
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@/app", "@/app/**", "@/modules/**", "!@/modules/journal", "!@/modules/journal/**"],
            "message": "Module chỉ được import từ shared/ và chính nó."
          }
        ]
      }
    ]
  }
}
```

Quên bước này thì lint vẫn xanh dù module import thẳng module khác. Thử bằng cách viết một import sai rồi chạy `npm run lint`.

### 5. Tiền tố theo module

- **Query key** bắt đầu bằng id module, gom ở `api/keys.ts` như `billSplitKeys` (`['bill-split', 'group', token]`). Nhờ vậy xóa cache cả module chỉ cần một lệnh với `['journal']`.
- **localStorage** đi qua `createModuleStorage('journal')` trong `@/shared/lib/storage`, tự thêm tiền tố `callone:journal:` và không ném lỗi khi trình duyệt chặn. Không gọi `localStorage` trực tiếp.
- **Lỗi** có bảng dịch riêng ở `api/errors.ts`, dùng `toAppError` và `getErrorMessage` trong `@/shared/lib/errors`. Mã lỗi có tiền tố riêng (như `BS_` của Chia tiền).

### 6. Database

Làm theo [supabase.md](supabase.md):

1. `npm run db:new -- journal_schema`. Tạo schema riêng `journal` cho bảng và hàm nội bộ, bật RLS, thu hồi mọi quyền của `public`, `anon`, `authenticated` trên schema đó.
2. API công khai của module là các hàm `public.jn_*`: `security definer`, `set search_path = ''`, gọi mọi tên đầy đủ schema, `revoke all ... from public, anon, authenticated` rồi `grant execute ... to ...` đúng đối tượng cần, không overload.
3. Test pgTAP trong `supabase/tests/database/`, lấy bộ test của Chia tiền làm mẫu: tập hàm `anon` gọi được đúng bằng tập `jn_*` (`01_bill_split_security`), không đọc ghi thẳng bảng, dữ liệu giữa các phạm vi không lẫn nhau (`06_bill_split_isolation`).
4. `npm run db:reset`, `npm run db:test`, `npm run db:lint`, rồi `npm run db:types` và commit file kiểu cùng migration.
5. Hàm security definer mà `anon` gọi được sẽ bị security advisor cảnh báo. Nếu đó là chủ đích thì ghi lý do vào `supabase.md` như đã làm cho `bs_*`.

Mô hình "ai giữ token thì dùng được" của Chia tiền chỉ hợp với module không cần đăng nhập. Module `private` dùng RLS theo người dùng, xem phần cuối.

### 7. Hợp đồng API

Viết `docs/contracts/journal-api.md` trước khi viết SQL và client, làm nguồn sự thật chung cho hai phía. Lấy `docs/contracts/bill-split-api.md` làm mẫu: mô hình truy cập, bảng, quy tắc chung của hàm ghi, JSON trả về, mã lỗi, chữ ký từng hàm, dữ liệu mẫu, các test database bắt buộc.

Kiểu JSON trên đường truyền đặt ở `src/modules/journal/api/contract.ts`. Kiểu tham số và kết quả của từng hàm do `npm run db:types` sinh vào `src/shared/types/database.types.ts`. Đổi hợp đồng thì sửa tài liệu, kiểu và test cùng lúc.

### 8. Test và kiểm tra

- Logic thuần ở `domain/` có unit test cạnh file (`*.test.ts`), chạy bằng `npm test`. Test cần Supabase local đặt tên `*.int.test.ts`, chạy bằng `npm run test:int`.
- E2E thêm spec vào `e2e/`, chạy bằng `npm run e2e` trên bản build.
- Xong thì `npm run check` và `npm run build` phải sạch.

### `access: 'private'` nghĩa là gì

Hiện tại chưa có đăng nhập. `ModuleGate` không render trang của module `private`, chỉ hiện "Cần đăng nhập để dùng module này.". Module `status: 'soon'` hiện dạng "Sắp có" trên Home và `ModuleGate` hiện "Module này sắp ra mắt.".

Ở bước đăng nhập và phân quyền, `private` sẽ có nghĩa là: người dùng phải đăng nhập (Supabase Auth) và được cấp quyền đúng module đó (bảng phân quyền theo module, trang admin để cấp). `ModuleGate` chỉ cho vào khi đủ hai điều kiện, và phía database dùng RLS theo người dùng thay cho mô hình token. Vì vậy module cần đăng nhập cứ đặt `access: 'private'` từ đầu, và chưa nên viết hàm database mở cho `anon`.

## PWA, offline và cập nhật

- `vite-plugin-pwa` (cấu hình trong `vite.config.ts`) sinh `manifest.webmanifest` và `sw.js` khi build. Dev server không có service worker.
- **Precache**: html, js, css, woff2, svg, png của bản build, gồm mọi chunk lazy-load. App mở được khi mất mạng. Module mới tự được precache, không cần cấu hình thêm.
- **Không có runtimeCaching**: dữ liệu Supabase là cross-origin và luôn đi thẳng ra mạng, service worker không bao giờ lưu. `e2e/pwa.spec.ts` sẽ đỏ nếu ai đó thêm chiến lược cache lúc chạy.
- Mở link hay tải lại thì `index.html` lấy từ precache (trừ đường dẫn có đuôi file), router dựng trang.
- **Cập nhật kiểu `prompt`**: service worker mới tải sẵn ở nền rồi chờ. `src/app/pwa.ts` hiện toast "Đã có phiên bản mới" với nút "Cập nhật" và giữ nguyên cho tới khi được xử lý. Bấm thì bản mới kích hoạt và trang tải lại. App không tự tải lại vì có thể đang nhập dở một khoản chi. Tab khác của app chỉ được nhắc "Tải lại". Tải lại trang bằng tay không áp bản mới, vì service worker cũ còn giữ trang: phải bấm "Cập nhật" hoặc đóng hết các tab.
- Khi người dùng quay lại app (`visibilitychange`), app hỏi trình duyệt có bản mới không, tối đa một lần mỗi 30 phút. Cần vì app cài trên điện thoại ít khi được mở lại từ đầu.

**Phối hợp với `preloadError.ts`.** Sau mỗi deploy, chunk cũ bị xóa khỏi hosting:

| Tình huống | Chuyện xảy ra |
|---|---|
| Tab mở lâu, đã có service worker điều khiển | Chunk cũ vẫn lấy được từ precache của service worker cũ, tab không gặp lỗi. Bản mới chờ ở nền cho tới khi người dùng bấm "Cập nhật" |
| Chưa có service worker điều khiển (lần mở đầu, trình duyệt không hỗ trợ, tải lại cứng) | Lazy-load chunk cũ lỗi, Vite phát `vite:preloadError`, `preloadError.ts` tải lại trang đúng một lần. Cờ trong sessionStorage chặn vòng lặp tải lại |

Hai cơ chế bù nhau và không giẫm nhau. Do đó `vercel.json` phải trả 404 thật cho file có đuôi mà không tồn tại (không rewrite về `index.html`): trả HTML cho một chunk thiếu chỉ đổi lỗi rõ ràng thành lỗi MIME khó đọc.

## Hosting và header bảo mật

`vercel.json` là nơi duy nhất khai báo hosting:

- **Rewrite SPA**: mọi đường dẫn không có đuôi file được trả `index.html`. Vercel kiểm file tĩnh trước rồi mới áp rewrite, nên file thật luôn được ưu tiên.
- **Cache**: `/assets/*` có hash nên `public, max-age=31536000, immutable`. `index.html`, `sw.js`, `manifest.webmanifest`, `registerSW.js` là `no-cache` để bản mới tới ngay.
- **Header bảo mật** cho mọi phản hồi:

| Header | Vì sao |
|---|---|
| `Referrer-Policy: no-referrer` | Link nhóm chứa token bí mật trong đường dẫn, không được lộ qua header Referer. Quan trọng nhất |
| `X-Content-Type-Options: nosniff` | Không cho trình duyệt đoán kiểu file |
| `Permissions-Policy` | Tắt camera, micro, vị trí, thanh toán, USB, Bluetooth, cảm biến... vì app không dùng. Giữ nguyên clipboard (nút Dán, Sao chép link) và Web Share |
| `Content-Security-Policy` | Script chỉ từ chính app, không inline, không eval. Kết nối chỉ tới chính app và đúng project Supabase đang dùng. Không cho nhúng vào khung (`frame-ancestors 'none'`) |

`style-src` có `'unsafe-inline'` vì sonner và các thư viện Radix (Dialog, Select, ScrollArea) chèn thẻ `<style>` lúc chạy. Script thì không nới.

Thêm dịch vụ bên ngoài (API, ảnh, font, thống kê) hay đổi Supabase sang tên miền riêng thì sửa CSP trong `vercel.json`. `vite preview` đọc đúng mục `/(.*)` của file này (xem `vite.config.ts`) và thêm origin của `VITE_SUPABASE_URL` vào `connect-src` để chạy được với Supabase local, nên `npm run e2e` luôn chạy dưới đúng CSP sẽ deploy. `e2e/pwa.spec.ts` kiểm các header này và báo vi phạm CSP trên trang chủ và trang Chia tiền.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở máy |
| `npm run check` | Lint, typecheck, unit test |
| `npm run build` | Build production |
| `npm run preview` | Chạy thử bản build, có service worker và header như khi deploy |
| `npm run deploy` | Deploy lên production trên Vercel (cần `vercel login` và `vercel link` trước) |
| `npm run test:int` | Test tích hợp với Supabase local |
| `npm run e2e` | Playwright |
| `npm run db:start`, `db:stop`, `db:status` | Bật, tắt, xem Supabase local |
| `npm run db:reset` | Chạy lại toàn bộ migration và seed |
| `npm run db:test` | Test pgTAP |
| `npm run db:types` | Sinh lại `database.types.ts` |
| `npm run db:push` | Đẩy migration lên Supabase cloud |
