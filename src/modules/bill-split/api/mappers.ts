/**
 * Đổi JSON server trả về (snake_case, kiểu Json) sang model camelCase của domain/types.ts.
 * Đây là chỗ duy nhất biết hình dạng JSON trên dây. JSON được kiểm tra trước khi đổi, để nếu agent supabase
 * và frontend lệch nhau về hợp đồng thì lỗi hiện rõ ở đây chứ không vỡ lung tung trong giao diện.
 */
import {
  SNAPSHOT_VERSION,
  TOKEN_PATTERN,
  type ExpenseDto,
  type GroupSnapshotDto,
  type GroupSummaryDto,
  type MemberDto,
  type SettlementDto,
} from '@/modules/bill-split/api/contract'
import type { Expense, Group, GroupSummary, Member, Settlement } from '@/modules/bill-split/domain/types'
import { AppError } from '@/shared/lib/errors'

type Dict = Record<string, unknown>

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function malformed(path: string, expected: string): never {
  throw new AppError({
    kind: 'unknown',
    code: 'UNKNOWN',
    message: `Dữ liệu từ server sai định dạng: ${path} phải là ${expected}`,
    detail: { path },
  })
}

function readString(source: Dict, key: string, path: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : malformed(`${path}.${key}`, 'chuỗi')
}

function readNumber(source: Dict, key: string, path: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : malformed(`${path}.${key}`, 'số')
}

function readNullableString(source: Dict, key: string, path: string): string | null {
  const value = source[key]
  return value === null || typeof value === 'string' ? value : malformed(`${path}.${key}`, 'chuỗi hoặc null')
}

function readList(source: Dict, key: string, path: string): Dict[] {
  const value = source[key]
  if (!Array.isArray(value)) return malformed(`${path}.${key}`, 'mảng')
  return value.map((item, index) => (isDict(item) ? item : malformed(`${path}.${key}[${index}]`, 'object')))
}

function checkMember(raw: Dict, path: string): void {
  readString(raw, 'id', path)
  readString(raw, 'name', path)
  readNumber(raw, 'position', path)
  for (const key of ['bank_bin', 'bank_account', 'bank_account_name']) readNullableString(raw, key, path)
}

function checkExpense(raw: Dict, path: string): void {
  for (const key of ['id', 'title', 'paid_by', 'spent_on', 'created_at', 'updated_at']) readString(raw, key, path)
  for (const key of ['amount', 'version']) readNumber(raw, key, path)
  readNullableString(raw, 'note', path)
  if (raw.split_mode !== 'equal' && raw.split_mode !== 'exact') malformed(`${path}.split_mode`, "'equal' hoặc 'exact'")
  readList(raw, 'shares', path).forEach((share, index) => {
    readString(share, 'member_id', `${path}.shares[${index}]`)
    readNumber(share, 'amount', `${path}.shares[${index}]`)
  })
}

function checkSettlement(raw: Dict, path: string): void {
  for (const key of ['id', 'from_member', 'to_member', 'settled_on', 'created_at', 'updated_at']) {
    readString(raw, key, path)
  }
  readNumber(raw, 'amount', path)
  readNullableString(raw, 'note', path)
}

/** Phiên bản khác nghĩa là server mới hơn app đang chạy: báo lỗi 'outdated' để giao diện bảo người dùng tải lại trang. */
function assertSupportedVersion(version: unknown): void {
  if (typeof version !== 'number') return malformed('snapshot.v', 'số')
  if (version !== SNAPSHOT_VERSION) {
    throw new AppError({
      kind: 'outdated',
      code: 'OUTDATED',
      message: `Snapshot phiên bản ${version} chưa được hỗ trợ, app chỉ đọc được phiên bản ${SNAPSHOT_VERSION}`,
      detail: { version },
    })
  }
}

