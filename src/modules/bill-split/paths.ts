/**
 * Đường dẫn của module và đọc link nhóm do người dùng dán vào.
 * Mọi nơi dựng URL hay điều hướng đều đi qua đây, không viết tay chuỗi đường dẫn.
 */
import { TOKEN_PATTERN } from '@/modules/bill-split/api/contract'

export const BILL_SPLIT_BASE_PATH = '/bill-split'

export const billSplitPaths = {
  home: (): string => BILL_SPLIT_BASE_PATH,
  newGroup: (): string => `${BILL_SPLIT_BASE_PATH}/new`,
  group: (token: string): string => `${BILL_SPLIT_BASE_PATH}/g/${encodeURIComponent(token)}`,
  newExpense: (token: string): string => `${billSplitPaths.group(token)}/expense/new`,
  expense: (token: string, expenseId: string): string =>
    `${billSplitPaths.group(token)}/expense/${encodeURIComponent(expenseId)}`,
}

/** Giá trị của tham số ?tab= trên trang nhóm, theo từng phần của trang. "chi-tieu" là mặc định và không cần ghi ra URL. */
export const GROUP_TAB_PARAMS = { expenses: 'chi-tieu', balances: 'so-du', members: 'thanh-vien' } as const

export type GroupTab = keyof typeof GROUP_TAB_PARAMS

/** Đọc ?tab= thành phần của trang nhóm. Thiếu hoặc lạ thì về Chi tiêu. */
export function parseGroupTab(value: string | null | undefined): GroupTab {
  const found = (Object.keys(GROUP_TAB_PARAMS) as GroupTab[]).find((tab) => GROUP_TAB_PARAMS[tab] === value)
  return found ?? 'expenses'
}

/** Đường dẫn trang nhóm mở sẵn một phần, ví dụ sau khi đổi link nhóm thì mở lại tab Thành viên. */
export function groupTabPath(token: string, tab: GroupTab): string {
  const base = billSplitPaths.group(token)
  return tab === 'expenses' ? base : `${base}?tab=${GROUP_TAB_PARAMS[tab]}`
}

/** Link đầy đủ để chia sẻ cho bạn bè, ví dụ groupLink(window.location.origin, token). */
export function groupLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${billSplitPaths.group(token)}`
}

/** Tìm đoạn /bill-split/g/<token> ở bất kỳ đâu trong chuỗi, token là đúng 24 ký tự base64url. */
const GROUP_LINK_PATTERN = /(?:^|\/)bill-split\/g\/([A-Za-z0-9_-]{24})(?![A-Za-z0-9_-])/

/**
 * Lấy token từ thứ người dùng dán: link đầy đủ (https://.../bill-split/g/<token>?...), đường dẫn
 * (/bill-split/g/<token>/expense/new), đoạn chat có chứa link, hoặc đúng token trần. Không hợp lệ thì null.
 */
export function parseGroupLink(input: string): string | null {
  const text = typeof input === 'string' ? input.trim() : ''
  if (TOKEN_PATTERN.test(text)) return text
  return GROUP_LINK_PATTERN.exec(text)?.[1] ?? null
}
