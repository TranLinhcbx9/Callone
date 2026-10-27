-- Chia tiền: bs_save_expense và bs_delete_expense (hợp đồng mục 4, 5, 6, 7 và 9).
-- Gồm: tổng phần chia (sum_mismatch), chia đều lệch quá 1 đồng (unequal_split), gửi lại cùng id
-- (idempotent), sửa theo version (BS_CONFLICT, BS_NOT_FOUND), giới hạn 1000 khoản chi, thứ tự snapshot.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(117);

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

create function pg_temp.throws(p_sql text, p_state text, p_message text, p_detail jsonb, p_desc text) returns text
language sql
as $$
  select is(
    pg_temp.err(p_sql),
    jsonb_build_object('state', p_state, 'message', p_message, 'detail', p_detail),
    p_desc
  );
$$;

create function pg_temp.invalid(p_sql text, p_field text, p_reason text, p_desc text) returns text
language sql
as $$
  select pg_temp.throws(p_sql, 'PT422', 'BS_INVALID', jsonb_build_object('field', p_field, 'reason', p_reason), p_desc);
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

-- Id cố định: tiền tố là nhóm, n = 1 là nhóm, 101.. là thành viên, 201.. là khoản chi.
create function pg_temp.uid(p_prefix text, p_n integer) returns uuid
language sql
immutable
as $$
  select (p_prefix || '0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

create function pg_temp.ta() returns text
language sql
immutable
as $$
  select 'test-group-a-token-00001'::text;
$$;

-- Phần chia p_amounts cho các thành viên 101, 102, ... của nhóm có tiền tố p_prefix.
create function pg_temp.sh(p_prefix text, p_amounts bigint[]) returns jsonb
language sql
immutable
as $$
  select jsonb_agg(jsonb_build_object('member_id', pg_temp.uid(p_prefix, 100 + a.n::integer), 'amount', a.v) order by a.n)
    from unnest(p_amounts) with ordinality as a(v, n);
$$;

-- Gọi bs_save_expense cho nhóm A với khoản chi số p_n (id = uid('a', 200 + p_n)).
create function pg_temp.save(
  p_n       integer,
  p_amount  bigint,
  p_shares  jsonb,
  p_mode    text default 'equal',
  p_version integer default null,
  p_title   text default 'Ăn trưa',
  p_paid    uuid default pg_temp.uid('a', 101),
  p_spent_on date default date '2026-10-24',
  p_note    text default null
) returns jsonb
language sql
as $$
  select public.bs_save_expense(pg_temp.ta(), pg_temp.uid('a', 200 + p_n), p_title, p_amount, p_paid, p_spent_on, p_mode, p_shares, p_version, p_note);
$$;

-- Khoản chi số p_n của nhóm A trong snapshot hiện tại (null nếu không có).
create function pg_temp.exp(p_n integer) returns jsonb
language sql
as $$
  select e.value
    from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'expenses') as e(value)
   where e.value ->> 'id' = pg_temp.uid('a', 200 + p_n)::text;
