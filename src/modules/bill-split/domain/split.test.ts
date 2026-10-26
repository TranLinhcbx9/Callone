// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import { amountToInputText } from '@/modules/bill-split/domain/money'
import { computeSplitPreview, splitEqually } from '@/modules/bill-split/domain/split'
import { createRng } from '@/modules/bill-split/domain/testing/prng'
import type { ExpenseDraft, Member, Share } from '@/modules/bill-split/domain/types'

function member(id: string, position: number): Member {
  return { id, name: `Người ${id}`, position, bank: null }
}

const members: Member[] = ['A', 'B', 'C', 'D'].map((id, index) => member(id, index))

function makeDraft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    id: 'expense-1',
    version: null,
    title: 'Lẩu gà',
    amountText: '1tr2',
    paidBy: 'A',
    spentOn: '2026-10-26',
    splitMode: 'equal',
    participantIds: ['A', 'B', 'C', 'D'],
    exactAmountTexts: {},
    note: '',
    ...overrides,
  }
}

const amounts = (shares: Share[]) => shares.map((share) => share.amount)
const total = (shares: Share[]) => shares.reduce((sum, share) => sum + share.amount, 0)

describe('splitEqually', () => {
  it.each<[string, number, string[], string | null, Record<string, number>]>([
    ['chia hết', 1_200_000, ['A', 'B', 'C', 'D'], 'A', { A: 300_000, B: 300_000, C: 300_000, D: 300_000 }],
    ['người trả tham gia, nhận đồng lẻ đầu tiên', 100, ['A', 'B', 'C'], 'A', { A: 34, B: 33, C: 33 }],
    ['người trả ở giữa vẫn được đồng lẻ trước', 100, ['A', 'B', 'C'], 'B', { A: 33, B: 34, C: 33 }],
    ['người trả đứng cuối', 100, ['A', 'B', 'C'], 'C', { A: 33, B: 33, C: 34 }],
    ['không có người trả thì theo thứ tự', 100, ['A', 'B', 'C'], null, { A: 34, B: 33, C: 33 }],
    ['người trả không tham gia thì theo thứ tự', 100, ['A', 'B', 'C'], 'Z', { A: 34, B: 33, C: 33 }],
    ['dư 2: người trả trước, rồi theo thứ tự', 101, ['A', 'B', 'C'], 'C', { A: 34, B: 33, C: 34 }],
    ['dư 2, người trả ở giữa', 101, ['A', 'B', 'C'], 'B', { A: 34, B: 34, C: 33 }],
    ['ít tiền hơn số người', 2, ['A', 'B', 'C'], 'B', { A: 1, B: 1, C: 0 }],
    ['1 đồng cho 3 người', 1, ['A', 'B', 'C'], 'C', { A: 0, B: 0, C: 1 }],
    ['số tiền 0', 0, ['A', 'B'], 'A', { A: 0, B: 0 }],
    ['một người', 7, ['A'], 'A', { A: 7 }],
    ['một người, người trả là người khác', 7, ['A'], 'B', { A: 7 }],
  ])('%s', (_name, amount, ids, payer, expected) => {
    const shares = splitEqually(amount, ids, payer)
    expect(shares.map((share) => share.memberId)).toEqual(ids)
    expect(Object.fromEntries(shares.map((share) => [share.memberId, share.amount]))).toEqual(expected)
    expect(total(shares)).toBe(amount)
  })

  it('không có ai tham gia thì không có phần nào', () => {
    expect(splitEqually(1000, [], 'A')).toEqual([])
  })

  it('bỏ id trùng, giữ thứ tự đầu tiên', () => {
    expect(splitEqually(10, ['A', 'B', 'A'], 'A')).toEqual([
      { memberId: 'A', amount: 5 },
      { memberId: 'B', amount: 5 },
    ])
  })

  it('từ chối số tiền không phải số nguyên không âm', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(() => splitEqually(bad, ['A'], 'A'), String(bad)).toThrow(RangeError)
    }
  })

  it('đúng với số tiền lớn nhất và nhóm đông nhất', () => {
    const ids = Array.from({ length: BS_LIMITS.membersPerGroup }, (_, index) => `m${index}`)
    const shares = splitEqually(BS_LIMITS.maxAmount, ids, 'm7')
    expect(total(shares)).toBe(BS_LIMITS.maxAmount)
    expect(Math.max(...amounts(shares)) - Math.min(...amounts(shares))).toBeLessThanOrEqual(1)
  })

  it('thuộc tính: tổng luôn đúng, lệch nhau tối đa 1, đồng lẻ phát đúng thứ tự (seed cố định)', () => {
    const rng = createRng(123456789)
    for (let i = 0; i < 5000; i++) {
      const count = rng.int(1, BS_LIMITS.membersPerGroup)
      const ids = Array.from({ length: count }, (_, index) => `m${index}`)
      const amount = rng.pick([rng.int(0, 200), rng.int(0, 5_000_000), rng.int(0, BS_LIMITS.maxAmount)])
      const payer = rng.pick<string | null>([null, 'ngoài nhóm', ids[rng.int(0, count - 1)] as string])

      const shares = splitEqually(amount, ids, payer)
      const values = amounts(shares)

      expect(shares.map((share) => share.memberId)).toEqual(ids)
      expect(total(shares), `amount=${amount} n=${count}`).toBe(amount)
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true)

      // Những người nhận đồng lẻ là `leftover` người đầu của danh sách [người trả, ...phần còn lại].
      const leftover = amount % count
      const base = (amount - leftover) / count
      const order = payer !== null && ids.includes(payer) ? [payer, ...ids.filter((id) => id !== payer)] : ids
      const expectedExtra = new Set(order.slice(0, leftover))
      for (const share of shares) {
        expect(share.amount, `${share.memberId} amount=${amount} n=${count}`).toBe(
          base + (expectedExtra.has(share.memberId) ? 1 : 0),
        )
      }
    }
  })
})

