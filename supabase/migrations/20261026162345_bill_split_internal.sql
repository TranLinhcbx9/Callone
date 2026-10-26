-- Module Chia tiền (bill-split), phần 2/3: hàm nội bộ và bộ dựng snapshot.
-- Hợp đồng: docs/contracts/bill-split-api.md, mục 4, 5 và 6.
--
-- Các hàm ở đây nằm trong schema `bill_split` nên anon và authenticated không gọi trực tiếp được.
-- Chúng chỉ được gọi từ các hàm `public.bs_*` (security definer).
--
-- Quy ước độ biến động (volatility): bs_get_group và bs_get_groups khai báo `stable`, Postgres chạy
-- chúng ở chế độ chỉ đọc. Mọi hàm mà chúng gọi cũng phải stable hoặc immutable, nên các hàm đọc
-- (find_group, build_snapshot, fail, ...) khai báo stable, còn hàm khóa dòng (lock_group) và các
-- hàm ghi là volatile.

-- ---------------------------------------------------------------------------
-- Lỗi
-- ---------------------------------------------------------------------------

-- Cửa duy nhất để raise lỗi của module. PostgREST đổi SQLSTATE 'PTxyz' thành HTTP status xyz,
-- body là { code: 'PTxyz', message: <mã lỗi>, details: <detail>, hint: null }.
create function bill_split.fail(p_status integer, p_code text, p_detail jsonb default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT' || p_status,
    message = p_code,
    detail = coalesce(p_detail::text, '');
end;
$$;

-- BS_INVALID (422): p_field là tên tham số bỏ tiền tố p_, p_reason lấy từ danh sách ở mục 6.
create function bill_split.invalid(p_field text, p_reason text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform bill_split.fail(422, 'BS_INVALID', jsonb_build_object('field', p_field, 'reason', p_reason));
end;
$$;

-- BS_LIMIT (422): p_limit là 'members', 'expenses' hoặc 'settlements'.
create function bill_split.over_limit(p_limit text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform bill_split.fail(422, 'BS_LIMIT', jsonb_build_object('limit', p_limit));
end;
$$;

-- ---------------------------------------------------------------------------
-- Chuỗi
-- ---------------------------------------------------------------------------

-- Chuẩn hóa chuỗi người dùng nhập: về dạng NFC (tiếng Việt gõ ở nguồn khác nhau có thể là dạng
-- tổ hợp hoặc dựng sẵn, nếu không chuẩn hóa thì "Hưng" có thể bị coi là hai tên khác nhau),
-- cắt khoảng trắng, tab và xuống dòng ở hai đầu. Rỗng thì trả null.
create function bill_split.clean(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(btrim(normalize(p_text, nfc), E' \t\r\n'), '');
$$;

-- Trường bắt buộc: required khi rỗng, too_long khi vượt p_max ký tự. Trả về chuỗi đã chuẩn hóa.
create function bill_split.req_text(p_value text, p_field text, p_max integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text := bill_split.clean(p_value);
begin
  if v_text is null then
    perform bill_split.invalid(p_field, 'required');
  end if;
  if char_length(v_text) > p_max then
    perform bill_split.invalid(p_field, 'too_long');
  end if;
  return v_text;
end;
$$;

-- Trường tùy chọn: rỗng thì trả null, too_long khi vượt p_max ký tự.
create function bill_split.opt_text(p_value text, p_field text, p_max integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text := bill_split.clean(p_value);
begin
  if v_text is not null and char_length(v_text) > p_max then
    perform bill_split.invalid(p_field, 'too_long');
  end if;
  return v_text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Token và nhóm
-- ---------------------------------------------------------------------------

-- Database chỉ lưu sha256 của token, không lưu token gốc.
create function bill_split.hash_token(p_token text)
returns bytea
language sql
immutable
security definer
set search_path = ''
as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

-- Token mới: 24 ký tự base64url từ 18 byte ngẫu nhiên, khớp ^[A-Za-z0-9_-]{24}$.
create function bill_split.new_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;

-- Tìm id nhóm chưa xóa theo token, không khóa. Dùng cho các hàm chỉ đọc (stable).
-- Token sai định dạng, không tồn tại, đã đổi hoặc nhóm đã xóa đều ra cùng một lỗi.
create function bill_split.find_group(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{24}$' then
    select g.id
      into v_group_id
      from bill_split.groups g
     where g.token_hash = bill_split.hash_token(p_token)
       and g.deleted_at is null;
  end if;

  if v_group_id is null then
    perform bill_split.fail(404, 'BS_GROUP_NOT_FOUND');
  end if;
  return v_group_id;
end;
$$;

-- Như find_group nhưng khóa dòng nhóm (for update) để các thao tác ghi trên cùng nhóm chạy lần lượt.
-- Nếu trong lúc chờ khóa mà nhóm bị xóa hoặc đổi token thì điều kiện where được đánh giá lại và
-- không còn dòng nào, nên người chờ nhận BS_GROUP_NOT_FOUND.
create function bill_split.lock_group(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{24}$' then
    select g.id
      into v_group_id
      from bill_split.groups g
     where g.token_hash = bill_split.hash_token(p_token)
       and g.deleted_at is null
       for update;
  end if;

  if v_group_id is null then
    perform bill_split.fail(404, 'BS_GROUP_NOT_FOUND');
  end if;
  return v_group_id;
end;
$$;

-- Đánh dấu nhóm vừa có thao tác ghi.
create function bill_split.touch_group(p_group_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update bill_split.groups set updated_at = now() where id = p_group_id;
$$;

-- ---------------------------------------------------------------------------
-- Phần chia của khoản chi
-- ---------------------------------------------------------------------------

-- Kiểm p_shares của bs_save_expense và trả về mảng đã chuẩn hóa [{ member_id, amount }] theo đúng
-- thứ tự gửi lên. Mọi lỗi có field = 'shares'. Thứ tự kiểm: dạng mảng, số phần tử, từng phần tử
-- (dạng, trùng), thuộc nhóm, có phần lớn hơn 0, tổng, chia đều.
-- Các lỗi định dạng của từng phần tử (thiếu hay sai kiểu member_id, amount) dùng required và format.
--
-- Kiểm tổng ngay trong hàm thay vì deferred constraint trigger: trên Postgres dưới 18, trigger hoãn
-- chạy lúc commit dưới quyền của session (anon) và sẽ lỗi quyền.
create function bill_split.check_shares(p_group_id uuid, p_amount bigint, p_split_mode text, p_shares jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len     integer;
  v_item    jsonb;
  v_text    text;
  v_num     numeric;
  v_id      uuid;
  v_ids     uuid[] := '{}';
  v_amounts bigint[] := '{}';
  v_sum     numeric;
begin
  if p_shares is null or jsonb_typeof(p_shares) = 'null' then
    perform bill_split.invalid('shares', 'required');
  end if;
  if jsonb_typeof(p_shares) <> 'array' then
    perform bill_split.invalid('shares', 'format');
  end if;

  v_len := jsonb_array_length(p_shares);
  if v_len = 0 then
    perform bill_split.invalid('shares', 'empty');
  end if;
  if v_len > 50 then
    perform bill_split.invalid('shares', 'too_many');
  end if;

  for v_item in select e.value from jsonb_array_elements(p_shares) as e(value) loop
    if jsonb_typeof(v_item) <> 'object' then
      perform bill_split.invalid('shares', 'format');
    end if;

    -- member_id: chuỗi uuid dạng chuẩn 8-4-4-4-12.
    if coalesce(jsonb_typeof(v_item -> 'member_id'), 'null') = 'null' then
      perform bill_split.invalid('shares', 'required');
    end if;
    if jsonb_typeof(v_item -> 'member_id') <> 'string' then
      perform bill_split.invalid('shares', 'format');
    end if;
    v_text := v_item ->> 'member_id';
    if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform bill_split.invalid('shares', 'format');
    end if;
    v_id := v_text::uuid;
    if v_id = any (v_ids) then
      perform bill_split.invalid('shares', 'duplicate');
    end if;

    -- amount: số nguyên JSON từ 0 tới 999 999 999 999.
    if coalesce(jsonb_typeof(v_item -> 'amount'), 'null') = 'null' then
      perform bill_split.invalid('shares', 'required');
    end if;
    if jsonb_typeof(v_item -> 'amount') <> 'number' then
      perform bill_split.invalid('shares', 'format');
    end if;
    v_num := (v_item ->> 'amount')::numeric;
    if v_num <> trunc(v_num) then
      perform bill_split.invalid('shares', 'format');
    end if;
    if v_num < 0 or v_num > 999999999999 then
      perform bill_split.invalid('shares', 'out_of_range');
    end if;

    v_ids := v_ids || v_id;
    v_amounts := v_amounts || v_num::bigint;
  end loop;

  -- Ids không lặp nên đếm bằng v_len là đủ để biết mọi thành viên đều thuộc nhóm.
  if (select count(*)
        from bill_split.members m
       where m.group_id = p_group_id
         and m.id = any (v_ids)) <> v_len then
    perform bill_split.invalid('shares', 'not_in_group');
  end if;

  if not exists (select 1 from unnest(v_amounts) as a(value) where a.value > 0) then
    perform bill_split.invalid('shares', 'empty');
  end if;

  select sum(a.value) into v_sum from unnest(v_amounts) as a(value);
  if v_sum <> p_amount then
    perform bill_split.invalid('shares', 'sum_mismatch');
  end if;

  if p_split_mode = 'equal'
     and (select max(a.value) - min(a.value) from unnest(v_amounts) as a(value)) > 1 then
    perform bill_split.invalid('shares', 'unequal_split');
  end if;

  return (
    select jsonb_agg(jsonb_build_object('member_id', i.member_id, 'amount', i.amount))
      from unnest(v_ids, v_amounts) as i(member_id, amount)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Snapshot (mục 5)
-- ---------------------------------------------------------------------------

-- Toàn bộ một nhóm dưới dạng JSON. Một câu SELECT duy nhất nên mọi phần nhìn thấy cùng một trạng thái.
-- Mọi truy vấn đều lọc theo p_group_id. Snapshot không bao giờ chứa token hay token_hash.
-- Mảng rỗng luôn là [] nhờ coalesce.
create function bill_split.build_snapshot(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with shares as (
    select s.expense_id,
           jsonb_agg(
             jsonb_build_object('member_id', s.member_id, 'amount', s.amount)
             order by m."position", m.created_at, m.id
           ) as items
      from bill_split.expense_shares s
      join bill_split.members m
        on m.group_id = s.group_id
       and m.id = s.member_id
     where s.group_id = p_group_id
     group by s.expense_id
  )
  select jsonb_build_object(
    'v', 1,
    'group', (
      select jsonb_build_object(
               'id', g.id,
               'name', g.name,
               'currency', g.currency,
               'created_at', g.created_at,
               'updated_at', g.updated_at
             )
        from bill_split.groups g
       where g.id = p_group_id
    ),
    'members', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'id', m.id,
                   'name', m.name,
                   'position', m."position",
                   'bank_bin', m.bank_bin,
                   'bank_account', m.bank_account,
                   'bank_account_name', m.bank_account_name
                 )
                 order by m."position", m.created_at, m.id
               ),
               '[]'::jsonb
             )
        from bill_split.members m
       where m.group_id = p_group_id
    ),
    'expenses', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'id', e.id,
                   'title', e.title,
                   'amount', e.amount,
                   'paid_by', e.paid_by,
                   'spent_on', e.spent_on,
                   'split_mode', e.split_mode,
                   'note', e.note,
                   'version', e.version,
                   'created_at', e.created_at,
                   'updated_at', e.updated_at,
                   'shares', coalesce(sh.items, '[]'::jsonb)
                 )
                 order by e.spent_on desc, e.created_at desc, e.id
               ),
               '[]'::jsonb
             )
        from bill_split.expenses e
        left join shares sh on sh.expense_id = e.id
       where e.group_id = p_group_id
    ),
    'settlements', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'id', t.id,
                   'from_member', t.from_member,
                   'to_member', t.to_member,
                   'amount', t.amount,
                   'settled_on', t.settled_on,
                   'note', t.note,
                   'created_at', t.created_at,
                   'updated_at', t.updated_at
                 )
                 order by t.settled_on desc, t.created_at desc, t.id
               ),
               '[]'::jsonb
             )
        from bill_split.settlements t
       where t.group_id = p_group_id
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Phân quyền: các hàm nội bộ không ai ngoài owner gọi được.
-- Postgres cấp EXECUTE cho PUBLIC theo mặc định, Supabase cấp thêm cho anon và authenticated,
-- nên thu hồi tường minh.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema bill_split from public, anon, authenticated;
revoke all on all sequences in schema bill_split from public, anon, authenticated;
revoke all on all functions in schema bill_split from public, anon, authenticated;
