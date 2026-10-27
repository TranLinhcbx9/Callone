-- Module Chia tiền (bill-split), phần 1/3: schema, bảng, ràng buộc, index, RLS và phân quyền.
-- Hợp đồng: docs/contracts/bill-split-api.md, mục 2 và 3.
--
-- Mọi bảng nằm trong schema nội bộ `bill_split`. Schema này không được lộ ra API: anon và
-- authenticated không có USAGE, RLS bật và không có policy nào. Client chỉ đi qua các hàm
-- `public.bs_*` (migration thứ 3), chạy bằng quyền chủ sở hữu (security definer).

-- gen_random_bytes dùng để sinh token nhóm. Supabase đã bật sẵn pgcrypto trong schema extensions.
create extension if not exists pgcrypto with schema extensions;

create schema bill_split;
comment on schema bill_split is
  'Module Chia tiền: bảng và hàm nội bộ. Không lộ qua API, anon và authenticated không có USAGE.';

revoke all on schema bill_split from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table bill_split.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  currency    text        not null default 'VND',
  -- sha256 của token gốc. Token gốc không được lưu ở bất kỳ đâu.
  token_hash  bytea       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Khác null nghĩa là đã xóa mềm.
  deleted_at  timestamptz,
  constraint groups_name_length check (char_length(name) between 1 and 80),
  constraint groups_currency_vnd check (currency = 'VND'),
  constraint groups_token_hash_sha256 check (octet_length(token_hash) = 32),
  -- unique tính cả nhóm đã xóa mềm: token của nhóm đã xóa không bao giờ được dùng lại.
  constraint groups_token_hash_key unique (token_hash)
);

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table bill_split.members (
  -- Client sinh, trừ thành viên ban đầu do bs_create_group sinh.
  id                 uuid        primary key,
  group_id           uuid        not null references bill_split.groups (id) on delete cascade,
  name               text        not null,
  "position"         integer     not null,
  bank_bin           text,
  bank_account       text,
  bank_account_name  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Đích của các khóa ngoại kép: ép dữ liệu con luôn cùng nhóm với thành viên.
  -- Các khóa ngoại trỏ tới đây (expenses.paid_by, expense_shares.member_id, settlements.from_member
  -- và to_member) khai báo deferrable initially deferred. Đây là khóa ngoại thường, không phải
  -- constraint trigger tự viết, nên kiểm lúc commit vẫn chạy bằng quyền owner. Nhờ hoãn kiểm tra,
  -- xóa cứng cả nhóm (delete from bill_split.groups) chạy được: nếu kiểm ngay thì cascade xóa
  -- members có thể chạy trước cascade xóa expenses, expense_shares và settlements.
  -- Các hàm API vẫn kiểm trước nên khách không bao giờ gặp lỗi khóa ngoại thô.
  constraint members_group_id_id_key unique (group_id, id),
  constraint members_name_length check (char_length(name) between 1 and 40),
  constraint members_position_nonnegative check ("position" >= 0),
  constraint members_bank_bin_format check (bank_bin is null or bank_bin ~ '^[0-9]{6}$'),
  constraint members_bank_account_format check (bank_account is null or bank_account ~ '^[0-9A-Za-z]{1,19}$'),
  constraint members_bank_account_name_length
    check (bank_account_name is null or char_length(bank_account_name) between 1 and 50),
  -- bank_bin và bank_account cùng null hoặc cùng có giá trị.
  constraint members_bank_pair check ((bank_bin is null) = (bank_account is null)),
  -- bank_account_name chỉ có khi đã có ngân hàng.
  constraint members_bank_account_name_needs_bank check (bank_account_name is null or bank_bin is not null)
);

-- Tên thành viên không trùng trong nhóm, không phân biệt hoa thường.
create unique index members_group_id_lower_name_key on bill_split.members (group_id, lower(name));

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table bill_split.expenses (
  id          uuid        primary key,
  group_id    uuid        not null references bill_split.groups (id) on delete cascade,
  title       text        not null,
  amount      bigint      not null,
  paid_by     uuid        not null,
  spent_on    date        not null,
  split_mode  text        not null,
  note        text,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint expenses_group_id_id_key unique (group_id, id),
  constraint expenses_paid_by_fkey foreign key (group_id, paid_by) references bill_split.members (group_id, id)
    deferrable initially deferred,
  constraint expenses_title_length check (char_length(title) between 1 and 80),
  constraint expenses_amount_range check (amount between 1 and 999999999999),
  constraint expenses_spent_on_range check (spent_on between date '2000-01-01' and date '2100-12-31'),
  constraint expenses_split_mode_check check (split_mode in ('equal', 'exact')),
  constraint expenses_note_length check (note is null or char_length(note) between 1 and 500),
  constraint expenses_version_positive check (version >= 1)
);

-- Khóa ngoại kép (group_id, paid_by). Khóa ngoại group_id đã được unique (group_id, id) phủ.
create index expenses_group_id_paid_by_idx on bill_split.expenses (group_id, paid_by);

