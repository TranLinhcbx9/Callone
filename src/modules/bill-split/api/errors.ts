/**
 * Dịch lỗi của module Chia tiền sang tiếng Việt.
 * Server raise lỗi với message là mã BS_*, detail là JSON ({ field, reason } cho BS_INVALID,
 * { limit } cho BS_LIMIT, { entity, current_version } cho BS_NOT_FOUND và BS_CONFLICT).
 * Lỗi mạng, app cũ và lỗi lạ dùng câu chung của shared/lib/errors.
 */
import {
  BS_LIMITS,
  type BsErrorCode,
  type BsInvalidDetail,
  type BsInvalidReason,
  type BsLimitDetail,
} from '@/modules/bill-split/api/contract'
import { getErrorMessage, toAppError, type AppError } from '@/shared/lib/errors'
import { formatNumber } from '@/shared/lib/format'

/** Câu mặc định cho từng mã lỗi, dùng khi không có chi tiết hoặc chi tiết lạ. */
export const BILL_SPLIT_ERROR_MESSAGES: Readonly<Record<BsErrorCode, string>> = {
  BS_GROUP_NOT_FOUND: 'Không tìm thấy nhóm. Link có thể đã được đổi hoặc nhóm đã bị xóa.',
  BS_NOT_FOUND: 'Dữ liệu này không còn nữa. Có thể người khác vừa xóa.',
  BS_CONFLICT: 'Có người vừa sửa khoản chi này. Tải lại để xem bản mới nhất.',
  BS_MEMBER_IN_USE: 'Thành viên này đã có khoản chi hoặc lần trả nợ nên không xóa được.',
  BS_INVALID: 'Dữ liệu chưa hợp lệ. Kiểm tra lại rồi thử lần nữa.',
  BS_LIMIT: 'Nhóm đã vượt giới hạn cho phép.',
  BS_RATE_LIMITED: 'Đang có quá nhiều nhóm mới được tạo. Thử lại sau ít phút.',
}

const LIMIT_MESSAGES: Readonly<Record<BsLimitDetail['limit'], string>> = {
  members: `Nhóm đã đủ ${BS_LIMITS.membersPerGroup} thành viên.`,
  expenses: `Nhóm đã đạt tối đa ${formatNumber(BS_LIMITS.expensesPerGroup)} khoản chi.`,
  settlements: `Nhóm đã đạt tối đa ${formatNumber(BS_LIMITS.settlementsPerGroup)} lần trả nợ.`,
}

