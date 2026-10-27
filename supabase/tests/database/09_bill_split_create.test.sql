-- Chia tiền: bs_create_group với token do client sinh (gửi lại an toàn) và giới hạn tốc độ tạo nhóm
-- theo từng client và toàn hệ thống (hợp đồng mục 1, 6, 7 và 9).
--   * Thứ tự kiểm: định dạng token, gửi lại, giới hạn tốc độ, rồi mới tới kiểm dữ liệu.
--   * Gửi lại không tạo gì và không tính vào giới hạn.
--   * Khóa client lấy từ header IP (cf-connecting-ip, x-forwarded-for, x-real-ip), không có thì 'unknown'.
--   * Cửa sổ trượt 10 phút, dòng cũ bị dọn, giới hạn ghi đè được bằng bill_split.settings.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(106);

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

-- BS_RATE_LIMITED: PT429, không có details.
create function pg_temp.limited(p_sql text, p_desc text) returns text
language sql
as $$
  select pg_temp.throws(p_sql, 'PT429', 'BS_RATE_LIMITED', null, p_desc);
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

create function pg_temp.keys(p_json jsonb) returns text[]
language sql
immutable
as $$
  select array_agg(k order by k) from jsonb_object_keys(p_json) as k;
$$;

-- Token 24 ký tự cố định theo số: 'client-token-' + 11 chữ số.
create function pg_temp.ct(p_n integer) returns text
language sql
immutable
as $$
  select 'client-token-' || lpad(p_n::text, 11, '0');
$$;

-- Khóa client mà bill_split.client_key() phải sinh ra cho một IP.
create function pg_temp.key(p_ip text) returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_ip, 'UTF8')), 'hex');
$$;

-- Đặt header của request giả lập (PostgREST ghi JSON này vào GUC request.headers ở mỗi request).
create function pg_temp.hdr(p_json text) returns void
language sql
as $$
  select set_config('request.headers', p_json, true);
$$;

create function pg_temp.ip(p_ip text) returns void
language sql
as $$
  select pg_temp.hdr(jsonb_build_object('cf-connecting-ip', p_ip)::text);
$$;

-- Các helper dưới đây chạy bằng quyền owner (security definer) để đọc và ghi bảng nội bộ khi đang là anon.
create function pg_temp.last_client() returns text
language sql
security definer
as $$
  select l.client_hash from bill_split.create_log l order by l.id desc limit 1;
$$;

-- Số dòng log: của một client (theo IP, hoặc 'unknown'), hoặc tất cả khi không truyền.
create function pg_temp.log_n(p_ip text default null) returns bigint
language sql
security definer
as $$
  select count(*)
    from bill_split.create_log l
   where p_ip is null
      or l.client_hash = case when p_ip = 'unknown' then p_ip else encode(sha256(convert_to(p_ip, 'UTF8')), 'hex') end;
$$;

-- Thêm p_n dòng log của một client, đã "cũ" p_age.
create function pg_temp.fill_client(p_ip text, p_n integer, p_age interval default interval '0') returns void
language sql
security definer
as $$
  insert into bill_split.create_log (client_hash, created_at)
  select case when p_ip = 'unknown' then p_ip else encode(sha256(convert_to(p_ip, 'UTF8')), 'hex') end,
         now() - p_age
    from generate_series(1, p_n);
$$;

-- Thêm p_n dòng log của p_n client khác nhau (kẻ lấp đầy giới hạn toàn hệ thống).
create function pg_temp.fill_others(p_n integer, p_age interval default interval '0') returns void
language sql
security definer
as $$
  insert into bill_split.create_log (client_hash, created_at)
  select 'filler-' || g, now() - p_age from generate_series(1, p_n) g;
$$;

-- Làm "cũ" mọi dòng log thêm p_age.
create function pg_temp.age_log(p_age interval) returns void
language sql
security definer
as $$
  update bill_split.create_log set created_at = created_at - p_age;
$$;

