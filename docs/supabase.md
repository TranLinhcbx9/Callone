# Supabase của Callone

Backend của Callone là Supabase, không có server riêng. Mọi thứ nằm trong thư mục `supabase/`:

```
supabase/
  config.toml           # cấu hình stack local (đã tắt các dịch vụ chưa cần)
  migrations/           # mỗi thay đổi schema là 1 file SQL, chạy theo thứ tự timestamp
  seed.sql              # dữ liệu mẫu, chỉ chạy ở local
  tests/database/       # test pgTAP
```

Module Chia tiền (`bill-split`) dùng schema riêng `bill_split` chứa bảng và hàm nội bộ, không lộ ra API. Client chỉ gọi 12 hàm `public.bs_*`. Hợp đồng đầy đủ (hiện là phiên bản 1.1) ở [docs/contracts/bill-split-api.md](contracts/bill-split-api.md).

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

Test `08_bill_split_seed` kiểm dữ liệu mẫu nên chạy sau `db:reset`. Nếu bạn đã sửa hay xóa hai nhóm mẫu bằng giao diện, hoặc đã đổi `bill_split.settings`, và test này đỏ, chạy lại `npm run db:reset`. Các test còn lại tự dựng dữ liệu trong một transaction rồi rollback, không phụ thuộc seed và không để lại gì (kể cả test giới hạn tạo nhóm, tự đặt lại `settings` và `create_log` trong transaction của nó).

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
   `db push` chỉ chạy migration, **không chạy `seed.sql`**, nên cloud không có dữ liệu mẫu và dùng giới hạn tạo nhóm mặc định (5 lần mỗi client, 100 lần toàn hệ thống trong 10 phút; chỉnh bằng SQL Editor, xem mục Giới hạn tạo nhóm).
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

- **Giới hạn mỗi nhóm**: 50 thành viên, 1000 khoản chi, 1000 thanh toán. Một nhóm đầy tối đa (50 thành viên, 1000 khoản chi chia cho cả 50 người, 1000 thanh toán, mọi trường dài hết cỡ) có snapshot khoảng 6 MB và tải mất chừng nửa giây. Với giới hạn cũ 5000 thì snapshot lên tới 29 MB và hơn 2 giây, sát mức 3 giây là thời gian tối đa mỗi câu lệnh của role `anon` trên Supabase.
- **Giới hạn tạo nhóm** (`BS_RATE_LIMITED`): xem mục ngay dưới.
- **Xóa nhóm là xóa mềm** (`deleted_at`), dữ liệu vẫn nằm trong bảng. Dọn hẳn các nhóm đã xóa lâu ngày bằng SQL (Studio hoặc `psql`), xóa cứng cả nhóm chạy được vì các khóa ngoại trỏ tới `members` được hoãn kiểm tra:
  ```sql
  delete from bill_split.groups where deleted_at < now() - interval '30 days';
  ```
  Token của nhóm đã xóa mềm không dùng lại được (`token_hash` unique tính cả nhóm đã xóa). Xóa cứng thì token đó trống lại.
- Token chỉ hiện ở lần tạo hoặc đổi token. Mất token là mất quyền truy cập nhóm, database không lưu token gốc nên không khôi phục được. Token do client sinh nên chính client là nơi duy nhất giữ nó.

### Giới hạn tạo nhóm

`bs_create_group` giới hạn theo cửa sổ trượt 10 phút: mỗi client tối đa 5 nhóm mới và toàn hệ thống tối đa 100. Vượt thì trả `BS_RATE_LIMITED` (HTTP 429).

