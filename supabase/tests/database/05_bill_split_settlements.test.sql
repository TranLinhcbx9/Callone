-- Chia tiền: bs_save_settlement và bs_delete_settlement (hợp đồng mục 4, 5, 6, 7 và 9).
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(57);

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

-- Id cố định: tiền tố là nhóm, n = 1 là nhóm, 101.. là thành viên, 301.. là thanh toán.
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

-- Gọi bs_save_settlement cho nhóm A: thanh toán số p_n, từ thành viên p_from tới thành viên p_to (1, 2, 3).
create function pg_temp.pay(
  p_n       integer,
  p_from    integer,
  p_to      integer,
  p_amount  bigint,
  p_settled date default date '2026-10-26',
  p_note    text default null
) returns jsonb
language sql
as $$
  select public.bs_save_settlement(
    pg_temp.ta(), pg_temp.uid('a', 300 + p_n), pg_temp.uid('a', 100 + p_from), pg_temp.uid('a', 100 + p_to),
    p_amount, p_settled, p_note
  );
$$;

-- Thanh toán số p_n của nhóm A trong snapshot hiện tại (null nếu không có).
create function pg_temp.pmt(p_n integer) returns jsonb
language sql
as $$
  select s.value
    from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'settlements') as s(value)
   where s.value ->> 'id' = pg_temp.uid('a', 300 + p_n)::text;
$$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền
--   Nhóm A: An (101), Bình (102), Chi (103).   Nhóm B: Dũng (101), Em (102), có thanh toán b-301.
--   Nhóm E: 2 thành viên và đúng 1000 thanh toán (thanh toán e-301 có id cố định).
-- ---------------------------------------------------------------------------
insert into bill_split.groups (id, name, token_hash) values
  (pg_temp.uid('a', 1), 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8'))),
  (pg_temp.uid('b', 1), 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8'))),
  (pg_temp.uid('e', 1), 'Nhóm E', sha256(convert_to('test-group-e-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position") values
  (pg_temp.uid('a', 101), pg_temp.uid('a', 1), 'An', 0),
  (pg_temp.uid('a', 102), pg_temp.uid('a', 1), 'Bình', 1),
  (pg_temp.uid('a', 103), pg_temp.uid('a', 1), 'Chi', 2),
  (pg_temp.uid('b', 101), pg_temp.uid('b', 1), 'Dũng', 0),
  (pg_temp.uid('b', 102), pg_temp.uid('b', 1), 'Em', 1),
  (pg_temp.uid('e', 101), pg_temp.uid('e', 1), 'Người E1', 0),
  (pg_temp.uid('e', 102), pg_temp.uid('e', 1), 'Người E2', 1);
insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on) values
  (pg_temp.uid('b', 301), pg_temp.uid('b', 1), pg_temp.uid('b', 102), pg_temp.uid('b', 101), 5000, date '2026-10-25');
insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
select case when g = 1 then pg_temp.uid('e', 301) else gen_random_uuid() end,
       pg_temp.uid('e', 1), pg_temp.uid('e', 101), pg_temp.uid('e', 102), 1000, date '2026-10-25'
  from generate_series(1, 1000) g;

set local role anon;

-- ---------------------------------------------------------------------------
-- Tạo mới
-- ---------------------------------------------------------------------------
select lives_ok($$select pg_temp.pay(1, 2, 1, 50000)$$, 'bs_save_settlement: Bình trả An 50.000');
select is(
  pg_temp.pmt(1) - 'created_at' - 'updated_at',
  jsonb_build_object(
    'id', pg_temp.uid('a', 301), 'from_member', pg_temp.uid('a', 102), 'to_member', pg_temp.uid('a', 101),
    'amount', 50000, 'settled_on', '2026-10-26', 'note', null
  ),
  'bs_save_settlement: thanh toán mới có đúng các trường của hợp đồng, note null, ngày dạng YYYY-MM-DD'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.pmt(1)) as k),
  array['amount', 'created_at', 'from_member', 'id', 'note', 'settled_on', 'to_member', 'updated_at'],
  'bs_save_settlement: thanh toán trong snapshot có đúng các khóa của hợp đồng (không có version)'
);
select matches(
  pg_temp.pmt(1) ->> 'created_at',
  '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$',
  'bs_save_settlement: created_at là chuỗi ISO 8601'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.pay(2, 3, 1, 10000, date '2026-10-26')) as k),
  array['expenses', 'group', 'members', 'settlements', 'v'],
  'bs_save_settlement: trả về snapshot đầy đủ'
);
select lives_ok($$select pg_temp.pay(3, 3, 2, 20000, date '2026-10-27', '  Chuyển khoản  ')$$, 'bs_save_settlement: tạo thanh toán ngày 27 có ghi chú');
select is(pg_temp.pmt(3) ->> 'note', 'Chuyển khoản', 'bs_save_settlement: note được trim');
select lives_ok($$select pg_temp.pay(4, 3, 2, 20000, date '2026-10-26', '   ')$$, 'bs_save_settlement: tạo thanh toán có note toàn khoảng trắng');
select is(pg_temp.pmt(4) -> 'note', 'null'::jsonb, 'bs_save_settlement: note rỗng sau khi trim thì lưu null');

