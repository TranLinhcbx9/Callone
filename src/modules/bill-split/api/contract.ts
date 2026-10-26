/**
 * Hợp đồng API module Chia tiền, phía client.
 *
 * Nguồn sự thật là docs/contracts/bill-split-api.md. Đổi gì ở đây phải đổi cả SQL và tài liệu,
 * và phải báo người điều phối vì 3 agent cùng dựa vào file này.
 *
 * Các kiểu ở đây mô tả JSON đi trên dây, đặt tên snake_case giống database.
 * Tầng api/ chuyển chúng sang model camelCase trong domain/types.ts trước khi đưa lên UI.
 */

export const SNAPSHOT_VERSION = 1

export const SPLIT_MODES = ['equal', 'exact'] as const
export type SplitMode = (typeof SPLIT_MODES)[number]

export interface MemberDto {
  id: string
  name: string
  position: number
  bank_bin: string | null
  bank_account: string | null
  bank_account_name: string | null
}

export interface ShareDto {
  member_id: string
  amount: number
}

export interface ExpenseDto {
  id: string
  title: string
  amount: number
  paid_by: string
  /** YYYY-MM-DD */
  spent_on: string
  split_mode: SplitMode
  note: string | null
  version: number
  created_at: string
  updated_at: string
  /** Sắp theo position của thành viên. */
  shares: ShareDto[]
}

export interface SettlementDto {
  id: string
  from_member: string
  to_member: string
  amount: number
  /** YYYY-MM-DD */
  settled_on: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface GroupDto {
  id: string
  name: string
  currency: 'VND'
  created_at: string
  updated_at: string
}

/** Toàn bộ một nhóm. Mọi hàm ghi đều trả lại snapshot mới nhất. */
export interface GroupSnapshotDto {
  v: typeof SNAPSHOT_VERSION
  group: GroupDto
  /** Sắp theo position tăng dần. */
  members: MemberDto[]
  /** Sắp theo spent_on giảm dần, rồi created_at giảm dần. */
  expenses: ExpenseDto[]
  /** Sắp theo settled_on giảm dần, rồi created_at giảm dần. */
  settlements: SettlementDto[]
}

export interface GroupSummaryDto {
  token: string
  id: string
  name: string
  member_count: number
  expense_count: number
  total_spent: number
  updated_at: string
}

export interface CreateGroupResultDto {
  token: string
  snapshot: GroupSnapshotDto
}

export interface RotateTokenResultDto {
  token: string
}

/** Phần chia gửi lên trong p_shares của bs_save_expense. */
export interface ShareInputDto {
  member_id: string
  amount: number
}

export const BS_ERROR_CODES = [
  'BS_GROUP_NOT_FOUND',
  'BS_NOT_FOUND',
  'BS_CONFLICT',
  'BS_MEMBER_IN_USE',
  'BS_INVALID',
  'BS_LIMIT',
  'BS_RATE_LIMITED',
] as const
export type BsErrorCode = (typeof BS_ERROR_CODES)[number]

export const BS_INVALID_REASONS = [
  'required',
  'too_long',
  'format',
  'out_of_range',
  'duplicate',
  'not_in_group',
  'same_member',
  'sum_mismatch',
  'unequal_split',
  'empty',
  'id_taken',
  'too_many',
] as const
export type BsInvalidReason = (typeof BS_INVALID_REASONS)[number]

/** Chi tiết của BS_INVALID. field là tên tham số bỏ tiền tố p_, ví dụ 'name', 'shares'. */
export interface BsInvalidDetail {
  field: string
  reason: BsInvalidReason
}

/** Chi tiết của BS_LIMIT. */
export interface BsLimitDetail {
  limit: 'members' | 'expenses' | 'settlements'
}

export const BS_LIMITS = {
  groupName: 80,
  memberName: 40,
  expenseTitle: 80,
  expenseNote: 500,
  settlementNote: 200,
  bankAccount: 19,
  bankAccountName: 50,
  membersPerGroup: 50,
  expensesPerGroup: 5000,
  settlementsPerGroup: 5000,
  minAmount: 1,
  maxAmount: 999_999_999_999,
  tokensPerLookup: 50,
  groupCreatesPerWindow: 30,
  groupCreateWindowMinutes: 10,
} as const

/** Token nhóm: 24 ký tự base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/
