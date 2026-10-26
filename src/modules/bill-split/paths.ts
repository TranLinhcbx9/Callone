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
