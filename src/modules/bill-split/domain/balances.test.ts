import { describe, expect, it } from 'vitest'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { splitEqually } from '@/modules/bill-split/domain/split'
import {
  makeExpense,
  makeGroup,
  makeMember,
  makeMembers,
  makeSettlement,
} from '@/modules/bill-split/domain/testing/fixtures'
import { createRng } from '@/modules/bill-split/domain/testing/prng'

const members = makeMembers(['A', 'B', 'C'])
const even = { A: 100_000, B: 100_000, C: 100_000 }

describe('computeBalances', () => {
  it('nhóm chưa có giao dịch: mọi số dư bằng 0, đúng thứ tự thành viên', () => {
    expect(computeBalances(makeGroup(members))).toEqual([
      { memberId: 'A', paid: 0, share: 0, sent: 0, received: 0, net: 0 },
      { memberId: 'B', paid: 0, share: 0, sent: 0, received: 0, net: 0 },
      { memberId: 'C', paid: 0, share: 0, sent: 0, received: 0, net: 0 },
    ])
  })

  it('A trả 300k chia đều cho 3 người: A được nhận 200k, B và C nợ 100k', () => {
    const group = makeGroup(members, [makeExpense('e1', 'A', 300_000, even)])
    expect(computeBalances(group)).toEqual([
      { memberId: 'A', paid: 300_000, share: 100_000, sent: 0, received: 0, net: 200_000 },
      { memberId: 'B', paid: 0, share: 100_000, sent: 0, received: 0, net: -100_000 },
      { memberId: 'C', paid: 0, share: 100_000, sent: 0, received: 0, net: -100_000 },
    ])
  })

  it('người trả không tham gia chia thì được nhận lại cả khoản', () => {
    const group = makeGroup(members, [makeExpense('e1', 'A', 90_000, { B: 45_000, C: 45_000 })])
    expect(computeBalances(group).map((balance) => balance.net)).toEqual([90_000, -45_000, -45_000])
  })

  it('chia theo số tiền riêng', () => {
    const group = makeGroup(members, [makeExpense('e1', 'B', 1_000_000, { A: 700_000, C: 300_000 })])
    expect(computeBalances(group).map((balance) => balance.net)).toEqual([-700_000, 1_000_000, -300_000])
  })

  it('đã trả nợ: người chuyển tăng số dư, người nhận giảm', () => {
    const group = makeGroup(
      members,
      [makeExpense('e1', 'A', 300_000, even)],
      [makeSettlement('s1', 'B', 'A', 100_000)],
    )
    expect(computeBalances(group)).toEqual([
      { memberId: 'A', paid: 300_000, share: 100_000, sent: 0, received: 100_000, net: 100_000 },
      { memberId: 'B', paid: 0, share: 100_000, sent: 100_000, received: 0, net: 0 },
      { memberId: 'C', paid: 0, share: 100_000, sent: 0, received: 0, net: -100_000 },
    ])
  })

  it('trả dư thì người trả thành người được nhận', () => {
    const group = makeGroup(
      members,
      [makeExpense('e1', 'A', 300_000, even)],
      [makeSettlement('s1', 'B', 'A', 150_000)],
    )
    expect(computeBalances(group).map((balance) => balance.net)).toEqual([50_000, 50_000, -100_000])
  })

  it('cộng dồn nhiều khoản chi và nhiều lần trả', () => {
    const group = makeGroup(
      members,
      [
        makeExpense('e1', 'A', 300_000, even),
        makeExpense('e2', 'B', 120_000, { A: 40_000, B: 40_000, C: 40_000 }),
        makeExpense('e3', 'C', 60_000, { A: 30_000, C: 30_000 }),
      ],
      [makeSettlement('s1', 'C', 'A', 50_000), makeSettlement('s2', 'C', 'B', 20_000)],
    )
    expect(computeBalances(group)).toEqual([
      { memberId: 'A', paid: 300_000, share: 170_000, sent: 0, received: 50_000, net: 80_000 },
      { memberId: 'B', paid: 120_000, share: 140_000, sent: 0, received: 20_000, net: -40_000 },
      { memberId: 'C', paid: 60_000, share: 170_000, sent: 70_000, received: 0, net: -40_000 },
    ])
  })

  it('trả về theo position dù mảng members không theo thứ tự', () => {
    const unordered = [makeMember('C', 2), makeMember('A', 0), makeMember('B', 1)]
    expect(computeBalances(makeGroup(unordered)).map((balance) => balance.memberId)).toEqual(['A', 'B', 'C'])
  })

  it('bỏ qua id không thuộc nhóm thay vì ném lỗi', () => {
    const group = makeGroup(
      members,
      [makeExpense('e1', 'ZZ', 100, { A: 50, YY: 50 })],
      [makeSettlement('s1', 'A', 'XX', 10)],
    )
    expect(computeBalances(group).map((balance) => balance.net)).toEqual([-40, 0, 0])
  })

  it('không sửa dữ liệu đầu vào', () => {
    const group = makeGroup(members, [makeExpense('e1', 'A', 300, { A: 100, B: 100, C: 100 })])
    const before = JSON.stringify(group)
    computeBalances(group)
    expect(JSON.stringify(group)).toBe(before)
  })
})

describe('computeBalances: thuộc tính', () => {
  it('tổng số dư cả nhóm luôn bằng 0 (seed cố định)', () => {
    const rng = createRng(555)
    for (let i = 0; i < 500; i++) {
      const ids = Array.from({ length: rng.int(2, 12) }, (_, index) => `m${index}`)
      const expenses = Array.from({ length: rng.int(0, 15) }, (_, index) => {
        const amount = rng.int(1, 50_000_000)
        const participants = ids.filter(() => rng.chance(0.6))
        if (participants.length === 0) participants.push(rng.pick(ids))
        const payer = rng.pick(ids)
        return makeExpense(`e${index}`, payer, amount, splitEqually(amount, participants, payer))
      })
      const settlements = Array.from({ length: rng.int(0, 8) }, (_, index) => {
        const from = rng.pick(ids)
        const to = rng.pick(ids.filter((id) => id !== from))
        return makeSettlement(`s${index}`, from, to, rng.int(1, 10_000_000))
      })

      const balances = computeBalances(makeGroup(makeMembers(ids), expenses, settlements))
      expect(balances.map((balance) => balance.memberId)).toEqual(ids)
      expect(balances.reduce((sum, balance) => sum + balance.net, 0)).toBe(0)
      for (const balance of balances) {
        expect(balance.net).toBe(balance.paid - balance.share + balance.sent - balance.received)
      }
    }
  })
})
