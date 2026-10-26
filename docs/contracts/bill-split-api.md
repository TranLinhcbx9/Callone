# Hợp đồng API: module Chia tiền (bill-split), phiên bản 1

Tài liệu này là nguồn sự thật cho ba bên:
- **Agent supabase** viết SQL đúng theo đây.
- **Agent frontend** gọi API theo đây.
- **Agent ui-design** dựng component nhận dữ liệu theo các model ở `src/modules/bill-split/domain/types.ts`.

Kiểu TypeScript tương ứng:
- JSON trên đường truyền: `src/modules/bill-split/api/contract.ts`.
- Tham số và kiểu trả về của từng hàm: `src/shared/types/database.types.ts`. File này đang viết tay, agent supabase sẽ thay bằng bản sinh tự động và bản đó phải tương đương.

Muốn đổi hợp đồng thì báo người điều phối. Không tự đổi một mình.

## 1. Mô hình truy cập

- Không có đăng nhập. Ai giữ token của nhóm thì đọc và ghi được nhóm đó, giống Tricount.
- Token gồm 24 ký tự base64url, sinh từ 18 byte ngẫu nhiên:
  `translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')`. Mẫu kiểm tra: `^[A-Za-z0-9_-]{24}$`.
- Database chỉ lưu `token_hash = sha256(convert_to(token, 'UTF8'))`, kiểu `bytea`, unique. Không lưu token gốc ở bất kỳ đâu, kể cả log.
- Token sai định dạng, không tồn tại, đã bị đổi, hoặc nhóm đã xóa mềm đều trả cùng một lỗi `BS_GROUP_NOT_FOUND`. Không được để lộ trường hợp nào.
- Client luôn gọi bằng POST, là mặc định của `supabase.rpc`. Không dùng `{ get: true }` để token không nằm trong URL.

## 2. Bố cục database

| Schema | Chứa gì | Ai truy cập |
|---|---|---|
| `bill_split` | Bảng và hàm nội bộ của module | Không lộ qua API. `anon` và `authenticated` không có USAGE |
| `public` | Chỉ các hàm API `bs_*` | `anon` và `authenticated` được EXECUTE |

- Bật RLS trên mọi bảng `bill_split.*` và không tạo policy nào, làm lớp chặn dự phòng.
- Thu hồi mọi quyền trên schema, bảng, sequence và hàm của `bill_split` khỏi `public`, `anon`, `authenticated`.
- Mỗi hàm `public.bs_*`: `revoke all on function ... from public, anon, authenticated;` rồi `grant execute on function ... to anon, authenticated;`. Postgres mặc định cho PUBLIC quyền EXECUTE mọi hàm mới, nên bước revoke là bắt buộc.
- **Không overload.** Mỗi tên hàm chỉ có đúng một chữ ký. Migration sau muốn đổi chữ ký thì phải `drop function` chữ ký cũ, nếu không bản cũ vẫn gọi được.
- Mọi hàm: `security definer`, `set search_path = ''`, gọi tên đầy đủ như `bill_split.groups`, `extensions.gen_random_bytes`.
- `bs_get_group` và `bs_get_groups` khai báo `stable`. Postgres chạy hàm stable ở chế độ chỉ đọc, nên hai hàm này không được ghi gì.
- Cảnh báo của Supabase security advisor về hàm security definer trong schema public là có chủ đích, ghi chú lại trong `docs/supabase.md`.

## 3. Bảng trong schema `bill_split`

Mọi chuỗi được `btrim` trước khi kiểm tra và lưu. Trường tùy chọn rỗng sau khi trim thì lưu `null`.

### `groups`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `uuid` | Khóa chính, `gen_random_uuid()` |
| `name` | `text` | 1 tới 80 ký tự |
| `currency` | `text` | Mặc định và chỉ nhận `'VND'` |
| `token_hash` | `bytea` | Not null, unique |
| `created_at` | `timestamptz` | Mặc định `now()` |
| `updated_at` | `timestamptz` | Mặc định `now()`, cập nhật mỗi khi có thao tác ghi trong nhóm |
| `deleted_at` | `timestamptz` | Null. Khác null nghĩa là đã xóa mềm |

