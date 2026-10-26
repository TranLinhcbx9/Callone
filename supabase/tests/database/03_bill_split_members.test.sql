-- Chia tiền: bs_save_member và bs_delete_member (hợp đồng mục 6, 7 và 9).
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(63);

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

-- Id cố định: tiền tố 'a' hoặc 'b' là nhóm, n = 1 là nhóm, 101.. là thành viên, 201.. khoản chi, 301.. thanh toán.
create function pg_temp.uid(p_prefix text, p_n integer) returns uuid
language sql
immutable
as $$
  select (p_prefix || '0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- Thành viên có id p_id trong snapshot p_snap (null nếu không có).
create function pg_temp.member(p_snap jsonb, p_id uuid) returns jsonb
language sql
immutable
as $$
  select m.value from jsonb_array_elements(p_snap -> 'members') as m(value) where m.value ->> 'id' = p_id::text;
$$;

create function pg_temp.keys(p_json jsonb) returns text[]
language sql
immutable
as $$
  select array_agg(k order by k) from jsonb_object_keys(p_json) as k;
$$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (tạo bằng quyền owner, các test dưới đây đi qua API bằng anon)
--   Nhóm A: An (101, chỉ có phần chia của một khoản chi), Bình (102, chỉ là người trả của khoản chi đó),
--           Chi (103, chưa dùng), Giang (104, chỉ là người trả của một thanh toán),
--           Hà (105, chỉ là người nhận của thanh toán đó), Khoa (106, chưa dùng).
--   Nhóm B: Dũng (101), Em (102).  Nhóm C: chưa có ai.  Nhóm D: đủ 50 thành viên.
-- ---------------------------------------------------------------------------
insert into bill_split.groups (id, name, token_hash) values
  (pg_temp.uid('a', 1), 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8'))),
  (pg_temp.uid('b', 1), 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8'))),
  (pg_temp.uid('c', 1), 'Nhóm C', sha256(convert_to('test-group-c-token-00001', 'UTF8'))),
  (pg_temp.uid('d', 1), 'Nhóm D', sha256(convert_to('test-group-d-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position") values
  (pg_temp.uid('a', 101), pg_temp.uid('a', 1), 'An', 0),
  (pg_temp.uid('a', 102), pg_temp.uid('a', 1), 'Bình', 1),
  (pg_temp.uid('a', 103), pg_temp.uid('a', 1), 'Chi', 2),
  (pg_temp.uid('a', 104), pg_temp.uid('a', 1), 'Giang', 3),
  (pg_temp.uid('a', 105), pg_temp.uid('a', 1), 'Hà', 4),
  (pg_temp.uid('a', 106), pg_temp.uid('a', 1), 'Khoa', 5),
  (pg_temp.uid('b', 101), pg_temp.uid('b', 1), 'Dũng', 0),
  (pg_temp.uid('b', 102), pg_temp.uid('b', 1), 'Em', 1);
insert into bill_split.members (id, group_id, name, "position")
select pg_temp.uid('d', 100 + g), pg_temp.uid('d', 1), 'Người ' || g, g - 1
  from generate_series(1, 50) g;
insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode) values
  (pg_temp.uid('a', 201), pg_temp.uid('a', 1), 'Ăn trưa', 100000, pg_temp.uid('a', 102), date '2026-10-24', 'exact');
insert into bill_split.expense_shares (expense_id, group_id, member_id, amount) values
  (pg_temp.uid('a', 201), pg_temp.uid('a', 1), pg_temp.uid('a', 101), 100000);
insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on) values
  (pg_temp.uid('a', 301), pg_temp.uid('a', 1), pg_temp.uid('a', 104), pg_temp.uid('a', 105), 10000, date '2026-10-25');

set local role anon;

-- ---------------------------------------------------------------------------
-- bs_save_member: thêm mới
-- ---------------------------------------------------------------------------
select is(
  pg_temp.member(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 107), 'Lan'), pg_temp.uid('a', 107)),
  jsonb_build_object('id', pg_temp.uid('a', 107), 'name', 'Lan', 'position', 6,
                     'bank_bin', null, 'bank_account', null, 'bank_account_name', null),
  'bs_save_member: id mới thì thêm vào cuối với position = max + 1, chưa có ngân hàng'
);
select is(
  pg_temp.keys(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 107), 'Lan')),
  array['expenses', 'group', 'members', 'settlements', 'v'],
  'bs_save_member trả snapshot đầy đủ'
);
select is(
  jsonb_array_length(public.bs_get_group('test-group-a-token-00001') -> 'members'),
  7,
  'bs_save_member: gửi lại cùng id chỉ ghi đè, không thêm thành viên thứ hai'
);
select is(
  pg_temp.member(public.bs_save_member('test-group-c-token-00001', pg_temp.uid('c', 101), 'Đầu tiên'), pg_temp.uid('c', 101)) -> 'position',
  '0'::jsonb,
  'bs_save_member: thành viên đầu tiên của nhóm chưa có ai có position 0'
);

