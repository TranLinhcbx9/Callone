-- Chia tiền: ký tự trắng trong chuỗi người dùng nhập (hợp đồng mục 3 và 7).
-- "Trắng" gồm khoảng trắng ASCII, toàn bộ Unicode White_Space (kể cả NBSP U+00A0, NEL U+0085, U+3000...)
-- và các ký tự rộng bằng không U+200B tới U+200D, U+2060, U+FEFF. Ký tự trắng ở hai đầu bị cắt,
-- chuỗi chỉ toàn ký tự trắng là rỗng nên bị từ chối (required) hoặc lưu null (trường tùy chọn).
-- Phần 1 kiểm hàm nội bộ với từng mã ký tự, phần 2 kiểm qua API như trình duyệt gọi.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(65);

-- ---------------------------------------------------------------------------
-- Helper (chỉ tồn tại trong transaction này)
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

-- Mọi mã ký tự được tính là trắng:
--   ASCII: tab, LF, VT, FF, CR (9 tới 13), dấu cách (32)
--   Unicode White_Space: NEL (133), NBSP (160), U+1680 (5760), U+2000 tới U+200A (8192 tới 8202),
--     U+2028 và U+2029 (8232, 8233), U+202F (8239), U+205F (8287), U+3000 (12288)
--   Rộng bằng không: U+200B tới U+200D (8203 tới 8205), U+2060 (8288), U+FEFF (65279)
create function pg_temp.blank_cps() returns integer[]
language sql
immutable
as $$
  select array[9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
               8232, 8233, 8239, 8287, 12288, 8203, 8204, 8205, 8288, 65279];
$$;

-- Danh sách mã (hex) vi phạm, để test báo rõ mã nào sai. null nghĩa là không mã nào sai.
create function pg_temp.bad_cps(p_check text) returns text[]
language plpgsql
as $$
declare
  v_bad text[];
begin
  execute format('select array_agg(to_hex(cp) order by cp) from unnest(pg_temp.blank_cps()) as cp where %s', p_check)
    into v_bad;
  return v_bad;
end;
$$;

-- ===========================================================================
-- Phần 1: bill_split.clean và bill_split.strip_blank với từng mã ký tự (bằng quyền owner)
-- ===========================================================================
select is(pg_temp.bad_cps($$bill_split.clean(chr(cp)) is not null$$), null, 'clean: mỗi ký tự trắng đứng một mình thành rỗng (null)');
select is(pg_temp.bad_cps($$bill_split.clean(repeat(chr(cp), 4)) is not null$$), null, 'clean: chuỗi toàn một loại ký tự trắng thành rỗng (null)');
select is(pg_temp.bad_cps($$bill_split.clean(chr(cp) || 'Linh' || chr(cp)) is distinct from 'Linh'$$), null, 'clean: ký tự trắng ở hai đầu bị cắt');
select is(pg_temp.bad_cps($$bill_split.clean(repeat(chr(cp), 3) || 'Linh') is distinct from 'Linh'$$), null, 'clean: nhiều ký tự trắng ở đầu bị cắt hết');
select is(pg_temp.bad_cps($$bill_split.clean('Linh' || repeat(chr(cp), 3)) is distinct from 'Linh'$$), null, 'clean: nhiều ký tự trắng ở cuối bị cắt hết');
-- So với dạng NFC: U+2000 và U+2001 tương đương chuẩn với U+2002 và U+2003 nên NFC đổi chúng.
select is(
  pg_temp.bad_cps($$bill_split.clean('Nguyễn' || chr(cp) || 'Linh') is distinct from normalize('Nguyễn' || chr(cp) || 'Linh', nfc)$$),
  null,
  'clean: ký tự trắng ở giữa được giữ nguyên (chỉ chuẩn hóa NFC)'
);
select is(
  bill_split.clean((select string_agg(chr(c), '') from unnest(pg_temp.blank_cps()) as c) || 'Linh'
                   || (select string_agg(chr(c), '' order by c desc) from unnest(pg_temp.blank_cps()) as c)),
  'Linh',
  'clean: một dải trộn mọi loại ký tự trắng ở hai đầu bị cắt sạch'
);
select is(
  (select array_agg(c order by c) from unnest(array['a', 'Z', '0', '.', '-', '_', '#', 'ạ', 'Đ', 'Ơ', 'ở', '漢', '😀']) as c where bill_split.clean(c) is distinct from c),
  null,
  'clean: ký tự không phải trắng (chữ, số, dấu câu, tiếng Việt có dấu, emoji) đứng một mình được giữ nguyên'
);
select is(bill_split.clean(U&'Hu\031Bng'), U&'H\01B0ng', 'clean: vẫn chuẩn hóa về NFC (u + dấu móc tổ hợp thành ư)');
select is(bill_split.clean(null), null, 'clean: null vào thì null ra');
select is(bill_split.clean(''), null, 'clean: chuỗi rỗng thì null');
select is(
  bill_split.clean(repeat(chr(160), 200000) || 'a' || repeat(chr(8203), 200000)),
  'a',
  'clean: đầu vào rất dài (400 nghìn ký tự trắng) chạy xong và cắt đúng'
);

