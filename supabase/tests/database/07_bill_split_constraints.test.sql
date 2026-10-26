-- Chia tiền: ràng buộc ở tầng bảng, lớp chặn cuối nếu hàm API có lỗi (hợp đồng mục 3).
-- Chạy bằng quyền owner, ghi thẳng vào bảng để chứng minh database tự từ chối dữ liệu sai.
begin;
set local search_path = public, extensions;

-- Khóa ngoại trỏ tới members khai báo deferrable initially deferred; kiểm ngay trong test để lỗi lộ ra tại câu lệnh.
set constraints all immediate;

select plan(45);

-- Chạy một câu SQL: null nếu thành công, nếu lỗi thì { state, constraint }.
create function pg_temp.err(p_sql text) returns jsonb
language plpgsql
as $$
declare
  v_constraint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_constraint = constraint_name;
  return jsonb_build_object('state', sqlstate, 'constraint', v_constraint);
end;
$$;

-- Khẳng định câu SQL lỗi với đúng SQLSTATE và tên ràng buộc.
create function pg_temp.violates(p_sql text, p_state text, p_constraint text, p_desc text) returns text
language sql
as $$
  select is(pg_temp.err(p_sql), jsonb_build_object('state', p_state, 'constraint', p_constraint), p_desc);
$$;

create function pg_temp.uid(p_prefix text, p_n integer) returns uuid
language sql
immutable
as $$
  select (p_prefix || '0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- Dữ liệu nền: hai nhóm, một khoản chi và một thanh toán ở nhóm A.
insert into bill_split.groups (id, name, token_hash) values
  (pg_temp.uid('a', 1), 'Nhóm A', sha256(convert_to('test-group-a-token-00001', 'UTF8'))),
  (pg_temp.uid('b', 1), 'Nhóm B', sha256(convert_to('test-group-b-token-00001', 'UTF8')));
insert into bill_split.members (id, group_id, name, "position") values
  (pg_temp.uid('a', 101), pg_temp.uid('a', 1), 'An', 0),
  (pg_temp.uid('a', 102), pg_temp.uid('a', 1), 'Bình', 1),
  (pg_temp.uid('b', 101), pg_temp.uid('b', 1), 'Dũng', 0);
insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode) values
  (pg_temp.uid('a', 201), pg_temp.uid('a', 1), 'Ăn trưa', 2000, pg_temp.uid('a', 101), date '2026-10-24', 'equal');
insert into bill_split.expense_shares (expense_id, group_id, member_id, amount) values
  (pg_temp.uid('a', 201), pg_temp.uid('a', 1), pg_temp.uid('a', 101), 1000),
  (pg_temp.uid('a', 201), pg_temp.uid('a', 1), pg_temp.uid('a', 102), 1000);
insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on) values
  (pg_temp.uid('a', 301), pg_temp.uid('a', 1), pg_temp.uid('a', 102), pg_temp.uid('a', 101), 500, date '2026-10-25');

-- ---------------------------------------------------------------------------
-- Khóa ngoại kép: dữ liệu con luôn cùng nhóm với thành viên và khoản chi
-- ---------------------------------------------------------------------------
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1000, pg_temp.uid('b', 101), date '2026-10-24', 'exact')$$,
  '23503', 'expenses_paid_by_fkey', 'expenses.paid_by là thành viên nhóm khác bị khóa ngoại kép chặn'
);
select pg_temp.violates(
  $$insert into bill_split.expense_shares (expense_id, group_id, member_id, amount)
    values (pg_temp.uid('a', 201), pg_temp.uid('a', 1), pg_temp.uid('b', 101), 1)$$,
  '23503', 'expense_shares_member_fkey', 'expense_shares.member_id là thành viên nhóm khác bị khóa ngoại kép chặn'
);
select pg_temp.violates(
  $$insert into bill_split.expense_shares (expense_id, group_id, member_id, amount)
    values (pg_temp.uid('a', 201), pg_temp.uid('b', 1), pg_temp.uid('b', 101), 1)$$,
  '23503', 'expense_shares_expense_fkey', 'expense_shares gắn khoản chi của nhóm A với group_id của nhóm B bị khóa ngoại kép chặn'
);
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('b', 101), pg_temp.uid('a', 101), 1, date '2026-10-25')$$,
  '23503', 'settlements_from_member_fkey', 'settlements.from_member là thành viên nhóm khác bị khóa ngoại kép chặn'
);
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('a', 101), pg_temp.uid('b', 101), 1, date '2026-10-25')$$,
  '23503', 'settlements_to_member_fkey', 'settlements.to_member là thành viên nhóm khác bị khóa ngoại kép chặn'
);
select is(
  pg_temp.err($$delete from bill_split.members where id = pg_temp.uid('a', 101)$$) ->> 'state',
  '23503',
  'xóa thành viên còn được khoản chi, phần chia hoặc thanh toán tham chiếu bị chặn'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), gen_random_uuid(), 'Mồ côi', 0)$$,
  '23503', 'members_group_id_fkey', 'thành viên của nhóm không tồn tại bị chặn'
);