/** Kiểm tra JSON là snapshot nhóm phiên bản 1 đúng hình dạng hợp đồng. Ném AppError nếu không. */
export function parseSnapshot(raw: unknown): GroupSnapshotDto {
  if (!isDict(raw)) return malformed('snapshot', 'object')
  assertSupportedVersion(raw.v)

  const group = raw.group
  if (!isDict(group)) return malformed('snapshot.group', 'object')
  for (const key of ['id', 'name', 'created_at', 'updated_at']) readString(group, key, 'snapshot.group')
  if (group.currency !== 'VND') malformed('snapshot.group.currency', "'VND'")

  readList(raw, 'members', 'snapshot').forEach((m, index) => checkMember(m, `snapshot.members[${index}]`))
  readList(raw, 'expenses', 'snapshot').forEach((e, index) => checkExpense(e, `snapshot.expenses[${index}]`))
  readList(raw, 'settlements', 'snapshot').forEach((s, index) => checkSettlement(s, `snapshot.settlements[${index}]`))
  return raw as unknown as GroupSnapshotDto
}

function toMember(dto: MemberDto): Member {
  const { bank_bin: bin, bank_account: account } = dto
  return {
    id: dto.id,
    name: dto.name,
    position: dto.position,
    bank: bin && account ? { bin, accountNumber: account, accountName: dto.bank_account_name || null } : null,
  }
}

function toExpense(dto: ExpenseDto): Expense {
  return {
    id: dto.id,
    title: dto.title,
    amount: dto.amount,
    paidBy: dto.paid_by,
    spentOn: dto.spent_on,
    splitMode: dto.split_mode,
    note: dto.note,
    version: dto.version,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    shares: dto.shares.map((share) => ({ memberId: share.member_id, amount: share.amount })),
  }
}

function toSettlement(dto: SettlementDto): Settlement {
  return {
    id: dto.id,
    fromMemberId: dto.from_member,
    toMemberId: dto.to_member,
    amount: dto.amount,
    settledOn: dto.settled_on,
    note: dto.note,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

/**
 * Snapshot DTO thành Group, từ chối snapshot có v khác 1. Giữ nguyên thứ tự server đã sắp
 * (thành viên theo position, khoản chi mới nhất trước). Dữ liệu từ server nên đi qua parseSnapshot trước.
 */
export function toGroup(snapshot: GroupSnapshotDto): Group {
  assertSupportedVersion(snapshot.v)
  return {
    id: snapshot.group.id,
    name: snapshot.group.name,
    currency: snapshot.group.currency,
    createdAt: snapshot.group.created_at,
    updatedAt: snapshot.group.updated_at,
    members: snapshot.members.map(toMember),
    expenses: snapshot.expenses.map(toExpense),
    settlements: snapshot.settlements.map(toSettlement),
  }
}

export function toGroupSummary(dto: GroupSummaryDto): GroupSummary {
  return {
    token: dto.token,
    id: dto.id,
    name: dto.name,
    memberCount: dto.member_count,
    expenseCount: dto.expense_count,
    totalSpent: dto.total_spent,
    updatedAt: dto.updated_at,
  }
}

/** Kết quả bs_get_groups: mảng tóm tắt, giữ nguyên thứ tự server (nhóm mới sửa trước). */
export function parseGroupSummaries(raw: unknown): GroupSummary[] {
  if (!Array.isArray(raw)) return malformed('summaries', 'mảng')
  return raw.map((item, index) => {
    const path = `summaries[${index}]`
    if (!isDict(item)) return malformed(path, 'object')
    for (const key of ['token', 'id', 'name', 'updated_at']) readString(item, key, path)
    for (const key of ['member_count', 'expense_count', 'total_spent']) readNumber(item, key, path)
    return toGroupSummary(item as unknown as GroupSummaryDto)
  })
}

function readToken(source: Dict, path: string): string {
  const token = readString(source, 'token', path)
  return TOKEN_PATTERN.test(token) ? token : malformed(`${path}.token`, 'token 24 ký tự base64url')
}

/** Kết quả bs_create_group: token mới và snapshot đầu tiên. */
export function parseCreateGroupResult(raw: unknown): { token: string; group: Group } {
  if (!isDict(raw)) return malformed('create_group', 'object')
  const token = readToken(raw, 'create_group')
  return { token, group: toGroup(parseSnapshot(raw.snapshot)) }
}

/** Kết quả bs_rotate_token: token mới. */
export function parseRotateTokenResult(raw: unknown): string {
  if (!isDict(raw)) return malformed('rotate_token', 'object')
  return readToken(raw, 'rotate_token')
}
