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

-- "Trắng" là mọi ký tự không hiện ra gì mà người dùng hay dán nhầm vào ô nhập: khoảng trắng ASCII (tab,
-- xuống dòng, VT, FF, CR, dấu cách), toàn bộ Unicode White_Space (NEL U+0085, NBSP U+00A0, U+1680,
-- U+2000 tới U+200A, U+2028, U+2029, U+202F, U+205F, U+3000) và các ký tự rộng bằng không
-- U+200B tới U+200D, U+2060, U+FEFF. Lớp ký tự viết tường minh bằng mã, không dùng \s hay [[:space:]]
-- vì hai lớp đó phụ thuộc locale của database (NBSP thường không được tính là khoảng trắng).
-- clean và strip_blank cùng dùng lớp này: sửa thì sửa cả hai, và sửa test 11_bill_split_blank_text.
--
-- Chuẩn hóa chuỗi người dùng nhập: về dạng NFC (tiếng Việt gõ ở nguồn khác nhau có thể là dạng
-- tổ hợp hoặc dựng sẵn, nếu không chuẩn hóa thì "Hưng" có thể bị coi là hai tên khác nhau),
-- cắt ký tự trắng ở hai đầu. Rỗng (hoặc chỉ toàn ký tự trắng) thì trả null.
-- Cắt hai đầu bằng hai regexp_replace neo ^ và $ riêng. Đã đo (PGlite): chuỗi 2 triệu ký tự xen kẽ ký tự
-- trắng chạy dưới 0,2 giây, không chậm theo cấp số nhân.
create function bill_split.clean(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        normalize(p_text, nfc),
        '^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+',
        ''
      ),
      '[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+$',
      ''
    ),
    ''
  );
$$;

-- Bỏ MỌI ký tự trắng ở bất kỳ đâu trong chuỗi (số tài khoản ngân hàng hay được dán kèm dấu cách,
-- NBSP hoặc ký tự rộng bằng không). Rỗng thì trả null.
create function bill_split.strip_blank(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      normalize(p_text, nfc),
      '[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+',
      '',
      'g'
    ),
    ''
  );
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