$$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền
--   Nhóm A: An (101), Bình (102), Chi (103).   Nhóm B: Dũng (101), Em (102), có khoản chi b-201.
--   Nhóm D: 50 thành viên.   Nhóm E: 1 thành viên và đúng 1000 khoản chi (khoản e-201 có id cố định).
-- ---------------------------------------------------------------------------
insert into bill_split.groups (id, name, token_hash) values
  (pg_temp.uid('a', 1), 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8'))),
  (pg_temp.uid('b', 1), 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8'))),
  (pg_temp.uid('d', 1), 'Nhóm D', sha256(convert_to('test-group-d-token-00001', 'UTF8'))),
  (pg_temp.uid('e', 1), 'Nhóm E', sha256(convert_to('test-group-e-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position") values
  (pg_temp.uid('a', 101), pg_temp.uid('a', 1), 'An', 0),
  (pg_temp.uid('a', 102), pg_temp.uid('a', 1), 'Bình', 1),
  (pg_temp.uid('a', 103), pg_temp.uid('a', 1), 'Chi', 2),
  (pg_temp.uid('b', 101), pg_temp.uid('b', 1), 'Dũng', 0),
  (pg_temp.uid('b', 102), pg_temp.uid('b', 1), 'Em', 1),
  (pg_temp.uid('e', 101), pg_temp.uid('e', 1), 'Người E', 0);
insert into bill_split.members (id, group_id, name, "position")
select pg_temp.uid('d', 100 + g), pg_temp.uid('d', 1), 'Người ' || g, g - 1
  from generate_series(1, 50) g;
insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode) values
  (pg_temp.uid('b', 201), pg_temp.uid('b', 1), 'Cà phê của B', 60000, pg_temp.uid('b', 101), date '2026-10-24', 'equal');
insert into bill_split.expense_shares (expense_id, group_id, member_id, amount) values
  (pg_temp.uid('b', 201), pg_temp.uid('b', 1), pg_temp.uid('b', 101), 30000),
  (pg_temp.uid('b', 201), pg_temp.uid('b', 1), pg_temp.uid('b', 102), 30000);
insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
select case when g = 1 then pg_temp.uid('e', 201) else gen_random_uuid() end,
       pg_temp.uid('e', 1), 'Khoản chi ' || g, 1000, pg_temp.uid('e', 101), date '2026-10-24', 'exact'
  from generate_series(1, 1000) g;

set local role anon;

-- ---------------------------------------------------------------------------
-- Tạo mới
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select pg_temp.save(1, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))$$,
  'bs_save_expense: tạo khoản chi chia đều cho 3 người'
);
select is(
  pg_temp.exp(1) - 'created_at' - 'updated_at',
  jsonb_build_object(
    'id', pg_temp.uid('a', 201), 'title', 'Ăn trưa', 'amount', 100000, 'paid_by', pg_temp.uid('a', 101),
    'spent_on', '2026-10-24', 'split_mode', 'equal', 'note', null, 'version', 1,
    'shares', jsonb_build_array(
      jsonb_build_object('member_id', pg_temp.uid('a', 101), 'amount', 33334),
      jsonb_build_object('member_id', pg_temp.uid('a', 102), 'amount', 33333),
      jsonb_build_object('member_id', pg_temp.uid('a', 103), 'amount', 33333)
    )
  ),
  'bs_save_expense: khoản chi mới có version 1, note null, ngày dạng YYYY-MM-DD và phần chia đủ'
);
select matches(
  pg_temp.exp(1) ->> 'created_at',
  '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$',
  'bs_save_expense: created_at là chuỗi ISO 8601'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.exp(1)) as k),
  array['amount', 'created_at', 'id', 'note', 'paid_by', 'shares', 'spent_on', 'split_mode', 'title', 'updated_at', 'version'],
  'bs_save_expense: khoản chi trong snapshot có đúng các khóa của hợp đồng'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.save(2, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))) as k),
  array['expenses', 'group', 'members', 'settlements', 'v'],
  'bs_save_expense: trả về snapshot đầy đủ'
);
select is(
  (select jsonb_agg(s.value) from jsonb_array_elements(pg_temp.exp(2) -> 'shares') as s(value)),
  (select jsonb_agg(s.value) from jsonb_array_elements(pg_temp.exp(1) -> 'shares') as s(value)),
  'bs_save_expense: phần chia của hai khoản chi giống nhau'
);

select lives_ok(
  $$select pg_temp.save(3, 100000, jsonb_build_array(
      jsonb_build_object('member_id', pg_temp.uid('a', 103), 'amount', 33333),
      jsonb_build_object('member_id', pg_temp.uid('a', 102), 'amount', 33333),
      jsonb_build_object('member_id', pg_temp.uid('a', 101), 'amount', 33334)))$$,
  'bs_save_expense: gửi phần chia theo thứ tự ngược'
);
select is(
  (select jsonb_agg(s.value ->> 'member_id' order by s.ord) from jsonb_array_elements(pg_temp.exp(3) -> 'shares') with ordinality as s(value, ord)),
  jsonb_build_array(pg_temp.uid('a', 101), pg_temp.uid('a', 102), pg_temp.uid('a', 103)),
  'snapshot: phần chia của mỗi khoản chi sắp theo position của thành viên'
);

select lives_ok(
  $$select pg_temp.save(4, 100000, pg_temp.sh('a', array[100000, 0, 0]), 'exact')$$,
  'bs_save_expense: chia riêng cho phép có phần bằng 0 miễn có ít nhất một phần lớn hơn 0'
);
select is(
  (select jsonb_agg(s.value -> 'amount' order by s.ord) from jsonb_array_elements(pg_temp.exp(4) -> 'shares') with ordinality as s(value, ord)),
  '[100000, 0, 0]'::jsonb,
  'bs_save_expense: phần chia bằng 0 vẫn được lưu và trả về'
);

