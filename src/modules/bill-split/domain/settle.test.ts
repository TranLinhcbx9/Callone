// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { EXACT_SETTLE_LIMIT, suggestTransfers } from '@/modules/bill-split/domain/settle'
import { splitEqually } from '@/modules/bill-split/domain/split'
import { makeExpense, makeGroup, makeMembers, makeSettlement } from '@/modules/bill-split/domain/testing/fixtures'
import { createRng, type Rng } from '@/modules/bill-split/domain/testing/prng'
import type { MemberBalance, Transfer } from '@/modules/bill-split/domain/types'

function balance(memberId: string, net: number): MemberBalance {
  return { memberId, paid: 0, share: 0, sent: 0, received: 0, net }
}

function balancesOf(nets: number[]): MemberBalance[] {
  return nets.map((net, index) => balance(`m${index}`, net))
}

const membersFor = (balances: MemberBalance[]) => makeMembers(balances.map((b) => b.memberId))

/** Số dư còn lại sau khi thực hiện các lần chuyển khoản: người chuyển tăng, người nhận giảm. */
function applyTransfers(balances: MemberBalance[], transfers: Transfer[]): Map<string, number> {
  const nets = new Map(balances.map((b) => [b.memberId, b.net]))
  for (const t of transfers) {
    nets.set(t.fromMemberId, (nets.get(t.fromMemberId) ?? 0) + t.amount)
    nets.set(t.toMemberId, (nets.get(t.toMemberId) ?? 0) - t.amount)
  }
  return nets
}

function expectValidPlan(balances: MemberBalance[], transfers: Transfer[]) {
  for (const t of transfers) {
    expect(Number.isSafeInteger(t.amount) && t.amount > 0, JSON.stringify(t)).toBe(true)
    expect(t.fromMemberId).not.toBe(t.toMemberId)
  }
  for (const [id, net] of applyTransfers(balances, transfers)) expect(net === 0, `${id}: còn lại ${net}`).toBe(true)
  const pairs = transfers.map((t) => `${t.fromMemberId}>${t.toMemberId}`)
  expect(new Set(pairs).size).toBe(pairs.length)
}

/** Tham lam: người nợ nhiều nhất trả người được nợ nhiều nhất. Dùng để so sánh, không phải thuật toán chính. */
function greedyCount(nets: number[]): number {
  const left = nets.filter((n) => n !== 0)
  let count = 0
  for (;;) {
    const maxIndex = left.indexOf(Math.max(...left))
    const minIndex = left.indexOf(Math.min(...left))
    if (left[maxIndex] === 0 || left[minIndex] === 0) return count
    const pay = Math.min(left[maxIndex] as number, -(left[minIndex] as number))
    left[maxIndex] = (left[maxIndex] as number) - pay
    left[minIndex] = (left[minIndex] as number) + pay
    count++
  }
}

/** Vét cạn: lần lượt hòa người đầu tiên còn dư với một người trái dấu, thử mọi cách chọn. Số giao dịch ít nhất. */
function bruteForceMinTransfers(nets: number[]): number {
  const work = nets.filter((n) => n !== 0)
  const solve = (start: number): number => {
    let first = start
    while (first < work.length && work[first] === 0) first++
    if (first === work.length) return 0
    const value = work[first] as number
    let best = Number.POSITIVE_INFINITY
    for (let other = first + 1; other < work.length; other++) {
      const target = work[other] as number
      if (value * target >= 0) continue
      work[other] = target + value
      best = Math.min(best, 1 + solve(first + 1))
      work[other] = target
    }
    return best
  }
  return solve(0)
}