-- ---------------------------------------------------------------------------
-- Ràng buộc của từng cột
-- ---------------------------------------------------------------------------
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('a', 101), pg_temp.uid('a', 101), 1, date '2026-10-25')$$,
  '23514', 'settlements_distinct_members', 'settlements: from_member khác to_member'
);
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('a', 101), pg_temp.uid('a', 102), 0, date '2026-10-25')$$,
  '23514', 'settlements_amount_range', 'settlements: amount từ 1'
);
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('a', 101), pg_temp.uid('a', 102), 1, date '2101-01-01')$$,
  '23514', 'settlements_settled_on_range', 'settlements: settled_on trong khoảng 2000-01-01 tới 2100-12-31'
);
select pg_temp.violates(
  $$insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on, note)
    values (gen_random_uuid(), pg_temp.uid('a', 1), pg_temp.uid('a', 101), pg_temp.uid('a', 102), 1, date '2026-10-25', '')$$,
  '23514', 'settlements_note_length', 'settlements: note rỗng phải là null'
);

select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), pg_temp.uid('a', 1), 'AN', 5)$$,
  '23505', 'members_group_id_lower_name_key', 'members: tên không trùng trong nhóm (không phân biệt hoa thường)'
);
select lives_ok(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), pg_temp.uid('b', 1), 'An', 5)$$,
  'members: cùng tên ở nhóm khác thì được'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), pg_temp.uid('a', 1), '', 6)$$,
  '23514', 'members_name_length', 'members: name không rỗng'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), pg_temp.uid('a', 1), repeat('x', 41), 6)$$,
  '23514', 'members_name_length', 'members: name tối đa 40 ký tự'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position") values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', -1)$$,
  '23514', 'members_position_nonnegative', 'members: position từ 0'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position", bank_bin, bank_account)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', 6, '12345', '123')$$,
  '23514', 'members_bank_bin_format', 'members: bank_bin đúng 6 chữ số'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position", bank_bin, bank_account)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', 6, '970436', 'a b')$$,
  '23514', 'members_bank_account_format', 'members: bank_account chỉ gồm chữ và số, tối đa 19 ký tự'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position", bank_bin)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', 6, '970436')$$,
  '23514', 'members_bank_pair', 'members: bank_bin và bank_account cùng null hoặc cùng có'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position", bank_account_name)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', 6, 'NGUYEN VAN A')$$,
  '23514', 'members_bank_account_name_needs_bank', 'members: bank_account_name chỉ có khi đã có ngân hàng'
);
select pg_temp.violates(
  $$insert into bill_split.members (id, group_id, name, "position", bank_bin, bank_account, bank_account_name)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'Mới', 6, '970436', '123', repeat('A', 51))$$,
  '23514', 'members_bank_account_name_length', 'members: bank_account_name tối đa 50 ký tự'
);

select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 0, pg_temp.uid('a', 101), date '2026-10-24', 'exact')$$,
  '23514', 'expenses_amount_range', 'expenses: amount từ 1'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1000000000000, pg_temp.uid('a', 101), date '2026-10-24', 'exact')$$,
  '23514', 'expenses_amount_range', 'expenses: amount tối đa 999 999 999 999'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1, pg_temp.uid('a', 101), date '1999-12-31', 'exact')$$,
  '23514', 'expenses_spent_on_range', 'expenses: spent_on trong khoảng 2000-01-01 tới 2100-12-31'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1, pg_temp.uid('a', 101), date '2026-10-24', 'percent')$$,
  '23514', 'expenses_split_mode_check', 'expenses: split_mode chỉ nhận equal hoặc exact'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode)
    values (gen_random_uuid(), pg_temp.uid('a', 1), '', 1, pg_temp.uid('a', 101), date '2026-10-24', 'exact')$$,
  '23514', 'expenses_title_length', 'expenses: title không rỗng'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode, note)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1, pg_temp.uid('a', 101), date '2026-10-24', 'exact', '')$$,
  '23514', 'expenses_note_length', 'expenses: note rỗng phải là null'
);
select pg_temp.violates(
  $$insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode, version)
    values (gen_random_uuid(), pg_temp.uid('a', 1), 'X', 1, pg_temp.uid('a', 101), date '2026-10-24', 'exact', 0)$$,
  '23514', 'expenses_version_positive', 'expenses: version từ 1'
);

