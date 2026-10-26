/**
 * Gợi ý chuyển khoản để mọi người hòa nợ với ít giao dịch nhất.
 *
 * Số giao dịch tối thiểu = (số người còn số dư khác 0) - (số nhóm con có tổng bằng 0 nhiều nhất có thể tách ra).
 * Mỗi nhóm con k người luôn hòa được bằng đúng k - 1 giao dịch. Tham lam "người nợ nhiều nhất trả người
 * được nợ nhiều nhất" không đảm bảo điều này: [+4, +3, +2, -5, -4] tham lam ra 4 giao dịch, tối ưu là 3.
 *
 * - Tối đa 16 người còn số dư: quy hoạch động trên tập con (2^16 trạng thái) tìm cách tách nhiều nhóm nhất,
 *   rồi hòa từng nhóm bằng cách tham lam. Cách này chính xác.
 * - Nhiều hơn 16 người: chỉ tham lam trên cả nhóm, nhiều nhất n - 1 giao dịch.
 *
 * Kết quả chỉ phụ thuộc vào số dư và position của thành viên, không phụ thuộc thứ tự mảng truyền vào,
 * nên máy nào cũng ra cùng một kế hoạch.
 */
import type { Member, MemberBalance, Transfer } from '@/modules/bill-split/domain/types'

/** Số người còn số dư tối đa để dùng thuật toán chính xác. */
export const EXACT_SETTLE_LIMIT = 16

interface Party {
  memberId: string
  /** Số dư: dương được nhận, âm phải trả. */
  net: number
  /** Thứ hạng theo position, dùng để chọn khi hòa. */
  rank: number
}

/** Thứ hạng từng id: thành viên theo (position, id), id lạ xếp sau theo id. */
function buildRanks(members: readonly Member[], balances: readonly MemberBalance[]): Map<string, number> {
  const known = [...members].sort((a, b) => a.position - b.position || compareText(a.id, b.id)).map((m) => m.id)
  const knownSet = new Set(known)
  const unknown = [...new Set(balances.map((b) => b.memberId))].filter((id) => !knownSet.has(id)).sort(compareText)
  return new Map([...known, ...unknown].map((id, index) => [id, index]))
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function popCount(mask: number): number {
  let count = 0
  for (let rest = mask; rest !== 0; rest &= rest - 1) count++
  return count
}

function indexOfLargest(items: readonly { left: number; rank: number }[]): number {
  let best = 0
  items.forEach((item, index) => {
    const current = items[best]
    if (current && (item.left > current.left || (item.left === current.left && item.rank < current.rank))) best = index
  })
  return best
}

/** Hòa nợ bằng cách cho người nợ nhiều nhất trả người được nợ nhiều nhất, lặp tới khi hết. */
function settleGreedily(parties: readonly Party[]): Transfer[] {
  const debtors = parties.filter((p) => p.net < 0).map((p) => ({ ...p, left: -p.net }))
  const creditors = parties.filter((p) => p.net > 0).map((p) => ({ ...p, left: p.net }))
  const transfers: Transfer[] = []

  while (debtors.length > 0 && creditors.length > 0) {
    const debtorIndex = indexOfLargest(debtors)
    const creditorIndex = indexOfLargest(creditors)
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    if (!debtor || !creditor) break

    const amount = Math.min(debtor.left, creditor.left)
    transfers.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amount })
    debtor.left -= amount
    creditor.left -= amount
    if (debtor.left === 0) debtors.splice(debtorIndex, 1)
    if (creditor.left === 0) creditors.splice(creditorIndex, 1)
  }
  return transfers
}

/** Tách tập người thành nhiều nhóm tổng bằng 0 nhất có thể. Trả về mỗi nhóm là một bitmask. */
function splitIntoZeroSumGroups(parties: readonly Party[]): number[] {
  const count = parties.length
  const fullMask = (1 << count) - 1
  const sums = new Float64Array(fullMask + 1)
  // best[mask] = số nhóm tổng 0 nhiều nhất tách được từ mask (xét mọi thứ tự xếp người, đếm số tiền tố có tổng 0).
  const best = new Uint8Array(fullMask + 1)

  for (let mask = 1; mask <= fullMask; mask++) {
    const lowBit = mask & -mask
    sums[mask] = (sums[mask ^ lowBit] ?? 0) + (parties[31 - Math.clz32(lowBit)]?.net ?? 0)
    let top = 0
    for (let index = 0; index < count; index++) {
      const bit = 1 << index
      if (mask & bit) top = Math.max(top, best[mask ^ bit] ?? 0)
    }
    best[mask] = top + (sums[mask] === 0 ? 1 : 0)
  }

  // Dựng lại một cách tách tối ưu, chọn có quy tắc để kết quả cố định: nhóm chứa người đứng đầu (position nhỏ nhất)
  // là nhóm nhỏ nhất có thể, hòa thì lấy bitmask nhỏ hơn. Rồi lặp với phần còn lại.
  const groups: number[] = []
  let rest = fullMask
  while (rest !== 0) {
    const lowBit = rest & -rest
    const target = best[rest] ?? 0
    const others = rest ^ lowBit
    let chosen = rest
    let chosenSize = Number.POSITIVE_INFINITY
    for (let sub = others; ; sub = (sub - 1) & others) {
      const candidate = sub | lowBit
      if (sums[candidate] === 0 && (best[rest ^ candidate] ?? 0) === target - 1) {
        const size = popCount(candidate)
        if (size < chosenSize || (size === chosenSize && candidate < chosen)) {
          chosen = candidate
          chosenSize = size
        }
      }
      if (sub === 0) break
    }
    groups.push(chosen)
    rest ^= chosen
  }
  return groups
}

function settleExactly(parties: readonly Party[]): Transfer[] {
  return splitIntoZeroSumGroups(parties).flatMap((mask) =>
    settleGreedily(parties.filter((_, index) => (mask & (1 << index)) !== 0)),
  )
}

/**
 * Gợi ý các lần chuyển khoản để mọi số dư về 0. fromMemberId là người nợ (net < 0) trả cho toMemberId
 * (net > 0). Số tiền là số nguyên dương. Kết quả sắp theo position của người trả, rồi người nhận.
 */
export function suggestTransfers(balances: readonly MemberBalance[], members: readonly Member[]): Transfer[] {
  const ranks = buildRanks(members, balances)
  const rankOf = (memberId: string) => ranks.get(memberId) ?? Number.MAX_SAFE_INTEGER

  const parties: Party[] = balances
    .filter((balance) => balance.net !== 0)
    .map((balance) => ({ memberId: balance.memberId, net: balance.net, rank: rankOf(balance.memberId) }))
    .sort((a, b) => a.rank - b.rank)
  if (parties.length < 2) return []

  const balanced = parties.reduce((sum, party) => sum + party.net, 0) === 0
  const transfers =
    balanced && parties.length <= EXACT_SETTLE_LIMIT ? settleExactly(parties) : settleGreedily(parties)
  return transfers.sort(
    (a, b) => rankOf(a.fromMemberId) - rankOf(b.fromMemberId) || rankOf(a.toMemberId) - rankOf(b.toMemberId),
  )
}