select lives_ok(
  $$select pg_temp.save(5, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_note => '  Ghi chú  ')$$,
  'bs_save_expense: tạo khoản chi có ghi chú'
);
select is(pg_temp.exp(5) ->> 'note', 'Ghi chú', 'bs_save_expense: note được trim');
select lives_ok(
  $$select pg_temp.save(6, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_note => '   ')$$,
  'bs_save_expense: tạo khoản chi có note toàn khoảng trắng'
);
select is(pg_temp.exp(6) -> 'note', 'null'::jsonb, 'bs_save_expense: note rỗng sau khi trim thì lưu null');
select is(pg_temp.exp(1) ->> 'title', 'Ăn trưa', 'bs_save_expense: title được lưu');
select lives_ok(
  $$select pg_temp.save(7, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_title => '  Tiêu đề có khoảng trắng  ', p_spent_on => date '2026-10-25')$$,
  'bs_save_expense: tạo khoản chi ngày 25'
);
select is(pg_temp.exp(7) ->> 'title', 'Tiêu đề có khoảng trắng', 'bs_save_expense: title được trim');

-- Thứ tự: spent_on giảm dần, rồi created_at giảm dần, rồi id.
select is(
  (select jsonb_agg(e.value ->> 'id' order by e.ord)
     from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'expenses') with ordinality as e(value, ord)),
  jsonb_build_array(
    pg_temp.uid('a', 207),
    pg_temp.uid('a', 201), pg_temp.uid('a', 202), pg_temp.uid('a', 203), pg_temp.uid('a', 204), pg_temp.uid('a', 205), pg_temp.uid('a', 206)
  ),
  'snapshot: expenses sắp theo spent_on giảm dần, cùng ngày và cùng created_at thì theo id'
);
reset role;
update bill_split.expenses set created_at = created_at + interval '1 minute' where id = pg_temp.uid('a', 204);
set local role anon;
select is(
  (select jsonb_agg(e.value ->> 'id' order by e.ord)
     from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'expenses') with ordinality as e(value, ord)),
  jsonb_build_array(
    pg_temp.uid('a', 207),
    pg_temp.uid('a', 204),
    pg_temp.uid('a', 201), pg_temp.uid('a', 202), pg_temp.uid('a', 203), pg_temp.uid('a', 205), pg_temp.uid('a', 206)
  ),
  'snapshot: cùng spent_on thì created_at giảm dần'
);

-- ---------------------------------------------------------------------------
-- Kiểm dữ liệu: các trường của khoản chi
-- ---------------------------------------------------------------------------
select pg_temp.invalid($$select pg_temp.save(9, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_title => '')$$, 'title', 'required', 'bs_save_expense: title rỗng thì required');
select pg_temp.invalid($$select pg_temp.save(9, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_title => null)$$, 'title', 'required', 'bs_save_expense: title null thì required');
select pg_temp.invalid($$select pg_temp.save(9, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_title => repeat('a', 81))$$, 'title', 'too_long', 'bs_save_expense: title 81 ký tự thì too_long');
select lives_ok($$select pg_temp.save(9, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_title => repeat('a', 80))$$, 'bs_save_expense: title đúng 80 ký tự được chấp nhận');

select pg_temp.invalid($$select pg_temp.save(10, 0, pg_temp.sh('a', array[0, 0, 0]))$$, 'amount', 'out_of_range', 'bs_save_expense: amount 0 thì out_of_range');
select pg_temp.invalid($$select pg_temp.save(10, -1, pg_temp.sh('a', array[33334, 33333, 33333]))$$, 'amount', 'out_of_range', 'bs_save_expense: amount âm thì out_of_range');
select pg_temp.invalid($$select pg_temp.save(10, 1000000000000, pg_temp.sh('a', array[333333333334, 333333333333, 333333333333]))$$, 'amount', 'out_of_range', 'bs_save_expense: amount vượt 999 999 999 999 thì out_of_range');
select pg_temp.invalid($$select pg_temp.save(10, null, pg_temp.sh('a', array[33334, 33333, 33333]))$$, 'amount', 'required', 'bs_save_expense: amount null thì required');
select lives_ok($$select pg_temp.save(11, 999999999999, pg_temp.sh('a', array[333333333333, 333333333333, 333333333333]))$$, 'bs_save_expense: amount đúng 999 999 999 999 được chấp nhận');
select lives_ok($$select pg_temp.save(12, 1, pg_temp.sh('a', array[1, 0, 0]))$$, 'bs_save_expense: amount 1 chia đều cho 3 người (1, 0, 0) lệch đúng 1 đồng nên được chấp nhận');

