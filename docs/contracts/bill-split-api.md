# Hợp đồng API: module Chia tiền (bill-split), phiên bản 1.1

**Thay đổi ở 1.1 so với 1:** `bs_create_group` nhận thêm `p_token` và `bs_rotate_token` nhận thêm `p_new_token` (token do client sinh, nhờ đó gửi lại an toàn khi rớt mạng); giới hạn mỗi nhóm giảm còn 1000 khoản chi và 1000 thanh toán (trước là 5000); giới hạn tạo nhóm tính theo từng client (5 lần) cộng toàn hệ thống (100 lần) trong 10 phút, thay cho 30 lần toàn hệ thống; NBSP, ký tự rộng bằng không và mọi khoảng trắng Unicode được coi là ký tự trắng khi cắt và khi kiểm `required`.

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
- Token gồm 24 ký tự base64url, sinh từ 18 byte ngẫu nhiên. Mẫu kiểm tra: `^[A-Za-z0-9_-]{24}$`.
  - **Client sinh** (cách nên dùng, vì cho phép gửi lại an toàn khi rớt mạng, xem mục 10): 18 byte từ `crypto.getRandomValues`, mã hóa base64url không đệm, gửi qua `p_token` của `bs_create_group` hoặc `p_new_token` của `bs_rotate_token`. Server chỉ kiểm định dạng chứ không kiểm được độ ngẫu nhiên, nên client bắt buộc dùng bộ sinh số ngẫu nhiên an toàn.
  - **Server sinh** khi client bỏ trống tham số đó: `translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')`.
- Database chỉ lưu `token_hash = sha256(convert_to(token, 'UTF8'))`, kiểu `bytea`, unique **tính cả nhóm đã xóa mềm**: token của nhóm đã xóa không bao giờ được dùng lại cho nhóm khác. Không lưu token gốc ở bất kỳ đâu, kể cả log.
- Token sai định dạng, không tồn tại, đã bị đổi, hoặc nhóm đã xóa mềm đều trả cùng một lỗi `BS_GROUP_NOT_FOUND`. Không được để lộ trường hợp nào. Ngoại lệ là hai tham số token mới do client chọn (`p_token` của `bs_create_group`, `p_new_token` của `bs_rotate_token`): sai định dạng hay đã bị chiếm thì báo `BS_INVALID` vì đó là lỗi của dữ liệu client gửi lên. Lỗi chỉ cho biết chính token vừa gửi đã có chủ, điều mà người nắm token đó vốn đã biết (đoán trúng một token 144 bit là không khả thi).
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

Mọi chuỗi được chuẩn hóa về NFC rồi cắt **ký tự trắng** ở hai đầu trước khi kiểm tra và lưu. Chuỗi rỗng sau khi cắt: trường bắt buộc báo `required`, trường tùy chọn lưu `null`.

Ký tự trắng gồm (định nghĩa viết tường minh theo mã ký tự, không phụ thuộc locale của database):
- Khoảng trắng ASCII: tab, xuống dòng, VT, FF, CR (U+0009 tới U+000D) và dấu cách (U+0020).
- Toàn bộ Unicode White_Space: NEL (U+0085), NBSP (U+00A0), U+1680, U+2000 tới U+200A, U+2028, U+2029, U+202F, U+205F, U+3000.
- Ký tự rộng bằng không: U+200B tới U+200D, U+2060, U+FEFF.

Ví dụ một tên chỉ gồm NBSP hoặc ký tự rộng bằng không bị từ chối như tên rỗng. Chỉ cắt hai đầu, ký tự trắng ở giữa chuỗi được giữ nguyên (riêng số tài khoản ngân hàng bỏ ký tự trắng ở mọi vị trí, xem `bs_save_member`). Các ký tự vô hình khác (ví dụ U+00AD, U+200E) không thuộc nhóm này.

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

### `settings` (nội bộ, ghi đè giới hạn tạo nhóm)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `key` | `text` | Khóa chính, chỉ nhận `create_limit_client` và `create_limit_global` |
| `value` | `integer` | Không âm. 0 là hợp lệ và chặn hẳn việc tạo nhóm mới (công tắc khẩn) |

Giá trị mặc định nằm trong code (5 mỗi client, 100 toàn hệ thống), bảng này chỉ để ghi đè; thiếu dòng nào thì dùng mặc định của giới hạn đó. Đổi bằng SQL, xem `docs/supabase.md`. `seed.sql` (chỉ chạy ở local) đặt cả hai là 1 000 000.