-- Xóa log và đặt hai giới hạn. null nghĩa là xóa dòng cấu hình, dùng mặc định trong code (5 và 100).
create function pg_temp.setup(p_client integer, p_global integer) returns void
language plpgsql
security definer
as $$
begin
  delete from bill_split.create_log;
  delete from bill_split.settings;
  if p_client is not null then
    insert into bill_split.settings (key, value) values ('create_limit_client', p_client);
  end if;
  if p_global is not null then
    insert into bill_split.settings (key, value) values ('create_limit_global', p_global);
  end if;
end;
$$;

-- Đổi một giới hạn mà không xóa log.
create function pg_temp.set_limit(p_key text, p_value integer) returns void
language plpgsql
security definer
as $$
begin
  delete from bill_split.settings where key = p_key;
  insert into bill_split.settings (key, value) values (p_key, p_value);
end;
$$;

-- Số nhóm giữ token này (kể cả nhóm đã xóa), hoặc tất cả nhóm khi không truyền.
create function pg_temp.group_n(p_token text default null) returns bigint
language sql
security definer
as $$
  select count(*)
    from bill_split.groups g
   where p_token is null or g.token_hash = sha256(convert_to(p_token, 'UTF8'));
$$;

-- Tạo một nhóm với header đã cho, trả khóa client của dòng log vừa thêm.
create function pg_temp.key_used(p_headers text) returns text
language plpgsql
as $$
begin
  perform pg_temp.hdr(p_headers);
  perform public.bs_create_group('Thử header', array['An']);
  return pg_temp.last_client();
end;
$$;

-- ===========================================================================
-- Phần 1: token do client sinh và gửi lại (giới hạn nâng rất cao để không cản trở)
-- ===========================================================================
do $$
begin
  perform pg_temp.setup(1000000, 1000000);
  -- Số nhóm có sẵn (seed, dữ liệu dev) để các phép đếm bên dưới chỉ tính nhóm của test này.
  perform pg_temp.put('groups0', pg_temp.group_n()::text);
end;
$$;

set local role anon;

do $$
begin
  perform pg_temp.put('c1', public.bs_create_group('Có token', array['An', 'Bình'], pg_temp.ct(1))::text);
end;
$$;

select is(pg_temp.get('c1')::jsonb ->> 'token', pg_temp.ct(1), 'bs_create_group: trả đúng token do client gửi lên');
select is(pg_temp.keys(pg_temp.get('c1')::jsonb), array['snapshot', 'token'], 'bs_create_group với token: vẫn trả đúng { token, snapshot }');
select is(
  public.bs_get_group(pg_temp.ct(1)),
  pg_temp.get('c1')::jsonb -> 'snapshot',
  'bs_create_group với token: nhóm đọc được bằng chính token đó và khớp snapshot lúc tạo'
);
select is(pg_temp.group_n(pg_temp.ct(1)), 1::bigint, 'bs_create_group với token: database lưu đúng một nhóm giữ sha256 của token');