select pg_temp.invalid($$select pg_temp.save(13, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_spent_on => date '1999-12-31')$$, 'spent_on', 'out_of_range', 'bs_save_expense: spent_on trước 2000-01-01 thì out_of_range');
select pg_temp.invalid($$select pg_temp.save(13, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_spent_on => date '2101-01-01')$$, 'spent_on', 'out_of_range', 'bs_save_expense: spent_on sau 2100-12-31 thì out_of_range');
select pg_temp.invalid($$select pg_temp.save(13, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_spent_on => null)$$, 'spent_on', 'required', 'bs_save_expense: spent_on null thì required');
select lives_ok($$select pg_temp.save(14, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_spent_on => date '2000-01-01')$$, 'bs_save_expense: spent_on đúng 2000-01-01 được chấp nhận');
select lives_ok($$select pg_temp.save(15, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_spent_on => date '2100-12-31')$$, 'bs_save_expense: spent_on đúng 2100-12-31 được chấp nhận');

select pg_temp.invalid($$select pg_temp.save(16, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), 'percent')$$, 'split_mode', 'format', 'bs_save_expense: split_mode không phải equal hoặc exact thì format');
select pg_temp.invalid($$select pg_temp.save(16, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), 'EQUAL')$$, 'split_mode', 'format', 'bs_save_expense: split_mode phân biệt hoa thường');
select pg_temp.invalid($$select pg_temp.save(16, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), null)$$, 'split_mode', 'required', 'bs_save_expense: split_mode null thì required');

select pg_temp.invalid($$select pg_temp.save(17, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_note => repeat('a', 501))$$, 'note', 'too_long', 'bs_save_expense: note 501 ký tự thì too_long');
select lives_ok($$select pg_temp.save(17, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_note => repeat('a', 500))$$, 'bs_save_expense: note đúng 500 ký tự được chấp nhận');

select pg_temp.invalid($$select pg_temp.save(18, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_paid => pg_temp.uid('a', 999))$$, 'paid_by', 'not_in_group', 'bs_save_expense: paid_by không tồn tại thì not_in_group');
select pg_temp.invalid($$select pg_temp.save(18, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_paid => pg_temp.uid('b', 101))$$, 'paid_by', 'not_in_group', 'bs_save_expense: paid_by là thành viên nhóm khác thì not_in_group');
select pg_temp.invalid($$select pg_temp.save(18, 100000, pg_temp.sh('a', array[33334, 33333, 33333]), p_paid => null)$$, 'paid_by', 'required', 'bs_save_expense: paid_by null thì required');
select pg_temp.invalid(
  $$select public.bs_save_expense(pg_temp.ta(), null, 'X', 100000, pg_temp.uid('a', 101), date '2026-10-24', 'equal', pg_temp.sh('a', array[33334, 33333, 33333]))$$,
  'expense_id', 'required', 'bs_save_expense: expense_id null thì required'
);