### `members`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `uuid` | Khóa chính. Client sinh, trừ thành viên ban đầu do `bs_create_group` sinh |
| `group_id` | `uuid` | Khóa ngoại tới `groups`, `on delete cascade` |
| `name` | `text` | 1 tới 40 ký tự. Unique theo `(group_id, lower(name))` |
| `position` | `integer` | Lớn hơn hoặc bằng 0 |
| `bank_bin` | `text` | Null hoặc đúng 6 chữ số |
| `bank_account` | `text` | Null hoặc `^[0-9A-Za-z]{1,19}$` |
| `bank_account_name` | `text` | Null hoặc tối đa 50 ký tự |
| `created_at`, `updated_at` | `timestamptz` | Mặc định `now()` |

Thêm `unique (group_id, id)` để làm khóa ngoại kép. `bank_bin` và `bank_account` cùng null hoặc cùng có giá trị. `bank_account_name` chỉ có khi hai cột kia có.

### `expenses`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `uuid` | Khóa chính, client sinh |
| `group_id` | `uuid` | Khóa ngoại tới `groups`, `on delete cascade` |
| `title` | `text` | 1 tới 80 ký tự |
| `amount` | `bigint` | Từ 1 tới 999 999 999 999 |
| `paid_by` | `uuid` | Khóa ngoại kép `(group_id, paid_by)` tới `members (group_id, id)` |
| `spent_on` | `date` | Từ 2000-01-01 tới 2100-12-31 |
| `split_mode` | `text` | `'equal'` hoặc `'exact'` |
| `note` | `text` | Null hoặc tối đa 500 ký tự |
| `version` | `integer` | Mặc định 1, tăng 1 mỗi lần sửa |
| `created_at`, `updated_at` | `timestamptz` | Mặc định `now()` |

Thêm `unique (group_id, id)`.

### `expense_shares`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `expense_id` | `uuid` | Khóa ngoại kép `(group_id, expense_id)` tới `expenses (group_id, id)`, `on delete cascade` |
| `group_id` | `uuid` | |
| `member_id` | `uuid` | Khóa ngoại kép `(group_id, member_id)` tới `members (group_id, id)` |
| `amount` | `bigint` | Từ 0 tới 999 999 999 999 |

Khóa chính `(expense_id, member_id)`.

### `settlements`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `uuid` | Khóa chính, client sinh |
| `group_id` | `uuid` | Khóa ngoại tới `groups`, `on delete cascade` |
| `from_member` | `uuid` | Khóa ngoại kép tới `members`. Người trả tiền |
| `to_member` | `uuid` | Khóa ngoại kép tới `members`. Người nhận tiền |
| `amount` | `bigint` | Từ 1 tới 999 999 999 999 |
| `settled_on` | `date` | Như `spent_on` |
| `note` | `text` | Null hoặc tối đa 200 ký tự |
| `created_at`, `updated_at` | `timestamptz` | Mặc định `now()` |

Ràng buộc `from_member <> to_member`.

Tạo index cho mọi khóa ngoại, và cho `groups (created_at)` để đếm giới hạn tạo nhóm.

## 4. Quy tắc chung của hàm ghi

1. Kiểm định dạng token, tìm nhóm chưa xóa theo `token_hash`, khóa dòng nhóm bằng `for update` để các thao tác trên cùng nhóm chạy lần lượt.
2. **Mọi truy vấn trên members, expenses, expense_shares, settlements đều có điều kiện `group_id = <nhóm của token>`.** Id của thành viên, khoản chi, thanh toán ai cầm link cũng thấy, nên thiếu điều kiện này là token nhóm A sửa được dữ liệu nhóm B.
3. Kiểm tra dữ liệu trước khi ghi và raise lỗi theo mục 6. Không để lỗi khóa ngoại, unique hay check của Postgres lọt ra client trong các tình huống đã lường trước.
4. Cập nhật `groups.updated_at = now()`.
5. Trả về snapshot mới nhất theo mục 5, trừ `bs_delete_group` và `bs_rotate_token`.
6. Kiểm tra tổng phần chia ngay trong hàm, sau khi ghi phần chia. Không dùng deferred constraint trigger: trên Postgres dưới 18, trigger hoãn chạy lúc commit dưới quyền `anon` và sẽ lỗi quyền.

## 5. Snapshot JSON

