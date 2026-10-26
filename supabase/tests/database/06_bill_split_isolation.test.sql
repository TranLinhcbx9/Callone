-- Chia tiền: cô lập giữa các nhóm (hợp đồng mục 4 và 9).
-- Id của thành viên, khoản chi, thanh toán ai cầm link cũng thấy, nên token nhóm A không được đọc,
-- sửa hay xóa dữ liệu nhóm B dù truyền id của nhóm B, và ngược lại. Mỗi hướng chạy cùng một loạt
-- lời gọi "tấn công", rồi khẳng định snapshot của cả hai nhóm không đổi một byte.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(38);

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
create function pg_temp.err(p_sql text) returns jsonb
language plpgsql
as $$
declare
  v_detail text;
  v_json   jsonb;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  if coalesce(v_detail, '') = '' then
    v_json := null;
  else
    begin
      v_json := v_detail::jsonb;
    exception when others then
      v_json := to_jsonb(v_detail);
    end;
  end if;
  return jsonb_build_object('state', sqlstate, 'message', sqlerrm, 'detail', v_json);
end;
$$;

create function pg_temp.put(p_key text, p_value text) returns void
language sql
as $$
  select set_config('t.' || p_key, p_value, true);
$$;

create function pg_temp.get(p_key text) returns text
language sql
stable
as $$
  select current_setting('t.' || p_key);
$$;