/** Tên trường hiện cho người dùng, khóa là tên tham số bỏ tiền tố p_. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Tên',
  member_names: 'Tên thành viên',
  title: 'Tiêu đề',
  amount: 'Số tiền',
  paid_by: 'Người trả',
  spent_on: 'Ngày chi',
  split_mode: 'Cách chia',
  shares: 'Phần chia',
  note: 'Ghi chú',
  bank_bin: 'Ngân hàng',
  bank_account: 'Số tài khoản',
  bank_account_name: 'Tên chủ tài khoản',
  from_member: 'Người trả',
  to_member: 'Người nhận',
  settled_on: 'Ngày trả',
  tokens: 'Danh sách nhóm',
  member_id: 'Thành viên',
  expense_id: 'Khoản chi',
  settlement_id: 'Lần trả nợ',
}

const REASON_TEMPLATES: Readonly<Record<BsInvalidReason, (label: string) => string>> = {
  required: (label) => `${label} không được để trống.`,
  too_long: (label) => `${label} quá dài.`,
  format: (label) => `${label} không đúng định dạng.`,
  out_of_range: (label) => `${label} nằm ngoài khoảng cho phép.`,
  duplicate: (label) => `${label} bị trùng.`,
  not_in_group: (label) => `${label} không thuộc nhóm này.`,
  same_member: () => 'Người trả và người nhận phải là hai người khác nhau.',
  sum_mismatch: () => 'Tổng các phần chia phải bằng số tiền.',
  unequal_split: () => 'Chia đều thì các phần chỉ được lệch nhau tối đa 1 ₫.',
  empty: (label) => `${label} đang trống.`,
  id_taken: () => 'Mã này đã được dùng ở nơi khác. Thử lại.',
  too_many: (label) => `${label} có quá nhiều mục.`,
}

/** Câu riêng cho những tổ hợp hay gặp, khóa dạng "field:reason". */
const INVALID_OVERRIDES: Readonly<Record<string, string>> = {
  'name:duplicate': 'Đã có người tên này trong nhóm.',
  'name:required': 'Nhập tên.',
  'member_names:duplicate': 'Có hai thành viên trùng tên.',
  'member_names:empty': 'Nhóm cần ít nhất một thành viên.',
  'member_names:required': 'Tên thành viên không được để trống.',
  'member_names:too_long': `Tên thành viên tối đa ${BS_LIMITS.memberName} ký tự.`,
  'title:required': 'Nhập tiêu đề khoản chi.',
  'title:too_long': `Tiêu đề tối đa ${BS_LIMITS.expenseTitle} ký tự.`,
  'amount:out_of_range': 'Số tiền phải từ 1 ₫ tới 999 tỷ ₫.',
  'spent_on:required': 'Chọn ngày chi.',
  'spent_on:out_of_range': 'Ngày chi phải nằm trong khoảng năm 2000 tới 2100.',
  'settled_on:required': 'Chọn ngày trả.',
  'settled_on:out_of_range': 'Ngày trả phải nằm trong khoảng năm 2000 tới 2100.',
  'paid_by:not_in_group': 'Người trả không còn trong nhóm.',
  'from_member:not_in_group': 'Người trả không còn trong nhóm.',
  'to_member:not_in_group': 'Người nhận không còn trong nhóm.',
  'shares:empty': 'Chọn ít nhất một người chịu tiền.',
  'shares:not_in_group': 'Có người trong phần chia không còn thuộc nhóm.',
  'shares:duplicate': 'Một người bị tính hai lần trong phần chia.',
  'shares:too_many': `Một khoản chi chia được cho tối đa ${BS_LIMITS.membersPerGroup} người.`,
  'bank_bin:required': 'Chọn ngân hàng.',
  'bank_bin:format': 'Mã ngân hàng không hợp lệ. Chọn lại ngân hàng.',
  'bank_account:required': 'Nhập số tài khoản.',
  'bank_account:format': `Số tài khoản chỉ gồm chữ và số, tối đa ${BS_LIMITS.bankAccount} ký tự.`,
  'bank_account_name:too_long': `Tên chủ tài khoản tối đa ${BS_LIMITS.bankAccountName} ký tự.`,
  'tokens:too_many': `Chỉ xem được tối đa ${BS_LIMITS.tokensPerLookup} nhóm cùng lúc.`,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Chi tiết của BS_INVALID nếu đúng dạng { field, reason }, để form tô đỏ đúng ô. */
export function getInvalidDetail(error: unknown): BsInvalidDetail | null {
  const appError = toAppError(error)
  if (appError.code !== 'BS_INVALID' || !isRecord(appError.detail)) return null
  const { field, reason } = appError.detail
  if (typeof field !== 'string' || typeof reason !== 'string') return null
  return { field, reason: reason as BsInvalidReason }
}

/** Version hiện tại trên server khi bị BS_CONFLICT, hoặc null nếu không biết. */
export function getConflictVersion(error: unknown): number | null {
  const appError = toAppError(error)
  if (appError.code !== 'BS_CONFLICT' || !isRecord(appError.detail)) return null
  const version = appError.detail.current_version
  return typeof version === 'number' ? version : null
}

export function isBillSplitError(error: unknown, code: BsErrorCode): error is AppError {
  return toAppError(error).code === code
}

/** Câu tiếng Việt cho một lỗi BS_INVALID theo từng trường và lý do. */
export function describeInvalid(detail: BsInvalidDetail): string {
  const override = INVALID_OVERRIDES[`${detail.field}:${detail.reason}`]
  if (override) return override
  const template = REASON_TEMPLATES[detail.reason] as ((label: string) => string) | undefined
  if (!template) return BILL_SPLIT_ERROR_MESSAGES.BS_INVALID
  return template(FIELD_LABELS[detail.field] ?? 'Dữ liệu')
}

function describeApp(error: AppError): string | null {
  const detail = isRecord(error.detail) ? error.detail : null
  switch (error.code) {
    case 'BS_INVALID': {
      const invalid = getInvalidDetail(error)
      return invalid ? describeInvalid(invalid) : null
    }
    case 'BS_LIMIT':
      return typeof detail?.limit === 'string' ? (LIMIT_MESSAGES[detail.limit as BsLimitDetail['limit']] ?? null) : null
    case 'BS_NOT_FOUND':
      return detail?.entity === 'expense' ? 'Khoản chi này không còn nữa. Có thể người khác vừa xóa.' : null
    default:
      return null
  }
}

/** Câu báo lỗi tiếng Việt cho mọi lỗi từ tầng api: lỗi nghiệp vụ BS_*, lỗi mạng, app cũ, lỗi lạ. */
export function getBillSplitErrorMessage(error: unknown): string {
  const appError = toAppError(error)
  const specific = appError.kind === 'app' ? describeApp(appError) : null
  return specific ?? getErrorMessage(appError, BILL_SPLIT_ERROR_MESSAGES)
}