```json
{
  "v": 1,
  "group": { "id": "uuid", "name": "Đà Lạt 3N2Đ", "currency": "VND", "created_at": "...", "updated_at": "..." },
  "members": [
    { "id": "uuid", "name": "Linh", "position": 0, "bank_bin": "970436", "bank_account": "0123456789", "bank_account_name": "NGUYEN VAN LINH" }
  ],
  "expenses": [
    {
      "id": "uuid", "title": "Lẩu gà lá é", "amount": 1200000, "paid_by": "uuid",
      "spent_on": "2026-10-26", "split_mode": "equal", "note": null, "version": 1,
      "created_at": "...", "updated_at": "...",
      "shares": [ { "member_id": "uuid", "amount": 300000 } ]
    }
  ],
  "settlements": [
    { "id": "uuid", "from_member": "uuid", "to_member": "uuid", "amount": 300000, "settled_on": "2026-10-27", "note": null, "created_at": "...", "updated_at": "..." }
  ]
}
```

- `members` sắp theo `position`, rồi `created_at`.
- `expenses` sắp theo `spent_on` giảm dần, rồi `created_at` giảm dần, rồi `id`. `settlements` sắp tương tự theo `settled_on`.
- `shares` của mỗi khoản chi sắp theo `position` của thành viên.
- Mảng rỗng phải là `[]`, không phải `null`. Dùng `coalesce(jsonb_agg(...), '[]'::jsonb)`.
- Tiền là số JSON. Ngày là chuỗi `YYYY-MM-DD`. Thời điểm là chuỗi ISO của `timestamptz`.
- Snapshot không bao giờ chứa token hay `token_hash`.

## 6. Lỗi

Raise bằng một hàm nội bộ duy nhất, ví dụ `bill_split.fail(status, code, detail)`:

```sql
raise exception using errcode = 'PT' || p_status, message = p_code, detail = coalesce(p_detail::text, '');
```

PostgREST đổi SQLSTATE `PTxyz` thành HTTP status `xyz`, body là `{ "code": "PT404", "message": "BS_GROUP_NOT_FOUND", "details": "...", "hint": null }`. Client đọc qua `toAppError` trong `src/shared/lib/errors.ts`.

| Mã | HTTP | Khi nào | `details` |
|---|---|---|---|
| `BS_GROUP_NOT_FOUND` | 404 | Token sai, không tồn tại, đã đổi, nhóm đã xóa | Rỗng |
| `BS_NOT_FOUND` | 404 | Sửa khoản chi theo version nhưng khoản chi không còn | `{"entity":"expense"}` |
| `BS_CONFLICT` | 409 | `p_expected_version` khác version hiện tại | `{"entity":"expense","current_version":3}` |
| `BS_MEMBER_IN_USE` | 409 | Xóa thành viên còn trong khoản chi, phần chia hoặc thanh toán | Rỗng |
| `BS_INVALID` | 422 | Dữ liệu sai | `{"field":"...","reason":"..."}` |
| `BS_LIMIT` | 422 | Vượt giới hạn của nhóm | `{"limit":"members"}`, `"expenses"` hoặc `"settlements"` |
| `BS_RATE_LIMITED` | 429 | Toàn hệ thống đã tạo từ 30 nhóm trong 10 phút gần nhất | Rỗng |

`field` là tên tham số bỏ tiền tố `p_`, ví dụ `name`, `member_names`, `title`, `amount`, `paid_by`, `spent_on`, `split_mode`, `shares`, `note`, `bank_bin`, `bank_account`, `bank_account_name`, `from_member`, `to_member`, `settled_on`, `tokens`, `member_id`, `expense_id`, `settlement_id`.

`reason` là một trong: `required`, `too_long`, `format`, `out_of_range`, `duplicate`, `not_in_group`, `same_member`, `sum_mismatch`, `unequal_split`, `empty`, `id_taken`, `too_many`.

## 7. Các hàm API

Thứ tự tham số: tham số bắt buộc trước, tham số có `default null` sau. Client bỏ qua tham số tùy chọn khi rỗng để SQL nhận `null`.

### `bs_create_group(p_name text, p_member_names text[]) returns jsonb`
- Không cần token. Kiểm giới hạn tốc độ trước: đếm `groups` có `created_at > now() - interval '10 minutes'`, kể cả nhóm đã xóa. Từ 30 trở lên thì `BS_RATE_LIMITED`.
- `name`: bắt buộc, tối đa 80 ký tự.
- `member_names`: rỗng thì `empty`, hơn 50 thì `BS_LIMIT members`. Mỗi tên sau trim dài 1 tới 40 (`required`, `too_long`). Không trùng nhau, không phân biệt hoa thường (`duplicate`). `field` luôn là `member_names`.
- Sinh token, id nhóm, id từng thành viên. `position` theo thứ tự trong mảng, bắt đầu từ 0.
- Trả `{ "token": "<token>", "snapshot": <snapshot> }`.
- Hàm này không lặp lại an toàn, client không tự gửi lại khi lỗi mạng.