-- ---------------------------------------------------------------------------
-- expense_shares
-- ---------------------------------------------------------------------------
create table bill_split.expense_shares (
  expense_id  uuid   not null,
  group_id    uuid   not null,
  member_id   uuid   not null,
  amount      bigint not null,
  primary key (expense_id, member_id),
  constraint expense_shares_expense_fkey
    foreign key (group_id, expense_id) references bill_split.expenses (group_id, id) on delete cascade,
  constraint expense_shares_member_fkey
    foreign key (group_id, member_id) references bill_split.members (group_id, id) deferrable initially deferred,
  constraint expense_shares_amount_range check (amount between 0 and 999999999999)
);

create index expense_shares_group_id_expense_id_idx on bill_split.expense_shares (group_id, expense_id);
create index expense_shares_group_id_member_id_idx on bill_split.expense_shares (group_id, member_id);

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------
create table bill_split.settlements (
  id           uuid        primary key,
  group_id     uuid        not null references bill_split.groups (id) on delete cascade,
  -- Người trả tiền.
  from_member  uuid        not null,
  -- Người nhận tiền.
  to_member    uuid        not null,
  amount       bigint      not null,
  settled_on   date        not null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint settlements_from_member_fkey
    foreign key (group_id, from_member) references bill_split.members (group_id, id) deferrable initially deferred,
  constraint settlements_to_member_fkey
    foreign key (group_id, to_member) references bill_split.members (group_id, id) deferrable initially deferred,
  constraint settlements_distinct_members check (from_member <> to_member),
  constraint settlements_amount_range check (amount between 1 and 999999999999),
  constraint settlements_settled_on_range check (settled_on between date '2000-01-01' and date '2100-12-31'),
  constraint settlements_note_length check (note is null or char_length(note) between 1 and 200)
);

-- Hai index này cũng phủ khóa ngoại group_id của settlements (cột đầu là group_id).
create index settlements_group_id_from_member_idx on bill_split.settlements (group_id, from_member);
create index settlements_group_id_to_member_idx on bill_split.settlements (group_id, to_member);

-- ---------------------------------------------------------------------------
-- settings: cấu hình nhỏ của module, hiện chỉ có hai giới hạn tạo nhóm.
-- Giá trị mặc định nằm trong code (bill_split.take_create_slot), bảng này chỉ để ghi đè, để trống là
-- dùng mặc định. Đổi bằng SQL (Studio hoặc psql), xem docs/supabase.md. seed.sql (chỉ local) nâng cả
-- hai lên rất cao để chạy e2e liên tục từ một IP không bị chặn.
-- ---------------------------------------------------------------------------
create table bill_split.settings (
  key    text    primary key,
  value  integer not null,
  constraint settings_key_known check (key in ('create_limit_client', 'create_limit_global')),
  -- 0 là hợp lệ: chặn hẳn việc tạo nhóm mới (công tắc khẩn).
  constraint settings_value_nonnegative check (value >= 0)
);

-- ---------------------------------------------------------------------------
-- create_log: nhật ký cửa sổ trượt của bs_create_group, nguồn của giới hạn tốc độ tạo nhóm.
-- Mỗi lần tạo nhóm thành công thêm một dòng, và mỗi lần tạo xóa các dòng cũ hơn cửa sổ, nên bảng
-- chỉ giữ cửa sổ hiện tại (tối đa 100 dòng với giới hạn mặc định) và không lưu IP lâu dài. Không có khóa ngoại tới groups: log này
-- không biết nhóm nào, chỉ biết "client này vừa tạo một nhóm lúc này".
-- ---------------------------------------------------------------------------
create table bill_split.create_log (
  id           bigint      generated always as identity primary key,
  -- sha256 (hex) của IP client, hoặc đúng chữ 'unknown' khi request không có header IP nào.
  client_hash  text        not null,
  created_at   timestamptz not null default now()
);

-- Dọn dòng cũ và đếm trong cửa sổ.
create index create_log_created_at_idx on bill_split.create_log (created_at);

-- ---------------------------------------------------------------------------
-- RLS: bật và không tạo policy nào, làm lớp chặn dự phòng.
-- Hàm security definer chạy bằng quyền chủ sở hữu (bỏ qua RLS) nên vẫn đọc ghi được.
-- ---------------------------------------------------------------------------
alter table bill_split.groups         enable row level security;
alter table bill_split.members        enable row level security;
alter table bill_split.expenses       enable row level security;
alter table bill_split.expense_shares enable row level security;
alter table bill_split.settlements    enable row level security;
alter table bill_split.settings       enable row level security;
alter table bill_split.create_log     enable row level security;

-- ---------------------------------------------------------------------------
-- Phân quyền: thu hồi mọi quyền khỏi PUBLIC, anon, authenticated.
-- Supabase có default privileges cấp quyền cho các role này trên đối tượng mới, nên thu hồi
-- tường minh sau khi tạo bảng. Mọi migration sau này đụng tới bill_split cũng phải lặp lại khối này.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema bill_split from public, anon, authenticated;
revoke all on all sequences in schema bill_split from public, anon, authenticated;
revoke all on all functions in schema bill_split from public, anon, authenticated;
