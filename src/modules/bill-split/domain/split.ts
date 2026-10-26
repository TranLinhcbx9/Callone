/**
 * Chia một khoản chi cho các thành viên và kiểm tra form khoản chi.
 * Mọi phép tính là số nguyên đồng, tổng các phần chia luôn đúng bằng số tiền.
 */
import { parseMoney, parseShareAmount } from '@/modules/bill-split/domain/money'
import type { ExpenseDraft, Member, Share, SplitIssue, SplitPreview } from '@/modules/bill-split/domain/types'

/**
 * Chia đều amount cho các người tham gia (theo thứ tự position). Mỗi người được phần nguyên của phép chia.
 * Số đồng lẻ còn lại (luôn nhỏ hơn số người) phát mỗi người 1 đồng: người trả trước nếu có tham gia,
 * rồi tới các người tham gia theo thứ tự. Nhờ vậy hai phần chia bất kỳ lệch nhau nhiều nhất 1 đồng.
 * Trả về đủ mọi người tham gia, kể cả phần bằng 0 khi amount nhỏ hơn số người.
 */
export function splitEqually(amount: number, participantIds: readonly string[], payerId: string | null): Share[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Số tiền phải là số nguyên không âm, nhận được ${amount}`)
  }
  const ids = [...new Set(participantIds)]
  if (ids.length === 0) return []

  const leftover = amount % ids.length
  const base = (amount - leftover) / ids.length
  const leftoverOrder =
    payerId !== null && ids.includes(payerId) ? [payerId, ...ids.filter((id) => id !== payerId)] : ids
  const getsExtra = new Set(leftoverOrder.slice(0, leftover))
  return ids.map((memberId) => ({ memberId, amount: base + (getsExtra.has(memberId) ? 1 : 0) }))
}

/**
 * Tính xem trước từ trạng thái form. Không ném lỗi: mọi vấn đề của form nằm trong issues,
 * issues rỗng nghĩa là lưu được và shares là phần chia sẽ gửi lên server.
 *
 * - Chia đều: những người trong participantIds (bỏ id không còn trong nhóm) chia đều số tiền.
 * - Chia riêng: ô để trống hoặc 0 nghĩa là không chịu phần nào, phải cộng đúng bằng tổng.
 * - shares chỉ gồm người có phần lớn hơn 0, sắp theo position.
 * - remaining = tổng tiền trừ tổng đã chia, âm nghĩa là chia lố. Bằng 0 khi chưa đọc được tổng tiền.
 */
export function computeSplitPreview(draft: ExpenseDraft, members: readonly Member[]): SplitPreview {
  const ordered = [...members].sort((a, b) => a.position - b.position)
  const memberIds = new Set(ordered.map((member) => member.id))
  const amount = parseMoney(draft.amountText)
  const payerId = draft.paidBy !== null && memberIds.has(draft.paidBy) ? draft.paidBy : null

  const issues: SplitIssue[] = []
  if (draft.title.trim() === '') issues.push({ kind: 'title_required' })
  if (!amount.ok) issues.push({ kind: 'amount', error: amount.error })
  if (payerId === null) issues.push({ kind: 'no_payer' })

  let shares: Share[] = []
  if (draft.splitMode === 'equal') {
    const selected = new Set(draft.participantIds)
    const participantIds = ordered.filter((member) => selected.has(member.id)).map((member) => member.id)
    if (participantIds.length === 0) issues.push({ kind: 'no_participants' })
    else if (amount.ok) shares = splitEqually(amount.value, participantIds, payerId)
  } else {
    for (const member of ordered) {
      const parsed = parseShareAmount(draft.exactAmountTexts[member.id] ?? '')
      if (!parsed.ok) issues.push({ kind: 'exact_amount', memberId: member.id, error: parsed.error })
      else shares.push({ memberId: member.id, amount: parsed.value })
    }
  }
  shares = shares.filter((share) => share.amount > 0)

  const assigned = shares.reduce((sum, share) => sum + share.amount, 0)
  const remaining = amount.ok ? amount.value - assigned : 0
  if (draft.splitMode === 'exact' && amount.ok && remaining !== 0) issues.push({ kind: 'sum_mismatch', remaining })

  return { amount, shares, assigned, remaining, issues }
}