- **Nhật ký**: mỗi lần tạo nhóm thành công thêm một dòng vào `bill_split.create_log` (khóa client và thời điểm). Mỗi lần có người tạo nhóm, các dòng cũ hơn 10 phút bị xóa, nên bảng chỉ giữ cửa sổ hiện tại (tối đa 100 dòng với giới hạn mặc định). Nếu nhiều ngày không ai tạo nhóm thì vài dòng cuối vẫn nằm đó, xóa tay được bằng `delete from bill_split.create_log;`.
- **Khóa client** là sha256 của IP, lấy từ header PostgREST đặt vào `request.headers`: `cf-connecting-ip` (Supabase cloud đi qua Cloudflare, đây là IP thật và client không giả được), không có thì địa chỉ đầu tiên của `x-forwarded-for`, rồi `x-real-ip`. Không có header nào thì mọi request như vậy dùng chung một bucket tên `unknown`. Hai header sau client tự đặt được nếu không đi qua Cloudflare, nên giới hạn toàn hệ thống mới là chốt chặn cuối. IPv6 tính theo từng địa chỉ đầy đủ. Băm sha256 không làm IP thành ẩn danh (IPv4 chỉ có 2^32 giá trị nên dò ngược được), vì thế bảng chỉ giữ 10 phút.
- **Không tính** vào giới hạn: lần gửi lại cùng `p_token` (nhận lại nhóm đã tạo) và lần bị từ chối vì dữ liệu sai.
- **Ghi đè** hai mức bằng bảng `bill_split.settings` (thiếu dòng nào thì dùng mặc định 5 hoặc 100). Chạy trong Studio hoặc `psql`:
  ```sql
  -- Nới hoặc siết
  insert into bill_split.settings (key, value)
  values ('create_limit_client', 10), ('create_limit_global', 200)
  on conflict (key) do update set value = excluded.value;

  -- Công tắc khẩn: ngưng nhận nhóm mới ngay, nhóm có sẵn vẫn dùng bình thường
  insert into bill_split.settings (key, value) values ('create_limit_global', 0)
  on conflict (key) do update set value = 0;

  -- Về mặc định
  delete from bill_split.settings;

  -- Xem ai đang tạo nhiều (khóa client là băm, 'unknown' là request không có header IP)
  select client_hash, count(*) from bill_split.create_log group by 1 order by 2 desc;
  ```
- **Local**: `seed.sql` đặt cả hai mức là 1 000 000, vì qua Kong mọi request local có cùng một IP và e2e tạo nhóm liên tục. `db push` không chạy seed nên cloud dùng mặc định. Nếu thấy `BS_RATE_LIMITED` khi test tay ở local, chạy `npm run db:reset` (hoặc xem `settings` ở trên).

## Gói Free của Supabase

- Project Free bị **tạm dừng sau khoảng 7 ngày không có hoạt động**. Khi đó app báo lỗi mạng cho tới khi bạn vào Dashboard bấm Restore project (dữ liệu vẫn còn). Có người dùng thường xuyên thì không bị.
- Hạn mức dung lượng và số project của gói Free do Supabase quy định và có thể đổi, xem bảng giá hiện tại trên trang Pricing.

## Gỡ rối

| Triệu chứng | Cách xử lý |
|---|---|
| `db:start` treo hoặc báo thiếu dung lượng | Kiểm tra Docker Desktop đã chạy và ổ chứa dữ liệu Docker còn trống |
| Cổng 54321, 54322 hoặc 54323 đang bị chiếm | `npm run db:stop` các project Supabase khác, hoặc đổi cổng trong `config.toml` |
| Client nhận `PGRST202` | Chữ ký hàm khác với client gọi (ví dụ client gửi `p_token` hay `p_new_token` mà database chưa có phiên bản 1.1): chạy lại `npm run db:reset` rồi `npm run db:types` |
| Client nhận `PGRST203` | Có hàm bị overload. Tìm hàm trùng tên bằng `\df public.bs_*` và `drop function` bản cũ |
| `db:reset` lỗi ở migration | Sửa migration rồi chạy lại. Migration chưa đẩy lên cloud thì được phép sửa |
| `BS_RATE_LIMITED` ở local | Seed nâng giới hạn lên 1 000 000. Gặp lỗi này nghĩa là `bill_split.settings` đã bị sửa hoặc database chưa seed: chạy `npm run db:reset` |
| Trên cloud ai cũng bị `BS_RATE_LIMITED` dù ít người dùng | Có thể request không mang header IP nên cùng rơi vào bucket `unknown` (5 lần mỗi 10 phút cho tất cả). Chạy `select client_hash, count(*) from bill_split.create_log group by 1;`: nếu gần như toàn `unknown` thì header IP không tới được PostgREST, nới `create_limit_client` trong `settings` |
| Cần ngưng nhận nhóm mới gấp | Đặt `create_limit_global` bằng 0 như trong mục Giới hạn tạo nhóm |