-- ---------------------------------------------------------------------------
-- Kiểm dữ liệu: phần chia
-- ---------------------------------------------------------------------------
select pg_temp.invalid(
  format('select pg_temp.save(19, 100000, %L::jsonb)', s.shares),
  'shares', s.reason,
  'bs_save_expense: shares ' || s.name || ' thì ' || s.reason
)
from (values
  ('là object', '{}', 'format'),
  ('là chuỗi', '"x"', 'format'),
  ('là số', '5', 'format'),
  ('là JSON null', 'null', 'required'),
  ('là mảng rỗng', '[]', 'empty'),
  ('có phần tử không phải object', '[1]', 'format'),
  ('thiếu member_id', '[{"amount": 100000}]', 'required'),
  ('có member_id null', '[{"member_id": null, "amount": 100000}]', 'required'),
  ('có member_id là số', '[{"member_id": 5, "amount": 100000}]', 'format'),
  ('có member_id không phải uuid', '[{"member_id": "abc", "amount": 100000}]', 'format'),
  ('có member_id viết kiểu có ngoặc nhọn', '[{"member_id": "{a0000000-0000-4000-8000-000000000101}", "amount": 100000}]', 'format'),
  ('thiếu amount', '[{"member_id": "a0000000-0000-4000-8000-000000000101"}]', 'required'),
  ('có amount là chuỗi', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": "100000"}]', 'format'),
  ('có amount có phần lẻ', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 99999.5}]', 'format'),
  ('có amount là boolean', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": true}]', 'format'),
  ('có amount âm', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": -1}]', 'out_of_range'),
  ('có amount vượt 999 999 999 999', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 1000000000000}]', 'out_of_range'),
  ('có member_id lặp', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 50000}, {"member_id": "A0000000-0000-4000-8000-000000000101", "amount": 50000}]', 'duplicate'),
  ('có member_id của nhóm khác', '[{"member_id": "b0000000-0000-4000-8000-000000000101", "amount": 100000}]', 'not_in_group'),
  ('có member_id không tồn tại', '[{"member_id": "c0000000-0000-4000-8000-0000000000ff", "amount": 100000}]', 'not_in_group'),
  ('không có phần nào lớn hơn 0', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 0}, {"member_id": "a0000000-0000-4000-8000-000000000102", "amount": 0}]', 'empty'),
  ('có tổng nhỏ hơn số tiền', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 50000}, {"member_id": "a0000000-0000-4000-8000-000000000102", "amount": 49999}]', 'sum_mismatch'),
  ('có tổng lớn hơn số tiền', '[{"member_id": "a0000000-0000-4000-8000-000000000101", "amount": 50000}, {"member_id": "a0000000-0000-4000-8000-000000000102", "amount": 50001}]', 'sum_mismatch')
) as s(name, shares, reason);

select pg_temp.invalid($$select pg_temp.save(19, 100000, null)$$, 'shares', 'required', 'bs_save_expense: shares null thì required');
select pg_temp.invalid(
  $$select pg_temp.save(19, 100000, (select jsonb_agg(jsonb_build_object('member_id', gen_random_uuid(), 'amount', 1)) from generate_series(1, 51)))$$,
  'shares', 'too_many', 'bs_save_expense: hơn 50 phần chia thì too_many'
);
select lives_ok(
  $$select public.bs_save_expense('test-group-d-token-00001', pg_temp.uid('d', 201), 'Cả nhóm 50 người', 100000, pg_temp.uid('d', 101), date '2026-10-24', 'equal',
      (select jsonb_agg(jsonb_build_object('member_id', pg_temp.uid('d', 100 + g), 'amount', 2000) order by g) from generate_series(1, 50) g))$$,
  'bs_save_expense: đúng 50 phần chia được chấp nhận'
);

select pg_temp.invalid(
  $$select pg_temp.save(19, 100000, pg_temp.sh('a', array[50000, 30000, 20000]))$$,
  'shares', 'unequal_split', 'bs_save_expense: chia đều mà phần lớn nhất hơn phần nhỏ nhất quá 1 đồng thì unequal_split'
);
select pg_temp.invalid(
  $$select pg_temp.save(19, 100000, pg_temp.sh('a', array[34000, 33000, 33000]))$$,
  'shares', 'unequal_split', 'bs_save_expense: chia đều lệch 1000 đồng thì unequal_split'
);
select pg_temp.invalid(
  $$select pg_temp.save(19, 100, pg_temp.sh('a', array[100, 0]))$$,
  'shares', 'unequal_split', 'bs_save_expense: chia đều mà có phần bằng 0 trong khi phần khác lớn thì unequal_split'
);
select lives_ok(
  $$select pg_temp.save(21, 100000, pg_temp.sh('a', array[50000, 30000, 20000]), 'exact')$$,
  'bs_save_expense: chia riêng cho phép phần chia khác nhau'
);
select lives_ok(
  $$select pg_temp.save(22, 100000, pg_temp.sh('a', array[50000, 50000]))$$,
  'bs_save_expense: chia đều chỉ cho 2 trong 3 thành viên'
);
select pg_temp.invalid(
  $$select pg_temp.save(19, 100000, pg_temp.sh('a', array[33334, 33333, 33332]), 'exact')$$,
  'shares', 'sum_mismatch', 'bs_save_expense: chia riêng mà tổng sai thì sum_mismatch'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'expenses') as e(value) where e.value ->> 'id' = pg_temp.uid('a', 219)::text),
  0::bigint,
  'bs_save_expense: mọi lời gọi bị từ chối không để lại khoản chi nào'
);