describe('computeSplitPreview: chia đều', () => {
  it('khoản chi hợp lệ: chia đều cho cả bốn người', () => {
    const preview = computeSplitPreview(makeDraft(), members)
    expect(preview.amount).toEqual({ ok: true, value: 1_200_000 })
    expect(preview.shares).toEqual([
      { memberId: 'A', amount: 300_000 },
      { memberId: 'B', amount: 300_000 },
      { memberId: 'C', amount: 300_000 },
      { memberId: 'D', amount: 300_000 },
    ])
    expect(preview.assigned).toBe(1_200_000)
    expect(preview.remaining).toBe(0)
    expect(preview.issues).toEqual([])
  })

  it('chỉ chia cho người được chọn và sắp phần chia theo position, không theo thứ tự bấm chọn', () => {
    const preview = computeSplitPreview(makeDraft({ participantIds: ['C', 'A'], amountText: '500k' }), members)
    expect(preview.shares).toEqual([
      { memberId: 'A', amount: 250_000 },
      { memberId: 'C', amount: 250_000 },
    ])
    expect(preview.issues).toEqual([])
  })

  it('đồng lẻ về người trả trước', () => {
    const preview = computeSplitPreview(
      makeDraft({ amountText: '100', participantIds: ['A', 'B', 'C'], paidBy: 'B' }),
      members,
    )
    expect(preview.shares).toEqual([
      { memberId: 'A', amount: 33 },
      { memberId: 'B', amount: 34 },
      { memberId: 'C', amount: 33 },
    ])
    expect(preview.assigned).toBe(100)
  })

  it('phần bằng 0 bị bỏ khỏi shares', () => {
    const preview = computeSplitPreview(
      makeDraft({ amountText: '2', participantIds: ['A', 'B', 'C'], paidBy: 'A' }),
      members,
    )
    expect(preview.shares).toEqual([
      { memberId: 'A', amount: 1 },
      { memberId: 'B', amount: 1 },
    ])
    expect(preview.issues).toEqual([])
  })

  it('bỏ qua id người tham gia không còn trong nhóm', () => {
    const preview = computeSplitPreview(makeDraft({ participantIds: ['A', 'ZZ'], amountText: '10' }), members)
    expect(preview.shares).toEqual([{ memberId: 'A', amount: 10 }])
    expect(preview.issues).toEqual([])
  })

  it('form trống báo đủ các vấn đề theo thứ tự cố định', () => {
    const preview = computeSplitPreview(
      makeDraft({ title: '   ', amountText: '', paidBy: null, participantIds: [] }),
      members,
    )
    expect(preview.issues).toEqual([
      { kind: 'title_required' },
      { kind: 'amount', error: 'empty' },
      { kind: 'no_payer' },
      { kind: 'no_participants' },
    ])
    expect(preview.amount).toEqual({ ok: false, error: 'empty' })
    expect(preview.shares).toEqual([])
    expect(preview.assigned).toBe(0)
    expect(preview.remaining).toBe(0)
  })

  it.each([
    ['abc', 'invalid'],
    ['1.5', 'fraction'],
    ['0', 'zero'],
    ['1000 tỷ', 'too_large'],
  ] as const)('số tiền %j báo lỗi %s và chưa có phần chia', (amountText, error) => {
    const preview = computeSplitPreview(makeDraft({ amountText }), members)
    expect(preview.issues).toEqual([{ kind: 'amount', error }])
    expect(preview.shares).toEqual([])
    expect(preview.remaining).toBe(0)
  })

  it('người trả không còn trong nhóm tính là chưa chọn người trả, vẫn chia được', () => {
    const draft = makeDraft({ paidBy: 'ZZ', amountText: '101', participantIds: ['A', 'B', 'C'] })
    const preview = computeSplitPreview(draft, members)
    expect(preview.issues).toEqual([{ kind: 'no_payer' }])
    expect(amounts(preview.shares)).toEqual([34, 34, 33])
  })

  it('thiếu người tham gia nhưng số tiền hợp lệ: remaining bằng cả số tiền', () => {
    const preview = computeSplitPreview(makeDraft({ participantIds: [], amountText: '300k' }), members)
    expect(preview.issues).toEqual([{ kind: 'no_participants' }])
    expect(preview.remaining).toBe(300_000)
  })

  it('không sửa dữ liệu đầu vào và không phụ thuộc thứ tự mảng members', () => {
    const shuffled = [members[2], members[0], members[3], members[1]] as Member[]
    const before = JSON.stringify(shuffled)
    const draft = makeDraft({ participantIds: ['D', 'B'], amountText: '1' })
    const draftBefore = JSON.stringify(draft)
    const preview = computeSplitPreview(draft, shuffled)
    expect(JSON.stringify(shuffled)).toBe(before)
    expect(JSON.stringify(draft)).toBe(draftBefore)
    expect(preview.shares).toEqual([{ memberId: 'B', amount: 1 }])
  })
})