-- Thứ tự: settled_on giảm dần, rồi created_at giảm dần, rồi id.
select is(
  (select jsonb_agg(s.value ->> 'id' order by s.ord)
     from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'settlements') with ordinality as s(value, ord)),
  jsonb_build_array(pg_temp.uid('a', 303), pg_temp.uid('a', 301), pg_temp.uid('a', 302), pg_temp.uid('a', 304)),
  'snapshot: settlements sắp theo settled_on giảm dần, cùng ngày và cùng created_at thì theo id'
);
reset role;
update bill_split.settlements set created_at = created_at + interval '1 minute' where id = pg_temp.uid('a', 304);
set local role anon;
select is(
  (select jsonb_agg(s.value ->> 'id' order by s.ord)
     from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'settlements') with ordinality as s(value, ord)),
  jsonb_build_array(pg_temp.uid('a', 303), pg_temp.uid('a', 304), pg_temp.uid('a', 301), pg_temp.uid('a', 302)),
  'snapshot: cùng settled_on thì created_at giảm dần'
);

-- ---------------------------------------------------------------------------
-- Ghi đè (không có version)
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.put('created_1', pg_temp.pmt(1) ->> 'created_at');
end;
$$;
select lives_ok(
  $$select pg_temp.pay(1, 1, 3, 70000, date '2026-10-28', 'sửa')$$,
  'bs_save_settlement: id đã có trong nhóm thì ghi đè'
);
select is(
  pg_temp.pmt(1) - 'created_at' - 'updated_at',
  jsonb_build_object(
    'id', pg_temp.uid('a', 301), 'from_member', pg_temp.uid('a', 101), 'to_member', pg_temp.uid('a', 103),
    'amount', 70000, 'settled_on', '2026-10-28', 'note', 'sửa'
  ),
  'bs_save_settlement: ghi đè cập nhật mọi trường'
);
select is(pg_temp.pmt(1) ->> 'created_at', pg_temp.get('created_1'), 'bs_save_settlement: ghi đè không đổi created_at');
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'settlements') as s(value) where s.value ->> 'id' = pg_temp.uid('a', 301)::text),
  1::bigint,
  'bs_save_settlement: ghi đè không tạo bản ghi thứ hai'
);