/** Cách vét cạn thứ hai: số nhóm tổng 0 nhiều nhất bằng đệ quy trên tập con. Số giao dịch ít nhất = n - số nhóm. */
function maxZeroSumGroups(nets: number[]): number {
  const work = nets.filter((n) => n !== 0)
  const size = 1 << work.length
  const sums = new Array<number>(size).fill(0)
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask
    sums[mask] = (sums[mask ^ low] as number) + (work[31 - Math.clz32(low)] as number)
  }
  const memo = new Map<number, number>()
  const solve = (mask: number): number => {
    if (mask === 0) return 0
    const cached = memo.get(mask)
    if (cached !== undefined) return cached
    const low = mask & -mask
    const others = mask ^ low
    let best = -1
    for (let sub = others; ; sub = (sub - 1) & others) {
      const group = sub | low
      if (sums[group] === 0) {
        const rest = solve(mask ^ group)
        if (rest >= 0) best = Math.max(best, rest + 1)
      }
      if (sub === 0) break
    }
    memo.set(mask, best)
    return best
  }
  return solve(size - 1)
}

/** n số nguyên trong [-spread, spread] có tổng bằng 0. */
function randomNets(rng: Rng, count: number, spread: number): number[] {
  const nets = Array.from({ length: count - 1 }, () => rng.int(-spread, spread))
  nets.push(0 - nets.reduce((sum, value) => sum + value, 0))
  return rng.shuffle(nets)
}

describe('suggestTransfers: ví dụ cụ thể', () => {
  it('[+4, +3, +2, -5, -4] chỉ cần 3 giao dịch, tham lam thì ra 4', () => {
    const nets = [4, 3, 2, -5, -4]
    expect(greedyCount(nets)).toBe(4)

    const balances = balancesOf(nets)
    const transfers = suggestTransfers(balances, membersFor(balances))
    expect(transfers).toHaveLength(3)
    expectValidPlan(balances, transfers)
    // Nhóm {+4, -4} và nhóm {+3, +2, -5}.
    expect(transfers).toEqual([
      { fromMemberId: 'm3', toMemberId: 'm1', amount: 3 },
      { fromMemberId: 'm3', toMemberId: 'm2', amount: 2 },
      { fromMemberId: 'm4', toMemberId: 'm0', amount: 4 },
    ])
  })

  it('không ai nợ ai thì không có giao dịch', () => {
    expect(suggestTransfers([], [])).toEqual([])
    expect(suggestTransfers(balancesOf([0, 0, 0]), makeMembers(['m0', 'm1', 'm2']))).toEqual([])
  })

  it('một cặp: người nợ trả người được nợ', () => {
    const balances = balancesOf([100_000, -100_000])
    expect(suggestTransfers(balances, membersFor(balances))).toEqual([
      { fromMemberId: 'm1', toMemberId: 'm0', amount: 100_000 },
    ])
  })

  it('một người được nhận, hai người nợ: 2 giao dịch', () => {
    const balances = balancesOf([300, -100, -200])
    expect(suggestTransfers(balances, membersFor(balances))).toEqual([
      { fromMemberId: 'm1', toMemberId: 'm0', amount: 100 },
      { fromMemberId: 'm2', toMemberId: 'm0', amount: 200 },
    ])
  })

  it('bỏ qua người có số dư 0', () => {
    const balances = balancesOf([0, 50, 0, -50, 0])
    expect(suggestTransfers(balances, membersFor(balances))).toEqual([
      { fromMemberId: 'm3', toMemberId: 'm1', amount: 50 },
    ])
  })

  it('hai nhóm tách được thì không gộp lại: 4 người chỉ cần 2 giao dịch', () => {
    const balances = balancesOf([100, 100, -100, -100])
    const transfers = suggestTransfers(balances, membersFor(balances))
    expect(transfers).toHaveLength(2)
    // Hòa thì người đứng đầu danh sách ghép với người hợp sớm nhất: m0 với m2, m1 với m3.
    expect(transfers).toEqual([
      { fromMemberId: 'm2', toMemberId: 'm0', amount: 100 },
      { fromMemberId: 'm3', toMemberId: 'm1', amount: 100 },
    ])
  })

  it('đủ cặp trùng số tiền thì mỗi cặp một giao dịch', () => {
    const balances = balancesOf([5, 7, 9, -9, -7, -5])
    expect(suggestTransfers(balances, membersFor(balances))).toHaveLength(3)
  })

  it('số tiền lớn vẫn là số nguyên chính xác', () => {
    const balances = balancesOf([600_000_000_000, -250_000_000_000, -350_000_000_000])
    const transfers = suggestTransfers(balances, membersFor(balances))
    expect(transfers).toHaveLength(2)
    expectValidPlan(balances, transfers)
  })

  it('id không có trong danh sách thành viên xếp sau cùng nhưng vẫn được hòa nợ', () => {
    const balances = [balance('x2', -30), balance('m1', 30), balance('x1', 10), balance('m0', -10)]
    const transfers = suggestTransfers(balances, makeMembers(['m0', 'm1']))
    expectValidPlan(balances, transfers)
    expect(transfers).toHaveLength(2)
  })

  it('tổng số dư khác 0 (dữ liệu hỏng) thì không ném lỗi, vẫn chỉ ra giao dịch hợp lệ', () => {
    const balances = balancesOf([100, -40, -30])
    const transfers = suggestTransfers(balances, membersFor(balances))
    expect(transfers).toEqual([
      { fromMemberId: 'm1', toMemberId: 'm0', amount: 40 },
      { fromMemberId: 'm2', toMemberId: 'm0', amount: 30 },
    ])
  })

  it('không sửa dữ liệu đầu vào', () => {
    const balances = balancesOf([4, 3, 2, -5, -4])
    const members = membersFor(balances)
    const before = JSON.stringify([balances, members])
    suggestTransfers(balances, members)
    expect(JSON.stringify([balances, members])).toBe(before)
  })

  it('từ số dư thật của nhóm: trả xong theo gợi ý thì mọi người hòa', () => {
    const members = makeMembers(['A', 'B', 'C', 'D'])
    const group = makeGroup(
      members,
      [
        makeExpense('e1', 'A', 1_200_000, splitEqually(1_200_000, ['A', 'B', 'C', 'D'], 'A')),
        makeExpense('e2', 'B', 450_000, splitEqually(450_000, ['B', 'C', 'D'], 'B')),
        makeExpense('e3', 'C', 90_001, splitEqually(90_001, ['A', 'C'], 'C')),
      ],
      [makeSettlement('s1', 'D', 'A', 100_000)],
    )
    const balances = computeBalances(group)
    const transfers = suggestTransfers(balances, members)
    expectValidPlan(balances, transfers)
    expect(transfers.length).toBeLessThanOrEqual(3)
  })
})

