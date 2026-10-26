-- Chia tiền: phân quyền và cấu trúc bảo mật (hợp đồng mục 2 và 9).
--   * Tập hàm public mà anon gọi được đúng bằng 12 hàm bs_*, không tên nào có hai chữ ký.
--   * anon và authenticated không có USAGE trên bill_split, không đọc hay ghi được bảng nào.
--   * RLS bật, không có policy. Mọi hàm security definer với search_path rỗng.
begin;
set local search_path = public, extensions;

select plan(41);

-- Chạy một câu SQL bằng quyền của role hiện tại, trả null nếu thành công,
-- nếu lỗi thì trả { state, message, detail } (detail được parse thành JSON nếu có thể).
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

-- ---------------------------------------------------------------------------
-- Schema bill_split không lộ ra API
-- ---------------------------------------------------------------------------
select has_schema('bill_split', 'schema bill_split tồn tại');

select is(has_schema_privilege('anon', 'bill_split', 'usage'), false, 'anon không có USAGE trên bill_split');
select is(has_schema_privilege('authenticated', 'bill_split', 'usage'), false, 'authenticated không có USAGE trên bill_split');
select is(has_schema_privilege('anon', 'bill_split', 'create'), false, 'anon không có CREATE trên bill_split');
select is(has_schema_privilege('authenticated', 'bill_split', 'create'), false, 'authenticated không có CREATE trên bill_split');

select is(
  (select count(*)
     from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where n.nspname = 'bill_split'
      and a.grantee = 0),
  0::bigint,
  'PUBLIC không có quyền nào trên schema bill_split'
);

-- ---------------------------------------------------------------------------
-- Bảng: không role API nào có quyền
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'bill_split' and c.relkind = 'r'),
  5::bigint,
  'bill_split có đúng 5 bảng'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) as p(priv)
    where n.nspname = 'bill_split'
      and c.relkind = 'r'
      and has_table_privilege(r.role_name, c.oid, p.priv)),
  0::bigint,
  'anon và authenticated không có quyền bảng nào trên bill_split'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(role_name)
    where n.nspname = 'bill_split'
      and c.relkind = 'r'
      and has_any_column_privilege(r.role_name, c.oid, 'select,insert,update,references')),
  0::bigint,
  'anon và authenticated không có quyền cột nào trên bill_split'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'bill_split'
      and c.relkind = 'r'
      and a.grantee = 0),
  0::bigint,
  'PUBLIC không có quyền nào trên bảng của bill_split'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'bill_split' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'RLS bật trên mọi bảng bill_split'
);

select is(
  (select count(*)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'bill_split'),
  0::bigint,
  'bill_split không có policy nào (RLS chỉ làm lớp chặn dự phòng)'
);

set local role anon;

select is(
  pg_temp.err(format('select * from bill_split.%I', t)) ->> 'state',
  '42501',
  'anon không đọc được bill_split.' || t
)
from unnest(array['groups', 'members', 'expenses', 'expense_shares', 'settlements']) as t;

select is(
  pg_temp.err($$insert into bill_split.groups (name, token_hash) values ('x', sha256('x'::bytea))$$) ->> 'state',
  '42501',
  'anon không ghi được vào bill_split.groups'
);
select is(pg_temp.err($$update bill_split.groups set name = 'x'$$) ->> 'state', '42501', 'anon không sửa được bill_split.groups');
select is(pg_temp.err($$delete from bill_split.members$$) ->> 'state', '42501', 'anon không xóa được bill_split.members');
select is(pg_temp.err($$select bill_split.find_group('test-group-a-token-00001')$$) ->> 'state', '42501', 'anon không gọi được hàm nội bộ bill_split.find_group');
select is(pg_temp.err($$select bill_split.build_snapshot(gen_random_uuid())$$) ->> 'state', '42501', 'anon không gọi được hàm nội bộ bill_split.build_snapshot');

set local role authenticated;

select is(
  pg_temp.err(format('select * from bill_split.%I', t)) ->> 'state',
  '42501',
  'authenticated không đọc được bill_split.' || t
)
from unnest(array['groups', 'members', 'expenses', 'expense_shares', 'settlements']) as t;