### `create_log` (nội bộ, nhật ký cửa sổ trượt của giới hạn tạo nhóm)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `bigint` | Khóa chính, `generated always as identity` |
| `client_hash` | `text` | Not null. sha256 hex của IP client, hoặc đúng chữ `unknown` |
| `created_at` | `timestamptz` | Mặc định `now()` |

Mỗi lần `bs_create_group` tạo nhóm thành công thêm một dòng; mỗi lần tạo cũng xóa các dòng cũ hơn 10 phút. Bảng chỉ giữ cửa sổ hiện tại nên không lưu IP lâu dài, và `client_hash` là băm một chiều chứ không phải IP gốc.

Cả hai bảng bật RLS không policy và thu hồi mọi quyền như các bảng khác của `bill_split`.

Tạo index cho mọi khóa ngoại, và cho `create_log (created_at)` để dọn và đếm cửa sổ giới hạn tạo nhóm.

## 4. Quy tắc chung của hàm ghi

1. Kiểm định dạng token, tìm nhóm chưa xóa theo `token_hash`, khóa dòng nhóm bằng `for update` để các thao tác trên cùng nhóm chạy lần lượt.
2. **Mọi truy vấn trên members, expenses, expense_shares, settlements đều có điều kiện `group_id = <nhóm của token>`.** Id của thành viên, khoản chi, thanh toán ai cầm link cũng thấy, nên thiếu điều kiện này là token nhóm A sửa được dữ liệu nhóm B.
3. Kiểm tra dữ liệu trước khi ghi và raise lỗi theo mục 6. Không để lỗi khóa ngoại, unique hay check của Postgres lọt ra client trong các tình huống đã lường trước.
4. Cập nhật `groups.updated_at = now()`.
5. Trả về snapshot mới nhất theo mục 5, trừ `bs_delete_group` và `bs_rotate_token`.
6. Kiểm tra tổng phần chia ngay trong hàm, sau khi ghi phần chia. Không dùng deferred constraint trigger: trên Postgres dưới 18, trigger hoãn chạy lúc commit dưới quyền `anon` và sẽ lỗi quyền.
7. Hai hàm không theo đúng bước 1: `bs_create_group` không có token nhóm (thứ tự kiểm riêng ở mục 7), và `bs_rotate_token` kiểm định dạng `p_new_token` trước rồi tra nhóm mà không raise khi không thấy, để nhận ra lần gửi lại. Mọi hàm ghi khác theo đúng bước 1.

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
| `BS_LIMIT` | 422 | Vượt giới hạn của nhóm: 50 thành viên, 1000 khoản chi, 1000 thanh toán | `{"limit":"members"}`, `"expenses"` hoặc `"settlements"` |
| `BS_RATE_LIMITED` | 429 | `bs_create_group`: client này đã tạo từ 5 nhóm, hoặc toàn hệ thống đã tạo từ 100 nhóm, trong 10 phút gần nhất (giới hạn ghi đè được, xem `bs_create_group`) | Rỗng |

`field` là tên tham số bỏ tiền tố `p_`, ví dụ `name`, `member_names`, `title`, `amount`, `paid_by`, `spent_on`, `split_mode`, `shares`, `note`, `bank_bin`, `bank_account`, `bank_account_name`, `from_member`, `to_member`, `settled_on`, `tokens`, `token` (của `bs_create_group`), `new_token` (của `bs_rotate_token`), `member_id`, `expense_id`, `settlement_id`.

`reason` là một trong: `required`, `too_long`, `format`, `out_of_range`, `duplicate`, `not_in_group`, `same_member`, `sum_mismatch`, `unequal_split`, `empty`, `id_taken`, `too_many`.

## 7. Các hàm API

Thứ tự tham số: tham số bắt buộc trước, tham số có `default null` sau. Client bỏ qua tham số tùy chọn khi rỗng để SQL nhận `null`.