describe('suggestTransfers: so với vét cạn (seed cố định)', () => {
  it('đúng số giao dịch ít nhất cho 2 tới 7 người, số dư nhỏ nên hay có nhóm tổng 0', () => {
    const rng = createRng(20261026)
    for (let i = 0; i < 2500; i++) {
      const nets = randomNets(rng, rng.int(2, 7), rng.pick([3, 6, 12]))
      const balances = balancesOf(nets)
      const transfers = suggestTransfers(balances, membersFor(balances))
      expectValidPlan(balances, transfers)
      expect(transfers.length, JSON.stringify(nets)).toBe(bruteForceMinTransfers(nets))
    }
  })

  it('đúng số giao dịch ít nhất cho tới 11 người so với cách đếm nhóm tổng 0 bằng đệ quy', () => {
    const rng = createRng(31415)
    for (let i = 0; i < 120; i++) {
      const nets = randomNets(rng, rng.int(8, 11), rng.pick([2, 4, 8]))
      const balances = balancesOf(nets)
      const transfers = suggestTransfers(balances, membersFor(balances))
      expectValidPlan(balances, transfers)
      const nonZero = nets.filter((n) => n !== 0).length
      expect(transfers.length, JSON.stringify(nets)).toBe(nonZero === 0 ? 0 : nonZero - maxZeroSumGroups(nets))
    }
  })

  it('không bao giờ tệ hơn tham lam và luôn hòa hết nợ, kể cả ở đúng giới hạn 16 người', () => {
    const rng = createRng(2718)
    for (let i = 0; i < 40; i++) {
      const nets = randomNets(rng, rng.int(12, EXACT_SETTLE_LIMIT), rng.pick([3, 10, 1000]))
      const balances = balancesOf(nets)
      const transfers = suggestTransfers(balances, membersFor(balances))
      expectValidPlan(balances, transfers)
      expect(transfers.length).toBeLessThanOrEqual(greedyCount(nets))
    }
  })

  it('trên 16 người dùng tham lam: vẫn hòa hết nợ, tối đa n - 1 giao dịch', () => {
    const rng = createRng(1618)
    for (const count of [EXACT_SETTLE_LIMIT + 1, 20, 33, 50]) {
      for (let i = 0; i < 10; i++) {
        const nets = randomNets(rng, count, rng.pick([5, 1000, 1_000_000_000]))
        const balances = balancesOf(nets)
        const transfers = suggestTransfers(balances, membersFor(balances))
        expectValidPlan(balances, transfers)
        expect(transfers.length).toBeLessThanOrEqual(nets.filter((n) => n !== 0).length - 1)
        expect(transfers.length).toBe(greedyCount(nets))
      }
    }
  })

  it('số tiền lớn đến 999 tỷ vẫn chính xác', () => {
    const rng = createRng(99)
    for (let i = 0; i < 200; i++) {
      const nets = randomNets(rng, rng.int(2, 6), 400_000_000_000)
      const balances = balancesOf(nets)
      const transfers = suggestTransfers(balances, membersFor(balances))
      expectValidPlan(balances, transfers)
      expect(transfers.length).toBe(bruteForceMinTransfers(nets))
    }
  })
})