-- ---------------------------------------------------------------------------
-- Kiểm dữ liệu
-- ---------------------------------------------------------------------------
select pg_temp.invalid($$select pg_temp.pay(9, 1, 1, 50000)$$, 'to_member', 'same_member', 'bs_save_settlement: người trả và người nhận trùng nhau thì same_member (field to_member)');
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), pg_temp.uid('b', 101), pg_temp.uid('a', 101), 50000, date '2026-10-26')$$,
  'from_member', 'not_in_group', 'bs_save_settlement: from_member của nhóm khác thì not_in_group'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), pg_temp.uid('a', 101), pg_temp.uid('b', 101), 50000, date '2026-10-26')$$,
  'to_member', 'not_in_group', 'bs_save_settlement: to_member của nhóm khác thì not_in_group'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), gen_random_uuid(), pg_temp.uid('a', 101), 50000, date '2026-10-26')$$,
  'from_member', 'not_in_group', 'bs_save_settlement: from_member không tồn tại thì not_in_group'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), pg_temp.uid('a', 101), gen_random_uuid(), 50000, date '2026-10-26')$$,
  'to_member', 'not_in_group', 'bs_save_settlement: to_member không tồn tại thì not_in_group'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), null, pg_temp.uid('a', 101), 50000, date '2026-10-26')$$,
  'from_member', 'required', 'bs_save_settlement: from_member null thì required'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('a', 309), pg_temp.uid('a', 101), null, 50000, date '2026-10-26')$$,
  'to_member', 'required', 'bs_save_settlement: to_member null thì required'
);
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), null, pg_temp.uid('a', 101), pg_temp.uid('a', 102), 50000, date '2026-10-26')$$,
  'settlement_id', 'required', 'bs_save_settlement: settlement_id null thì required'
);
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 0)$$, 'amount', 'out_of_range', 'bs_save_settlement: amount 0 thì out_of_range');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, -5)$$, 'amount', 'out_of_range', 'bs_save_settlement: amount âm thì out_of_range');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 1000000000000)$$, 'amount', 'out_of_range', 'bs_save_settlement: amount vượt 999 999 999 999 thì out_of_range');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, null)$$, 'amount', 'required', 'bs_save_settlement: amount null thì required');
select lives_ok($$select pg_temp.pay(10, 1, 2, 1)$$, 'bs_save_settlement: amount 1 được chấp nhận');
select lives_ok($$select pg_temp.pay(11, 1, 2, 999999999999)$$, 'bs_save_settlement: amount 999 999 999 999 được chấp nhận');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 1000, date '1999-12-31')$$, 'settled_on', 'out_of_range', 'bs_save_settlement: settled_on trước 2000-01-01 thì out_of_range');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 1000, date '2101-01-01')$$, 'settled_on', 'out_of_range', 'bs_save_settlement: settled_on sau 2100-12-31 thì out_of_range');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 1000, null)$$, 'settled_on', 'required', 'bs_save_settlement: settled_on null thì required');
select lives_ok($$select pg_temp.pay(12, 1, 2, 1000, date '2000-01-01')$$, 'bs_save_settlement: settled_on 2000-01-01 được chấp nhận');
select lives_ok($$select pg_temp.pay(13, 1, 2, 1000, date '2100-12-31')$$, 'bs_save_settlement: settled_on 2100-12-31 được chấp nhận');
select pg_temp.invalid($$select pg_temp.pay(9, 1, 2, 1000, date '2026-10-26', repeat('a', 201))$$, 'note', 'too_long', 'bs_save_settlement: note 201 ký tự thì too_long');
select lives_ok($$select pg_temp.pay(14, 1, 2, 1000, date '2026-10-26', repeat('a', 200))$$, 'bs_save_settlement: note đúng 200 ký tự được chấp nhận');
select is(pg_temp.pmt(9), null::jsonb, 'bs_save_settlement: các lời gọi bị từ chối không để lại bản ghi nào');

-- ---------------------------------------------------------------------------
-- Id đã thuộc nhóm khác, giới hạn 1000
-- ---------------------------------------------------------------------------
select pg_temp.invalid(
  $$select public.bs_save_settlement(pg_temp.ta(), pg_temp.uid('b', 301), pg_temp.uid('a', 101), pg_temp.uid('a', 102), 1000, date '2026-10-26')$$,
  'settlement_id', 'id_taken', 'bs_save_settlement: id thuộc nhóm khác thì id_taken'
);
select is(
  (public.bs_get_group('test-group-b-token-00001') -> 'settlements' -> 0) ->> 'amount',
  '5000',
  'bs_save_settlement: thanh toán của nhóm B không bị đụng tới'
);
select pg_temp.throws(
  $$select public.bs_save_settlement('test-group-e-token-00001', gen_random_uuid(), pg_temp.uid('e', 101), pg_temp.uid('e', 102), 1000, date '2026-10-26')$$,
  'PT422', 'BS_LIMIT', '{"limit":"settlements"}',
  'bs_save_settlement: nhóm đã có 1000 thanh toán thì BS_LIMIT settlements'
);
select lives_ok(
  $$select public.bs_save_settlement('test-group-e-token-00001', pg_temp.uid('e', 301), pg_temp.uid('e', 102), pg_temp.uid('e', 101), 2000, date '2026-10-26')$$,
  'bs_save_settlement: nhóm đủ 1000 thanh toán vẫn ghi đè được thanh toán có sẵn'
);
select lives_ok($$select public.bs_delete_settlement('test-group-e-token-00001', pg_temp.uid('e', 301))$$, 'bs_delete_settlement: xóa một thanh toán trong nhóm đầy');
select lives_ok(
  $$select public.bs_save_settlement('test-group-e-token-00001', gen_random_uuid(), pg_temp.uid('e', 101), pg_temp.uid('e', 102), 1000, date '2026-10-26')$$,
  'bs_save_settlement: xóa bớt thì thêm được lại'
);
reset role;
select is((select count(*) from bill_split.settlements s where s.group_id = pg_temp.uid('e', 1)), 1000::bigint, 'giới hạn thanh toán: nhóm E giữ đúng 1000 thanh toán');
set local role anon;