### `bs_get_group(p_token text) returns jsonb`, stable
Trả snapshot.

### `bs_get_groups(p_tokens text[]) returns jsonb`, stable
- Tối đa 50 token, nhiều hơn thì `BS_INVALID` với `field: tokens`, `reason: too_many`. `null` coi như mảng rỗng.
- Bỏ qua token sai, không tồn tại hoặc đã xóa, không báo lỗi.
- Trả mảng `[{ "token", "id", "name", "member_count", "expense_count", "total_spent", "updated_at" }]` sắp theo `updated_at` giảm dần. `token` là token đầu vào tương ứng.

### `bs_update_group(p_token text, p_name text) returns jsonb`
Đổi tên nhóm, kiểm `name` như khi tạo. Trả snapshot.

### `bs_rotate_token(p_token text) returns jsonb`
Sinh token mới, token cũ hết hiệu lực ngay. Trả `{ "token": "<token mới>" }`.

### `bs_delete_group(p_token text) returns void`
Đặt `deleted_at = now()`. Sau đó mọi hàm với token này trả `BS_GROUP_NOT_FOUND`.

### `bs_save_member(p_token text, p_member_id uuid, p_name text, p_bank_bin text default null, p_bank_account text default null, p_bank_account_name text default null) returns jsonb`
- Id chưa có trong nhóm: tạo mới, `position = max(position) + 1`, hoặc 0 nếu nhóm chưa có ai. Nhóm đã đủ 50 người thì `BS_LIMIT members`. Id đã thuộc nhóm khác thì `BS_INVALID`, `field: member_id`, `reason: id_taken`.
- Id đã có trong nhóm: ghi đè tên và toàn bộ thông tin ngân hàng. Tham số bỏ trống nghĩa là xóa thông tin đó.
- `name`: bắt buộc, tối đa 40, không trùng thành viên khác trong nhóm, không phân biệt hoa thường (`duplicate`).
- Ngân hàng: `bank_bin` và `bank_account` cùng có hoặc cùng trống, thiếu một bên thì `required` cho bên thiếu. `bank_bin` đúng 6 chữ số (`format`). `bank_account` bỏ hết khoảng trắng rồi khớp `^[0-9A-Za-z]{1,19}$` (`format`). `bank_account_name` tối đa 50 (`too_long`), chỉ nhận khi có ngân hàng. Client tự chuẩn hóa tên chủ tài khoản thành chữ hoa không dấu, server chỉ trim.
- Trả snapshot.

### `bs_delete_member(p_token text, p_member_id uuid) returns jsonb`
- Thành viên không có trong nhóm thì coi như đã xóa, trả snapshot.
- Còn xuất hiện ở `expenses.paid_by`, `expense_shares` hoặc `settlements` thì `BS_MEMBER_IN_USE`.
- Trả snapshot.

### `bs_save_expense(p_token text, p_expense_id uuid, p_title text, p_amount bigint, p_paid_by uuid, p_spent_on date, p_split_mode text, p_shares jsonb, p_expected_version integer default null, p_note text default null) returns jsonb`

Kiểm tra:
- `title` bắt buộc, tối đa 80. `amount` từ 1 tới 999 999 999 999 (`out_of_range`). `spent_on` bắt buộc, trong khoảng ở mục 3 (`out_of_range`). `split_mode` là `equal` hoặc `exact` (`format`). `note` tối đa 500.
- `paid_by` phải là thành viên của nhóm (`not_in_group`).
- `shares` là mảng JSON `[{ "member_id", "amount" }]` có 1 tới 50 phần tử (`empty`, `too_many`). `member_id` không lặp (`duplicate`) và thuộc nhóm (`not_in_group`). `amount` là số nguyên từ 0 tới 999 999 999 999 (`format`, `out_of_range`). Có ít nhất một phần lớn hơn 0 (`empty`). Tổng bằng `p_amount` (`sum_mismatch`). Khi `split_mode = 'equal'`, phần lớn nhất trừ phần nhỏ nhất không quá 1 đồng (`unequal_split`). `field` của mọi lỗi phần chia là `shares`.