### `bs_create_group(p_name text, p_member_names text[], p_token text default null) returns jsonb`
Không cần token nhóm. Kiểm theo thứ tự này và dừng ở lỗi đầu tiên:
1. **Định dạng `p_token`** (chỉ khi truyền): sai mẫu `^[A-Za-z0-9_-]{24}$` thì `BS_INVALID`, `field: token`, `reason: format`.
2. **Gửi lại** (chỉ khi truyền `p_token`):
   - Đã có nhóm chưa xóa giữ đúng token này: trả `{ "token", "snapshot" }` của nhóm đó (snapshot hiện tại, không phải lúc tạo), không tạo gì, không tính vào giới hạn tốc độ. Bước này đứng trước mọi kiểm tra bên dưới nên `p_name` và `p_member_names` không được xét: lần gửi lại mang nội dung khác vẫn nhận nhóm cũ nguyên vẹn.
   - Chỉ có nhóm đã xóa mềm giữ token này: `BS_INVALID`, `field: token`, `reason: id_taken`.
3. **Giới hạn tốc độ**: `BS_RATE_LIMITED`, xem bên dưới.
4. **Dữ liệu.** `name`: bắt buộc, tối đa 80 ký tự. `member_names`: rỗng thì `empty`, hơn 50 thì `BS_LIMIT members`. Mỗi tên sau khi cắt dài 1 tới 40 (`required`, `too_long`), không trùng nhau và không phân biệt hoa thường (`duplicate`). `field` của lỗi tên thành viên luôn là `member_names`.
5. **Ghi.** Token là `p_token` nếu có, không thì server sinh. Sinh id nhóm và id từng thành viên, `position` theo thứ tự trong mảng, bắt đầu từ 0. Trả `{ "token": "<token>", "snapshot": <snapshot> }`.

Hàm an toàn để gửi lại khi truyền `p_token`: gửi lại cùng token nhận lại đúng nhóm đó, kể cả khi lần đầu còn đang chạy (các lần tạo chạy lần lượt dưới một khóa, lần gửi lại chạy sau thấy nhóm vừa commit). Không truyền `p_token` thì mỗi lần gọi tạo một nhóm mới và client không được tự gửi lại.

**Giới hạn tốc độ** (cửa sổ trượt 10 phút, đếm trong `create_log`):
- Mỗi client tối đa **5** lần tạo và toàn hệ thống tối đa **100** lần. Lần thứ 6 của một client, hoặc lần thứ 101 của cả hệ thống, trả `BS_RATE_LIMITED` (HTTP 429, `details` rỗng).
- Chỉ lần tạo **thành công** mới chiếm chỗ: lần gửi lại (bước 2) và lần bị từ chối vì dữ liệu sai (bước 4) thì không.
- Khóa client là sha256 hex của IP, lấy từ GUC `request.headers` mà PostgREST đặt cho mỗi request: ưu tiên `cf-connecting-ip`, rồi địa chỉ đầu tiên của `x-forwarded-for`, rồi `x-real-ip` (header rỗng thì bỏ qua, tên header không phân biệt hoa thường). Không dùng được header nào thì mọi request như vậy chung một bucket tên `unknown`.
- Giới hạn của từng client chỉ đáng tin tới mức header IP đáng tin. Supabase cloud đi qua Cloudflare, nơi `cf-connecting-ip` luôn là IP thật; `x-forwarded-for` và `x-real-ip` có thể do client tự đặt khi không có header Cloudflare. Giới hạn toàn hệ thống vẫn chặn kẻ đổi header liên tục. Địa chỉ IPv6 được tính theo cả địa chỉ chứ không gộp theo dải.
- Ghi đè hai mức bằng `bill_split.settings` (`create_limit_client`, `create_limit_global`; 0 chặn hẳn việc tạo nhóm). Local thì `seed.sql` nâng cả hai lên 1 000 000 để chạy e2e từ một IP không bị chặn.

### `bs_get_group(p_token text) returns jsonb`, stable
Trả snapshot.

### `bs_get_groups(p_tokens text[]) returns jsonb`, stable
- Tối đa 50 token, nhiều hơn thì `BS_INVALID` với `field: tokens`, `reason: too_many`. `null` coi như mảng rỗng.
- Bỏ qua token sai, không tồn tại hoặc đã xóa, không báo lỗi.
- Trả mảng `[{ "token", "id", "name", "member_count", "expense_count", "total_spent", "updated_at" }]` sắp theo `updated_at` giảm dần. `token` là token đầu vào tương ứng.

### `bs_update_group(p_token text, p_name text) returns jsonb`
Đổi tên nhóm, kiểm `name` như khi tạo. Trả snapshot.