-- ---------------------------------------------------------------------------
-- Gửi lại cùng id (rớt mạng): không tạo bản ghi thứ hai
-- ---------------------------------------------------------------------------
select lives_ok($$select pg_temp.save(30, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))$$, 'bs_save_expense: tạo khoản chi 30');
do $$
begin
  perform pg_temp.put('before_retry', public.bs_get_group(pg_temp.ta())::text);
end;
$$;
select is(
  pg_temp.save(30, 55555, pg_temp.sh('a', array[18519, 18518, 18518]), p_title => 'Tiêu đề khác'),
  pg_temp.get('before_retry')::jsonb,
  'bs_save_expense: gửi lại cùng id (version null) không ghi gì và trả snapshot hiện tại'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'expenses') as e(value) where e.value ->> 'id' = pg_temp.uid('a', 230)::text),
  1::bigint,
  'bs_save_expense: gửi lại cùng id không tạo bản ghi thứ hai'
);
select is(pg_temp.exp(30) ->> 'title', 'Ăn trưa', 'bs_save_expense: gửi lại không ghi đè dữ liệu');
select is(pg_temp.exp(30) ->> 'version', '1', 'bs_save_expense: gửi lại không tăng version');

-- ---------------------------------------------------------------------------
-- Sửa theo version
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.put('created_30', pg_temp.exp(30) ->> 'created_at');
end;
$$;
select lives_ok(
  $$select pg_temp.save(30, 90000, pg_temp.sh('a', array[0, 40000, 50000]), 'exact', 1,
      p_title => 'Đã sửa', p_paid => pg_temp.uid('a', 102), p_spent_on => date '2026-10-26', p_note => 'ghi chú mới')$$,
  'bs_save_expense: sửa khoản chi với đúng version'
);
select is(
  pg_temp.exp(30) - 'created_at' - 'updated_at',
  jsonb_build_object(
    'id', pg_temp.uid('a', 230), 'title', 'Đã sửa', 'amount', 90000, 'paid_by', pg_temp.uid('a', 102),
    'spent_on', '2026-10-26', 'split_mode', 'exact', 'note', 'ghi chú mới', 'version', 2,
    'shares', jsonb_build_array(
      jsonb_build_object('member_id', pg_temp.uid('a', 101), 'amount', 0),
      jsonb_build_object('member_id', pg_temp.uid('a', 102), 'amount', 40000),
      jsonb_build_object('member_id', pg_temp.uid('a', 103), 'amount', 50000)
    )
  ),
  'bs_save_expense: sửa cập nhật các cột, tăng version và thay toàn bộ phần chia cũ'
);
select is(pg_temp.exp(30) ->> 'created_at', pg_temp.get('created_30'), 'bs_save_expense: sửa không đổi created_at');

do $$
begin
  perform pg_temp.put('before_conflict', public.bs_get_group(pg_temp.ta())::text);
end;
$$;
select pg_temp.throws(
  $$select pg_temp.save(30, 60000, pg_temp.sh('a', array[20000, 20000, 20000]), p_version => 1)$$,
  'PT409', 'BS_CONFLICT', '{"entity":"expense","current_version":2}',
  'bs_save_expense: sửa bằng version cũ thì BS_CONFLICT kèm current_version'
);
select pg_temp.throws(
  $$select pg_temp.save(30, 60000, pg_temp.sh('a', array[20000, 20000, 20000]), p_version => 7)$$,
  'PT409', 'BS_CONFLICT', '{"entity":"expense","current_version":2}',
  'bs_save_expense: sửa bằng version lớn hơn hiện tại cũng là BS_CONFLICT'
);
select is(public.bs_get_group(pg_temp.ta()), pg_temp.get('before_conflict')::jsonb, 'bs_save_expense: bị BS_CONFLICT thì không ghi gì');
select lives_ok(
  $$select pg_temp.save(30, 60000, pg_temp.sh('a', array[20000, 20000, 20000]), p_version => 2, p_title => 'Sửa lần hai')$$,
  'bs_save_expense: sửa tiếp bằng version mới nhất'
);
select is(pg_temp.exp(30) ->> 'version', '3', 'bs_save_expense: version tăng 1 mỗi lần sửa');
select pg_temp.throws(
  $$select pg_temp.save(31, 60000, pg_temp.sh('a', array[20000, 20000, 20000]), p_version => 1)$$,
  'PT404', 'BS_NOT_FOUND', '{"entity":"expense"}',
  'bs_save_expense: sửa khoản chi không còn thì BS_NOT_FOUND'
);

