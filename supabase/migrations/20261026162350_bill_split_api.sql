-- Module Chia tiền (bill-split), phần 3/3: 12 hàm API công khai `public.bs_*`.
-- Hợp đồng: docs/contracts/bill-split-api.md, mục 1, 4, 6 và 7.
--
-- Quy tắc chung của mọi hàm ở đây:
--   * security definer + set search_path = '': chạy bằng quyền owner, mọi tên đều gọi đầy đủ schema.
--   * Hàm ghi: kiểm token và khóa dòng nhóm (for update) trước, kiểm dữ liệu rồi mới ghi,
--     mọi truy vấn trên members, expenses, expense_shares, settlements đều có `group_id = v_group_id`.
--     Trừ các phép kiểm "id đã bị nhóm khác chiếm" (id_taken), là chỗ duy nhất đọc không lọc theo nhóm
--     và chỉ để biết id có tồn tại hay không.
--   * Hàm ghi trả snapshot mới nhất (trừ bs_delete_group và bs_rotate_token).
--   * Không overload: mỗi tên đúng một chữ ký. Muốn đổi chữ ký thì drop function bản cũ trong
--     migration mới, nếu không bản cũ vẫn gọi được.
--   * Postgres cấp EXECUTE cho PUBLIC theo mặc định và Supabase cấp thêm cho anon, authenticated,
--     service_role trên hàm mới ở schema public. Mỗi hàm revoke hết rồi chỉ grant cho anon và authenticated.

