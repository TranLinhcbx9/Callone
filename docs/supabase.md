# Supabase của Callone

Backend của Callone là Supabase, không có server riêng. Mọi thứ nằm trong thư mục `supabase/`:

```
supabase/
  config.toml           # cấu hình stack local (đã tắt các dịch vụ chưa cần)
  migrations/           # mỗi thay đổi schema là 1 file SQL, chạy theo thứ tự timestamp
  seed.sql              # dữ liệu mẫu, chỉ chạy ở local
  tests/database/       # test pgTAP
```

Module Chia tiền (`bill-split`) dùng schema riêng `bill_split` chứa bảng và hàm nội bộ, không lộ ra API. Client chỉ gọi 12 hàm `public.bs_*`. Hợp đồng đầy đủ ở [docs/contracts/bill-split-api.md](contracts/bill-split-api.md).

## Chạy ở máy

Cần Docker Desktop đang chạy. Lần đầu `db:start` tải vài GB image nên cần chỗ trống ở ổ chứa dữ liệu Docker.

```bash
npm run db:start      # bật stack local
npm run db:status     # xem URL và key
cp .env.example .env.local   # rồi điền URL và Publishable key lấy từ db:status
npm run dev
```

| Thành phần | Địa chỉ |
|---|---|
| API (PostgREST qua Kong) | http://127.0.0.1:54321 |
| Studio (xem bảng, chạy SQL) | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Biến môi trường của frontend (`.env.local`, không commit):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # lấy từ npm run db:status
```

Stack local chỉ bật API, Postgres, Studio và Auth. Realtime, Storage, Edge Runtime, Analytics và mailpit đang tắt trong `config.toml` cho nhẹ. Cần dịch vụ nào thì đổi `enabled = true` ở mục tương ứng rồi chạy lại `npm run db:start`.

`npm run db:stop` tắt stack, dữ liệu local được giữ lại trong volume Docker.

## Reset, test, lint, types

| Lệnh | Việc |
|---|---|
| `npm run db:reset` | Tạo lại database local: chạy toàn bộ migration rồi `seed.sql` |
| `npm run db:test` | Chạy test pgTAP trong `supabase/tests/database/` |
| `npm run db:lint` | Lint các hàm plpgsql của database local (plpgsql_check) |
| `npm run db:types` | Sinh lại `src/shared/types/database.types.ts` từ database local |
| `npx supabase db advisors --local --type security` | Security advisor chạy trên database local |

Test `08_bill_split_seed` kiểm dữ liệu mẫu nên chạy sau `db:reset`. Nếu bạn đã sửa hay xóa hai nhóm mẫu bằng giao diện và test này đỏ, chạy lại `npm run db:reset`.

Sau khi đổi chữ ký hàm API hoặc kiểu trả về, nhớ chạy `npm run db:types` và commit file kiểu cùng migration.

## Thêm migration

```bash
npm run db:new -- ten_ngan_gon     # tạo supabase/migrations/<timestamp>_ten_ngan_gon.sql
```

Viết SQL vào file mới, rồi `npm run db:reset` để thử và `npm run db:test` để kiểm. Không sửa migration đã đẩy lên cloud, hãy thêm migration mới.

Quy tắc khi đụng tới module Chia tiền:

- Hàm mới: `security definer`, `set search_path = ''`, gọi mọi tên đầy đủ schema (`bill_split.groups`, `extensions.gen_random_bytes`).
- Hàm `public.*` mới phải `revoke all ... from public, anon, authenticated` rồi `grant execute ... to anon, authenticated`. Postgres và Supabase cấp EXECUTE rộng theo mặc định nên bước revoke là bắt buộc.
- Không overload. Muốn đổi chữ ký thì `drop function` chữ ký cũ trong cùng migration, nếu không bản cũ vẫn gọi được và client có thể gặp lỗi `PGRST203`.
- Cuối migration có thêm đối tượng vào `bill_split`, lặp lại khối `revoke all on all tables/sequences/functions in schema bill_split from public, anon, authenticated`.
- Mọi truy vấn trên dữ liệu nhóm phải có `group_id = <nhóm của token>`. Test `06_bill_split_isolation` bắt các lỗ hổng kiểu này.
- Đổi hợp đồng thì báo người điều phối, cập nhật `docs/contracts/bill-split-api.md` và test.

## Đưa lên Supabase cloud

1. Vào https://supabase.com, tạo project (gói Free). Chọn region gần Việt Nam, ví dụ Singapore. Ghi lại mật khẩu database và project ref.
2. Đăng nhập CLI và liên kết project:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Đẩy migration:
   ```bash
   npm run db:push
   ```
   `db push` chỉ chạy migration, **không chạy `seed.sql`**, nên cloud không có dữ liệu mẫu.
4. Lấy URL và publishable key: Dashboard > Project Settings > API Keys. Dùng key dạng `sb_publishable_...`, không bao giờ đưa secret key hay `service_role` vào frontend.
5. Đặt biến môi trường trên Vercel (Project Settings > Environment Variables, chọn Production và Preview):
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Vite nhúng biến này lúc build nên phải deploy lại sau khi đổi.
6. Chạy `npx supabase db advisors --linked --type security` để xem cảnh báo bảo mật của project cloud.

## Security advisor: cảnh báo có chủ đích

Supabase security advisor sẽ cảnh báo 12 hàm `public.bs_*` vì chúng là `SECURITY DEFINER` và `anon` gọi được (lint `anon_security_definer_function_executable`, kèm bản `authenticated_security_definer_function_executable` cho người đã đăng nhập). Đây là **chủ đích** của thiết kế:

- Không có đăng nhập, ai giữ token nhóm thì đọc và ghi được nhóm đó. Các hàm này là cửa duy nhất vào dữ liệu.
- Bảng nằm trong schema `bill_split`, `anon` và `authenticated` không có USAGE trên schema, không có quyền nào trên bảng, RLS bật và không có policy. Đi đường bảng (ví dụ `GET /rest/v1/groups`) là không thể.
- Mỗi hàm kiểm token (24 ký tự base64url, chỉ lưu sha256), giới hạn mọi truy vấn theo nhóm của token và trả cùng một lỗi `BS_GROUP_NOT_FOUND` cho mọi token không hợp lệ.
- Test `01_bill_split_security` khẳng định tập hàm `anon` gọi được là đúng 12 hàm `bs_*`. Có hàm thứ 13 hay hàm nội bộ bị lộ thì test đỏ.

Không cần "sửa" các cảnh báo này. Nếu thấy cảnh báo về hàm khác, bảng khác hay `function_search_path_mutable` thì đó mới là vấn đề thật.

## Quản lý dữ liệu

- **Giới hạn mỗi nhóm**: 50 thành viên, 5000 khoản chi, 5000 thanh toán.
- **Giới hạn tạo nhóm**: toàn hệ thống tối đa 30 nhóm mới trong 10 phút (`BS_RATE_LIMITED`). Nếu thấy lỗi này khi test tay liên tục ở local, đợi 10 phút hoặc chạy `npm run db:reset`.
- **Xóa nhóm là xóa mềm** (`deleted_at`), dữ liệu vẫn nằm trong bảng. Dọn hẳn các nhóm đã xóa lâu ngày bằng SQL (Studio hoặc `psql`), xóa cứng cả nhóm chạy được vì các khóa ngoại trỏ tới `members` được hoãn kiểm tra:
  ```sql
  delete from bill_split.groups where deleted_at < now() - interval '30 days';
  ```
- Token chỉ hiện ở lần tạo hoặc đổi token. Mất token là mất quyền truy cập nhóm, database không lưu token gốc nên không khôi phục được.

## Gói Free của Supabase

- Project Free bị **tạm dừng sau khoảng 7 ngày không có hoạt động**. Khi đó app báo lỗi mạng cho tới khi bạn vào Dashboard bấm Restore project (dữ liệu vẫn còn). Có người dùng thường xuyên thì không bị.
- Hạn mức dung lượng và số project của gói Free do Supabase quy định và có thể đổi, xem bảng giá hiện tại trên trang Pricing.

## Gỡ rối

| Triệu chứng | Cách xử lý |
|---|---|
| `db:start` treo hoặc báo thiếu dung lượng | Kiểm tra Docker Desktop đã chạy và ổ chứa dữ liệu Docker còn trống |
| Cổng 54321, 54322 hoặc 54323 đang bị chiếm | `npm run db:stop` các project Supabase khác, hoặc đổi cổng trong `config.toml` |
| Client nhận `PGRST202` | Chữ ký hàm khác với client gọi: chạy lại `npm run db:reset` rồi `npm run db:types` |
| Client nhận `PGRST203` | Có hàm bị overload. Tìm hàm trùng tên bằng `\df public.bs_*` và `drop function` bản cũ |
| `db:reset` lỗi ở migration | Sửa migration rồi chạy lại. Migration chưa đẩy lên cloud thì được phép sửa |