do $$
begin
  perform pg_temp.put('before_bad_edit', public.bs_get_group(pg_temp.ta())::text);
end;
$$;
select pg_temp.invalid(
  $$select pg_temp.save(30, 60000, pg_temp.sh('a', array[20000, 20000, 19999]), p_version => 3)$$,
  'shares', 'sum_mismatch', 'bs_save_expense: sửa với tổng phần chia sai thì sum_mismatch'
);
select pg_temp.invalid(
  $$select pg_temp.save(30, 60000, pg_temp.sh('a', array[20000, 20000, 20000]), p_version => 3, p_paid => pg_temp.uid('b', 101))$$,
  'paid_by', 'not_in_group', 'bs_save_expense: sửa với paid_by của nhóm khác thì not_in_group'
);
select is(public.bs_get_group(pg_temp.ta()), pg_temp.get('before_bad_edit')::jsonb, 'bs_save_expense: sửa bị từ chối thì dữ liệu và phần chia cũ giữ nguyên');

-- ---------------------------------------------------------------------------
-- Xóa và hoàn tác xóa
-- ---------------------------------------------------------------------------
select lives_ok($$select public.bs_delete_expense(pg_temp.ta(), pg_temp.uid('a', 230))$$, 'bs_delete_expense: xóa khoản chi 30');
select is(pg_temp.exp(30), null::jsonb, 'bs_delete_expense: khoản chi không còn trong snapshot');
reset role;
select is(
  (select count(*) from bill_split.expense_shares s where s.expense_id = pg_temp.uid('a', 230)),
  0::bigint,
  'bs_delete_expense: phần chia xóa theo khoản chi'
);
set local role anon;
select is(
  public.bs_delete_expense(pg_temp.ta(), gen_random_uuid()),
  public.bs_get_group(pg_temp.ta()),
  'bs_delete_expense: id không có thì thôi, trả snapshot'
);
select pg_temp.invalid($$select public.bs_delete_expense(pg_temp.ta(), null)$$, 'expense_id', 'required', 'bs_delete_expense: expense_id null thì required');
select lives_ok(
  $$select pg_temp.save(30, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))$$,
  'bs_save_expense: hoàn tác xóa bằng cách tạo lại đúng id cũ với version null'
);
select is(pg_temp.exp(30) ->> 'version', '1', 'bs_save_expense: khoản chi được tạo lại có version 1');

-- ---------------------------------------------------------------------------
-- Giới hạn 1000 khoản chi
-- ---------------------------------------------------------------------------
select pg_temp.throws(
  $$select public.bs_save_expense('test-group-e-token-00001', gen_random_uuid(), 'Quá giới hạn', 1000, pg_temp.uid('e', 101), date '2026-10-24', 'exact',
      jsonb_build_array(jsonb_build_object('member_id', pg_temp.uid('e', 101), 'amount', 1000)))$$,
  'PT422', 'BS_LIMIT', '{"limit":"expenses"}',
  'bs_save_expense: nhóm đã có 1000 khoản chi thì BS_LIMIT expenses'
);
select lives_ok(
  $$select public.bs_save_expense('test-group-e-token-00001', pg_temp.uid('e', 201), 'Sửa trong nhóm đầy', 1000, pg_temp.uid('e', 101), date '2026-10-24', 'exact',
      jsonb_build_array(jsonb_build_object('member_id', pg_temp.uid('e', 101), 'amount', 1000)), 1)$$,
  'bs_save_expense: nhóm đủ 1000 khoản chi vẫn sửa được khoản có sẵn'
);
select lives_ok(
  $$select public.bs_save_expense('test-group-e-token-00001', pg_temp.uid('e', 201), 'Gửi lại trong nhóm đầy', 1000, pg_temp.uid('e', 101), date '2026-10-24', 'exact',
      jsonb_build_array(jsonb_build_object('member_id', pg_temp.uid('e', 101), 'amount', 1000)))$$,
  'bs_save_expense: nhóm đủ 1000 khoản chi vẫn nhận lời gửi lại của khoản có sẵn'
);
select lives_ok($$select public.bs_delete_expense('test-group-e-token-00001', pg_temp.uid('e', 201))$$, 'bs_delete_expense: xóa một khoản trong nhóm đầy');
select lives_ok(
  $$select public.bs_save_expense('test-group-e-token-00001', gen_random_uuid(), 'Thêm sau khi xóa', 1000, pg_temp.uid('e', 101), date '2026-10-24', 'exact',
      jsonb_build_array(jsonb_build_object('member_id', pg_temp.uid('e', 101), 'amount', 1000)))$$,
  'bs_save_expense: xóa bớt thì thêm được lại'
);
reset role;
select is((select count(*) from bill_split.expenses e where e.group_id = pg_temp.uid('e', 1)), 1000::bigint, 'giới hạn khoản chi: nhóm E giữ đúng 1000 khoản');
set local role anon;