-- Tìm nhóm chưa xóa theo token và khóa dòng nhóm (for update) để các thao tác ghi trên cùng nhóm chạy
-- lần lượt. Không thấy nhóm thì trả null, không raise (bs_rotate_token cần phân biệt "token cũ đã
-- đổi" với "token sai" để nhận lời gửi lại; mọi hàm khác dùng lock_group bên dưới).
-- Nếu trong lúc chờ khóa mà nhóm bị xóa hoặc đổi token thì điều kiện where được đánh giá lại và
-- không còn dòng nào, nên người chờ nhận null.
create function bill_split.try_lock_group(p_token text)
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
  return v_group_id;
end;
$$;

-- Như try_lock_group nhưng không thấy nhóm thì raise BS_GROUP_NOT_FOUND (cùng một lỗi cho token sai
-- định dạng, không tồn tại, đã đổi và nhóm đã xóa).
create function bill_split.lock_group(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := bill_split.try_lock_group(p_token);
begin
  if v_group_id is null then
    perform bill_split.fail(404, 'BS_GROUP_NOT_FOUND');
  end if;
  return v_group_id;
end;
$$;

-- bs_create_group được gửi lại với cùng token do client sinh: nếu đã có nhóm chưa xóa giữ token này thì
-- trả đúng { token, snapshot } của nhóm đó (không tạo gì, không tính vào giới hạn tốc độ). Chỉ có nhóm
-- đã xóa mềm giữ token thì BS_INVALID id_taken, vì token của nhóm đã xóa không được dùng lại. Chưa có
-- nhóm nào (hoặc p_token null) thì trả null.
create function bill_split.replay_create(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_deleted  boolean;
begin
  if p_token is null then
    return null;
  end if;

  select g.id, g.deleted_at is not null
    into v_group_id, v_deleted
    from bill_split.groups g
   where g.token_hash = bill_split.hash_token(p_token);
  if not found then
    return null;
  end if;

  if v_deleted then
    perform bill_split.invalid('token', 'id_taken');
  end if;
  return jsonb_build_object('token', p_token, 'snapshot', bill_split.build_snapshot(v_group_id));
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
-- Giới hạn tốc độ tạo nhóm (mục 6 và 7 của hợp đồng)
-- ---------------------------------------------------------------------------

-- Khóa của client đang gọi: sha256 (hex, chữ thường) của địa chỉ IP, lấy từ header mà PostgREST đặt
-- vào GUC request.headers (một JSON, tên header viết thường). Thứ tự ưu tiên:
--   1. cf-connecting-ip: Cloudflare luôn ghi đè bằng IP thật nên client không giả được. Supabase cloud
--      đi qua Cloudflare nên đây là nguồn đáng tin.
--   2. Địa chỉ đầu tiên của x-forwarded-for.
--   3. x-real-ip.
-- Header nào rỗng thì bỏ qua và xét header kế. Không có header nào dùng được (hoặc chạy ngoài
-- PostgREST nên không có GUC, hoặc GUC không phải JSON object) thì trả đúng chữ 'unknown': một bucket
-- chung cho mọi request như vậy. Hàm chỉ đọc GUC nên stable.
create function bill_split.client_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw     text := nullif(current_setting('request.headers', true), '');
  v_headers jsonb;
  v_ip      text;
begin
  if v_raw is not null then
    -- PostgREST luôn ghi JSON hợp lệ. Bắt lỗi chỉ để một giá trị lạ không làm hỏng việc tạo nhóm.
    begin
      v_headers := v_raw::jsonb;
    exception when others then
      v_headers := null;
    end;
  end if;

  if jsonb_typeof(v_headers) = 'object' then
    select bill_split.clean(split_part(h.value, ',', 1))
      into v_ip
      from jsonb_each_text(v_headers) as h(key, value)
     where lower(h.key) in ('cf-connecting-ip', 'x-forwarded-for', 'x-real-ip')
       and bill_split.clean(split_part(h.value, ',', 1)) is not null
     order by case lower(h.key)
                when 'cf-connecting-ip' then 1
                when 'x-forwarded-for' then 2
                else 3
              end
     limit 1;
  end if;

  if v_ip is null then
    return 'unknown';
  end if;
  return encode(sha256(convert_to(lower(v_ip), 'UTF8')), 'hex');
end;
$$;

-- Giữ một chỗ trong giới hạn tạo nhóm cho client hiện tại, hoặc raise BS_RATE_LIMITED (429).
-- Cửa sổ trượt 10 phút, hai giới hạn đều đếm trong cửa sổ đó:
--   * mỗi client (client_key): mặc định 5 lần tạo,
--   * toàn hệ thống: mặc định 100 lần tạo.
-- Ghi đè bằng bill_split.settings (create_limit_client, create_limit_global), thiếu dòng thì dùng mặc định
-- ở đây. Dòng cũ hơn cửa sổ bị xóa ngay mỗi lần gọi nên create_log chỉ giữ cửa sổ hiện tại.
-- Gọi mỗi lần tạo nhóm mới (không gọi khi gửi lại), và PHẢI gọi khi đang giữ advisory lock của
-- bs_create_group: lock đó làm các lần tạo chạy lần lượt nên đếm rồi thêm không bị hai lần tạo cùng
-- lọt qua. Dòng log được thêm ngay ở đây, trước khi kiểm dữ liệu; nếu bước kiểm dữ liệu hay bước ghi
-- sau đó lỗi thì cả transaction (kể cả dòng log) bị rollback, nên chỉ lần tạo thành công mới chiếm chỗ.
create function bill_split.take_create_slot()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window       constant interval := interval '10 minutes';
  v_client       text := bill_split.client_key();
  v_limit_client integer;
  v_limit_global integer;
begin
  select s.value into v_limit_client from bill_split.settings s where s.key = 'create_limit_client';
  select s.value into v_limit_global from bill_split.settings s where s.key = 'create_limit_global';
  v_limit_client := coalesce(v_limit_client, 5);
  v_limit_global := coalesce(v_limit_global, 100);

  delete from bill_split.create_log l where l.created_at <= now() - v_window;

  if (select count(*) from bill_split.create_log l where l.client_hash = v_client) >= v_limit_client
     or (select count(*) from bill_split.create_log l) >= v_limit_global then
    perform bill_split.fail(429, 'BS_RATE_LIMITED');
  end if;

  insert into bill_split.create_log (client_hash) values (v_client);
end;
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