### `bs_rotate_token(p_token text, p_new_token text default null) returns jsonb`
Đổi token của nhóm, token cũ hết hiệu lực ngay. Trả `{ "token": "<token mới>" }`.
1. **Định dạng `p_new_token`** (chỉ khi truyền, kiểm đầu tiên, trước khi tra nhóm): phải khớp `^[A-Za-z0-9_-]{24}$` và khác `p_token`, nếu không thì `BS_INVALID`, `field: new_token`, `reason: format`. Không truyền thì server sinh token mới.
2. Tra và khóa nhóm chưa xóa theo `p_token`, không raise khi không thấy.
3. **Thấy nhóm:** nếu đã có một nhóm bất kỳ, kể cả nhóm đã xóa mềm, giữ token mới thì `BS_INVALID`, `field: new_token`, `reason: id_taken`. Không thì lưu hash của token mới, đặt `updated_at`, trả `{ "token": "<token mới>" }`.
4. **Không thấy nhóm:** nếu có truyền `p_new_token` và đã có nhóm chưa xóa giữ đúng token đó thì đây là lần gửi lại của một lần đổi đã commit mà phản hồi bị mất. Trả `{ "token": "<p_new_token>" }`, không ghi gì. Còn lại là `BS_GROUP_NOT_FOUND`.

An toàn để gửi lại với đúng cặp `(p_token, p_new_token)`. Lần gửi lại chỉ được nhận ra khi token mới còn sống: nếu nhóm đã đổi token lần nữa hoặc bị xóa trong lúc chờ thì lần gửi lại nhận `BS_GROUP_NOT_FOUND`. Bước 4 không kiểm `p_token` có đúng là token cũ của chính nhóm đó không, vì ai nắm token đang sống thì vốn đã có toàn quyền với nhóm. Hai lần đổi song song cùng cặp token cũng an toàn: lần đến sau chờ khóa rồi rơi vào bước 4.

### `bs_delete_group(p_token text) returns void`
Đặt `deleted_at = now()`. Sau đó mọi hàm với token này trả `BS_GROUP_NOT_FOUND`.

### `bs_save_member(p_token text, p_member_id uuid, p_name text, p_bank_bin text default null, p_bank_account text default null, p_bank_account_name text default null) returns jsonb`
- Id chưa có trong nhóm: tạo mới, `position = max(position) + 1`, hoặc 0 nếu nhóm chưa có ai. Nhóm đã đủ 50 người thì `BS_LIMIT members`. Id đã thuộc nhóm khác thì `BS_INVALID`, `field: member_id`, `reason: id_taken`.
- Id đã có trong nhóm: ghi đè tên và toàn bộ thông tin ngân hàng. Tham số bỏ trống nghĩa là xóa thông tin đó.
- `name`: bắt buộc, tối đa 40, không trùng thành viên khác trong nhóm, không phân biệt hoa thường (`duplicate`).
- Ngân hàng: `bank_bin` và `bank_account` cùng có hoặc cùng trống, thiếu một bên thì `required` cho bên thiếu. `bank_bin` đúng 6 chữ số (`format`). `bank_account` bỏ hết ký tự trắng ở mọi vị trí (dấu cách, NBSP, ký tự rộng bằng không... hay bị dán kèm, định nghĩa ở mục 3) rồi khớp `^[0-9A-Za-z]{1,19}$` (`format`). `bank_account_name` tối đa 50 (`too_long`), chỉ nhận khi có ngân hàng. Client tự chuẩn hóa tên chủ tài khoản thành chữ hoa không dấu, server chỉ cắt ký tự trắng hai đầu.
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
  - Id chưa tồn tại: kiểm giới hạn 1000 khoản chi (`BS_LIMIT expenses`), thêm khoản chi với `version = 1` và các phần chia.
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
- Id chưa có: kiểm giới hạn 1000 thanh toán (`BS_LIMIT settlements`) rồi thêm. Id có trong nhóm: ghi đè, không có version. Id ở nhóm khác: `BS_INVALID`, `reason: id_taken`.
- Trả snapshot.

### `bs_delete_settlement(p_token text, p_settlement_id uuid) returns jsonb`
Xóa nếu có. Trả snapshot.

## 8. Dữ liệu mẫu, chỉ dùng ở local

`supabase/seed.sql` chỉ chạy khi `supabase db reset` ở máy, không chạy khi `db push` lên production.