describe('suggestTransfers: kết quả cố định', () => {
  it('không phụ thuộc thứ tự mảng số dư, chỉ phụ thuộc position (seed cố định)', () => {
    const rng = createRng(8080)
    for (let i = 0; i < 300; i++) {
      const nets = randomNets(rng, rng.int(2, 14), rng.pick([2, 5, 50]))
      const balances = balancesOf(nets)
      const members = membersFor(balances)
      const expected = suggestTransfers(balances, members)
      expect(suggestTransfers(rng.shuffle(balances), rng.shuffle(members))).toEqual(expected)
      expect(suggestTransfers(balances, members)).toEqual(expected)
    }
  })

  it('đổi position của thành viên thì kế hoạch đổi theo, vẫn hợp lệ', () => {
    const balances = balancesOf([100, 100, -100, -100])
    const reversed = makeMembers(['m3', 'm2', 'm1', 'm0'])
    const transfers = suggestTransfers(balances, reversed)
    expectValidPlan(balances, transfers)
    expect(transfers).toEqual([
      { fromMemberId: 'm3', toMemberId: 'm1', amount: 100 },
      { fromMemberId: 'm2', toMemberId: 'm0', amount: 100 },
    ])
  })

  it('từ nhóm ngẫu nhiên: gợi ý hòa hết nợ và bằng số giao dịch ít nhất', () => {
    const rng = createRng(424242)
    for (let i = 0; i < 200; i++) {
      const ids = Array.from({ length: rng.int(2, 7) }, (_, index) => `m${index}`)
      const expenses = Array.from({ length: rng.int(1, 8) }, (_, index) => {
        const amount = rng.int(1, 20_000) * 1000
        const participants = ids.filter(() => rng.chance(0.6))
        if (participants.length === 0) participants.push(rng.pick(ids))
        const payer = rng.pick(ids)
        return makeExpense(`e${index}`, payer, amount, splitEqually(amount, participants, payer))
      })
      const members = makeMembers(ids)
      const balances = computeBalances(makeGroup(members, expenses))
      const transfers = suggestTransfers(balances, members)
      expectValidPlan(balances, transfers)
      expect(transfers.length).toBe(bruteForceMinTransfers(balances.map((b) => b.net)))
    }
  })
})
