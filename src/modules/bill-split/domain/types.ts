/**
 * Model phía client của module Chia tiền, đặt tên camelCase.
 *
 * Đây là hợp đồng giữa agent frontend và agent ui-design:
 * - frontend chuyển DTO trong api/contract.ts sang các kiểu này và viết hàm tính toán trả về chúng.
 * - component hiển thị trong components/ nhận các kiểu này qua props, không tự gọi API.
 * Đổi file này phải báo người điều phối.
 */
import type { SplitMode } from '@/modules/bill-split/api/contract'

export type { SplitMode }

export interface BankAccount {
  /** Mã BIN 6 số của ngân hàng theo NAPAS, ví dụ '970436' là Vietcombank. */
  bin: string
  accountNumber: string
  /** Tên chủ tài khoản viết hoa không dấu, có thể để trống. */
  accountName: string | null
}

export interface Member {
  id: string
  name: string
  position: number
  /** null khi chưa nhập đủ ngân hàng và số tài khoản. */
  bank: BankAccount | null
}

export interface Share {
  memberId: string
  amount: number
}

export interface Expense {
  id: string
  title: string
  amount: number
  paidBy: string
  /** YYYY-MM-DD */
  spentOn: string
  splitMode: SplitMode
  note: string | null
  version: number
  createdAt: string
  updatedAt: string
  shares: Share[]
}

export interface Settlement {
  id: string
  fromMemberId: string
  toMemberId: string
  amount: number
  /** YYYY-MM-DD */
  settledOn: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  currency: 'VND'
  createdAt: string
  updatedAt: string
  /** Sắp theo position tăng dần. */
  members: Member[]
  /** Mới nhất trước. */
  expenses: Expense[]
  /** Mới nhất trước. */
  settlements: Settlement[]
}

export interface GroupSummary {
  token: string
  id: string
  name: string
  memberCount: number
  expenseCount: number
  totalSpent: number
  updatedAt: string
}

/**
 * Số dư của một thành viên.
 * net = paid - share + sent - received.
 * net > 0: người này được nhận lại tiền. net < 0: người này còn nợ. 0: hòa.
 */
export interface MemberBalance {
  memberId: string
  /** Tổng tiền đã trả cho các khoản chi. */
  paid: number
  /** Tổng phần phải chịu trong các khoản chi. */
  share: number
  /** Tổng đã trả lại cho người khác. */
  sent: number
  /** Tổng đã được người khác trả lại. */
  received: number
  net: number
}

/** Một lần chuyển khoản: fromMemberId trả cho toMemberId. */
export interface Transfer {
  fromMemberId: string
  toMemberId: string
  amount: number
}

export interface Bank {
  bin: string
  /** Mã viết tắt, ví dụ 'VCB'. */
  code: string
  /** Tên ngắn, ví dụ 'Vietcombank'. */
  shortName: string
  /** Tên đầy đủ. */
  name: string
}

export type MoneyParseError = 'empty' | 'invalid' | 'fraction' | 'zero' | 'too_large'

export type MoneyParseResult = { ok: true; value: number } | { ok: false; error: MoneyParseError }

/** Trạng thái form khoản chi. Giữ nguyên chữ người dùng gõ để không mất "1tr2" khi đang sửa. */
export interface ExpenseDraft {
  /** Id do client sinh sẵn khi mở form tạo mới. */
  id: string
  /** null khi tạo mới, bằng version hiện tại khi sửa. */
  version: number | null
  title: string
  amountText: string
  paidBy: string | null
  /** YYYY-MM-DD */
  spentOn: string
  splitMode: SplitMode
  /** Chia đều: những người tham gia. */
  participantIds: string[]
  /** Chia riêng: memberId sang chữ đã gõ. Ô trống nghĩa là 0. */
  exactAmountTexts: Record<string, string>
  note: string
}

export type SplitIssue =
  | { kind: 'title_required' }
  | { kind: 'amount'; error: MoneyParseError }
  | { kind: 'no_payer' }
  | { kind: 'no_participants' }
  | { kind: 'exact_amount'; memberId: string; error: MoneyParseError }
  | { kind: 'sum_mismatch'; remaining: number }

/** Kết quả tính từ ExpenseDraft, dùng để xem trước trên form và để gửi lên server khi hợp lệ. */
export interface SplitPreview {
  amount: MoneyParseResult
  /** Phần chia đã tính, chỉ gồm người có phần, sắp theo position. */
  shares: Share[]
  /** Tổng đã chia. */
  assigned: number
  /** Số tiền còn thiếu so với tổng. Âm nghĩa là chia lố. */
  remaining: number
  /** Rỗng nghĩa là lưu được. */
  issues: SplitIssue[]
}