select lives_ok(
  $$select public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 106))$$,
  'bs_delete_member: xóa thành viên chưa dùng (Khoa, position 5)'
);
select is(
  pg_temp.member(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 108), 'Mận'), pg_temp.uid('a', 108)) -> 'position',
  '7'::jsonb,
  'bs_save_member: position = max + 1 kể cả khi có khoảng trống do xóa'
);
select is(
  (select jsonb_agg(m.value ->> 'name' order by m.ord)
     from jsonb_array_elements(public.bs_get_group('test-group-a-token-00001') -> 'members') with ordinality as m(value, ord)),
  '["An", "Bình", "Chi", "Giang", "Hà", "Lan", "Mận"]'::jsonb,
  'bs_save_member: snapshot sắp thành viên theo position'
);

-- ---------------------------------------------------------------------------
-- bs_save_member: ngân hàng
-- ---------------------------------------------------------------------------
select is(
  pg_temp.member(
    public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', '0123456789', 'NGUYEN THI NGA'),
    pg_temp.uid('a', 109)
  ) - 'id' - 'position',
  jsonb_build_object('name', 'Nga', 'bank_bin', '970436', 'bank_account', '0123456789', 'bank_account_name', 'NGUYEN THI NGA'),
  'bs_save_member: thêm mới kèm đủ thông tin ngân hàng'
);
select is(
  pg_temp.member(
    public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970422', '0987654321'),
    pg_temp.uid('a', 109)
  ) - 'id' - 'position',
  jsonb_build_object('name', 'Nga', 'bank_bin', '970422', 'bank_account', '0987654321', 'bank_account_name', null),
  'bs_save_member: ghi đè, tham số bỏ trống (tên chủ tài khoản) nghĩa là xóa thông tin đó'
);
select is(
  pg_temp.member(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga'), pg_temp.uid('a', 109)) - 'id' - 'position',
  jsonb_build_object('name', 'Nga', 'bank_bin', null, 'bank_account', null, 'bank_account_name', null),
  'bs_save_member: bỏ hết tham số ngân hàng thì xóa toàn bộ thông tin ngân hàng'
);
select is(
  pg_temp.member(
    public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '  970436 ', ' 0123 4567 89 ', '  NGUYEN THI NGA  '),
    pg_temp.uid('a', 109)
  ) - 'id' - 'position',
  jsonb_build_object('name', 'Nga', 'bank_bin', '970436', 'bank_account', '0123456789', 'bank_account_name', 'NGUYEN THI NGA'),
  'bs_save_member: bank_bin được trim, số tài khoản bỏ hết khoảng trắng, tên chủ tài khoản được trim'
);
select is(
  pg_temp.member(
    public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', 'AB12cd', '   '),
    pg_temp.uid('a', 109)
  ) - 'id' - 'position' - 'name',
  jsonb_build_object('bank_bin', '970436', 'bank_account', 'AB12cd', 'bank_account_name', null),
  'bs_save_member: số tài khoản gồm chữ và số được chấp nhận, tên chủ tài khoản toàn khoảng trắng thành null'
);
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', repeat('9', 19))$$,
  'bs_save_member: số tài khoản 19 ký tự được chấp nhận'
);
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', '1', repeat('A', 50))$$,
  'bs_save_member: tên chủ tài khoản 50 ký tự được chấp nhận'
);