select pg_temp.violates(
  $$insert into bill_split.expense_shares (expense_id, group_id, member_id, amount)
    values (pg_temp.uid('a', 201), pg_temp.uid('a', 1), pg_temp.uid('a', 101), 1)$$,
  '23505', 'expense_shares_pkey', 'expense_shares: mỗi thành viên chỉ một phần chia trong một khoản chi'
);
select pg_temp.violates(
  $$update bill_split.expense_shares set amount = -1 where expense_id = pg_temp.uid('a', 201)$$,
  '23514', 'expense_shares_amount_range', 'expense_shares: amount từ 0'
);

select pg_temp.violates(
  $$insert into bill_split.groups (name, token_hash) values ('X', sha256(convert_to('test-group-a-token-00001', 'UTF8')))$$,
  '23505', 'groups_token_hash_key', 'groups: token_hash là unique'
);
select pg_temp.violates(
  $$insert into bill_split.groups (name, token_hash) values ('X', '\x00'::bytea)$$,
  '23514', 'groups_token_hash_sha256', 'groups: token_hash đúng 32 byte (sha256)'
);
select pg_temp.violates(
  $$insert into bill_split.groups (name, token_hash) values ('', sha256('x'::bytea))$$,
  '23514', 'groups_name_length', 'groups: name không rỗng'
);
select pg_temp.violates(
  $$insert into bill_split.groups (name, token_hash) values (repeat('x', 81), sha256('x'::bytea))$$,
  '23514', 'groups_name_length', 'groups: name tối đa 80 ký tự'
);
select pg_temp.violates(
  $$insert into bill_split.groups (name, currency, token_hash) values ('X', 'USD', sha256('x'::bytea))$$,
  '23514', 'groups_currency_vnd', 'groups: currency chỉ nhận VND'
);

-- ---------------------------------------------------------------------------
-- Xóa cascade
-- ---------------------------------------------------------------------------
select lives_ok($$delete from bill_split.expenses where id = pg_temp.uid('a', 201)$$, 'xóa khoản chi');
select is(
  (select count(*) from bill_split.expense_shares where expense_id = pg_temp.uid('a', 201)),
  0::bigint,
  'xóa khoản chi xóa theo phần chia (on delete cascade)'
);

insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode) values
  (pg_temp.uid('a', 202), pg_temp.uid('a', 1), 'Cà phê', 2000, pg_temp.uid('a', 101), date '2026-10-24', 'equal');
insert into bill_split.expense_shares (expense_id, group_id, member_id, amount) values
  (pg_temp.uid('a', 202), pg_temp.uid('a', 1), pg_temp.uid('a', 101), 1000),
  (pg_temp.uid('a', 202), pg_temp.uid('a', 1), pg_temp.uid('a', 102), 1000);

-- Điều kiện sản xuất: các khóa ngoại trỏ tới members được hoãn, nên xóa cứng cả nhóm chạy được.
set constraints all deferred;
select lives_ok($$delete from bill_split.groups where id = pg_temp.uid('a', 1)$$, 'xóa cứng nhóm có đủ thành viên, khoản chi, phần chia và thanh toán');
select lives_ok($$set constraints all immediate$$, 'xóa cứng nhóm: kiểm các khóa ngoại hoãn lúc cuối không lỗi');
select is(
  (select (select count(*) from bill_split.members where group_id = pg_temp.uid('a', 1))
        + (select count(*) from bill_split.expenses where group_id = pg_temp.uid('a', 1))
        + (select count(*) from bill_split.expense_shares where group_id = pg_temp.uid('a', 1))
        + (select count(*) from bill_split.settlements where group_id = pg_temp.uid('a', 1))),
  0::bigint,
  'xóa cứng nhóm xóa sạch dữ liệu con'
);
select is(
  (select count(*) from bill_split.members where group_id = pg_temp.uid('b', 1)),
  2::bigint,
  'xóa cứng nhóm A không đụng tới nhóm B'
);

-- ---------------------------------------------------------------------------
-- Cấu trúc
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'bill_split' and c.relkind = 'r'
      and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')),
  0::bigint,
  'mọi bảng của bill_split đều có khóa chính'
);
select is(
  (select count(*)
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'bill_split'
      and c.contype = 'f'
      and not exists (
        select 1
          from pg_index i
         where i.indrelid = c.conrelid
           and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
           and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey
      )),
  0::bigint,
  'mọi khóa ngoại của bill_split đều có index phủ (các cột đầu của một index)'
);
select ok(to_regclass('bill_split.groups_created_at_idx') is not null, 'có index groups (created_at) cho giới hạn tốc độ tạo nhóm');
select ok(to_regclass('bill_split.members_group_id_lower_name_key') is not null, 'có unique index members (group_id, lower(name))');

select * from finish();
rollback;
