/**
 * Số dư từng thành viên: net = đã trả - phần phải chịu + đã chuyển đi - đã nhận về.
 * net > 0 được nhận lại tiền, net < 0 còn nợ. Tổng net cả nhóm luôn bằng 0.
 */
import type { Group, MemberBalance } from '@/modules/bill-split/domain/types'

export type BalanceSource = Pick<Group, 'members' | 'expenses' | 'settlements'>

type Totals = Omit<MemberBalance, 'memberId' | 'net'>

/** Trả về mỗi thành viên một dòng, sắp theo position. Id lạ (không thuộc members) bị bỏ qua. */
export function computeBalances(group: BalanceSource): MemberBalance[] {
  const ordered = [...group.members].sort((a, b) => a.position - b.position)
  const totals = new Map<string, Totals>(
    ordered.map((member) => [member.id, { paid: 0, share: 0, sent: 0, received: 0 }]),
  )
  const add = (memberId: string, field: keyof Totals, amount: number) => {
    const row = totals.get(memberId)
    if (row) row[field] += amount
  }

  for (const expense of group.expenses) {
    add(expense.paidBy, 'paid', expense.amount)
    for (const share of expense.shares) add(share.memberId, 'share', share.amount)
  }
  for (const settlement of group.settlements) {
    add(settlement.fromMemberId, 'sent', settlement.amount)
    add(settlement.toMemberId, 'received', settlement.amount)
  }

  return ordered.map((member) => {
    const row = totals.get(member.id) ?? { paid: 0, share: 0, sent: 0, received: 0 }
    return { memberId: member.id, ...row, net: row.paid - row.share + row.sent - row.received }
  })
}