-- Id cố định: tiền tố là nhóm, n = 1 là nhóm, 101.. là thành viên, 201.. là khoản chi, 301.. là thanh toán.
create function pg_temp.uid(p_prefix text, p_n integer) returns uuid
language sql
immutable
as $$
  select (p_prefix || '0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

create function pg_temp.invalid_json(p_field text, p_reason text) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('state', 'PT422', 'message', 'BS_INVALID', 'detail', jsonb_build_object('field', p_field, 'reason', p_reason));
$$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền: hai nhóm có cấu trúc giống nhau.
--   Thành viên 101, 102, 103; khoản chi 201 (người 101 trả 90.000, chia đều 3 người);
--   thanh toán 301 (người 102 trả người 101 10.000).
-- ---------------------------------------------------------------------------
insert into bill_split.groups (id, name, token_hash) values
  (pg_temp.uid('a', 1), 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8'))),
  (pg_temp.uid('b', 1), 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position", bank_bin, bank_account, bank_account_name)
select pg_temp.uid(p, 100 + n), pg_temp.uid(p, 1), p || n, n - 1,
       case when n = 1 then '970436' end, case when n = 1 then '0123456789' end, case when n = 1 then 'NGUYEN VAN ' || upper(p) end
  from unnest(array['a', 'b']) as p
 cross join generate_series(1, 3) as n;
insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode, note)
select pg_temp.uid(p, 201), pg_temp.uid(p, 1), 'Khoản chi ' || upper(p), 90000, pg_temp.uid(p, 101), date '2026-10-24', 'equal', 'Ghi chú ' || upper(p)
  from unnest(array['a', 'b']) as p;
insert into bill_split.expense_shares (expense_id, group_id, member_id, amount)
select pg_temp.uid(p, 201), pg_temp.uid(p, 1), pg_temp.uid(p, 100 + n), 30000
  from unnest(array['a', 'b']) as p
 cross join generate_series(1, 3) as n;
insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on, note)
select pg_temp.uid(p, 301), pg_temp.uid(p, 1), pg_temp.uid(p, 102), pg_temp.uid(p, 101), 10000, date '2026-10-25', 'Thanh toán ' || upper(p)
  from unnest(array['a', 'b']) as p;

-- updated_at cố định ở quá khứ: nếu lời gọi nào "ghi" vào nhóm (kể cả chỉ đánh dấu updated_at = now()),
-- snapshot sẽ khác ngay. Trong một transaction now() không đổi nên không cố định như vậy thì không thấy được.
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00';

do $$
begin
  perform pg_temp.put('a_before', bill_split.build_snapshot(pg_temp.uid('a', 1))::text);
  perform pg_temp.put('b_before', bill_split.build_snapshot(pg_temp.uid('b', 1))::text);
end;
$$;

set local role anon;

-- ---------------------------------------------------------------------------
-- Hai hướng tấn công. Tham số của mẫu SQL:
--   %1 token của nhóm đang cầm,  %2 thành viên của mình,  %3 thành viên của nhóm kia,
--   %4 khoản chi của mình,       %5 khoản chi của nhóm kia,
--   %6 thanh toán của mình,      %7 thanh toán của nhóm kia,  %8 thành viên thứ hai của mình.
-- Kết quả mong đợi: lỗi đúng mã, hoặc null khi lời gọi thành công mà không làm gì (xóa id của nhóm khác).
-- ---------------------------------------------------------------------------
select is(
  pg_temp.err(format(s.sql, d.token, d.own_member, d.other_member, d.own_expense, d.other_expense, d.own_settlement, d.other_settlement, d.own_member2)),
  s.expected,
  d.name || ': ' || s.name
)
from (values
  ('A cầm token, dùng id của B', 'test-group-a-token-00001',
     pg_temp.uid('a', 101), pg_temp.uid('b', 101), pg_temp.uid('a', 201), pg_temp.uid('b', 201), pg_temp.uid('a', 301), pg_temp.uid('b', 301), pg_temp.uid('a', 102)),
  ('B cầm token, dùng id của A', 'test-group-b-token-00001',
     pg_temp.uid('b', 101), pg_temp.uid('a', 101), pg_temp.uid('b', 201), pg_temp.uid('a', 201), pg_temp.uid('b', 301), pg_temp.uid('a', 301), pg_temp.uid('b', 102))
) as d(name, token, own_member, other_member, own_expense, other_expense, own_settlement, other_settlement, own_member2)
cross join (values
  ('bs_save_member ghi đè thành viên của nhóm kia bị id_taken',
   $$select public.bs_save_member(%1$L, %3$L, 'Hacked', '970436', '9999999999', 'HACKER')$$,
   pg_temp.invalid_json('member_id', 'id_taken')),
  ('bs_delete_member xóa thành viên của nhóm kia là việc không làm gì',
   $$select public.bs_delete_member(%1$L, %3$L)$$,
   null::jsonb),
  ('bs_save_expense tạo trùng id khoản chi của nhóm kia bị id_taken',
   $$select public.bs_save_expense(%1$L, %5$L, 'Chiếm id', 90000, %2$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %2$L, 'amount', 90000)))$$,
   pg_temp.invalid_json('expense_id', 'id_taken')),
  ('bs_save_expense sửa khoản chi của nhóm kia (có version) bị BS_NOT_FOUND',
   $$select public.bs_save_expense(%1$L, %5$L, 'Sửa trộm', 90000, %2$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %2$L, 'amount', 90000)), 1)$$,
   jsonb_build_object('state', 'PT404', 'message', 'BS_NOT_FOUND', 'detail', jsonb_build_object('entity', 'expense'))),
  ('bs_save_expense với paid_by của nhóm kia bị not_in_group',
   $$select public.bs_save_expense(%1$L, gen_random_uuid(), 'X', 1000, %3$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %2$L, 'amount', 1000)))$$,
   pg_temp.invalid_json('paid_by', 'not_in_group')),
  ('bs_save_expense với phần chia của thành viên nhóm kia bị not_in_group',
   $$select public.bs_save_expense(%1$L, gen_random_uuid(), 'X', 1000, %2$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %3$L, 'amount', 1000)))$$,
   pg_temp.invalid_json('shares', 'not_in_group')),
  ('bs_save_expense chia lẫn thành viên của mình và nhóm kia bị not_in_group',
   $$select public.bs_save_expense(%1$L, gen_random_uuid(), 'X', 1000, %2$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %2$L, 'amount', 500), jsonb_build_object('member_id', %3$L, 'amount', 500)))$$,
   pg_temp.invalid_json('shares', 'not_in_group')),
  ('bs_save_expense sửa khoản chi của mình nhưng chia cho thành viên nhóm kia bị not_in_group',
   $$select public.bs_save_expense(%1$L, %4$L, 'Sửa', 1000, %2$L, date '2026-10-24', 'exact', jsonb_build_array(jsonb_build_object('member_id', %2$L, 'amount', 500), jsonb_build_object('member_id', %3$L, 'amount', 500)), 1)$$,
   pg_temp.invalid_json('shares', 'not_in_group')),
  ('bs_delete_expense xóa khoản chi của nhóm kia là việc không làm gì',
   $$select public.bs_delete_expense(%1$L, %5$L)$$,
   null::jsonb),
  ('bs_save_settlement ghi đè thanh toán của nhóm kia bị id_taken',
   $$select public.bs_save_settlement(%1$L, %7$L, %2$L, %8$L, 1000, date '2026-10-26')$$,
   pg_temp.invalid_json('settlement_id', 'id_taken')),
  ('bs_save_settlement với from_member của nhóm kia bị not_in_group',
   $$select public.bs_save_settlement(%1$L, gen_random_uuid(), %3$L, %2$L, 1000, date '2026-10-26')$$,
   pg_temp.invalid_json('from_member', 'not_in_group')),
  ('bs_save_settlement với to_member của nhóm kia bị not_in_group',
   $$select public.bs_save_settlement(%1$L, gen_random_uuid(), %2$L, %3$L, 1000, date '2026-10-26')$$,
   pg_temp.invalid_json('to_member', 'not_in_group')),
  ('bs_save_settlement sửa thanh toán của mình sang thành viên nhóm kia bị not_in_group',
   $$select public.bs_save_settlement(%1$L, %6$L, %3$L, %2$L, 1000, date '2026-10-26')$$,
   pg_temp.invalid_json('from_member', 'not_in_group')),
  ('bs_delete_settlement xóa thanh toán của nhóm kia là việc không làm gì',
   $$select public.bs_delete_settlement(%1$L, %7$L)$$,
   null::jsonb)
) as s(name, sql, expected);