-- ---------------------------------------------------------------------------
-- bs_create_group
-- ---------------------------------------------------------------------------
create function public.bs_create_group(p_name text, p_member_names text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name     text;
  v_item     text;
  v_clean    text;
  v_names    text[] := '{}';
  v_keys     text[] := '{}';
  v_token    text;
  v_group_id uuid;
begin
  -- Giới hạn tốc độ toàn hệ thống: từ 30 nhóm trong 10 phút gần nhất (kể cả nhóm đã xóa) thì từ chối.
  -- Khóa advisory giữ tới hết transaction để hai lần tạo đồng thời không cùng lọt qua mức 29.
  perform pg_advisory_xact_lock(hashtextextended('callone.bill_split.create_group', 0));
  if (select count(*)
        from bill_split.groups g
       where g.created_at > now() - interval '10 minutes') >= 30 then
    perform bill_split.fail(429, 'BS_RATE_LIMITED');
  end if;

  v_name := bill_split.req_text(p_name, 'name', 80);

  if p_member_names is null or cardinality(p_member_names) = 0 then
    perform bill_split.invalid('member_names', 'empty');
  end if;
  if cardinality(p_member_names) > 50 then
    perform bill_split.over_limit('members');
  end if;

  foreach v_item in array p_member_names loop
    v_clean := bill_split.req_text(v_item, 'member_names', 40);
    if lower(v_clean) = any (v_keys) then
      perform bill_split.invalid('member_names', 'duplicate');
    end if;
    v_names := v_names || v_clean;
    v_keys := v_keys || lower(v_clean);
  end loop;

  v_token := bill_split.new_token();

  insert into bill_split.groups (name, token_hash)
  values (v_name, bill_split.hash_token(v_token))
  returning id into v_group_id;

  insert into bill_split.members (id, group_id, name, "position")
  select gen_random_uuid(), v_group_id, n.name, (n.ord - 1)::integer
    from unnest(v_names) with ordinality as n(name, ord);

  return jsonb_build_object('token', v_token, 'snapshot', bill_split.build_snapshot(v_group_id));
end;
$$;

comment on function public.bs_create_group(text, text[]) is
  'Chia tiền: tạo nhóm mới. Trả { token, snapshot }. Không an toàn để gửi lại, client không tự thử lại.';

revoke all on function public.bs_create_group(text, text[]) from public, anon, authenticated;
grant execute on function public.bs_create_group(text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_get_group (stable, chỉ đọc)
-- ---------------------------------------------------------------------------
create function public.bs_get_group(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return bill_split.build_snapshot(bill_split.find_group(p_token));
end;
$$;

comment on function public.bs_get_group(text) is 'Chia tiền: snapshot của một nhóm theo token.';

revoke all on function public.bs_get_group(text) from public, anon, authenticated;
grant execute on function public.bs_get_group(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_get_groups (stable, chỉ đọc)
-- ---------------------------------------------------------------------------
create function public.bs_get_groups(p_tokens text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tokens is not null and cardinality(p_tokens) > 50 then
    perform bill_split.invalid('tokens', 'too_many');
  end if;

  -- Bỏ qua token sai định dạng, không tồn tại hoặc nhóm đã xóa. Token trùng chỉ tính một lần.
  return (
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'token', t.token,
                 'id', g.id,
                 'name', g.name,
                 'member_count', (select count(*) from bill_split.members m where m.group_id = g.id),
                 'expense_count', x.expense_count,
                 'total_spent', x.total_spent,
                 'updated_at', g.updated_at
               )
               order by g.updated_at desc, g.created_at desc, g.id
             ),
             '[]'::jsonb
           )
      from (
        select distinct u.token
          from unnest(coalesce(p_tokens, '{}'::text[])) as u(token)
         where u.token ~ '^[A-Za-z0-9_-]{24}$'
      ) t
      join bill_split.groups g
        on g.token_hash = bill_split.hash_token(t.token)
       and g.deleted_at is null
     cross join lateral (
        select count(*) as expense_count,
               coalesce(sum(e.amount), 0) as total_spent
          from bill_split.expenses e
         where e.group_id = g.id
     ) x
  );
end;
$$;

comment on function public.bs_get_groups(text[]) is
  'Chia tiền: tóm tắt nhiều nhóm theo danh sách token (tối đa 50), bỏ qua token không hợp lệ.';

revoke all on function public.bs_get_groups(text[]) from public, anon, authenticated;
grant execute on function public.bs_get_groups(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_update_group
-- ---------------------------------------------------------------------------
create function public.bs_update_group(p_token text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_name     text;
begin
  v_group_id := bill_split.lock_group(p_token);
  v_name := bill_split.req_text(p_name, 'name', 80);

  update bill_split.groups
     set name = v_name,
         updated_at = now()
   where id = v_group_id;

  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_update_group(text, text) is 'Chia tiền: đổi tên nhóm. Trả snapshot.';

revoke all on function public.bs_update_group(text, text) from public, anon, authenticated;
grant execute on function public.bs_update_group(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_rotate_token
-- ---------------------------------------------------------------------------
create function public.bs_rotate_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_token    text;
begin
  v_group_id := bill_split.lock_group(p_token);
  v_token := bill_split.new_token();

  update bill_split.groups
     set token_hash = bill_split.hash_token(v_token),
         updated_at = now()
   where id = v_group_id;

  return jsonb_build_object('token', v_token);
end;
$$;

comment on function public.bs_rotate_token(text) is
  'Chia tiền: đổi token nhóm, token cũ hết hiệu lực ngay. Trả { token }.';

revoke all on function public.bs_rotate_token(text) from public, anon, authenticated;
grant execute on function public.bs_rotate_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_delete_group (xóa mềm)
-- ---------------------------------------------------------------------------
create function public.bs_delete_group(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  v_group_id := bill_split.lock_group(p_token);

  update bill_split.groups
     set deleted_at = now(),
         updated_at = now()
   where id = v_group_id;
end;
$$;

comment on function public.bs_delete_group(text) is
  'Chia tiền: xóa mềm nhóm. Sau đó mọi hàm với token này trả BS_GROUP_NOT_FOUND.';

revoke all on function public.bs_delete_group(text) from public, anon, authenticated;
grant execute on function public.bs_delete_group(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_save_member
-- ---------------------------------------------------------------------------
create function public.bs_save_member(
  p_token             text,
  p_member_id         uuid,
  p_name              text,
  p_bank_bin          text default null,
  p_bank_account      text default null,
  p_bank_account_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_name     text;
  v_bin      text;
  v_account  text;
  v_holder   text;
  v_position integer;
begin
  v_group_id := bill_split.lock_group(p_token);

  if p_member_id is null then
    perform bill_split.invalid('member_id', 'required');
  end if;
  v_name := bill_split.req_text(p_name, 'name', 40);

  -- Ngân hàng: bank_bin và bank_account cùng có hoặc cùng trống. Có tên chủ tài khoản mà thiếu
  -- ngân hàng thì cũng báo thiếu bank_bin hoặc bank_account. Số tài khoản bỏ hết khoảng trắng.
  v_bin := bill_split.clean(p_bank_bin);
  v_account := nullif(regexp_replace(coalesce(p_bank_account, ''), '\s', '', 'g'), '');
  v_holder := bill_split.opt_text(p_bank_account_name, 'bank_account_name', 50);

  if v_bin is not null or v_account is not null or v_holder is not null then
    if v_bin is null then
      perform bill_split.invalid('bank_bin', 'required');
    end if;
    if v_account is null then
      perform bill_split.invalid('bank_account', 'required');
    end if;
    if v_bin !~ '^[0-9]{6}$' then
      perform bill_split.invalid('bank_bin', 'format');
    end if;
    if v_account !~ '^[0-9A-Za-z]{1,19}$' then
      perform bill_split.invalid('bank_account', 'format');
    end if;
  end if;

  if exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id <> p_member_id
       and lower(m.name) = lower(v_name)
  ) then
    perform bill_split.invalid('name', 'duplicate');
  end if;

  if exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id = p_member_id
  ) then
    -- Ghi đè tên và toàn bộ thông tin ngân hàng. Tham số trống nghĩa là xóa thông tin đó.
    update bill_split.members
       set name = v_name,
           bank_bin = v_bin,
           bank_account = v_account,
           bank_account_name = v_holder,
           updated_at = now()
     where group_id = v_group_id
       and id = p_member_id;
  else
    -- Id đã nằm ở nhóm khác thì không dùng được.
    if exists (select 1 from bill_split.members m where m.id = p_member_id) then
      perform bill_split.invalid('member_id', 'id_taken');
    end if;

    if (select count(*) from bill_split.members m where m.group_id = v_group_id) >= 50 then
      perform bill_split.over_limit('members');
    end if;

    select coalesce(max(m."position"), -1) + 1
      into v_position
      from bill_split.members m
     where m.group_id = v_group_id;

    insert into bill_split.members (id, group_id, name, "position", bank_bin, bank_account, bank_account_name)
    values (p_member_id, v_group_id, v_name, v_position, v_bin, v_account, v_holder);
  end if;

  perform bill_split.touch_group(v_group_id);
  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_save_member(text, uuid, text, text, text, text) is
  'Chia tiền: thêm hoặc sửa thành viên theo id (client sinh). Trả snapshot.';

revoke all on function public.bs_save_member(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bs_save_member(text, uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_delete_member
-- ---------------------------------------------------------------------------
create function public.bs_delete_member(p_token text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  v_group_id := bill_split.lock_group(p_token);

  if p_member_id is null then
    perform bill_split.invalid('member_id', 'required');
  end if;

  -- Thành viên không có trong nhóm thì coi như đã xóa: không ghi gì, trả snapshot.
  if exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id = p_member_id
  ) then
    if exists (select 1 from bill_split.expenses e where e.group_id = v_group_id and e.paid_by = p_member_id)
       or exists (select 1 from bill_split.expense_shares s where s.group_id = v_group_id and s.member_id = p_member_id)
       or exists (
         select 1
           from bill_split.settlements t
          where t.group_id = v_group_id
            and (t.from_member = p_member_id or t.to_member = p_member_id)
       ) then
      perform bill_split.fail(409, 'BS_MEMBER_IN_USE');
    end if;

    delete from bill_split.members
     where group_id = v_group_id
       and id = p_member_id;

    perform bill_split.touch_group(v_group_id);
  end if;

  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_delete_member(text, uuid) is
  'Chia tiền: xóa thành viên. BS_MEMBER_IN_USE nếu còn trong khoản chi, phần chia hoặc thanh toán.';

revoke all on function public.bs_delete_member(text, uuid) from public, anon, authenticated;
grant execute on function public.bs_delete_member(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_save_expense
-- ---------------------------------------------------------------------------
create function public.bs_save_expense(
  p_token            text,
  p_expense_id       uuid,
  p_title            text,
  p_amount           bigint,
  p_paid_by          uuid,
  p_spent_on         date,
  p_split_mode       text,
  p_shares           jsonb,
  p_expected_version integer default null,
  p_note             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id        uuid;
  v_title           text;
  v_note            text;
  v_shares          jsonb;
  v_exists          boolean;
  v_current_version integer;
  v_sum             numeric;
begin
  v_group_id := bill_split.lock_group(p_token);

  -- Kiểm dữ liệu trước khi ghi (mục 7).
  if p_expense_id is null then
    perform bill_split.invalid('expense_id', 'required');
  end if;
  v_title := bill_split.req_text(p_title, 'title', 80);
  if p_amount is null then
    perform bill_split.invalid('amount', 'required');
  end if;
  if p_amount < 1 or p_amount > 999999999999 then
    perform bill_split.invalid('amount', 'out_of_range');
  end if;
  if p_spent_on is null then
    perform bill_split.invalid('spent_on', 'required');
  end if;
  if p_spent_on < date '2000-01-01' or p_spent_on > date '2100-12-31' then
    perform bill_split.invalid('spent_on', 'out_of_range');
  end if;
  if p_split_mode is null then
    perform bill_split.invalid('split_mode', 'required');
  end if;
  if p_split_mode not in ('equal', 'exact') then
    perform bill_split.invalid('split_mode', 'format');
  end if;
  v_note := bill_split.opt_text(p_note, 'note', 500);
  if p_paid_by is null then
    perform bill_split.invalid('paid_by', 'required');
  end if;
  if not exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id = p_paid_by
  ) then
    perform bill_split.invalid('paid_by', 'not_in_group');
  end if;
  v_shares := bill_split.check_shares(v_group_id, p_amount, p_split_mode, p_shares);

  select e.version
    into v_current_version
    from bill_split.expenses e
   where e.group_id = v_group_id
     and e.id = p_expense_id;
  v_exists := found;

  if p_expected_version is null then
    -- Tạo mới.
    if v_exists then
      -- Id đã có trong nhóm này: coi là gửi lại do rớt mạng, không ghi gì.
      return bill_split.build_snapshot(v_group_id);
    end if;

    if exists (select 1 from bill_split.expenses e where e.id = p_expense_id) then
      perform bill_split.invalid('expense_id', 'id_taken');
    end if;

    if (select count(*) from bill_split.expenses e where e.group_id = v_group_id) >= 5000 then
      perform bill_split.over_limit('expenses');
    end if;

    insert into bill_split.expenses (id, group_id, title, amount, paid_by, spent_on, split_mode, note)
    values (p_expense_id, v_group_id, v_title, p_amount, p_paid_by, p_spent_on, p_split_mode, v_note);
  else
    -- Sửa theo version.
    if not v_exists then
      perform bill_split.fail(404, 'BS_NOT_FOUND', jsonb_build_object('entity', 'expense'));
    end if;
    if v_current_version <> p_expected_version then
      perform bill_split.fail(
        409,
        'BS_CONFLICT',
        jsonb_build_object('entity', 'expense', 'current_version', v_current_version)
      );
    end if;

    update bill_split.expenses
       set title = v_title,
           amount = p_amount,
           paid_by = p_paid_by,
           spent_on = p_spent_on,
           split_mode = p_split_mode,
           note = v_note,
           version = version + 1,
           updated_at = now()
     where group_id = v_group_id
       and id = p_expense_id;

    delete from bill_split.expense_shares
     where group_id = v_group_id
       and expense_id = p_expense_id;
  end if;

  insert into bill_split.expense_shares (expense_id, group_id, member_id, amount)
  select p_expense_id, v_group_id, s.member_id, s.amount
    from jsonb_to_recordset(v_shares) as s(member_id uuid, amount bigint);

  -- Kiểm lại tổng phần chia vừa ghi ngay trong hàm (không dùng deferred constraint trigger).
  -- Dữ liệu đã được check_shares kiểm nên bước này chỉ là lớp chặn cuối. Lỗi thì rollback cả hàm.
  select coalesce(sum(s.amount), 0)
    into v_sum
    from bill_split.expense_shares s
   where s.group_id = v_group_id
     and s.expense_id = p_expense_id;
  if v_sum <> p_amount then
    perform bill_split.invalid('shares', 'sum_mismatch');
  end if;

  perform bill_split.touch_group(v_group_id);
  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_save_expense(text, uuid, text, bigint, uuid, date, text, jsonb, integer, text) is
  'Chia tiền: tạo (p_expected_version null) hoặc sửa theo version một khoản chi cùng phần chia. Trả snapshot.';

revoke all on function public.bs_save_expense(text, uuid, text, bigint, uuid, date, text, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.bs_save_expense(text, uuid, text, bigint, uuid, date, text, jsonb, integer, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_delete_expense
-- ---------------------------------------------------------------------------
create function public.bs_delete_expense(p_token text, p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  v_group_id := bill_split.lock_group(p_token);

  if p_expense_id is null then
    perform bill_split.invalid('expense_id', 'required');
  end if;

  -- Phần chia xóa theo nhờ on delete cascade. Không có khoản chi thì thôi, không ghi gì.
  delete from bill_split.expenses
   where group_id = v_group_id
     and id = p_expense_id;

  if found then
    perform bill_split.touch_group(v_group_id);
  end if;

  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_delete_expense(text, uuid) is 'Chia tiền: xóa khoản chi (nếu có). Trả snapshot.';

revoke all on function public.bs_delete_expense(text, uuid) from public, anon, authenticated;
grant execute on function public.bs_delete_expense(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_save_settlement
-- ---------------------------------------------------------------------------
create function public.bs_save_settlement(
  p_token         text,
  p_settlement_id uuid,
  p_from_member   uuid,
  p_to_member     uuid,
  p_amount        bigint,
  p_settled_on    date,
  p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_note     text;
begin
  v_group_id := bill_split.lock_group(p_token);

  if p_settlement_id is null then
    perform bill_split.invalid('settlement_id', 'required');
  end if;

  if p_from_member is null then
    perform bill_split.invalid('from_member', 'required');
  end if;
  if not exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id = p_from_member
  ) then
    perform bill_split.invalid('from_member', 'not_in_group');
  end if;

  if p_to_member is null then
    perform bill_split.invalid('to_member', 'required');
  end if;
  if not exists (
    select 1
      from bill_split.members m
     where m.group_id = v_group_id
       and m.id = p_to_member
  ) then
    perform bill_split.invalid('to_member', 'not_in_group');
  end if;
  if p_from_member = p_to_member then
    perform bill_split.invalid('to_member', 'same_member');
  end if;

  if p_amount is null then
    perform bill_split.invalid('amount', 'required');
  end if;
  if p_amount < 1 or p_amount > 999999999999 then
    perform bill_split.invalid('amount', 'out_of_range');
  end if;
  if p_settled_on is null then
    perform bill_split.invalid('settled_on', 'required');
  end if;
  if p_settled_on < date '2000-01-01' or p_settled_on > date '2100-12-31' then
    perform bill_split.invalid('settled_on', 'out_of_range');
  end if;
  v_note := bill_split.opt_text(p_note, 'note', 200);

  if exists (
    select 1
      from bill_split.settlements t
     where t.group_id = v_group_id
       and t.id = p_settlement_id
  ) then
    -- Ghi đè, không có version.
    update bill_split.settlements
       set from_member = p_from_member,
           to_member = p_to_member,
           amount = p_amount,
           settled_on = p_settled_on,
           note = v_note,
           updated_at = now()
     where group_id = v_group_id
       and id = p_settlement_id;
  else
    -- Id đã nằm ở nhóm khác thì không dùng được.
    if exists (select 1 from bill_split.settlements t where t.id = p_settlement_id) then
      perform bill_split.invalid('settlement_id', 'id_taken');
    end if;

    if (select count(*) from bill_split.settlements t where t.group_id = v_group_id) >= 5000 then
      perform bill_split.over_limit('settlements');
    end if;

    insert into bill_split.settlements (id, group_id, from_member, to_member, amount, settled_on, note)
    values (p_settlement_id, v_group_id, p_from_member, p_to_member, p_amount, p_settled_on, v_note);
  end if;

  perform bill_split.touch_group(v_group_id);
  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_save_settlement(text, uuid, uuid, uuid, bigint, date, text) is
  'Chia tiền: thêm hoặc ghi đè một lần thanh toán nợ theo id (client sinh). Trả snapshot.';

revoke all on function public.bs_save_settlement(text, uuid, uuid, uuid, bigint, date, text)
  from public, anon, authenticated;
grant execute on function public.bs_save_settlement(text, uuid, uuid, uuid, bigint, date, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bs_delete_settlement
-- ---------------------------------------------------------------------------
create function public.bs_delete_settlement(p_token text, p_settlement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  v_group_id := bill_split.lock_group(p_token);

  if p_settlement_id is null then
    perform bill_split.invalid('settlement_id', 'required');
  end if;

  delete from bill_split.settlements
   where group_id = v_group_id
     and id = p_settlement_id;

  if found then
    perform bill_split.touch_group(v_group_id);
  end if;

  return bill_split.build_snapshot(v_group_id);
end;
$$;

comment on function public.bs_delete_settlement(text, uuid) is 'Chia tiền: xóa một lần thanh toán (nếu có). Trả snapshot.';

revoke all on function public.bs_delete_settlement(text, uuid) from public, anon, authenticated;
grant execute on function public.bs_delete_settlement(text, uuid) to anon, authenticated;