describe('computeSplitPreview: chia theo số tiền riêng', () => {
  const exact = (texts: Record<string, string>, overrides: Partial<ExpenseDraft> = {}) =>
    makeDraft({ splitMode: 'exact', amountText: '1tr', exactAmountTexts: texts, ...overrides })

  it('cộng đúng bằng tổng thì lưu được', () => {
    const preview = computeSplitPreview(exact({ A: '700k', B: '300k' }), members)
    expect(preview.shares).toEqual([
      { memberId: 'A', amount: 700_000 },
      { memberId: 'B', amount: 300_000 },
    ])
    expect(preview.assigned).toBe(1_000_000)
    expect(preview.remaining).toBe(0)
    expect(preview.issues).toEqual([])
  })

  it('ô trống và ô 0 nghĩa là 0 và bị bỏ khỏi shares', () => {
    const preview = computeSplitPreview(exact({ A: '1tr', B: '', C: '0', D: '  ' }), members)
    expect(preview.shares).toEqual([{ memberId: 'A', amount: 1_000_000 }])
    expect(preview.issues).toEqual([])
  })

  it('còn thiếu thì báo sum_mismatch với remaining dương', () => {
    const preview = computeSplitPreview(exact({ A: '500k', B: '300k', C: '', D: '0' }), members)
    expect(preview.assigned).toBe(800_000)
    expect(preview.remaining).toBe(200_000)
    expect(preview.issues).toEqual([{ kind: 'sum_mismatch', remaining: 200_000 }])
  })

  it('chia lố thì remaining âm', () => {
    const preview = computeSplitPreview(exact({ A: '700k', B: '500k' }), members)
    expect(preview.remaining).toBe(-200_000)
    expect(preview.issues).toEqual([{ kind: 'sum_mismatch', remaining: -200_000 }])
  })

  it('chưa nhập ô nào: còn thiếu cả số tiền', () => {
    const preview = computeSplitPreview(exact({}), members)
    expect(preview.shares).toEqual([])
    expect(preview.remaining).toBe(1_000_000)
    expect(preview.issues).toEqual([{ kind: 'sum_mismatch', remaining: 1_000_000 }])
  })

  it('ô nhập sai báo exact_amount đúng người, phần hợp lệ vẫn được cộng', () => {
    const preview = computeSplitPreview(exact({ A: '600k', B: 'abc', C: '1.5', D: '400k' }), members)
    expect(preview.issues).toEqual([
      { kind: 'exact_amount', memberId: 'B', error: 'invalid' },
      { kind: 'exact_amount', memberId: 'C', error: 'fraction' },
    ])
    expect(preview.assigned).toBe(1_000_000)
    expect(preview.remaining).toBe(0)
  })

  it('đọc được mọi kiểu gõ tiền trong ô riêng', () => {
    const texts = { A: '1tr2', B: '1,5tr', C: '200.000', D: '2k5' }
    const preview = computeSplitPreview(exact(texts, { amountText: '2902500' }), members)
    expect(amounts(preview.shares)).toEqual([1_200_000, 1_500_000, 200_000, 2_500])
    expect(preview.issues).toEqual([])
  })

  it('bỏ qua participantIds và bỏ qua ô của người không còn trong nhóm', () => {
    const preview = computeSplitPreview(exact({ A: '1tr', ZZ: '5tr' }, { participantIds: ['B', 'C'] }), members)
    expect(preview.shares).toEqual([{ memberId: 'A', amount: 1_000_000 }])
    expect(preview.issues).toEqual([])
  })

  it('tổng tiền sai thì không báo sum_mismatch, remaining về 0', () => {
    const preview = computeSplitPreview(exact({ A: '500k' }, { amountText: 'abc' }), members)
    expect(preview.issues).toEqual([{ kind: 'amount', error: 'invalid' }])
    expect(preview.remaining).toBe(0)
    expect(preview.assigned).toBe(500_000)
  })

  it('gom đủ vấn đề cùng lúc', () => {
    const preview = computeSplitPreview(exact({ A: 'x' }, { title: '', paidBy: null }), members)
    expect(preview.issues).toEqual([
      { kind: 'title_required' },
      { kind: 'no_payer' },
      { kind: 'exact_amount', memberId: 'A', error: 'invalid' },
      { kind: 'sum_mismatch', remaining: 1_000_000 },
    ])
  })
})

