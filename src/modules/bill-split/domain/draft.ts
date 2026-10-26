/**
 * Vòng đời của form khoản chi: tạo bản nháp trống, nạp khoản chi có sẵn để sửa,
 * và đổi bản nháp hợp lệ thành dữ liệu gửi lên server.
 */
import { isIsoDate } from '@/shared/lib/date'
import { amountToInputText } from '@/modules/bill-split/domain/money'
import { computeSplitPreview } from '@/modules/bill-split/domain/split'
import type { ExpenseInput, SettlementInput } from '@/modules/bill-split/domain/inputs'
import type { Expense, ExpenseDraft, Member, Settlement, SplitPreview } from '@/modules/bill-split/domain/types'

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
