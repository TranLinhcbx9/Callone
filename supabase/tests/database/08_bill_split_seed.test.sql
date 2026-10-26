-- Chia tiền: dữ liệu mẫu của supabase/seed.sql (hợp đồng mục 8).
-- Test này cần dữ liệu mẫu còn nguyên, nên chạy sau `npm run db:reset`. Nếu bạn đã sửa hay xóa hai nhóm
-- mẫu bằng giao diện thì test này có thể đỏ, chạy `npm run db:reset` để khôi phục.
begin;
set local search_path = public, extensions;

select plan(23);

create function pg_temp.names(p_snap jsonb) returns jsonb
language sql
immutable
as $$
  select jsonb_agg(m.value ->> 'name' order by m.ord)
    from jsonb_array_elements(p_snap -> 'members') with ordinality as m(value, ord);
$$;

set local role anon;

-- ---------------------------------------------------------------------------
-- Nhóm Đà Lạt 3N2Đ
-- ---------------------------------------------------------------------------
select is(
  public.bs_get_group('dalat-demo-token-2026-ok') #>> '{group,name}',
  'Đà Lạt 3N2Đ',
  'seed: token dalat-demo-token-2026-ok mở nhóm Đà Lạt 3N2Đ'
);
select is(
  pg_temp.names(public.bs_get_group('dalat-demo-token-2026-ok')),
  '["Linh", "Hưng", "Mai", "Tú"]'::jsonb,
  'seed: Đà Lạt có 4 thành viên Linh, Hưng, Mai, Tú theo thứ tự'
);
select is(
  (public.bs_get_group('dalat-demo-token-2026-ok') #> '{members,0}') - 'id',
  '{"name": "Linh", "position": 0, "bank_bin": "970436", "bank_account": "0123456789", "bank_account_name": "NGUYEN VAN LINH"}'::jsonb,
  'seed: Linh có Vietcombank 970436, tài khoản 0123456789, tên NGUYEN VAN LINH'
);
select is(
  (public.bs_get_group('dalat-demo-token-2026-ok') #> '{members,1}') - 'id',
  '{"name": "Hưng", "position": 1, "bank_bin": "970422", "bank_account": "0987654321", "bank_account_name": null}'::jsonb,
  'seed: Hưng có MB 970422, tài khoản 0987654321, chưa có tên chủ tài khoản'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'members') as m(value) where m.value -> 'bank_bin' <> 'null'::jsonb),
  2::bigint,
  'seed: chỉ Linh và Hưng có thông tin ngân hàng'
);
select is(
  jsonb_array_length(public.bs_get_group('dalat-demo-token-2026-ok') -> 'expenses'),
  6,
  'seed: Đà Lạt có 6 khoản chi'
);
select is(
  (select jsonb_agg(distinct e.value ->> 'split_mode' order by e.value ->> 'split_mode')
     from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'expenses') as e(value)),
  '["equal", "exact"]'::jsonb,
  'seed: Đà Lạt có cả khoản chia đều và chia riêng'
);
select is(
  (select jsonb_agg(e.value ->> 'title' order by e.ord)
     from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'expenses') with ordinality as e(value, ord)),
  '["Lẩu gà lá é", "Cà phê view đồi", "Nướng BBQ tối", "Thuê xe máy 2 ngày", "Homestay 2 đêm", "Vé xe giường nằm khứ hồi"]'::jsonb,
  'seed: khoản chi sắp mới nhất trước'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'expenses') as e(value) where jsonb_array_length(e.value -> 'shares') = 3),
  1::bigint,
  'seed: có một khoản chi chỉ chia cho 3 trong 4 người'
);
select is(
  (public.bs_get_group('dalat-demo-token-2026-ok') #> '{settlements,0}') - 'id' - 'from_member' - 'to_member' - 'created_at' - 'updated_at',
  '{"amount": 300000, "settled_on": "2026-10-26", "note": "Chuyển khoản MB"}'::jsonb,
  'seed: Đà Lạt có 1 lần trả nợ 300.000'
);
select is(
  jsonb_array_length(public.bs_get_group('dalat-demo-token-2026-ok') -> 'settlements'),
  1,
  'seed: Đà Lạt chỉ có đúng 1 lần trả nợ'
);
select is(
  (select m.value ->> 'name'
     from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'members') as m(value)
    where m.value ->> 'id' = public.bs_get_group('dalat-demo-token-2026-ok') #>> '{settlements,0,from_member}'),
  'Tú',
  'seed: người trả nợ là Tú'
);
select is(
  (select m.value ->> 'name'
     from jsonb_array_elements(public.bs_get_group('dalat-demo-token-2026-ok') -> 'members') as m(value)
    where m.value ->> 'id' = public.bs_get_group('dalat-demo-token-2026-ok') #>> '{settlements,0,to_member}'),
  'Linh',
  'seed: người nhận là Linh'
);

-- ---------------------------------------------------------------------------
-- Nhóm Lẩu thứ Sáu
-- ---------------------------------------------------------------------------
select is(
  public.bs_get_group('lau-thu-sau-demo-token-1') #>> '{group,name}',
  'Lẩu thứ Sáu',
  'seed: token lau-thu-sau-demo-token-1 mở nhóm Lẩu thứ Sáu'
);
select is(
  jsonb_array_length(public.bs_get_group('lau-thu-sau-demo-token-1') -> 'members'),
  3,
  'seed: Lẩu thứ Sáu có 3 thành viên'
);
select is(
  jsonb_array_length(public.bs_get_group('lau-thu-sau-demo-token-1') -> 'expenses'),
  2,
  'seed: Lẩu thứ Sáu có 2 khoản chi'
);
select is(
  public.bs_get_group('lau-thu-sau-demo-token-1') -> 'settlements',
  '[]'::jsonb,
  'seed: Lẩu thứ Sáu chưa có thanh toán, settlements là []'
);

-- ---------------------------------------------------------------------------
-- Danh sách nhóm
-- ---------------------------------------------------------------------------
select is(
  (select jsonb_agg(x.value - 'id' - 'updated_at' order by x.ord)
     from jsonb_array_elements(public.bs_get_groups(array['lau-thu-sau-demo-token-1', 'dalat-demo-token-2026-ok'])) with ordinality as x(value, ord)),
  '[
    {"name": "Đà Lạt 3N2Đ", "token": "dalat-demo-token-2026-ok", "member_count": 4, "expense_count": 6, "total_spent": 8090000},
    {"name": "Lẩu thứ Sáu", "token": "lau-thu-sau-demo-token-1", "member_count": 3, "expense_count": 2, "total_spent": 1105000}
  ]'::jsonb,
  'seed: bs_get_groups trả hai nhóm mẫu, nhóm cập nhật gần nhất (Đà Lạt) đứng đầu'
);

-- ---------------------------------------------------------------------------
-- Bất biến của dữ liệu mẫu (đọc bảng bằng quyền owner)
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select count(*)
     from bill_split.expenses e
    where e.group_id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')
      and e.amount is distinct from (select sum(s.amount) from bill_split.expense_shares s where s.expense_id = e.id)),
  0::bigint,
  'seed: mọi khoản chi có tổng phần chia đúng bằng số tiền'
);
select is(
  (select count(*)
     from bill_split.expenses e
    where e.group_id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')
      and e.split_mode = 'equal'
      and (select max(s.amount) - min(s.amount) from bill_split.expense_shares s where s.expense_id = e.id) > 1),
  0::bigint,
  'seed: mọi khoản chi chia đều lệch tối đa 1 đồng'
);
select is(
  (select count(*) from bill_split.groups g
    where g.id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')
      and g.token_hash in (sha256(convert_to('dalat-demo-token-2026-ok', 'UTF8')), sha256(convert_to('lau-thu-sau-demo-token-1', 'UTF8')))),
  2::bigint,
  'seed: database chỉ lưu sha256 của token mẫu'
);
select is(
  (select count(*) from bill_split.members m where m.name <> normalize(m.name, nfc))
  + (select count(*) from bill_split.groups g where g.name <> normalize(g.name, nfc)),
  0::bigint,
  'seed: mọi tên đã ở dạng NFC giống như dữ liệu đi qua API'
);
select is(
  (select count(*) from bill_split.groups g where g.id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001') and g.created_at > now() - interval '10 minutes'),
  0::bigint,
  'seed: nhóm mẫu không bị tính vào giới hạn tốc độ tạo nhóm'
);

select * from finish();
rollback;