select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436')$$,
  'bank_account', 'required', 'bs_save_member: có bank_bin mà thiếu bank_account thì required cho bank_account'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', null, '0123456789')$$,
  'bank_bin', 'required', 'bs_save_member: có bank_account mà thiếu bank_bin thì required cho bank_bin'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', '    ')$$,
  'bank_account', 'required', 'bs_save_member: số tài khoản chỉ có khoảng trắng coi như thiếu'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', null, null, 'NGUYEN THI NGA')$$,
  'bank_bin', 'required', 'bs_save_member: có tên chủ tài khoản mà không có ngân hàng thì từ chối (required cho bank_bin)'
);
select pg_temp.invalid(
  format('select public.bs_save_member(%L, %L, %L, %L, %L)', 'test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', t.v, '0123456789'),
  'bank_bin', 'format', 'bs_save_member: bank_bin sai định dạng (' || t.v || ') thì format'
)
from unnest(array['12345', '1234567', 'abcdef', '97 0436', '97043A']) as t(v);
select pg_temp.invalid(
  format('select public.bs_save_member(%L, %L, %L, %L, %L)', 'test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', t.v),
  'bank_account', 'format', 'bs_save_member: bank_account sai định dạng (' || t.v || ') thì format'
)
from unnest(array['12-34', '123!', repeat('1', 20), 'ăn123']) as t(v);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 109), 'Nga', '970436', '1', repeat('A', 51))$$,
  'bank_account_name', 'too_long', 'bs_save_member: tên chủ tài khoản 51 ký tự thì too_long'
);

-- ---------------------------------------------------------------------------
-- bs_save_member: sửa và kiểm tên
-- ---------------------------------------------------------------------------
select is(
  pg_temp.member(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 101), '  An Nguyễn '), pg_temp.uid('a', 101)) - 'bank_bin' - 'bank_account' - 'bank_account_name',
  jsonb_build_object('id', pg_temp.uid('a', 101), 'name', 'An Nguyễn', 'position', 0),
  'bs_save_member: đổi tên thành viên (có trim), position giữ nguyên'
);
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 101), 'AN NGUYỄN')$$,
  'bs_save_member: đổi hoa thường tên của chính mình không bị coi là trùng'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 110), '')$$,
  'name', 'required', 'bs_save_member: name rỗng thì required'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 110), null)$$,
  'name', 'required', 'bs_save_member: name null thì required'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 110), repeat('a', 41))$$,
  'name', 'too_long', 'bs_save_member: name 41 ký tự thì too_long'
);
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 110), repeat('a', 40))$$,
  'bs_save_member: name đúng 40 ký tự được chấp nhận'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 111), 'bình')$$,
  'name', 'duplicate', 'bs_save_member: thêm tên trùng thành viên khác (không phân biệt hoa thường) thì duplicate'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 111), '  CHI ')$$,
  'name', 'duplicate', 'bs_save_member: trùng sau khi trim thì duplicate'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 102), 'Chi')$$,
  'name', 'duplicate', 'bs_save_member: đổi tên thành tên của thành viên khác thì duplicate'
);
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 112), U&'H\01B0ng')$$,
  'bs_save_member: thêm Hưng'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 113), U&'H\01AFNG')$$,
  'name', 'duplicate', 'bs_save_member: HƯNG trùng Hưng'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 113), U&'Hu\031Bng')$$,
  'name', 'duplicate', 'bs_save_member: Hưng gõ dạng tổ hợp (NFD) cũng trùng Hưng'
);
select is(
  (select m.value ->> 'name'
     from jsonb_array_elements(public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 114), U&'Tu\0301') -> 'members') as m(value)
    where m.value ->> 'id' = pg_temp.uid('a', 114)::text),
  U&'T\00FA',
  'bs_save_member: tên dạng tổ hợp được lưu ở dạng NFC'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', null, 'Không id')$$,
  'member_id', 'required', 'bs_save_member: member_id null thì required'
);
select is(
  jsonb_array_length(public.bs_get_group('test-group-a-token-00001') -> 'members'),
  11,
  'bs_save_member: các lời gọi bị từ chối không để lại thành viên nào'
);

-- ---------------------------------------------------------------------------
-- bs_save_member: giới hạn 50 thành viên và id đã bị nhóm khác chiếm
-- ---------------------------------------------------------------------------
select pg_temp.throws(
  $$select public.bs_save_member('test-group-d-token-00001', pg_temp.uid('d', 151), 'Người thứ 51')$$,
  'PT422', 'BS_LIMIT', '{"limit":"members"}',
  'bs_save_member: nhóm đủ 50 người thì thêm người thứ 51 là BS_LIMIT members'
);
select lives_ok(
  $$select public.bs_save_member('test-group-d-token-00001', pg_temp.uid('d', 101), 'Người 1 sửa')$$,
  'bs_save_member: nhóm đủ 50 người vẫn sửa được thành viên có sẵn'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('b', 101), 'Dũng của A')$$,
  'member_id', 'id_taken', 'bs_save_member: id thuộc nhóm khác thì BS_INVALID id_taken'
);
select is(
  pg_temp.member(public.bs_get_group('test-group-b-token-00001'), pg_temp.uid('b', 101)) ->> 'name',
  'Dũng',
  'bs_save_member: thành viên của nhóm B không bị đụng tới'
);

