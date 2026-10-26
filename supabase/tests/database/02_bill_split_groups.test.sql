-- Chia tiền: tạo, đọc, đổi tên, đổi token, xóa nhóm; token; giới hạn tốc độ; hình dạng snapshot
-- (hợp đồng mục 1, 5, 6, 7 và 9). Mọi lời gọi API chạy dưới vai trò anon như trình duyệt.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(110);

-- ---------------------------------------------------------------------------
-- Helper (chỉ tồn tại trong transaction này)
-- ---------------------------------------------------------------------------

-- Chạy một câu SQL bằng quyền của role hiện tại: trả null nếu thành công, nếu lỗi thì trả
-- { state, message, detail } (detail parse thành JSON nếu được).
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

-- Khẳng định câu SQL lỗi với đúng SQLSTATE, message và detail.
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

create function pg_temp.not_found(p_sql text, p_desc text) returns text
language sql
as $$
  select pg_temp.throws(p_sql, 'PT404', 'BS_GROUP_NOT_FOUND', null, p_desc);
$$;

-- Lưu và đọc giá trị giữa các câu lệnh bằng biến cấu hình cục bộ transaction.
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

-- Một nhóm tạo bằng bs_create_group được lưu dưới khóa k dạng { token, snapshot }.
create function pg_temp.tok(p_key text) returns text
language sql
stable
as $$
  select pg_temp.get(p_key)::jsonb ->> 'token';
$$;