select is(pg_temp.err($$delete from bill_split.expenses$$) ->> 'state', '42501', 'authenticated không xóa được bill_split.expenses');
select is(pg_temp.err($$select bill_split.lock_group('test-group-a-token-00001')$$) ->> 'state', '42501', 'authenticated không gọi được hàm nội bộ bill_split.lock_group');

reset role;

-- ---------------------------------------------------------------------------
-- Hàm: allowlist đúng 12 hàm bs_*, không overload, không PUBLIC
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  array[
    'bs_create_group', 'bs_delete_expense', 'bs_delete_group', 'bs_delete_member', 'bs_delete_settlement',
    'bs_get_group', 'bs_get_groups', 'bs_rotate_token', 'bs_save_expense', 'bs_save_member',
    'bs_save_settlement', 'bs_update_group'
  ],
  'anon chỉ gọi được đúng 12 hàm bs_* trong schema public'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  array[
    'bs_create_group', 'bs_delete_expense', 'bs_delete_group', 'bs_delete_member', 'bs_delete_settlement',
    'bs_get_group', 'bs_get_groups', 'bs_rotate_token', 'bs_save_expense', 'bs_save_member',
    'bs_save_settlement', 'bs_update_group'
  ],
  'authenticated chỉ gọi được đúng 12 hàm bs_* trong schema public'
);

select is(
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'bs\_%'),
  12::bigint,
  'có đúng 12 hàm bs_* trong schema public'
);

select is(
  (select count(*)
     from (select proname from pg_proc
            where pronamespace = 'public'::regnamespace and proname like 'bs\_%'
            group by proname having count(*) > 1) d),
  0::bigint,
  'không tên hàm bs_* nào có hai chữ ký (không overload)'
);

select is(
  (select count(*)
     from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'bs\_%'
      and a.grantee = 0),
  0::bigint,
  'PUBLIC không có EXECUTE trên hàm bs_* nào'
);

select is(
  (select count(*)
     from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'bill_split'::regnamespace
      and a.grantee = 0),
  0::bigint,
  'PUBLIC không có EXECUTE trên hàm nội bộ nào của bill_split'
);

select is(
  (select count(*)
     from pg_proc p
    cross join (values ('anon'), ('authenticated')) as r(role_name)
    where p.pronamespace = 'bill_split'::regnamespace
      and has_function_privilege(r.role_name, p.oid, 'execute')),
  0::bigint,
  'anon và authenticated không có EXECUTE trên hàm nội bộ nào của bill_split'
);

select cmp_ok(
  (select count(*) from pg_proc where pronamespace = 'bill_split'::regnamespace),
  '>',
  0::bigint,
  'bill_split có hàm nội bộ (kiểm tra trên là có ý nghĩa)'
);

-- ---------------------------------------------------------------------------
-- Thuộc tính của hàm
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
     from pg_proc p
    where (p.pronamespace = 'bill_split'::regnamespace
           or (p.pronamespace = 'public'::regnamespace and p.proname like 'bs\_%'))
      and not (p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'])),
  0::bigint,
  'mọi hàm của module đều security definer và set search_path = ''''.'
);

select is(
  (select array_agg(proname::text order by proname)
     from pg_proc
    where pronamespace = 'public'::regnamespace and proname like 'bs\_%' and provolatile = 's'),
  array['bs_get_group', 'bs_get_groups'],
  'chỉ bs_get_group và bs_get_groups khai báo stable (chạy chỉ đọc)'
);

select is(
  (select count(*)
     from pg_proc
    where pronamespace = 'public'::regnamespace and proname like 'bs\_%' and provolatile = 'v'),
  10::bigint,
  '10 hàm ghi còn lại là volatile'
);

select is(
  (select count(*)
     from pg_proc
    where pronamespace = 'bill_split'::regnamespace
      and proname in ('find_group', 'build_snapshot', 'check_shares', 'fail', 'invalid', 'over_limit', 'clean', 'req_text', 'opt_text', 'hash_token')
      and provolatile = 'v'),
  0::bigint,
  'các hàm nội bộ mà hàm stable gọi tới đều không phải volatile'
);

select * from finish();
rollback;