-- Gửi lại
select is(
  public.bs_create_group('Có token', array['An', 'Bình'], pg_temp.ct(1)),
  pg_temp.get('c1')::jsonb,
  'gửi lại cùng token: trả đúng { token, snapshot } của nhóm đã tạo'
);
select is(pg_temp.group_n(pg_temp.ct(1)), 1::bigint, 'gửi lại cùng token: không tạo nhóm thứ hai');
select is(
  public.bs_create_group('Tên khác', array['X', 'Y', 'Z'], pg_temp.ct(1)) #>> '{snapshot,group,name}',
  'Có token',
  'gửi lại cùng token với nội dung khác: trả nhóm cũ, không đổi tên, không thêm thành viên'
);
select is(
  public.bs_create_group('   ', null, pg_temp.ct(1)) #>> '{snapshot,group,name}',
  'Có token',
  'gửi lại được kiểm trước kiểm dữ liệu: tên trắng và thiếu thành viên vẫn trả nhóm cũ'
);
select is(
  jsonb_array_length(public.bs_save_member(pg_temp.ct(1), gen_random_uuid(), 'Chi') -> 'members'),
  3,
  'bs_save_member trên nhóm tạo bằng token client: thêm được thành viên'
);
select is(
  jsonb_array_length(public.bs_create_group('Có token', array['An', 'Bình'], pg_temp.ct(1)) #> '{snapshot,members}'),
  3,
  'gửi lại: trả snapshot hiện tại của nhóm (đã có thành viên thứ ba), không phải snapshot lúc tạo'
);
select is(pg_temp.log_n(), 1::bigint, 'gửi lại không tính vào giới hạn tốc độ: log chỉ có lần tạo thật');

-- Token của nhóm đã xóa không dùng lại được
select lives_ok($$select public.bs_create_group('Sẽ xóa', array['An'], pg_temp.ct(2))$$, 'tạo nhóm thứ hai bằng token client khác');
select lives_ok($$select public.bs_delete_group(pg_temp.ct(2))$$, 'xóa mềm nhóm thứ hai');
select pg_temp.invalid(
  $$select public.bs_create_group('Chiếm lại', array['An'], pg_temp.ct(2))$$,
  'token', 'id_taken',
  'tạo bằng token của nhóm đã xóa mềm: BS_INVALID token id_taken'
);
select pg_temp.invalid(
  $$select public.bs_create_group('   ', null, pg_temp.ct(2))$$,
  'token', 'id_taken',
  'token của nhóm đã xóa được kiểm trước dữ liệu: tên trắng vẫn ra id_taken'
);
select is(pg_temp.group_n(pg_temp.ct(2)), 1::bigint, 'tạo bằng token của nhóm đã xóa: không tạo nhóm mới');
select is(pg_temp.group_n() - pg_temp.get('groups0')::bigint, 2::bigint, 'phần 1: tới đây test đã tạo đúng hai nhóm (một sống, một đã xóa)');

-- Định dạng token
select pg_temp.invalid(
  format('select public.bs_create_group(%L, array[%L], %L)', 'Nhóm', 'An', t.v),
  'token', 'format',
  'bs_create_group: token ' || t.label || ' thì BS_INVALID token format'
)
from (values
  ('ngắn hơn 24 ký tự', 'short'),
  ('23 ký tự', repeat('a', 23)),
  ('25 ký tự', repeat('a', 25)),
  ('rỗng', ''),
  ('có dấu cách', ' ' || repeat('a', 23)),
  ('có ký tự ngoài base64url', repeat('a', 23) || '!'),
  ('có chữ có dấu', repeat('à', 24)),
  ('có xuống dòng ở cuối', repeat('a', 23) || E'\n')
) as t(label, v);

select pg_temp.invalid(
  $$select public.bs_create_group('   ', null, 'short')$$,
  'token', 'format',
  'token sai định dạng được kiểm trước dữ liệu: tên trắng cộng token sai vẫn ra token format'
);

do $$
begin
  perform pg_temp.put('c3', public.bs_create_group('Không token', array['An'], null)::text);
  perform pg_temp.put('c4', public.bs_create_group('Hai tham số', array['An'])::text);
end;
$$;
select matches(pg_temp.get('c3')::jsonb ->> 'token', '^[A-Za-z0-9_-]{24}$', 'p_token null: server tự sinh token');
select matches(pg_temp.get('c4')::jsonb ->> 'token', '^[A-Za-z0-9_-]{24}$', 'bỏ p_token (gọi với hai tham số): server tự sinh token');
select isnt(pg_temp.get('c3')::jsonb ->> 'token', pg_temp.get('c4')::jsonb ->> 'token', 'token do server sinh khác nhau giữa các lần tạo');
select is(
  public.bs_update_group(pg_temp.ct(1), 'Đổi tên') #>> '{group,name}',
  'Đổi tên',
  'nhóm tạo bằng token client dùng được mọi hàm khác (bs_update_group)'
);
select is(
  public.bs_create_group('Gửi lại sau đổi tên', array['An'], pg_temp.ct(1)) #>> '{snapshot,group,name}',
  'Đổi tên',
  'gửi lại sau khi đổi tên: trả nhóm với tên hiện tại'
);

-- Gửi lại không bị giới hạn tốc độ chặn, kể cả khi giới hạn bằng 0
reset role;
do $$
begin
  perform pg_temp.setup(0, 0);
end;
$$;
set local role anon;
select is(
  public.bs_create_group('Gửi lại khi hết chỗ', array['An'], pg_temp.ct(1)) #>> '{snapshot,group,name}',
  'Đổi tên',
  'gửi lại khi giới hạn tạo nhóm bằng 0: vẫn trả nhóm cũ (gửi lại không bị giới hạn tốc độ chặn)'
);
select is(pg_temp.log_n(), 0::bigint, 'gửi lại khi giới hạn bằng 0: không thêm dòng log nào');

-- ===========================================================================
-- Phần 2: giới hạn tốc độ với mặc định trong code (5 mỗi client, 100 toàn hệ thống, cửa sổ 10 phút)
-- ===========================================================================
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
end;
$$;
set local role anon;
do $$
begin
  perform pg_temp.ip('203.0.113.1');
end;
$$;

select lives_ok(
  format('select public.bs_create_group(%L, array[%L])', 'Client A số ' || g, 'An'),
  'rate limit mặc định: client A tạo nhóm lần thứ ' || g || ' trong 10 phút được'
)
from generate_series(1, 5) g;

select pg_temp.limited(
  $$select public.bs_create_group('Client A số 6', array['An'])$$,
  'rate limit mặc định: client A tạo lần thứ 6 trong 10 phút thì BS_RATE_LIMITED (PT429, không có details)'
);
select pg_temp.limited(
  $$select public.bs_create_group('', array[]::text[])$$,
  'rate limit được kiểm trước khi kiểm dữ liệu: tên trắng khi hết chỗ vẫn ra BS_RATE_LIMITED'
);
select pg_temp.invalid(
  $$select public.bs_create_group('Nhóm', array['An'], 'short')$$,
  'token', 'format',
  'khi hết chỗ: token sai định dạng vẫn ra token format (định dạng được kiểm trước giới hạn)'
);
select lives_ok(
  $$select public.bs_create_group('Gửi lại', array['An'], pg_temp.ct(1))$$,
  'khi hết chỗ: gửi lại token đã có vẫn thành công (gửi lại được kiểm trước giới hạn)'
);
select pg_temp.limited(
  $$select public.bs_create_group('Token mới', array['An'], pg_temp.ct(3))$$,
  'khi hết chỗ: token mới chưa có nhóm thì BS_RATE_LIMITED'
);
select is(pg_temp.log_n('203.0.113.1'), 5::bigint, 'rate limit: client A có đúng 5 dòng log, lần bị từ chối và lần gửi lại không thêm dòng');
select is(pg_temp.group_n(pg_temp.ct(3)), 0::bigint, 'rate limit: lần bị từ chối không tạo nhóm');

do $$
begin
  perform pg_temp.ip('203.0.113.2');
end;
$$;
select lives_ok($$select public.bs_create_group('Client B', array['An'])$$, 'rate limit theo client: client B vẫn tạo được khi client A đã hết chỗ');
select is(pg_temp.log_n('203.0.113.2'), 1::bigint, 'rate limit: client B có một dòng log');

-- Lần tạo lỗi dữ liệu không chiếm chỗ (transaction của request bị rollback)
do $$
begin
  perform pg_temp.ip('203.0.113.3');
end;
$$;
select lives_ok(
  format('select public.bs_create_group(%L, array[%L])', 'Client C số ' || g, 'An'),
  'client C tạo nhóm lần thứ ' || g
)
from generate_series(1, 4) g;
select pg_temp.invalid($$select public.bs_create_group('   ', array['An'])$$, 'name', 'required', 'client C: tên trắng bị từ chối vì dữ liệu');
select pg_temp.invalid($$select public.bs_create_group('Nhóm', array['An', 'an'])$$, 'member_names', 'duplicate', 'client C: tên thành viên trùng bị từ chối vì dữ liệu');
select is(pg_temp.log_n('203.0.113.3'), 4::bigint, 'lần tạo bị từ chối vì dữ liệu không chiếm chỗ trong giới hạn (log vẫn 4 dòng)');
select lives_ok($$select public.bs_create_group('Client C số 5', array['An'])$$, 'client C vẫn tạo được lần thứ 5 sau hai lần lỗi dữ liệu');
select pg_temp.limited($$select public.bs_create_group('Client C số 6', array['An'])$$, 'client C tạo lần thứ 6 thì BS_RATE_LIMITED');

-- ===========================================================================
-- Phần 3: khóa client lấy từ header nào
-- ===========================================================================
reset role;
do $$
begin
  perform pg_temp.setup(1000000, 1000000);
end;
$$;
set local role anon;

select is(
  pg_temp.key_used(c.headers),
  c.expected,
  'client_key: ' || c.label
)
from (values
  ('chỉ cf-connecting-ip', '{"cf-connecting-ip": "203.0.113.10"}', pg_temp.key('203.0.113.10')),
  ('cf-connecting-ip thắng x-forwarded-for và x-real-ip',
     '{"x-real-ip": "192.0.2.3", "x-forwarded-for": "198.51.100.2", "cf-connecting-ip": "203.0.113.11"}', pg_temp.key('203.0.113.11')),
  ('x-forwarded-for lấy địa chỉ đầu tiên và bỏ khoảng trắng',
     '{"x-forwarded-for": " 198.51.100.7 , 70.41.3.18, 150.172.238.178"}', pg_temp.key('198.51.100.7')),
  ('x-forwarded-for thắng x-real-ip', '{"x-real-ip": "192.0.2.4", "x-forwarded-for": "198.51.100.8"}', pg_temp.key('198.51.100.8')),
  ('chỉ x-real-ip', '{"x-real-ip": "192.0.2.5"}', pg_temp.key('192.0.2.5')),
  ('cf-connecting-ip trắng thì xét x-forwarded-for', '{"cf-connecting-ip": "   ", "x-forwarded-for": "198.51.100.9"}', pg_temp.key('198.51.100.9')),
  ('x-forwarded-for rỗng thì xét x-real-ip', '{"x-forwarded-for": "", "x-real-ip": "192.0.2.6"}', pg_temp.key('192.0.2.6')),
  ('tên header viết hoa vẫn nhận', '{"CF-Connecting-IP": "203.0.113.12"}', pg_temp.key('203.0.113.12')),
  ('IPv6 không phân biệt hoa thường', '{"cf-connecting-ip": "2001:DB8::AB"}', pg_temp.key('2001:db8::ab')),
  ('header không liên quan thì unknown', '{"user-agent": "curl/8", "x-client-ip": "203.0.113.13"}', 'unknown'),
  ('JSON rỗng thì unknown', '{}', 'unknown'),
  ('GUC rỗng (chạy ngoài PostgREST) thì unknown', '', 'unknown'),
  ('GUC không phải JSON thì unknown', 'khong-phai-json', 'unknown'),
  ('GUC là JSON nhưng không phải object thì unknown', '["203.0.113.14"]', 'unknown')
) as c(label, headers, expected);

-- 'unknown' là một bucket chung cho mọi request không có header IP
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
end;
$$;
set local role anon;
select lives_ok(
  format('select pg_temp.key_used(%L)', c.headers),
  'bucket unknown: tạo nhóm với ' || c.label
)
from (values
  ('GUC rỗng', ''),
  ('JSON rỗng', '{}'),
  ('header không liên quan', '{"user-agent": "curl/8"}'),
  ('GUC không phải JSON', 'khong-phai-json'),
  ('x-forwarded-for trắng', '{"x-forwarded-for": "  "}')
) as c(label, headers);
select is(pg_temp.log_n('unknown'), 5::bigint, 'bucket unknown: mọi dạng "không có IP" cùng đếm vào một bucket');
do $$
begin
  perform pg_temp.hdr('{}');
end;
$$;
select pg_temp.limited($$select public.bs_create_group('Unknown thứ 6', array['An'])$$, 'bucket unknown: lần thứ 6 từ bất kỳ request nào không có IP thì BS_RATE_LIMITED');
do $$
begin
  perform pg_temp.ip('203.0.113.20');
end;
$$;
select lives_ok($$select public.bs_create_group('Có IP', array['An'])$$, 'bucket unknown đầy không ảnh hưởng client có IP');

-- ===========================================================================
-- Phần 4: giới hạn toàn hệ thống và cửa sổ trượt
-- ===========================================================================
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
  perform pg_temp.fill_others(99);
end;
$$;
set local role anon;
do $$
begin
  perform pg_temp.ip('203.0.113.31');
end;
$$;
select lives_ok($$select public.bs_create_group('Toàn hệ thống thứ 100', array['An'])$$, 'giới hạn toàn hệ thống mặc định 100: lần tạo thứ 100 trong 10 phút được');
do $$
begin
  perform pg_temp.ip('203.0.113.32');
end;
$$;
select pg_temp.limited(
  $$select public.bs_create_group('Toàn hệ thống thứ 101', array['An'])$$,
  'giới hạn toàn hệ thống: lần thứ 101 bị BS_RATE_LIMITED dù client này chưa tạo lần nào'
);
select is(pg_temp.log_n('203.0.113.32'), 0::bigint, 'giới hạn toàn hệ thống: client bị từ chối không có dòng log');
select is(pg_temp.log_n(), 100::bigint, 'giới hạn toàn hệ thống: log có đúng 100 dòng');

-- Dòng log hết hạn thì được dọn và không còn tính
reset role;
do $$
begin
  perform pg_temp.age_log(interval '11 minutes');
end;
$$;
set local role anon;
select lives_ok($$select public.bs_create_group('Sau cửa sổ', array['An'])$$, 'hết cửa sổ 10 phút: client tạo lại được dù log từng đầy');
select is(pg_temp.log_n(), 1::bigint, 'dọn log: các dòng cũ hơn cửa sổ bị xóa khi có lần tạo mới, chỉ còn dòng vừa thêm');

-- Dòng log còn trong cửa sổ thì vẫn tính và không bị dọn
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
  perform pg_temp.fill_others(100, interval '9 minutes');
end;
$$;
set local role anon;
select pg_temp.limited($$select public.bs_create_group('Log 9 phút', array['An'])$$, 'log mới 9 phút trước vẫn nằm trong cửa sổ nên vẫn tính vào giới hạn');
reset role;
do $$
begin
  perform pg_temp.age_log(interval '2 minutes');
end;
$$;
set local role anon;
select lives_ok($$select public.bs_create_group('Log 11 phút', array['An'])$$, 'log 11 phút trước đã ra khỏi cửa sổ nên không tính');

-- Đúng 10 phút trước thì không còn tính (cửa sổ là created_at > now() - 10 phút)
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
  perform pg_temp.fill_client('203.0.113.40', 5, interval '10 minutes');
end;
$$;
set local role anon;
do $$
begin
  perform pg_temp.ip('203.0.113.40');
end;
$$;
select lives_ok($$select public.bs_create_group('Biên 10 phút', array['An'])$$, 'log đúng 10 phút trước đã ra khỏi cửa sổ');
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
  perform pg_temp.fill_client('203.0.113.40', 5, interval '9 minutes 59 seconds');
end;
$$;
set local role anon;
select pg_temp.limited($$select public.bs_create_group('Biên 9:59', array['An'])$$, 'log 9 phút 59 giây trước còn trong cửa sổ');

-- Chỉ dọn dòng cũ, dòng mới giữ nguyên
reset role;
do $$
begin
  perform pg_temp.setup(null, null);
  perform pg_temp.fill_others(3, interval '11 minutes');
  perform pg_temp.fill_others(2, interval '1 minute');
end;
$$;
set local role anon;
select lives_ok($$select public.bs_create_group('Dọn log', array['An'])$$, 'tạo nhóm khi log có dòng cũ lẫn dòng mới');
select is(pg_temp.log_n(), 3::bigint, 'dọn log: 3 dòng cũ bị xóa, 2 dòng mới và dòng vừa thêm được giữ');

-- ===========================================================================
-- Phần 5: ghi đè giới hạn bằng bill_split.settings
-- ===========================================================================
reset role;
do $$
begin
  perform pg_temp.setup(2, null);
  perform pg_temp.hdr('{"cf-connecting-ip": "203.0.113.50"}');
end;
$$;
set local role anon;
select lives_ok(
  format('select public.bs_create_group(%L, array[%L])', 'Giới hạn 2, lần ' || g, 'An'),
  'settings create_limit_client = 2: tạo lần thứ ' || g || ' được'
)
from generate_series(1, 2) g;
select pg_temp.limited($$select public.bs_create_group('Giới hạn 2, lần 3', array['An'])$$, 'settings create_limit_client = 2: lần thứ 3 bị BS_RATE_LIMITED');
reset role;
do $$
begin
  perform pg_temp.set_limit('create_limit_client', 3);
end;
$$;
set local role anon;
select lives_ok($$select public.bs_create_group('Nâng lên 3', array['An'])$$, 'nâng create_limit_client lên 3: tạo được tiếp ngay, không cần chờ');
select pg_temp.limited($$select public.bs_create_group('Nâng lên 3, lần 4', array['An'])$$, 'create_limit_client = 3: lần thứ 4 bị chặn');

reset role;
do $$
begin
  perform pg_temp.setup(10, null);
end;
$$;
set local role anon;
select lives_ok(
  format('select public.bs_create_group(%L, array[%L])', 'Giới hạn 10, lần ' || g, 'An'),
  'settings create_limit_client = 10: tạo lần thứ ' || g || ' được (vượt mặc định 5)'
)
from generate_series(1, 6) g;
reset role;
do $$
begin
  perform pg_temp.fill_others(100);
end;
$$;
set local role anon;
select pg_temp.limited(
  $$select public.bs_create_group('Toàn hệ thống mặc định', array['An'])$$,
  'chỉ ghi đè create_limit_client: giới hạn toàn hệ thống vẫn là mặc định 100 và vẫn chặn'
);

reset role;
do $$
begin
  perform pg_temp.setup(0, null);
end;
$$;
set local role anon;
select pg_temp.limited($$select public.bs_create_group('Công tắc khẩn', array['An'])$$, 'create_limit_client = 0: chặn hẳn việc tạo nhóm (công tắc khẩn)');

reset role;
do $$
begin
  perform pg_temp.setup(null, 0);
end;
$$;
set local role anon;
select pg_temp.limited($$select public.bs_create_group('Công tắc khẩn toàn hệ thống', array['An'])$$, 'create_limit_global = 0: chặn hẳn việc tạo nhóm');

reset role;
do $$
begin
  perform pg_temp.setup(null, 2);
  perform pg_temp.fill_others(1);
end;
$$;
set local role anon;
select lives_ok($$select public.bs_create_group('Toàn hệ thống 2, lần 2', array['An'])$$, 'settings create_limit_global = 2: lần thứ hai (còn một chỗ) được');
select pg_temp.limited($$select public.bs_create_group('Toàn hệ thống 2, lần 3', array['An'])$$, 'create_limit_global = 2: lần thứ ba bị chặn dù client này mới tạo một lần');

select * from finish();
rollback;