create function pg_temp.gid(p_key text) returns uuid
language sql
stable
as $$
  select (pg_temp.get(p_key)::jsonb #>> '{snapshot,group,id}')::uuid;
$$;

-- Id của thành viên thứ p_n (từ 0) trong snapshot lúc tạo nhóm.
create function pg_temp.mid(p_key text, p_n integer) returns uuid
language sql
stable
as $$
  select (pg_temp.get(p_key)::jsonb #>> array['snapshot', 'members', p_n::text, 'id'])::uuid;
$$;

-- Phần chia p_amounts cho các thành viên 0, 1, 2, ... của nhóm p_key.
create function pg_temp.sh(p_key text, p_amounts bigint[]) returns jsonb
language sql
stable
as $$
  select jsonb_agg(jsonb_build_object('member_id', pg_temp.mid(p_key, (a.n - 1)::integer), 'amount', a.v) order by a.n)
    from unnest(p_amounts) with ordinality as a(v, n);
$$;

create function pg_temp.keys(p_json jsonb) returns text[]
language sql
immutable
as $$
  select array_agg(k order by k) from jsonb_object_keys(p_json) as k;
$$;

-- Làm "cũ" mọi nhóm sẵn có (seed, dữ liệu dev) để giới hạn tốc độ không bị ảnh hưởng. Rollback ở cuối.
update bill_split.groups set created_at = created_at - interval '1 hour';

set local role anon;

-- ---------------------------------------------------------------------------
-- bs_create_group: thành công và hình dạng snapshot
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.put('created', public.bs_create_group('Đà Lạt', array['Linh', 'Hưng', 'Mai'])::text);
end;
$$;

select matches(pg_temp.tok('created'), '^[A-Za-z0-9_-]{24}$', 'bs_create_group trả token 24 ký tự base64url');
select is(pg_temp.keys(pg_temp.get('created')::jsonb), array['snapshot', 'token'], 'bs_create_group trả đúng { token, snapshot }');
select is(
  pg_temp.keys(pg_temp.get('created')::jsonb -> 'snapshot'),
  array['expenses', 'group', 'members', 'settlements', 'v'],
  'snapshot có đúng các khóa v, group, members, expenses, settlements'
);
select is(pg_temp.get('created')::jsonb #>> '{snapshot,v}', '1', 'snapshot.v = 1');
select is(
  pg_temp.keys(pg_temp.get('created')::jsonb #> '{snapshot,group}'),
  array['created_at', 'currency', 'id', 'name', 'updated_at'],
  'snapshot.group có đúng các khóa của hợp đồng'
);
select is(pg_temp.get('created')::jsonb #>> '{snapshot,group,name}', 'Đà Lạt', 'snapshot.group.name là tên nhóm');
select is(pg_temp.get('created')::jsonb #>> '{snapshot,group,currency}', 'VND', 'snapshot.group.currency là VND');
select matches(
  pg_temp.get('created')::jsonb #>> '{snapshot,group,created_at}',
  '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$',
  'created_at là chuỗi ISO 8601 của timestamptz'
);
select is(
  pg_temp.keys(pg_temp.get('created')::jsonb #> '{snapshot,members,0}'),
  array['bank_account', 'bank_account_name', 'bank_bin', 'id', 'name', 'position'],
  'mỗi thành viên có đúng các khóa của hợp đồng'
);
select is(
  (select jsonb_agg(jsonb_build_object('name', m.value ->> 'name', 'position', m.value -> 'position') order by m.ord)
     from jsonb_array_elements(pg_temp.get('created')::jsonb #> '{snapshot,members}') with ordinality as m(value, ord)),
  '[{"name":"Linh","position":0},{"name":"Hưng","position":1},{"name":"Mai","position":2}]'::jsonb,
  'thành viên ban đầu theo thứ tự mảng, position bắt đầu từ 0'
);
select is(pg_temp.get('created')::jsonb #> '{snapshot,members,0,bank_bin}', 'null'::jsonb, 'thông tin ngân hàng chưa có là JSON null');
select is(pg_temp.get('created')::jsonb #> '{snapshot,expenses}', '[]'::jsonb, 'expenses rỗng là [] chứ không phải null');
select is(pg_temp.get('created')::jsonb #> '{snapshot,settlements}', '[]'::jsonb, 'settlements rỗng là [] chứ không phải null');
select is(strpos((pg_temp.get('created')::jsonb -> 'snapshot')::text, 'token'), 0, 'snapshot không chứa token hay token_hash');
select is(
  strpos((pg_temp.get('created')::jsonb -> 'snapshot')::text, pg_temp.tok('created')),
  0,
  'snapshot không chứa giá trị token'
);
select is(
  public.bs_get_group(pg_temp.tok('created')),
  pg_temp.get('created')::jsonb -> 'snapshot',
  'bs_get_group trả đúng snapshot lúc tạo'
);

reset role;
select is(
  (select g.token_hash from bill_split.groups g where g.id = pg_temp.gid('created')),
  sha256(convert_to(pg_temp.tok('created'), 'UTF8')),
  'database chỉ lưu sha256 của token'
);
select is(
  (select count(*) from bill_split.members m where m.group_id = pg_temp.gid('created')),
  3::bigint,
  'bs_create_group tạo đủ 3 thành viên'
);
set local role anon;

-- ---------------------------------------------------------------------------
-- bs_create_group: kiểm dữ liệu
-- ---------------------------------------------------------------------------
select pg_temp.invalid($$select public.bs_create_group('   ', array['A'])$$, 'name', 'required', 'bs_create_group: name trắng thì required');
select pg_temp.invalid($$select public.bs_create_group(null, array['A'])$$, 'name', 'required', 'bs_create_group: name null thì required');
select pg_temp.invalid($$select public.bs_create_group(repeat('a', 81), array['A'])$$, 'name', 'too_long', 'bs_create_group: name 81 ký tự thì too_long');
select lives_ok($$select public.bs_create_group(repeat('a', 80), array['A'])$$, 'bs_create_group: name đúng 80 ký tự được chấp nhận');

select pg_temp.invalid($$select public.bs_create_group('X', array[]::text[])$$, 'member_names', 'empty', 'bs_create_group: member_names rỗng thì empty');
select pg_temp.invalid($$select public.bs_create_group('X', null)$$, 'member_names', 'empty', 'bs_create_group: member_names null coi như rỗng');
select pg_temp.throws(
  $$select public.bs_create_group('X', array(select 'N' || g from generate_series(1, 51) g))$$,
  'PT422', 'BS_LIMIT', '{"limit":"members"}',
  'bs_create_group: hơn 50 thành viên thì BS_LIMIT members'
);
select lives_ok(
  $$select public.bs_create_group('X', array(select 'N' || g from generate_series(1, 50) g))$$,
  'bs_create_group: đúng 50 thành viên được chấp nhận'
);
select pg_temp.invalid($$select public.bs_create_group('X', array['A', '  '])$$, 'member_names', 'required', 'bs_create_group: tên thành viên trắng thì required');
select pg_temp.invalid($$select public.bs_create_group('X', array['A', null])$$, 'member_names', 'required', 'bs_create_group: tên thành viên null thì required');
select pg_temp.invalid($$select public.bs_create_group('X', array[repeat('a', 41)])$$, 'member_names', 'too_long', 'bs_create_group: tên thành viên 41 ký tự thì too_long');
select lives_ok($$select public.bs_create_group('X', array[repeat('a', 40)])$$, 'bs_create_group: tên thành viên đúng 40 ký tự được chấp nhận');
select pg_temp.invalid($$select public.bs_create_group('X', array['Linh', 'LINH'])$$, 'member_names', 'duplicate', 'bs_create_group: trùng tên không phân biệt hoa thường');
select pg_temp.invalid($$select public.bs_create_group('X', array['Linh', '  linh '])$$, 'member_names', 'duplicate', 'bs_create_group: trùng tên sau khi trim');
select pg_temp.invalid(
  $$select public.bs_create_group('X', array[U&'H\01B0ng', U&'H\01AFNG'])$$,
  'member_names', 'duplicate',
  'bs_create_group: Hưng và HƯNG là trùng tên'
);
select pg_temp.invalid(
  $$select public.bs_create_group('X', array[U&'Hu\031Bng', U&'H\01B0ng'])$$,
  'member_names', 'duplicate',
  'bs_create_group: hai cách gõ (tổ hợp và dựng sẵn) của cùng một tên tiếng Việt là trùng'
);

do $$
begin
  perform pg_temp.put('trim', public.bs_create_group('  Nhóm trim  ', array['  Linh  ', E'\tHưng\n'])::text);
  perform pg_temp.put('nfc', public.bs_create_group('NFC', array[U&'Hu\031Bng'])::text);
end;
$$;

select is(pg_temp.get('trim')::jsonb #>> '{snapshot,group,name}', 'Nhóm trim', 'bs_create_group: tên nhóm được trim');
select is(
  (select jsonb_agg(m.value ->> 'name' order by m.ord)
     from jsonb_array_elements(pg_temp.get('trim')::jsonb #> '{snapshot,members}') with ordinality as m(value, ord)),
  '["Linh", "Hưng"]'::jsonb,
  'bs_create_group: tên thành viên được trim (kể cả tab và xuống dòng)'
);
select is(
  pg_temp.get('nfc')::jsonb #>> '{snapshot,members,0,name}',
  U&'H\01B0ng',
  'bs_create_group: tên dạng tổ hợp (NFD) được chuẩn hóa về NFC'
);

-- ---------------------------------------------------------------------------
-- Token: mọi trường hợp lỗi cho cùng một lỗi BS_GROUP_NOT_FOUND
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.put('a', public.bs_create_group('Nhóm A', array['An', 'Bình'])::text);
  perform pg_temp.put('b', public.bs_create_group('Nhóm B', array['Dũng'])::text);
end;
$$;

select isnt(pg_temp.tok('a'), pg_temp.tok('b'), 'hai nhóm có hai token khác nhau');

select pg_temp.not_found(format('select public.bs_get_group(%L)', t.v), 'bs_get_group: token sai #' || t.n || ' trả BS_GROUP_NOT_FOUND')
from unnest(array[
  null, '', 'short', repeat('a', 23), repeat('a', 25), repeat('a', 23) || '!', repeat('A', 24), repeat('à', 24),
  pg_temp.tok('a') || E'\n', ' ' || pg_temp.tok('a'), pg_temp.tok('a') || 'x'
]) with ordinality as t(v, n);

select pg_temp.not_found(s.sql, s.name || ': token không tồn tại trả BS_GROUP_NOT_FOUND')
from (values
  ('bs_get_group', $$select public.bs_get_group('unknown-token-aaaaaaaa00')$$),
  ('bs_update_group', $$select public.bs_update_group('unknown-token-aaaaaaaa00', 'X')$$),
  ('bs_rotate_token', $$select public.bs_rotate_token('unknown-token-aaaaaaaa00')$$),
  ('bs_delete_group', $$select public.bs_delete_group('unknown-token-aaaaaaaa00')$$),
  ('bs_save_member', $$select public.bs_save_member('unknown-token-aaaaaaaa00', gen_random_uuid(), 'X')$$),
  ('bs_delete_member', $$select public.bs_delete_member('unknown-token-aaaaaaaa00', gen_random_uuid())$$),
  ('bs_save_expense', $$select public.bs_save_expense('unknown-token-aaaaaaaa00', gen_random_uuid(), 'X', 1, gen_random_uuid(), date '2026-10-26', 'equal', '[]'::jsonb)$$),
  ('bs_delete_expense', $$select public.bs_delete_expense('unknown-token-aaaaaaaa00', gen_random_uuid())$$),
  ('bs_save_settlement', $$select public.bs_save_settlement('unknown-token-aaaaaaaa00', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, date '2026-10-26')$$),
  ('bs_delete_settlement', $$select public.bs_delete_settlement('unknown-token-aaaaaaaa00', gen_random_uuid())$$)
) as s(name, sql);

select pg_temp.not_found(
  $$select public.bs_update_group('unknown-token-aaaaaaaa00', '')$$,
  'token được kiểm trước dữ liệu: token sai cộng name sai vẫn là BS_GROUP_NOT_FOUND'
);

-- Token sai định dạng bị từ chối trước khi tra cứu: kể cả khi database có sẵn một dòng mà hash khớp.
reset role;
insert into bill_split.groups (name, token_hash) values ('Nhóm token lạ', sha256(convert_to('short-token', 'UTF8')));
set local role anon;
select pg_temp.not_found($$select public.bs_get_group('short-token')$$, 'bs_get_group: token sai định dạng bị từ chối trước khi tra cứu (kể cả hash có tồn tại)');
select pg_temp.not_found($$select public.bs_update_group('short-token', 'X')$$, 'bs_update_group: token sai định dạng bị từ chối trước khi tra cứu (kể cả hash có tồn tại)');
select is(public.bs_get_groups(array['short-token']), '[]'::jsonb, 'bs_get_groups: token sai định dạng bị bỏ qua (kể cả hash có tồn tại)');

-- ---------------------------------------------------------------------------
-- bs_get_groups
-- ---------------------------------------------------------------------------
reset role;
update bill_split.groups set updated_at = timestamptz '2026-10-20 00:00:00+00' where id = pg_temp.gid('a');
update bill_split.groups set updated_at = timestamptz '2026-10-21 00:00:00+00' where id = pg_temp.gid('b');
set local role anon;

select is(
  (select jsonb_agg(x.value ->> 'name' order by x.ord)
     from jsonb_array_elements(public.bs_get_groups(array[pg_temp.tok('a'), pg_temp.tok('b'), 'bad', pg_temp.tok('a')]))
          with ordinality as x(value, ord)),
  '["Nhóm B", "Nhóm A"]'::jsonb,
  'bs_get_groups: sắp theo updated_at giảm dần, bỏ token sai, token trùng chỉ tính một lần'
);
select is(
  pg_temp.keys(public.bs_get_groups(array[pg_temp.tok('a')]) -> 0),
  array['expense_count', 'id', 'member_count', 'name', 'token', 'total_spent', 'updated_at'],
  'bs_get_groups: mỗi phần tử có đúng các khóa của hợp đồng'
);
select is(
  public.bs_get_groups(array[pg_temp.tok('a')]) -> 0 ->> 'token',
  pg_temp.tok('a'),
  'bs_get_groups: token trả về là token đầu vào'
);
select is(
  (public.bs_get_groups(array[pg_temp.tok('a')]) -> 0) - 'token' - 'updated_at',
  jsonb_build_object('id', pg_temp.gid('a'), 'name', 'Nhóm A', 'member_count', 2, 'expense_count', 0, 'total_spent', 0),
  'bs_get_groups: nhóm chưa có khoản chi có expense_count và total_spent bằng 0'
);
select is(public.bs_get_groups(null), '[]'::jsonb, 'bs_get_groups: null coi như mảng rỗng');
select is(public.bs_get_groups(array[]::text[]), '[]'::jsonb, 'bs_get_groups: mảng rỗng trả []');
select is(public.bs_get_groups(array['bad', 'cũng sai', '']), '[]'::jsonb, 'bs_get_groups: token sai bị bỏ qua, không báo lỗi');
select is(
  jsonb_array_length(public.bs_get_groups(array(select 'unknown-token-' || lpad(g::text, 10, '0') from generate_series(1, 50) g))),
  0,
  'bs_get_groups: đúng 50 token được chấp nhận'
);
select pg_temp.invalid(
  $$select public.bs_get_groups(array(select 'x' || g from generate_series(1, 51) g))$$,
  'tokens', 'too_many',
  'bs_get_groups: hơn 50 token thì too_many'
);

do $$
begin
  perform public.bs_save_expense(pg_temp.tok('a'), gen_random_uuid(), 'Ăn trưa', 100000, pg_temp.mid('a', 0),
    date '2026-10-24', 'equal', pg_temp.sh('a', array[50000, 50000]));
  perform public.bs_save_expense(pg_temp.tok('a'), gen_random_uuid(), 'Cà phê', 50000, pg_temp.mid('a', 1),
    date '2026-10-25', 'exact', pg_temp.sh('a', array[30000, 20000]));
end;
$$;

select is(
  (public.bs_get_groups(array[pg_temp.tok('a')]) -> 0) - 'token' - 'updated_at',
  jsonb_build_object('id', pg_temp.gid('a'), 'name', 'Nhóm A', 'member_count', 2, 'expense_count', 2, 'total_spent', 150000),
  'bs_get_groups: đếm đúng thành viên, khoản chi và tổng chi'
);

-- ---------------------------------------------------------------------------
-- bs_update_group
-- ---------------------------------------------------------------------------
select is(
  public.bs_update_group(pg_temp.tok('a'), '  Đà Lạt 2026  ') #>> '{group,name}',
  'Đà Lạt 2026',
  'bs_update_group: đổi tên (có trim) và trả snapshot'
);
select is(
  public.bs_get_group(pg_temp.tok('a')) #>> '{group,name}',
  'Đà Lạt 2026',
  'bs_update_group: tên mới được lưu'
);
select is(
  jsonb_array_length(public.bs_update_group(pg_temp.tok('a'), 'Nhóm A') -> 'expenses'),
  2,
  'bs_update_group: snapshot trả về đầy đủ khoản chi'
);
select is(public.bs_get_group(pg_temp.tok('b')) #>> '{group,name}', 'Nhóm B', 'bs_update_group: không đụng tới nhóm khác');
select pg_temp.invalid($$select public.bs_update_group(pg_temp.tok('a'), '')$$, 'name', 'required', 'bs_update_group: name rỗng thì required');
select pg_temp.invalid($$select public.bs_update_group(pg_temp.tok('a'), null)$$, 'name', 'required', 'bs_update_group: name null thì required');
select pg_temp.invalid($$select public.bs_update_group(pg_temp.tok('a'), repeat('a', 81))$$, 'name', 'too_long', 'bs_update_group: name 81 ký tự thì too_long');

reset role;
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = pg_temp.gid('a');
set local role anon;
select lives_ok($$select public.bs_update_group(pg_temp.tok('a'), 'Nhóm A')$$, 'bs_update_group chạy lại để kiểm updated_at');
reset role;
select cmp_ok(
  (select g.updated_at from bill_split.groups g where g.id = pg_temp.gid('a')),
  '>',
  timestamptz '2020-01-01 00:00:00+00',
  'bs_update_group cập nhật groups.updated_at'
);
set local role anon;

-- ---------------------------------------------------------------------------
-- bs_rotate_token
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.put('rot', public.bs_rotate_token(pg_temp.tok('a'))::text);
end;
$$;

select is(pg_temp.keys(pg_temp.get('rot')::jsonb), array['token'], 'bs_rotate_token trả đúng { token }');
select matches(pg_temp.get('rot')::jsonb ->> 'token', '^[A-Za-z0-9_-]{24}$', 'bs_rotate_token: token mới đúng định dạng');
select isnt(pg_temp.get('rot')::jsonb ->> 'token', pg_temp.tok('a'), 'bs_rotate_token: token mới khác token cũ');
select pg_temp.not_found($$select public.bs_get_group(pg_temp.tok('a'))$$, 'bs_rotate_token: token cũ trả BS_GROUP_NOT_FOUND ngay sau khi đổi');
select pg_temp.not_found($$select public.bs_update_group(pg_temp.tok('a'), 'X')$$, 'bs_rotate_token: token cũ không ghi được nữa');
select is(
  public.bs_get_group(pg_temp.get('rot')::jsonb ->> 'token') #>> '{group,id}',
  pg_temp.gid('a')::text,
  'bs_rotate_token: token mới đọc được đúng nhóm cũ'
);
select is(
  jsonb_array_length(public.bs_get_group(pg_temp.get('rot')::jsonb ->> 'token') -> 'expenses'),
  2,
  'bs_rotate_token: dữ liệu nhóm giữ nguyên'
);
select is(
  (select jsonb_agg(x.value ->> 'token')
     from jsonb_array_elements(public.bs_get_groups(array[pg_temp.tok('a'), pg_temp.get('rot')::jsonb ->> 'token'])) as x(value)),
  jsonb_build_array(pg_temp.get('rot')::jsonb ->> 'token'),
  'bs_get_groups: chỉ nhận token mới, bỏ token cũ'
);
reset role;
select is(
  (select g.token_hash from bill_split.groups g where g.id = pg_temp.gid('a')),
  sha256(convert_to(pg_temp.get('rot')::jsonb ->> 'token', 'UTF8')),
  'bs_rotate_token: database lưu sha256 của token mới'
);
set local role anon;
do $$
begin
  perform pg_temp.put('a', jsonb_set(pg_temp.get('a')::jsonb, '{token}', to_jsonb(pg_temp.get('rot')::jsonb ->> 'token'))::text);
end;
$$;
do $$
begin
  perform pg_temp.put('a', jsonb_set(pg_temp.get('a')::jsonb, '{token}', to_jsonb(public.bs_rotate_token(pg_temp.tok('a')) ->> 'token'))::text);
end;
$$;
select is(
  public.bs_get_group(pg_temp.tok('a')) #>> '{group,id}',
  pg_temp.gid('a')::text,
  'bs_rotate_token: đổi liên tiếp lần hai, token mới nhất dùng được'
);

-- ---------------------------------------------------------------------------
-- Vai trò authenticated cũng gọi được API
-- ---------------------------------------------------------------------------
set local role authenticated;
select is(public.bs_get_group(pg_temp.tok('b')) #>> '{group,name}', 'Nhóm B', 'role authenticated cũng gọi được API');
set local role anon;

-- ---------------------------------------------------------------------------
-- bs_delete_group (xóa mềm)
-- ---------------------------------------------------------------------------
select lives_ok($$select public.bs_delete_group(pg_temp.tok('b'))$$, 'bs_delete_group: xóa nhóm thành công');
select pg_temp.not_found($$select public.bs_get_group(pg_temp.tok('b'))$$, 'nhóm đã xóa: bs_get_group trả BS_GROUP_NOT_FOUND');
select pg_temp.not_found($$select public.bs_update_group(pg_temp.tok('b'), 'X')$$, 'nhóm đã xóa: bs_update_group trả BS_GROUP_NOT_FOUND');
select pg_temp.not_found($$select public.bs_save_member(pg_temp.tok('b'), gen_random_uuid(), 'X')$$, 'nhóm đã xóa: bs_save_member trả BS_GROUP_NOT_FOUND');
select pg_temp.not_found($$select public.bs_rotate_token(pg_temp.tok('b'))$$, 'nhóm đã xóa: bs_rotate_token trả BS_GROUP_NOT_FOUND');
select pg_temp.not_found($$select public.bs_delete_group(pg_temp.tok('b'))$$, 'nhóm đã xóa: xóa lần hai trả BS_GROUP_NOT_FOUND');
select is(
  jsonb_array_length(public.bs_get_groups(array[pg_temp.tok('b'), pg_temp.tok('a')])),
  1,
  'bs_get_groups: bỏ qua nhóm đã xóa'
);
reset role;
select ok(
  (select g.deleted_at is not null from bill_split.groups g where g.id = pg_temp.gid('b')),
  'bs_delete_group: xóa mềm, dòng nhóm còn và deleted_at đã đặt'
);
select is(
  (select count(*) from bill_split.members m where m.group_id = pg_temp.gid('b')),
  1::bigint,
  'bs_delete_group: dữ liệu con giữ nguyên'
);
select is(
  (select g.deleted_at is null from bill_split.groups g where g.id = pg_temp.gid('a')),
  true,
  'bs_delete_group: không đụng tới nhóm khác'
);
set local role anon;

-- ---------------------------------------------------------------------------
-- Giới hạn tốc độ tạo nhóm: từ 30 nhóm trong 10 phút gần nhất thì BS_RATE_LIMITED (kể cả nhóm đã xóa)
-- ---------------------------------------------------------------------------
reset role;
update bill_split.groups set created_at = created_at - interval '1 hour';
insert into bill_split.groups (name, token_hash)
select 'Rate ' || g, sha256(convert_to('rate-limit-fill-' || lpad(g::text, 8, '0'), 'UTF8'))
  from generate_series(1, 29) g;
set local role anon;

select lives_ok($$select public.bs_create_group('Nhóm thứ 30', array['A'])$$, 'rate limit: nhóm thứ 30 trong 10 phút vẫn tạo được');
select pg_temp.throws(
  $$select public.bs_create_group('Nhóm thứ 31', array['A'])$$,
  'PT429', 'BS_RATE_LIMITED', null,
  'rate limit: từ 30 nhóm trong 10 phút thì BS_RATE_LIMITED (PT429)'
);
select pg_temp.throws(
  $$select public.bs_create_group('', array[]::text[])$$,
  'PT429', 'BS_RATE_LIMITED', null,
  'rate limit: được kiểm trước khi kiểm dữ liệu'
);
reset role;
select is((select count(*) from bill_split.groups g where g.created_at > now() - interval '10 minutes'), 30::bigint, 'rate limit: lần bị từ chối không tạo thêm nhóm');
set local role anon;

select lives_ok($$select public.bs_delete_group('rate-limit-fill-00000001')$$, 'rate limit: xóa mềm một nhóm vừa tạo');
select pg_temp.throws(
  $$select public.bs_create_group('Nhóm thứ 31', array['A'])$$,
  'PT429', 'BS_RATE_LIMITED', null,
  'rate limit: nhóm đã xóa vẫn được tính vào giới hạn'
);

reset role;
update bill_split.groups set created_at = now() - interval '11 minutes' where created_at > now() - interval '10 minutes';
set local role anon;
select lives_ok($$select public.bs_create_group('Nhóm sau cửa sổ', array['A'])$$, 'rate limit: hết cửa sổ 10 phút thì tạo lại được');

select * from finish();
rollback;