select is(
  public.bs_get_group('test-group-a-token-00001'),
  pg_temp.get('a_before')::jsonb,
  'sau mọi lời gọi tấn công: snapshot nhóm A không đổi một byte'
);
select is(
  public.bs_get_group('test-group-b-token-00001'),
  pg_temp.get('b_before')::jsonb,
  'sau mọi lời gọi tấn công: snapshot nhóm B không đổi một byte'
);

-- ---------------------------------------------------------------------------
-- Snapshot và danh sách không lẫn dữ liệu nhóm khác
-- ---------------------------------------------------------------------------
select is(
  strpos((public.bs_get_group('test-group-a-token-00001'))::text, 'b0000000-'),
  0,
  'snapshot nhóm A không chứa id nào của nhóm B'
);
select is(
  strpos((public.bs_get_group('test-group-b-token-00001'))::text, 'a0000000-'),
  0,
  'snapshot nhóm B không chứa id nào của nhóm A'
);
select is(
  (select jsonb_agg(x.value ->> 'id') from jsonb_array_elements(public.bs_get_groups(array['test-group-a-token-00001'])) as x(value)),
  jsonb_build_array(pg_temp.uid('a', 1)),
  'bs_get_groups với token nhóm A chỉ trả nhóm A'
);
select is(
  (select jsonb_agg(x.value ->> 'id' order by x.value ->> 'id')
     from jsonb_array_elements(public.bs_get_groups(array['test-group-a-token-00001', 'test-group-b-token-00001'])) as x(value)),
  jsonb_build_array(pg_temp.uid('a', 1), pg_temp.uid('b', 1)),
  'bs_get_groups với hai token trả đúng hai nhóm'
);
select is(
  (select (x.value ->> 'expense_count') || '/' || (x.value ->> 'total_spent') || '/' || (x.value ->> 'member_count')
     from jsonb_array_elements(public.bs_get_groups(array['test-group-a-token-00001'])) as x(value)),
  '1/90000/3',
  'bs_get_groups: số liệu của nhóm A không lẫn nhóm B'
);

-- ---------------------------------------------------------------------------
-- Xóa nhóm A không ảnh hưởng nhóm B
-- ---------------------------------------------------------------------------
select lives_ok($$select public.bs_delete_group('test-group-a-token-00001')$$, 'bs_delete_group: xóa nhóm A');
select is(
  public.bs_get_group('test-group-b-token-00001'),
  pg_temp.get('b_before')::jsonb,
  'sau khi xóa nhóm A: nhóm B vẫn nguyên vẹn'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_groups(array['test-group-a-token-00001', 'test-group-b-token-00001'])) as x(value)),
  1::bigint,
  'sau khi xóa nhóm A: bs_get_groups chỉ còn nhóm B'
);

select * from finish();
rollback;