-- ---------------------------------------------------------------------------
-- bs_delete_settlement
-- ---------------------------------------------------------------------------
select lives_ok($$select public.bs_delete_settlement(pg_temp.ta(), pg_temp.uid('a', 301))$$, 'bs_delete_settlement: xóa thanh toán 1');
select is(pg_temp.pmt(1), null::jsonb, 'bs_delete_settlement: thanh toán không còn trong snapshot');
select is(
  public.bs_delete_settlement(pg_temp.ta(), gen_random_uuid()),
  public.bs_get_group(pg_temp.ta()),
  'bs_delete_settlement: id không có thì thôi, trả snapshot'
);
select pg_temp.invalid($$select public.bs_delete_settlement(pg_temp.ta(), null)$$, 'settlement_id', 'required', 'bs_delete_settlement: settlement_id null thì required');
select is(
  public.bs_delete_settlement(pg_temp.ta(), pg_temp.uid('b', 301)) -> 'group' ->> 'name',
  'Nhóm A',
  'bs_delete_settlement: id của nhóm khác coi như không có trong nhóm này'
);
select is(
  jsonb_array_length(public.bs_get_group('test-group-b-token-00001') -> 'settlements'),
  1,
  'bs_delete_settlement: thanh toán của nhóm B không bị xóa'
);
do $$
declare
  v_id text;
begin
  for v_id in
    select s.value ->> 'id'
      from jsonb_array_elements(public.bs_get_group(pg_temp.ta()) -> 'settlements') as s(value)
  loop
    perform public.bs_delete_settlement(pg_temp.ta(), v_id::uuid);
  end loop;
end;
$$;
select is(public.bs_get_group(pg_temp.ta()) -> 'settlements', '[]'::jsonb, 'bs_delete_settlement: xóa hết thì settlements là [] chứ không phải null');

-- ---------------------------------------------------------------------------
-- updated_at của nhóm
-- ---------------------------------------------------------------------------
reset role;
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = pg_temp.uid('a', 1);
set local role anon;
select lives_ok($$select public.bs_delete_settlement(pg_temp.ta(), gen_random_uuid())$$, 'bs_delete_settlement: xóa id lạ');
reset role;
select is(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  timestamptz '2000-01-01 00:00:00+00',
  'bs_delete_settlement: không ghi gì thì không đổi groups.updated_at'
);
set local role anon;
select lives_ok($$select pg_temp.pay(20, 1, 2, 1000)$$, 'bs_save_settlement: tạo thanh toán để kiểm updated_at');
reset role;
select cmp_ok(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  '>',
  timestamptz '2020-01-01 00:00:00+00',
  'bs_save_settlement cập nhật groups.updated_at'
);
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = pg_temp.uid('a', 1);
set local role anon;
select lives_ok($$select public.bs_delete_settlement(pg_temp.ta(), pg_temp.uid('a', 320))$$, 'bs_delete_settlement: xóa thanh toán để kiểm updated_at');
reset role;
select cmp_ok(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  '>',
  timestamptz '2020-01-01 00:00:00+00',
  'bs_delete_settlement cập nhật groups.updated_at'
);

select * from finish();
rollback;