Ghi:
- **Tạo mới**, khi `p_expected_version` là null:
  - Id chưa tồn tại: kiểm giới hạn 5000 khoản chi (`BS_LIMIT expenses`), thêm khoản chi với `version = 1` và các phần chia.
  - Id đã có trong nhóm này: coi là gửi lại do rớt mạng, không ghi gì, trả snapshot.
  - Id đã có ở nhóm khác: `BS_INVALID`, `field: expense_id`, `reason: id_taken`.
- **Sửa**, khi `p_expected_version` có giá trị:
  - Id không có trong nhóm: `BS_NOT_FOUND`.
  - `version` hiện tại khác `p_expected_version`: `BS_CONFLICT`.
  - Cập nhật các cột, `version = version + 1`, `updated_at = now()`, xóa phần chia cũ rồi thêm phần chia mới.
- Trả snapshot.

Hoàn tác xóa khoản chi: client gọi lại hàm này với đúng id cũ và `p_expected_version` null, khoản chi được tạo lại với version 1.

### `bs_delete_expense(p_token text, p_expense_id uuid) returns jsonb`
Xóa nếu có, phần chia xóa theo. Không có thì thôi. Trả snapshot.

### `bs_save_settlement(p_token text, p_settlement_id uuid, p_from_member uuid, p_to_member uuid, p_amount bigint, p_settled_on date, p_note text default null) returns jsonb`
- `from_member`, `to_member` thuộc nhóm (`not_in_group`) và khác nhau (`same_member`, `field: to_member`). `amount` từ 1 tới 999 999 999 999. `settled_on` như `spent_on`. `note` tối đa 200.
- Id chưa có: kiểm giới hạn 5000 (`BS_LIMIT settlements`) rồi thêm. Id có trong nhóm: ghi đè, không có version. Id ở nhóm khác: `BS_INVALID`, `reason: id_taken`.
- Trả snapshot.

### `bs_delete_settlement(p_token text, p_settlement_id uuid) returns jsonb`
Xóa nếu có. Trả snapshot.

## 8. Dữ liệu mẫu, chỉ dùng ở local

`supabase/seed.sql` chỉ chạy khi `supabase db reset` ở máy, không chạy khi `db push` lên production.

- Nhóm **Đà Lạt 3N2Đ**, token `dalat-demo-token-2026-ok`. Thành viên Linh, Hưng, Mai, Tú. Linh có Vietcombank BIN 970436, TK 0123456789, tên NGUYEN VAN LINH. Hưng có MB BIN 970422, TK 0987654321. Khoảng 5 khoản chi gồm cả chia đều và chia riêng, 1 lần trả nợ.
- Nhóm **Lẩu thứ Sáu**, token `lau-thu-sau-demo-token-1`, 3 thành viên, 2 khoản chi.

## 9. Kiểm thử bắt buộc phía database

Viết bằng pgTAP trong `supabase/tests/database/`, chạy bằng `npm run db:test`. Mọi test chạy dưới vai trò `anon` khi kiểm quyền.

- Tập hàm trong schema `public` mà `anon` gọi được đúng bằng 12 hàm `bs_*` ở mục 7. Không tên nào có hai chữ ký.
- `anon` và `authenticated` không có USAGE trên `bill_split`, không đọc hay ghi được bảng nào.
- Mỗi mã lỗi ở mục 6 xuất hiện đúng tình huống, đúng SQLSTATE `PTxyz`.
- Token nhóm A không đọc, sửa, xóa được thành viên, khoản chi, thanh toán của nhóm B khi truyền id của nhóm B.
- Tổng phần chia sai trả `sum_mismatch`. Chia đều lệch quá 1 đồng trả `unequal_split`.
- Gửi lại `bs_save_expense` tạo mới cùng id không tạo bản ghi thứ hai.
- Sửa bằng version cũ trả `BS_CONFLICT`.
- Đổi token xong thì token cũ trả `BS_GROUP_NOT_FOUND`, token mới dùng được.
- Giới hạn tạo nhóm hoạt động.
- Snapshot đúng cấu trúc ở mục 5, mảng rỗng là `[]`.

## 10. Phía client

- Tầng `api/` gọi `supabase.rpc(tên, tham số)`, đổi lỗi bằng `toAppError(error, status)`, có bảng dịch mã lỗi tiếng Việt ở `api/errors.ts`.
- Đổi snapshot DTO sang model trong `domain/types.ts` ở một chỗ duy nhất.
- Mọi hàm ghi trả snapshot, nên cập nhật cache React Query bằng snapshot đó luôn, không cần gọi lại.
- Chỉ thử lại khi lỗi mạng, và không bao giờ tự thử lại `bs_create_group`.
