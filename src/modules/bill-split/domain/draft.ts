/**
 * Vòng đời của form khoản chi: tạo bản nháp trống, nạp khoản chi có sẵn để sửa,
 * và đổi bản nháp hợp lệ thành dữ liệu gửi lên server.
 */
import { isIsoDate } from '@/shared/lib/date'
import { amountToInputText } from '@/modules/bill-split/domain/money'
import { computeSplitPreview } from '@/modules/bill-split/domain/split'
import type { ExpenseInput, SettlementInput } from '@/modules/bill-split/domain/inputs'
import type { Expense, ExpenseDraft, Member, Settlement, Share, SplitPreview } from '@/modules/bill-split/domain/types'

/** Ngày khoản chi và ngày trả nợ phải từ 2000-01-01 tới 2100-12-31, giống ràng buộc ở database. */
export function isValidBillDate(iso: string): boolean {
  return isIsoDate(iso) && iso >= '2000-01-01' && iso <= '2100-12-31'
}

export interface NewDraftOptions {
  /** Id sinh sẵn bằng newId(), giữ nguyên cho tới khi lưu để bấm hai lần không tạo hai khoản. */
  id: string
  /** Ngày hôm nay YYYY-MM-DD theo giờ Việt Nam (todayIsoDate()). */
  today: string
  members: readonly Member[]
  /** Người trả mặc định, thường là "mình". Bỏ qua nếu không còn trong nhóm. */
  paidBy?: string | null
}

/** Bản nháp mới: chia đều cho cả nhóm, hôm nay, chưa có tiêu đề và số tiền. */
export function createExpenseDraft({ id, today, members, paidBy = null }: NewDraftOptions): ExpenseDraft {
  const ordered = [...members].sort((a, b) => a.position - b.position)
  return {
    id,
    version: null,
    title: '',
    amountText: '',
    paidBy: paidBy !== null && ordered.some((member) => member.id === paidBy) ? paidBy : null,
    spentOn: today,
    splitMode: 'equal',
    participantIds: ordered.map((member) => member.id),
    exactAmountTexts: {},
    note: '',
  }
}

/**
 * Nạp khoản chi có sẵn vào form sửa. Người có phần 0 đồng không nằm trong shares nên không được chọn lại
 * (chỉ xảy ra khi chia đều số tiền nhỏ hơn số người).
 */
export function draftFromExpense(expense: Expense): ExpenseDraft {
  return {
    id: expense.id,
    version: expense.version,
    title: expense.title,
    amountText: amountToInputText(expense.amount),
    paidBy: expense.paidBy,
    spentOn: expense.spentOn,
    splitMode: expense.splitMode,
    participantIds: expense.shares.map((share) => share.memberId),
    exactAmountTexts:
      expense.splitMode === 'exact'
        ? Object.fromEntries(expense.shares.map((share) => [share.memberId, amountToInputText(share.amount)]))
        : {},
    note: expense.note ?? '',
  }
}

/**
 * Khoản chi có sẵn thành dữ liệu gửi lên. Mặc định gửi kèm version hiện tại để sửa.
 * Hoàn tác xóa thì truyền expectedVersion = null: server tạo lại khoản chi với đúng id cũ.
 */
export function expenseToInput(expense: Expense, expectedVersion: number | null = expense.version): ExpenseInput {
  return {
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    paidBy: expense.paidBy,
    spentOn: expense.spentOn,
    splitMode: expense.splitMode,
    shares: expense.shares.map((share) => ({ memberId: share.memberId, amount: share.amount })),
    note: expense.note,
    expectedVersion,
  }
}

/** Lần trả nợ có sẵn thành dữ liệu gửi lên, dùng để hoàn tác khi vừa xóa nhầm (lưu lại đúng id cũ). */
export function settlementToInput(settlement: Settlement): SettlementInput {
  return {
    id: settlement.id,
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amount: settlement.amount,
    settledOn: settlement.settledOn,
    note: settlement.note,
  }
}

export type DraftResult =
  | { ok: true; input: ExpenseInput; preview: SplitPreview }
  | { ok: false; preview: SplitPreview; dateInvalid: boolean }

/**
 * Kiểm tra bản nháp. Hợp lệ thì trả dữ liệu gửi lên. Nếu không, trả preview (issues cho các ô của form)
 * và dateInvalid khi ngày trống hoặc ngoài khoảng cho phép, vì SplitIssue không có loại lỗi ngày.
 */
export function draftToInput(draft: ExpenseDraft, members: readonly Member[]): DraftResult {
  const preview = computeSplitPreview(draft, members)
  const dateInvalid = !isValidBillDate(draft.spentOn)
  if (dateInvalid || preview.issues.length > 0 || !preview.amount.ok || draft.paidBy === null) {
    return { ok: false, preview, dateInvalid }
  }

  const note = draft.note.trim()
  return {
    ok: true,
    preview,
    input: {
      id: draft.id,
      title: draft.title.trim(),
      amount: preview.amount.value,
      paidBy: draft.paidBy,
      spentOn: draft.spentOn,
      splitMode: draft.splitMode,
      shares: preview.shares,
      note: note === '' ? null : note,
      expectedVersion: draft.version,
    },
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a)
  return ids.size === new Set(b).size && b.every((id) => ids.has(id))
}

/** Các ô số riêng đã gõ gì đó: ô để trống hoặc chỉ khoảng trắng coi như không có (parseShareAmount cũng hiểu là 0). */
function filledAmountTexts(texts: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(texts)
    .filter(([, text]) => text.trim() !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Hai bản nháp có cùng nội dung không, để biết người dùng đã sửa form chưa (hỏi xác nhận trước khi thoát).
 * Chỉ so phần của cách chia đang dùng: người tham gia khi chia đều, ô số riêng khi chia riêng. Thứ tự người tham gia
 * và ô số riêng bỏ trống không tính là khác biệt.
 */
export function draftsEqual(a: ExpenseDraft, b: ExpenseDraft): boolean {
  if (
    a.id !== b.id ||
    a.version !== b.version ||
    a.title !== b.title ||
    a.amountText !== b.amountText ||
    a.paidBy !== b.paidBy ||
    a.spentOn !== b.spentOn ||
    a.splitMode !== b.splitMode ||
    a.note !== b.note
  ) {
    return false
  }
  if (a.splitMode === 'equal') return sameIds(a.participantIds, b.participantIds)
  return JSON.stringify(filledAmountTexts(a.exactAmountTexts)) === JSON.stringify(filledAmountTexts(b.exactAmountTexts))
}

function sharesByMember(shares: readonly Share[]): [string, number][] {
  return shares
    .filter((share) => share.amount > 0)
    .map((share): [string, number] => [share.memberId, share.amount])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Khoản chi trên server đã có đúng nội dung của dữ liệu định gửi lên chưa (tiêu đề, số tiền, người trả, ngày, cách chia,
 * ghi chú, phần chia; bỏ qua id, version và thời điểm). Dùng khi lưu sửa bị báo xung đột: nếu bản mới nhất trên server
 * giống hệt thứ người dùng vừa lưu thì đó là lần lưu trước đã thành công nhưng mất phản hồi, không phải người khác sửa.
 */
export function expenseMatchesInput(expense: Expense, input: ExpenseInput): boolean {
  return (
    expense.title === input.title &&
    expense.amount === input.amount &&
    expense.paidBy === input.paidBy &&
    expense.spentOn === input.spentOn &&
    expense.splitMode === input.splitMode &&
    (expense.note ?? null) === (input.note ?? null) &&
    JSON.stringify(sharesByMember(expense.shares)) === JSON.stringify(sharesByMember(input.shares))
  )
}
