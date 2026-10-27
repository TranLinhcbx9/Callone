-- Chia tiền: bs_rotate_token với token mới do client chọn (hợp đồng mục 1, 6, 7 và 9).
--   * p_new_token đúng định dạng và khác token cũ, nếu không BS_INVALID new_token format.
--   * Token mới đã thuộc nhóm khác, kể cả nhóm đã xóa mềm: BS_INVALID new_token id_taken.
--   * Gửi lại cùng cặp token an toàn: lần đổi đã commit mà phản hồi bị mất được nhận ra ở lần gửi lại
--     (token cũ không còn, token mới đang sống) và trả lại { token } mà không ghi gì.
-- Cách đổi token do server sinh (bỏ p_new_token) có test ở 02.
begin;
set local search_path = public, extensions;

-- Các khóa ngoại trỏ tới members khai báo deferrable initially deferred. Kiểm ngay trong test để
-- mọi vi phạm khóa ngoại của hàm API lộ ra tại câu lệnh gây lỗi, không chờ tới commit (test luôn rollback).
set constraints all immediate;

select plan(56);

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

create function pg_temp.not_found(p_sql text, p_desc text) returns text
language sql
as $$
  select pg_temp.throws(p_sql, 'PT404', 'BS_GROUP_NOT_FOUND', null, p_desc);
$$;

-- Token cố định: 'rotated-token-' + 10 chữ số (24 ký tự).
create function pg_temp.nt(p_n integer) returns text
language sql
immutable
as $$
  select 'rotated-token-' || lpad(p_n::text, 10, '0');
$$;

-- Đọc bảng bằng quyền owner khi đang là anon.
create function pg_temp.hash_of(p_group text) returns bytea
language sql
security definer
as $$
  select g.token_hash from bill_split.groups g where g.name = p_group;
$$;

create function pg_temp.updated_of(p_group text) returns timestamptz
language sql
security definer
as $$
  select g.updated_at from bill_split.groups g where g.name = p_group;
$$;

create function pg_temp.set_updated(p_group text, p_at timestamptz) returns void
language sql
security definer
as $$
  update bill_split.groups set updated_at = p_at where name = p_group;
$$;

create function pg_temp.sha(p_token text) returns bytea
language sql
immutable
as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền: nhóm A và B còn sống, nhóm D đã xóa mềm
-- ---------------------------------------------------------------------------
insert into bill_split.groups (id, name, token_hash, deleted_at) values
  ('a0000000-0000-4000-8000-000000000001', 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8')), null),
  ('b0000000-0000-4000-8000-000000000001', 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8')), null),
  ('d0000000-0000-4000-8000-000000000001', 'Nhóm D', sha256(convert_to('test-group-d-token-00001', 'UTF8')), timestamptz '2026-10-01 00:00:00+00');
insert into bill_split.members (id, group_id, name, "position") values
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'An', 0),
  ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 'Bình', 0);
update bill_split.groups set updated_at = timestamptz '2000-01-01 00:00:00+00';

set local role anon;