-- ---------------------------------------------------------------------------
-- bs_delete_member
-- ---------------------------------------------------------------------------
select is(
  pg_temp.member(public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 103)), pg_temp.uid('a', 103)),
  null::jsonb,
  'bs_delete_member: xóa thành viên chưa dùng (Chi), snapshot trả về không còn Chi'
);
select is(
  public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 103)),
  public.bs_get_group('test-group-a-token-00001'),
  'bs_delete_member: thành viên không có trong nhóm thì coi như đã xóa, trả snapshot'
);
select is(
  public.bs_delete_member('test-group-a-token-00001', gen_random_uuid()),
  public.bs_get_group('test-group-a-token-00001'),
  'bs_delete_member: id lạ cũng không lỗi'
);
select pg_temp.throws(
  $$select public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 102))$$,
  'PT409', 'BS_MEMBER_IN_USE', null,
  'bs_delete_member: chỉ còn là người trả của khoản chi (không có phần chia) thì BS_MEMBER_IN_USE'
);
select pg_temp.throws(
  $$select public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 101))$$,
  'PT409', 'BS_MEMBER_IN_USE', null,
  'bs_delete_member: chỉ còn trong phần chia của khoản chi (không phải người trả) thì BS_MEMBER_IN_USE'
);
select pg_temp.throws(
  $$select public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 104))$$,
  'PT409', 'BS_MEMBER_IN_USE', null,
  'bs_delete_member: chỉ còn là người trả của một thanh toán thì BS_MEMBER_IN_USE'
);
select pg_temp.throws(
  $$select public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('a', 105))$$,
  'PT409', 'BS_MEMBER_IN_USE', null,
  'bs_delete_member: chỉ còn là người nhận của một thanh toán thì BS_MEMBER_IN_USE'
);
select is(
  (select count(*) from jsonb_array_elements(public.bs_get_group('test-group-a-token-00001') -> 'members') as m(value)
    where (m.value ->> 'id')::uuid in (pg_temp.uid('a', 101), pg_temp.uid('a', 102), pg_temp.uid('a', 104), pg_temp.uid('a', 105))),
  4::bigint,
  'bs_delete_member: bị từ chối thì các thành viên vẫn còn'
);
select pg_temp.invalid(
  $$select public.bs_delete_member('test-group-a-token-00001', null)$$,
  'member_id', 'required', 'bs_delete_member: member_id null thì required'
);
select is(
  public.bs_delete_member('test-group-a-token-00001', pg_temp.uid('b', 101)) -> 'group' ->> 'name',
  'Nhóm A',
  'bs_delete_member: id của nhóm khác coi như không có trong nhóm này, trả snapshot nhóm này'
);
select is(
  pg_temp.member(public.bs_get_group('test-group-b-token-00001'), pg_temp.uid('b', 101)) ->> 'name',
  'Dũng',
  'bs_delete_member: thành viên của nhóm B không bị xóa'
);
select is(
  public.bs_delete_member('test-group-c-token-00001', pg_temp.uid('c', 101)) -> 'members',
  '[]'::jsonb,
  'bs_delete_member: xóa người cuối cùng thì members là [] chứ không phải null'
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
reset role;
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = pg_temp.uid('a', 1);
set local role anon;
select lives_ok(
  $$select public.bs_delete_member('test-group-a-token-00001', gen_random_uuid())$$,
  'bs_delete_member: xóa id lạ (không ghi gì)'
);
reset role;
select is(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  timestamptz '2000-01-01 00:00:00+00',
  'bs_delete_member: không ghi gì thì không đổi groups.updated_at'
);
set local role anon;
select lives_ok(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.uid('a', 115), 'Quân')$$,
  'bs_save_member: thêm thành viên để kiểm updated_at'
);
reset role;
select cmp_ok(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.uid('a', 1)),
  '>',
  timestamptz '2020-01-01 00:00:00+00',
  'bs_save_member cập nhật groups.updated_at'
);

select * from finish();
rollback;