-- ---------------------------------------------------------------------------
-- Id đã thuộc nhóm khác
-- ---------------------------------------------------------------------------
select pg_temp.invalid(
  $$select public.bs_save_expense(pg_temp.ta(), pg_temp.uid('b', 201), 'Chiếm id', 60000, pg_temp.uid('a', 101), date '2026-10-24', 'equal', pg_temp.sh('a', array[30000, 30000]))$$,
  'expense_id', 'id_taken', 'bs_save_expense: id đã thuộc khoản chi của nhóm khác thì id_taken'
);
select pg_temp.throws(
  $$select public.bs_save_expense(pg_temp.ta(), pg_temp.uid('b', 201), 'Sửa trộm', 60000, pg_temp.uid('a', 101), date '2026-10-24', 'equal', pg_temp.sh('a', array[30000, 30000]), 1)$$,
  'PT404', 'BS_NOT_FOUND', '{"entity":"expense"}',
  'bs_save_expense: sửa id của nhóm khác thì BS_NOT_FOUND'
);
select is(
  (public.bs_get_group('test-group-b-token-00001') -> 'expenses' -> 0) ->> 'title',
  'Cà phê của B',
  'bs_save_expense: khoản chi của nhóm B không bị đụng tới'
);

-- ---------------------------------------------------------------------------
-- updated_at của nhóm và bất biến của dữ liệu
-- ---------------------------------------------------------------------------
reset role;
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = pg_temp.uid('a', 1);
set local role anon;
select lives_ok($$select pg_temp.save(30, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))$$, 'bs_save_expense: gửi lại khoản chi có sẵn');
select lives_ok($$select public.bs_delete_expense(pg_temp.ta(), gen_random_uuid())$$, 'bs_delete_expense: xóa id lạ');
reset role;
select is(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  timestamptz '2000-01-01 00:00:00+00',
  'gửi lại và xóa id lạ không ghi gì nên không đổi groups.updated_at'
);
set local role anon;
select lives_ok($$select pg_temp.save(40, 100000, pg_temp.sh('a', array[33334, 33333, 33333]))$$, 'bs_save_expense: tạo khoản chi để kiểm updated_at');
select lives_ok($$select public.bs_delete_expense(pg_temp.ta(), pg_temp.uid('a', 240))$$, 'bs_delete_expense: xóa khoản chi để kiểm updated_at');
reset role;
select cmp_ok(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  '>',
  timestamptz '2020-01-01 00:00:00+00',
  'bs_save_expense và bs_delete_expense cập nhật groups.updated_at'
);
select is(
  (select count(*)
     from bill_split.expenses e
    where e.group_id = pg_temp.uid('a', 1)
      and e.amount is distinct from (select sum(s.amount) from bill_split.expense_shares s where s.expense_id = e.id)),
  0::bigint,
  'bất biến: với mọi khoản chi của nhóm A, tổng phần chia đúng bằng số tiền'
);
select is(
  (select count(*)
     from bill_split.expenses e
    where e.group_id = pg_temp.uid('a', 1)
      and not exists (select 1 from bill_split.expense_shares s where s.expense_id = e.id)),
  0::bigint,
  'bất biến: mọi khoản chi của nhóm A đều có phần chia'
);

select * from finish();
rollback;
