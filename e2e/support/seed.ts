/**
 * Dựng dữ liệu cho test E2E bằng cách gọi thẳng RPC của Supabase qua HTTP, không đi qua giao diện:
 * POST ${VITE_SUPABASE_URL}/rest/v1/rpc/<hàm> với header apikey, giống cách app gọi.
 *
 * URL và key đọc từ .env.local (và .env.e2e.local nếu có, như Vite ở mode e2e); biến môi trường
 * VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY đặt sẵn khi chạy thì được ưu tiên.
 *
 * Tạo nhóm bị giới hạn tốc độ (mỗi client và toàn hệ thống, trong 10 phút), nên mỗi file test chỉ nên tạo ít nhóm
 * nhất có thể và dùng lại nhóm giữa các bước. seed.sql của database local đã nâng giới hạn lên rất cao; nếu vẫn
 * gặp BS_RATE_LIMITED thì dọn nhật ký giới hạn thay vì chờ, xem câu lệnh trong thông báo lỗi.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface SupabaseConfig {
  url: string
  key: string
}

/** Đọc một file .env đơn giản: KEY=value mỗi dòng, bỏ dòng trống và dòng chú thích, bỏ cặp nháy bao quanh. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const values: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match || line.trimStart().startsWith('#')) continue
    const [, name, raw] = match
    if (name === undefined || raw === undefined) continue
    values[name] = raw.replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

/** Cấu hình Supabase giống thứ bản build e2e dùng: process.env thắng, rồi .env.e2e.local, .env.e2e, .env.local, .env. */
export function readSupabaseConfig(cwd: string = process.cwd()): SupabaseConfig {
  const files = ['.env', '.env.local', '.env.e2e', '.env.e2e.local']
  const fromFiles = Object.assign({}, ...files.map((file) => readEnvFile(resolve(cwd, file)))) as Record<string, string>
  const url = process.env.VITE_SUPABASE_URL ?? fromFiles.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fromFiles.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY. Sao chép .env.example thành .env.local.')
  }
  return { url: url.replace(/\/+$/, ''), key }
}

const RATE_LIMIT_HINT =
  'Dọn nhật ký giới hạn tạo nhóm rồi chạy lại: ' +
  'docker exec supabase_db_callone psql -U postgres -c "delete from bill_split.create_log"'

/** Lỗi do một hàm RPC trả về. `code` là mã BS_* (message của PostgREST), `detail` là JSON trong details. */
export class RpcFailure extends Error {
  readonly code: string
  readonly status: number
  readonly detail: unknown

  constructor(fn: string, status: number, code: string, detail: unknown) {
    super(
      `${fn} lỗi ${status} ${code}${detail ? ` ${JSON.stringify(detail)}` : ''}` +
        (code === 'BS_RATE_LIMITED' ? `\n${RATE_LIMIT_HINT}` : ''),
    )
    this.name = 'RpcFailure'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/** Gọi một hàm RPC bs_* và trả JSON. Ném RpcFailure khi server báo lỗi. */
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
  config: SupabaseConfig = readSupabaseConfig(),
): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (response.status === 204) return null as T
  const text = await response.text()
  let body: unknown = null
  try {
    body = text === '' ? null : JSON.parse(text)
  } catch {
    body = text
  }
  if (!response.ok) {
    const failure = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
    let detail: unknown = failure.details
    if (typeof detail === 'string' && detail !== '') {
      try {
        detail = JSON.parse(detail)
      } catch {
        // giữ nguyên chuỗi
      }
    }
    throw new RpcFailure(fn, response.status, String(failure.message ?? 'UNKNOWN'), detail || null)
  }
  return body as T
}

/** Ngày hôm nay YYYY-MM-DD theo giờ Việt Nam, như todayIsoDate() của app. */
export function todayVn(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

export interface SeedExpense {
  title: string
  amount: number
  /** Tên người trả (một trong các thành viên của nhóm). */
  paidBy: string
  /** Mặc định là hôm nay. */
  spentOn?: string
  /** Tên những người chia, mặc định cả nhóm. Chia đều, phần lẻ đồng dồn cho những người đứng đầu danh sách. */
  participants?: string[]
}

export interface SeedGroupOptions {
  /** Mặc định là tên có hậu tố ngẫu nhiên, để dễ tìm trong database khi test hỏng. */
  name?: string
  members: string[]
  expenses?: SeedExpense[]
}

export interface SeededGroup {
  token: string
  name: string
  /** Tên thành viên sang id. */
  memberIds: Readonly<Record<string, string>>
}

interface SnapshotMember {
  id: string
  name: string
}

/** Chia đều `amount` cho `count` người: phần lẻ đồng cộng thêm 1 cho những người đầu tiên. */
export function equalShares(amount: number, count: number): number[] {
  const base = Math.floor(amount / count)
  const rest = amount - base * count
  return Array.from({ length: count }, (_, index) => base + (index < rest ? 1 : 0))
}

/** Thêm một khoản chi chia đều vào nhóm qua bs_save_expense. */
export async function addExpense(
  group: SeededGroup,
  expense: SeedExpense,
  config: SupabaseConfig = readSupabaseConfig(),
): Promise<void> {
  const idOf = (memberName: string): string => {
    const id = group.memberIds[memberName]
    if (!id) throw new Error(`Không có thành viên "${memberName}" trong nhóm`)
    return id
  }
  const participants = expense.participants ?? Object.keys(group.memberIds)
  const amounts = equalShares(expense.amount, participants.length)
  await rpc(
    'bs_save_expense',
    {
      p_token: group.token,
      p_expense_id: randomUUID(),
      p_title: expense.title,
      p_amount: expense.amount,
      p_paid_by: idOf(expense.paidBy),
      p_spent_on: expense.spentOn ?? todayVn(),
      p_split_mode: 'equal',
      p_shares: participants.map((participant, index) => ({ member_id: idOf(participant), amount: amounts[index] })),
    },
    config,
  )
}

/** Tạo một nhóm qua bs_create_group rồi thêm các khoản chi qua bs_save_expense. */
export async function seedGroup(options: SeedGroupOptions, config: SupabaseConfig = readSupabaseConfig()): Promise<SeededGroup> {
  const name = options.name ?? `E2E ${randomUUID().slice(0, 8)}`
  const created = await rpc<{ token: string; snapshot: { members: SnapshotMember[] } }>(
    'bs_create_group',
    { p_name: name, p_member_names: options.members },
    config,
  )
  const group: SeededGroup = {
    token: created.token,
    name,
    memberIds: Object.fromEntries(created.snapshot.members.map((member) => [member.name, member.id])),
  }
  for (const expense of options.expenses ?? []) await addExpense(group, expense, config)
  return group
}