describe('computeSplitPreview: thuộc tính', () => {
  it('chia đều hợp lệ thì tổng đúng, lệch tối đa 1, không có vấn đề (seed cố định)', () => {
    const rng = createRng(4242)
    for (let i = 0; i < 2000; i++) {
      const count = rng.int(1, 12)
      const group = Array.from({ length: count }, (_, index) => member(`m${index}`, index))
      const amount = rng.int(1, BS_LIMITS.maxAmount)
      const chosen = group.filter(() => rng.chance(0.6))
      if (chosen.length === 0) chosen.push(rng.pick(group))

      const preview = computeSplitPreview(
        makeDraft({
          amountText: amountToInputText(amount),
          paidBy: rng.pick(group).id,
          participantIds: rng.shuffle(chosen.map((m) => m.id)),
        }),
        rng.shuffle(group),
      )
      const values = amounts(preview.shares)
      expect(preview.issues).toEqual([])
      expect(total(preview.shares), `amount=${amount} n=${chosen.length}`).toBe(amount)
      expect(preview.remaining).toBe(0)
      // Người có phần bằng 0 bị bỏ khỏi shares, phần còn lại vẫn lệch nhau tối đa 1 và sắp theo position.
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      const positions = preview.shares.map((s) => group.findIndex((m) => m.id === s.memberId))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('chia riêng cộng đúng bằng tổng thì không có vấn đề', () => {
    const rng = createRng(777)
    for (let i = 0; i < 1000; i++) {
      const count = rng.int(1, 10)
      const group = Array.from({ length: count }, (_, index) => member(`m${index}`, index))
      const parts = group.map(() => (rng.chance(0.3) ? 0 : rng.int(1, 9_999_999)))
      if (!parts.some((part) => part > 0)) parts[0] = rng.int(1, 5_000)
      const amount = parts.reduce((sum, part) => sum + part, 0)
      const texts = Object.fromEntries(group.map((m, index) => [m.id, amountToInputText(parts[index] ?? 0)]))

      const preview = computeSplitPreview(
        makeDraft({
          splitMode: 'exact',
          paidBy: rng.pick(group).id,
          amountText: amountToInputText(amount),
          exactAmountTexts: texts,
        }),
        group,
      )
      expect(preview.issues, `amount=${amount}`).toEqual([])
      expect(total(preview.shares)).toBe(amount)
      expect(preview.shares.length).toBe(parts.filter((part) => part > 0).length)
    }
  })
})