select is(pg_temp.bad_cps($$bill_split.strip_blank(chr(cp)) is not null$$), null, 'strip_blank: mỗi ký tự trắng đứng một mình thành rỗng (null)');
select is(pg_temp.bad_cps($$bill_split.strip_blank('0123' || chr(cp) || '456' || chr(cp) || '789') is distinct from '0123456789'$$), null, 'strip_blank: bỏ ký tự trắng ở bất kỳ đâu trong chuỗi');
select is(bill_split.strip_blank('0123abcXYZ789'), '0123abcXYZ789', 'strip_blank: chuỗi không có ký tự trắng giữ nguyên');
select is(bill_split.strip_blank(null), null, 'strip_blank: null vào thì null ra');
select is(length(bill_split.strip_blank(repeat('1' || chr(160), 100000))), 100000, 'strip_blank: đầu vào rất dài chạy xong và bỏ đúng');

-- ===========================================================================
-- Phần 2: qua API (anon)
-- ===========================================================================
insert into bill_split.groups (id, name, token_hash) values
  ('a0000000-0000-4000-8000-000000000001', 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position") values
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'An', 0),
  ('a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 'Bình', 1);
insert into bill_split.settings (key, value) values ('create_limit_client', 1000000), ('create_limit_global', 1000000)
on conflict (key) do update set value = excluded.value;

create function pg_temp.mid(p_n integer) returns uuid
language sql
immutable
as $$
  select ('a0000000-0000-4000-8000-' || lpad((100 + p_n)::text, 12, '0'))::uuid;
$$;

-- Khoản chi số p_n của nhóm A, chia đều cho An và Bình.
create function pg_temp.save_exp(p_n integer, p_title text, p_note text) returns jsonb
language sql
as $$
  select public.bs_save_expense(
    'test-group-a-token-00001', ('a0000000-0000-4000-8000-' || lpad((200 + p_n)::text, 12, '0'))::uuid, p_title, 100000,
    pg_temp.mid(1), date '2026-10-26', 'equal',
    jsonb_build_array(jsonb_build_object('member_id', pg_temp.mid(1), 'amount', 50000), jsonb_build_object('member_id', pg_temp.mid(2), 'amount', 50000)),
    null, p_note
  );
$$;

create function pg_temp.get_exp(p_n integer) returns jsonb
language sql
as $$
  select e.value
    from jsonb_array_elements(public.bs_get_group('test-group-a-token-00001') -> 'expenses') as e(value)
   where e.value ->> 'id' = ('a0000000-0000-4000-8000-' || lpad((200 + p_n)::text, 12, '0'));
$$;

create function pg_temp.save_pay(p_n integer, p_note text) returns jsonb
language sql
as $$
  select public.bs_save_settlement(
    'test-group-a-token-00001', ('a0000000-0000-4000-8000-' || lpad((300 + p_n)::text, 12, '0'))::uuid,
    pg_temp.mid(2), pg_temp.mid(1), 10000, date '2026-10-26', p_note
  );
$$;

create function pg_temp.get_pay(p_n integer) returns jsonb
language sql
as $$
  select s.value
    from jsonb_array_elements(public.bs_get_group('test-group-a-token-00001') -> 'settlements') as s(value)
   where s.value ->> 'id' = ('a0000000-0000-4000-8000-' || lpad((300 + p_n)::text, 12, '0'));
$$;

-- Chuỗi chỉ toàn ký tự trắng, mỗi loại một mẫu.
create function pg_temp.blanks() returns table (label text, v text)
language sql
immutable
as $$
  values
    ('NBSP', U&'\00A0\00A0'),
    ('ký tự rộng bằng không U+200B', U&'\200B'),
    ('U+200C và U+200D', U&'\200C\200D'),
    ('word joiner U+2060', U&'\2060'),
    ('BOM U+FEFF', U&'\FEFF'),
    ('dấu cách ý nghĩa U+3000', U&'\3000'),
    ('NEL U+0085', U&'\0085'),
    ('en quad và hair space', U&'\2000\200A'),
    ('tab, VT, FF, CR, LF', chr(9) || chr(11) || chr(12) || chr(13) || chr(10)),
    ('trộn nhiều loại', U&' \00A0\200B\3000\FEFF' || chr(10));
$$;

-- Thành viên theo tên trong snapshot hiện tại.
create function pg_temp.member(p_name text) returns jsonb
language sql
as $$
  select m.value
    from jsonb_array_elements(public.bs_get_group('test-group-a-token-00001') -> 'members') as m(value)
   where m.value ->> 'name' = p_name;
$$;

set local role anon;


-- bs_create_group
select pg_temp.invalid(
  format('select public.bs_create_group(%L, array[%L])', b.v, 'An'),
  'name', 'required',
  'bs_create_group: tên nhóm chỉ có ' || b.label || ' thì required'
)
from pg_temp.blanks() b;
select pg_temp.invalid(
  $$select public.bs_create_group('Nhóm', array['An', U&'\00A0'])$$,
  'member_names', 'required',
  'bs_create_group: tên thành viên chỉ có NBSP thì required'
);
select pg_temp.invalid(
  $$select public.bs_create_group('Nhóm', array[U&'\200B\FEFF'])$$,
  'member_names', 'required',
  'bs_create_group: tên thành viên chỉ có ký tự rộng bằng không thì required'
);
select pg_temp.invalid(
  $$select public.bs_create_group('Nhóm', array['Linh', U&'\00A0linh\200B'])$$,
  'member_names', 'duplicate',
  'bs_create_group: tên trùng sau khi cắt ký tự trắng (kể cả NBSP và ký tự rộng bằng không) là duplicate'
);
do $$
begin
  perform set_config('t.created', public.bs_create_group(U&'\00A0\3000Đà Lạt\200B\FEFF', array[U&'\00A0Linh\200B', U&'\FEFF Hưng\3000'])::text, true);
end;
$$;
select is(current_setting('t.created')::jsonb #>> '{snapshot,group,name}', 'Đà Lạt', 'bs_create_group: tên nhóm được cắt ký tự trắng và ký tự rộng bằng không ở hai đầu');
select is(
  (select jsonb_agg(m.value ->> 'name' order by m.ord)
     from jsonb_array_elements(current_setting('t.created')::jsonb #> '{snapshot,members}') with ordinality as m(value, ord)),
  '["Linh", "Hưng"]'::jsonb,
  'bs_create_group: tên thành viên được cắt ký tự trắng và ký tự rộng bằng không ở hai đầu'
);

-- bs_update_group
select pg_temp.invalid(
  format('select public.bs_update_group(%L, %L)', 'test-group-a-token-00001', b.v),
  'name', 'required',
  'bs_update_group: tên chỉ có ' || b.label || ' thì required'
)
from pg_temp.blanks() b
where b.label in ('NBSP', 'ký tự rộng bằng không U+200B', 'BOM U+FEFF', 'trộn nhiều loại');
select is(
  public.bs_update_group('test-group-a-token-00001', U&'\00A0Nhóm mới\200B') #>> '{group,name}',
  'Nhóm mới',
  'bs_update_group: tên mới được cắt ký tự trắng ở hai đầu'
);

-- bs_save_member
select pg_temp.invalid(
  format('select public.bs_save_member(%L, gen_random_uuid(), %L)', 'test-group-a-token-00001', b.v),
  'name', 'required',
  'bs_save_member: tên chỉ có ' || b.label || ' thì required'
)
from pg_temp.blanks() b
where b.label in ('NBSP', 'ký tự rộng bằng không U+200B', 'word joiner U+2060', 'dấu cách ý nghĩa U+3000', 'trộn nhiều loại');
select is(
  public.bs_save_member('test-group-a-token-00001', gen_random_uuid(), U&'\00A0Chi\200B') #>> '{members,2,name}',
  'Chi',
  'bs_save_member: tên được cắt ký tự trắng ở hai đầu'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', gen_random_uuid(), U&'\200BCHI\00A0')$$,
  'name', 'duplicate',
  'bs_save_member: tên trùng thành viên khác sau khi cắt ký tự trắng là duplicate'
);

-- Ngân hàng: số tài khoản bỏ hết ký tự trắng ở bất kỳ đâu, kể cả NBSP và ký tự rộng bằng không
select is(
  pg_temp.member('Chi') - 'id',
  jsonb_build_object('name', 'Chi', 'position', 2, 'bank_bin', null, 'bank_account', null, 'bank_account_name', null),
  'bs_save_member: thành viên không có thông tin ngân hàng thì ba trường ngân hàng là null'
);
select is(
  public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', '970436', U&'0123 456\00A0789\200B', U&'\00A0NGUYEN VAN AN\200B') -> 'members' -> 0,
  jsonb_build_object('id', pg_temp.mid(1), 'name', 'An', 'position', 0, 'bank_bin', '970436', 'bank_account', '0123456789', 'bank_account_name', 'NGUYEN VAN AN'),
  'bs_save_member: số tài khoản bỏ dấu cách, NBSP và ký tự rộng bằng không; tên chủ tài khoản được cắt hai đầu'
);
select is(
  public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', U&'\00A0', U&'\200B \3000', U&'\FEFF') -> 'members' -> 0,
  jsonb_build_object('id', pg_temp.mid(1), 'name', 'An', 'position', 0, 'bank_bin', null, 'bank_account', null, 'bank_account_name', null),
  'bs_save_member: ba trường ngân hàng chỉ toàn ký tự trắng coi như để trống, xóa thông tin ngân hàng cũ'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', '970436', U&'\200B\00A0')$$,
  'bank_account', 'required',
  'bs_save_member: số tài khoản chỉ toàn ký tự trắng mà có bank_bin thì bank_account required'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', U&'\00A0', '0123456789')$$,
  'bank_bin', 'required',
  'bs_save_member: bank_bin chỉ toàn ký tự trắng mà có số tài khoản thì bank_bin required'
);
select pg_temp.invalid(
  $$select public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', '970436', U&'0123\00A0-45')$$,
  'bank_account', 'format',
  'bs_save_member: sau khi bỏ ký tự trắng, ký tự lạ còn lại (dấu gạch) vẫn là format'
);
select is(
  public.bs_save_member('test-group-a-token-00001', pg_temp.mid(1), 'An', '970436', '0123456789', U&'\00A0\200B') -> 'members' -> 0 -> 'bank_account_name',
  'null'::jsonb,
  'bs_save_member: tên chủ tài khoản chỉ toàn ký tự trắng thì lưu null'
);

-- bs_save_expense
select pg_temp.invalid(
  format('select pg_temp.save_exp(1, %L, null)', b.v),
  'title', 'required',
  'bs_save_expense: tiêu đề chỉ có ' || b.label || ' thì required'
)
from pg_temp.blanks() b
where b.label in ('NBSP', 'ký tự rộng bằng không U+200B', 'BOM U+FEFF', 'dấu cách ý nghĩa U+3000', 'trộn nhiều loại');
select lives_ok($$select pg_temp.save_exp(1, U&'\00A0Ăn trưa\200B', U&'\00A0\200B\3000')$$, 'bs_save_expense: tạo khoản chi có tiêu đề bọc ký tự trắng và ghi chú chỉ toàn ký tự trắng');
select is(pg_temp.get_exp(1) ->> 'title', 'Ăn trưa', 'bs_save_expense: tiêu đề được cắt ký tự trắng ở hai đầu');
select is(pg_temp.get_exp(1) -> 'note', 'null'::jsonb, 'bs_save_expense: ghi chú chỉ toàn ký tự trắng thì lưu null');
select lives_ok($$select pg_temp.save_exp(2, 'Cà phê', U&'\FEFFGhi chú thật\00A0')$$, 'bs_save_expense: tạo khoản chi có ghi chú bọc ký tự trắng');
select is(pg_temp.get_exp(2) ->> 'note', 'Ghi chú thật', 'bs_save_expense: ghi chú được cắt ký tự trắng ở hai đầu');

-- bs_save_settlement
select lives_ok($$select pg_temp.save_pay(1, U&'\00A0\200B\FEFF')$$, 'bs_save_settlement: tạo thanh toán có ghi chú chỉ toàn ký tự trắng');
select is(pg_temp.get_pay(1) -> 'note', 'null'::jsonb, 'bs_save_settlement: ghi chú chỉ toàn ký tự trắng thì lưu null');
select lives_ok($$select pg_temp.save_pay(2, U&'\200BChuyển khoản MB\00A0')$$, 'bs_save_settlement: tạo thanh toán có ghi chú bọc ký tự trắng');
select is(pg_temp.get_pay(2) ->> 'note', 'Chuyển khoản MB', 'bs_save_settlement: ghi chú được cắt ký tự trắng ở hai đầu');

select * from finish();
rollback;