- Nhóm **Đà Lạt 3N2Đ**, token `dalat-demo-token-2026-ok`. Thành viên Linh, Hưng, Mai, Tú. Linh có Vietcombank BIN 970436, TK 0123456789, tên NGUYEN VAN LINH. Hưng có MB BIN 970422, TK 0987654321. Khoảng 5 khoản chi gồm cả chia đều và chia riêng, 1 lần trả nợ.
- Nhóm **Lẩu thứ Sáu**, token `lau-thu-sau-demo-token-1`, 3 thành viên, 2 khoản chi.
- Hai dòng `bill_split.settings` nâng `create_limit_client` và `create_limit_global` lên 1 000 000, để e2e và test tích hợp chạy liên tục từ một IP (qua Kong mọi request local có cùng IP) mà không bị `BS_RATE_LIMITED`. Cloud không chạy seed nên dùng mặc định 5 và 100.

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
- Giới hạn mỗi nhóm: 50 thành viên, 1000 khoản chi, 1000 thanh toán; thêm vào nhóm đầy bị `BS_LIMIT`, xóa bớt thì thêm lại được, sửa hay gửi lại phần tử có sẵn vẫn được.
- Tạo nhóm với `p_token`: sai định dạng thì `BS_INVALID token format`; gửi lại cùng token trả đúng nhóm cũ (kể cả khi nội dung khác), không tạo nhóm thứ hai, không thêm dòng `create_log`, không bị giới hạn tốc độ chặn; token của nhóm đã xóa mềm thì `BS_INVALID token id_taken`.
- Đổi token với `p_new_token`: sai định dạng hoặc trùng token cũ thì `BS_INVALID new_token format`; trùng token của nhóm khác (sống hay đã xóa) thì `id_taken`; gửi lại cùng cặp trả `{ token }` mà không ghi gì; không còn dùng được cả hai token thì `BS_GROUP_NOT_FOUND`.
- Giới hạn tạo nhóm: 5 lần mỗi client và 100 lần toàn hệ thống trong 10 phút (`BS_RATE_LIMITED`, `details` rỗng); khóa client theo thứ tự `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, không có thì bucket `unknown`; log cũ hơn cửa sổ bị dọn; lần gửi lại và lần lỗi dữ liệu không chiếm chỗ; ghi đè bằng `settings`.
- Ký tự trắng (mục 3): tên chỉ gồm NBSP, ký tự rộng bằng không hay khoảng trắng Unicode bị từ chối `required` (hoặc lưu `null` với trường tùy chọn), ký tự trắng hai đầu bị cắt.
- Snapshot đúng cấu trúc ở mục 5, mảng rỗng là `[]`.

## 10. Phía client

- Tầng `api/` gọi `supabase.rpc(tên, tham số)`, đổi lỗi bằng `toAppError(error, status)`, có bảng dịch mã lỗi tiếng Việt ở `api/errors.ts`.
- Đổi snapshot DTO sang model trong `domain/types.ts` ở một chỗ duy nhất.
- Mọi hàm ghi trả snapshot, nên cập nhật cache React Query bằng snapshot đó luôn, không cần gọi lại.
- Chỉ thử lại khi lỗi mạng (không có phản hồi HTTP, hoặc hết giờ chờ). Lỗi có mã `BS_*` là phản hồi cuối cùng của server, không thử lại.
- `bs_create_group` và `bs_rotate_token` an toàn để thử lại **khi và chỉ khi** client giữ nguyên token giữa các lần thử: sinh `p_token` (hoặc `p_new_token`) một lần cho mỗi thao tác của người dùng, lưu lại (ví dụ trong storage) trước khi gọi, dùng lại cho mọi lần thử, và chỉ bỏ khi thao tác thành công hoặc nhận lỗi `BS_*`. Gọi mà không truyền token thì server tự sinh và lần thử lại sẽ tạo nhóm thứ hai, nên khi đó không được tự thử lại.
- Với `bs_rotate_token`, phải lưu `p_new_token` trước khi gọi: nếu lần đổi đã commit mà phản hồi bị mất và client không còn giữ token mới (ví dụ vừa tải lại trang), thiết bị này mất đường vào nhóm. Có phản hồi thành công thì thay token đã lưu bằng token mới; mất phản hồi thì gửi lại đúng cặp cũ.
- `BS_RATE_LIMITED` (429) là lỗi cuối cùng, không thử lại ngay: báo người dùng đợi vài phút.