-- ---------------------------------------------------------------------------
-- Đổi sang token do client chọn
-- ---------------------------------------------------------------------------
select is(
  public.bs_rotate_token('test-group-a-token-00001', pg_temp.nt(1)),
  jsonb_build_object('token', pg_temp.nt(1)),
  'bs_rotate_token: trả đúng { token } là token mới do client chọn'
);
select pg_temp.not_found($$select public.bs_get_group('test-group-a-token-00001')$$, 'bs_rotate_token: token cũ hết hiệu lực ngay');
select is(public.bs_get_group(pg_temp.nt(1)) #>> '{group,name}', 'Nhóm A', 'bs_rotate_token: token mới mở đúng nhóm cũ');
select is(pg_temp.hash_of('Nhóm A'), pg_temp.sha(pg_temp.nt(1)), 'bs_rotate_token: database lưu sha256 của token mới');
select cmp_ok(pg_temp.updated_of('Nhóm A'), '>', timestamptz '2020-01-01 00:00:00+00', 'bs_rotate_token: cập nhật groups.updated_at');
select is(public.bs_get_group('test-group-b-token-00001') #>> '{group,name}', 'Nhóm B', 'bs_rotate_token: không đụng tới nhóm khác');

-- Gửi lại cùng cặp token (phản hồi lần đầu bị mất)
do $$
begin
  perform pg_temp.set_updated('Nhóm A', timestamptz '2000-01-01 00:00:00+00');
end;
$$;
select is(
  public.bs_rotate_token('test-group-a-token-00001', pg_temp.nt(1)),
  jsonb_build_object('token', pg_temp.nt(1)),
  'gửi lại cùng cặp token: thành công và trả lại đúng { token }'
);
select is(
  public.bs_rotate_token('test-group-a-token-00001', pg_temp.nt(1)),
  jsonb_build_object('token', pg_temp.nt(1)),
  'gửi lại lần nữa vẫn thành công (gửi lại bao nhiêu lần cũng được)'
);
select is(pg_temp.updated_of('Nhóm A'), timestamptz '2000-01-01 00:00:00+00', 'gửi lại không ghi gì: groups.updated_at không đổi');
select is(pg_temp.hash_of('Nhóm A'), pg_temp.sha(pg_temp.nt(1)), 'gửi lại không ghi gì: token_hash vẫn là của token mới');
select is(public.bs_get_group(pg_temp.nt(1)) #>> '{group,name}', 'Nhóm A', 'sau khi gửi lại: token mới vẫn dùng được');

-- Đổi lần hai, rồi gửi lại cặp của lần đầu thì không còn là lần gửi lại hợp lệ
select is(
  public.bs_rotate_token(pg_temp.nt(1), pg_temp.nt(2)),
  jsonb_build_object('token', pg_temp.nt(2)),
  'đổi liên tiếp lần hai bằng token do client chọn'
);
select pg_temp.not_found(
  $$select public.bs_rotate_token('test-group-a-token-00001', pg_temp.nt(1))$$,
  'gửi lại cặp của lần đổi đầu sau khi đã đổi lần hai: token mới của cặp đó không còn sống nên BS_GROUP_NOT_FOUND'
);
select pg_temp.not_found($$select public.bs_get_group(pg_temp.nt(1))$$, 'sau lần đổi thứ hai: token của lần đầu hết hiệu lực');
select is(public.bs_get_group(pg_temp.nt(2)) #>> '{group,name}', 'Nhóm A', 'sau lần đổi thứ hai: token mới nhất mở nhóm');

-- Đổi ngược về một token từng dùng: hash cũ không còn trong database nên không bị coi là trùng
select is(
  public.bs_rotate_token(pg_temp.nt(2), 'test-group-a-token-00001'),
  jsonb_build_object('token', 'test-group-a-token-00001'),
  'đổi ngược về token cũ của chính nhóm: được, vì database không giữ hash của token đã thay'
);
select is(public.bs_get_group('test-group-a-token-00001') #>> '{group,name}', 'Nhóm A', 'sau khi đổi ngược: token ban đầu mở lại nhóm');

-- ---------------------------------------------------------------------------
-- Định dạng token mới
-- ---------------------------------------------------------------------------
select pg_temp.invalid(
  format('select public.bs_rotate_token(%L, %L)', 'test-group-a-token-00001', t.v),
  'new_token', 'format',
  'bs_rotate_token: token mới ' || t.label || ' thì BS_INVALID new_token format'
)
from (values
  ('ngắn hơn 24 ký tự', 'short'),
  ('23 ký tự', repeat('n', 23)),
  ('25 ký tự', repeat('n', 25)),
  ('rỗng', ''),
  ('có dấu cách', ' ' || repeat('n', 23)),
  ('có ký tự ngoài base64url', repeat('n', 23) || '+'),
  ('có chữ có dấu', repeat('ậ', 24)),
  ('có xuống dòng ở cuối', repeat('n', 23) || E'\n')
) as t(label, v);

select pg_temp.invalid(
  $$select public.bs_rotate_token('test-group-a-token-00001', 'test-group-a-token-00001')$$,
  'new_token', 'format',
  'bs_rotate_token: token mới trùng token cũ thì BS_INVALID new_token format (không được giả vờ đã đổi)'
);
select pg_temp.invalid(
  $$select public.bs_rotate_token('unknown-token-aaaaaaaa00', 'short')$$,
  'new_token', 'format',
  'token mới sai định dạng được kiểm trước khi tra nhóm: token cũ không tồn tại vẫn ra new_token format'
);
select pg_temp.invalid(
  $$select public.bs_rotate_token(null, 'short')$$,
  'new_token', 'format',
  'token mới sai định dạng được kiểm trước khi tra nhóm: token cũ null vẫn ra new_token format'
);
select pg_temp.invalid(
  $$select public.bs_rotate_token('unknown-token-aaaaaaaa00', 'unknown-token-aaaaaaaa00')$$,
  'new_token', 'format',
  'token mới trùng token cũ được kiểm trước khi tra nhóm, kể cả khi token đó không tồn tại'
);
select is(pg_temp.hash_of('Nhóm A'), pg_temp.sha('test-group-a-token-00001'), 'các lần bị từ chối vì định dạng không đổi token của nhóm');

-- ---------------------------------------------------------------------------
-- Token mới đã thuộc nhóm khác
-- ---------------------------------------------------------------------------
select pg_temp.invalid(
  $$select public.bs_rotate_token('test-group-a-token-00001', 'test-group-b-token-00001')$$,
  'new_token', 'id_taken',
  'token mới là token đang sống của nhóm khác: BS_INVALID new_token id_taken'
);
select is(public.bs_get_group('test-group-a-token-00001') #>> '{group,name}', 'Nhóm A', 'id_taken: nhóm A giữ nguyên token cũ');
select is(public.bs_get_group('test-group-b-token-00001') #>> '{group,name}', 'Nhóm B', 'id_taken: nhóm B không bị đụng tới');
select pg_temp.invalid(
  $$select public.bs_rotate_token('test-group-a-token-00001', 'test-group-d-token-00001')$$,
  'new_token', 'id_taken',
  'token mới là token của nhóm đã xóa mềm: BS_INVALID new_token id_taken (token của nhóm đã xóa không dùng lại được)'
);
select is(pg_temp.hash_of('Nhóm A'), pg_temp.sha('test-group-a-token-00001'), 'id_taken với nhóm đã xóa: nhóm A giữ nguyên token cũ');
select is(pg_temp.hash_of('Nhóm D'), pg_temp.sha('test-group-d-token-00001'), 'id_taken với nhóm đã xóa: nhóm D giữ nguyên hash');

-- ---------------------------------------------------------------------------
-- Token cũ không dùng được
-- ---------------------------------------------------------------------------
select pg_temp.not_found(
  $$select public.bs_rotate_token('unknown-token-aaaaaaaa00', pg_temp.nt(3))$$,
  'token cũ không tồn tại, token mới chưa thuộc nhóm nào: BS_GROUP_NOT_FOUND'
);
select pg_temp.not_found(
  $$select public.bs_rotate_token(null, pg_temp.nt(3))$$,
  'token cũ null, token mới chưa thuộc nhóm nào: BS_GROUP_NOT_FOUND'
);
select pg_temp.not_found(
  $$select public.bs_rotate_token('short', pg_temp.nt(3))$$,
  'token cũ sai định dạng, token mới chưa thuộc nhóm nào: BS_GROUP_NOT_FOUND'
);
select pg_temp.not_found(
  $$select public.bs_rotate_token('test-group-d-token-00001', pg_temp.nt(3))$$,
  'token cũ của nhóm đã xóa mềm: BS_GROUP_NOT_FOUND'
);
select pg_temp.not_found(
  $$select public.bs_rotate_token('unknown-token-aaaaaaaa00', 'test-group-d-token-00001')$$,
  'token cũ không tồn tại, token mới là của nhóm đã xóa mềm: BS_GROUP_NOT_FOUND (nhóm đã xóa không phải là lần đổi đã commit)'
);
select pg_temp.not_found($$select public.bs_get_group(pg_temp.nt(3))$$, 'các lần BS_GROUP_NOT_FOUND không tạo ra token mới nào');

-- Token mới đang sống: coi là lần gửi lại, không ghi gì
do $$
begin
  perform pg_temp.set_updated('Nhóm B', timestamptz '2000-01-01 00:00:00+00');
end;
$$;
select is(
  public.bs_rotate_token('unknown-token-aaaaaaaa00', 'test-group-b-token-00001'),
  jsonb_build_object('token', 'test-group-b-token-00001'),
  'token cũ không còn dùng được nhưng token mới đang sống: trả { token } (lần gửi lại), không cần biết token cũ là gì'
);
select is(pg_temp.updated_of('Nhóm B'), timestamptz '2000-01-01 00:00:00+00', 'lần gửi lại không ghi gì: groups.updated_at của nhóm B không đổi');
select is(pg_temp.hash_of('Nhóm B'), pg_temp.sha('test-group-b-token-00001'), 'lần gửi lại không ghi gì: token_hash của nhóm B không đổi');
select is(
  public.bs_rotate_token(null, 'test-group-b-token-00001'),
  jsonb_build_object('token', 'test-group-b-token-00001'),
  'lần gửi lại với token cũ null cũng nhận ra token mới đang sống'
);
select is(public.bs_get_group('test-group-a-token-00001') #>> '{group,name}', 'Nhóm A', 'lần gửi lại không đụng tới nhóm khác');

-- ---------------------------------------------------------------------------
-- Token mới do server sinh khi bỏ p_new_token, và các cách gọi
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('t.gen', public.bs_rotate_token('test-group-a-token-00001', null)::text, true);
end;
$$;
select matches(current_setting('t.gen')::jsonb ->> 'token', '^[A-Za-z0-9_-]{24}$', 'p_new_token null: server tự sinh token mới đúng định dạng');
select pg_temp.not_found($$select public.bs_get_group('test-group-a-token-00001')$$, 'p_new_token null: token cũ hết hiệu lực');
select is(public.bs_get_group(current_setting('t.gen')::jsonb ->> 'token') #>> '{group,name}', 'Nhóm A', 'p_new_token null: token do server sinh mở đúng nhóm');
select is(
  public.bs_rotate_token(p_token := current_setting('t.gen')::jsonb ->> 'token', p_new_token := pg_temp.nt(4)),
  jsonb_build_object('token', pg_temp.nt(4)),
  'gọi bằng tham số có tên p_token và p_new_token (như PostgREST)'
);
do $$
begin
  perform set_config('t.a', public.bs_rotate_token(p_token := pg_temp.nt(4)) ->> 'token', true);
end;
$$;
select matches(current_setting('t.a'), '^[A-Za-z0-9_-]{24}$', 'bỏ p_new_token khi gọi bằng tham số có tên: cũng được, server tự sinh token');

set local role authenticated;
select is(
  public.bs_rotate_token('test-group-b-token-00001', pg_temp.nt(5)),
  jsonb_build_object('token', pg_temp.nt(5)),
  'role authenticated cũng gọi được bs_rotate_token với token mới do client chọn'
);
set local role anon;

-- Nhóm đã xóa
select lives_ok($$select public.bs_delete_group(pg_temp.nt(5))$$, 'xóa mềm nhóm B bằng token mới');
select pg_temp.not_found(
  $$select public.bs_rotate_token(pg_temp.nt(5), pg_temp.nt(6))$$,
  'nhóm đã xóa mềm: bs_rotate_token trả BS_GROUP_NOT_FOUND'
);
select pg_temp.invalid(
  format('select public.bs_rotate_token(%L, %L)', current_setting('t.a'), pg_temp.nt(5)),
  'new_token', 'id_taken',
  'token của nhóm B vừa xóa không thành token mới của nhóm A: id_taken'
);

select * from finish();
rollback;
