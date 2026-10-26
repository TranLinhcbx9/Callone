// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import {
  createExpenseDraft,
  draftFromExpense,
  draftToInput,
  expenseToInput,
  isValidBillDate,
} from '@/modules/bill-split/domain/draft'
import { makeExpense, makeMembers } from '@/modules/bill-split/domain/testing/fixtures'
import type { ExpenseDraft } from '@/modules/bill-split/domain/types'

const members = makeMembers(['A', 'B', 'C'])

describe('isValidBillDate', () => {
  it.each<[string, boolean]>([
    ['2026-10-26', true],
    ['2000-01-01', true],
    ['2100-12-31', true],
    ['1999-12-31', false],
    ['2101-01-01', false],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['26/10/2026', false],
    ['', false],
  ])('%j là %s', (value, expected) => {
    expect(isValidBillDate(value)).toBe(expected)
  })
})

describe('createExpenseDraft', () => {
  it('chia đều cho cả nhóm, hôm nay, người trả mặc định là mình', () => {
    const draft = createExpenseDraft({ id: 'e1', today: '2026-10-26', members: [...members].reverse(), paidBy: 'B' })
    expect(draft).toEqual({
      id: 'e1',
      version: null,
      title: '',
      amountText: '',
      paidBy: 'B',
      spentOn: '2026-10-26',
      splitMode: 'equal',
      participantIds: ['A', 'B', 'C'],
      exactAmountTexts: {},
      note: '',
    })
  })

  it('người trả mặc định không còn trong nhóm hoặc không truyền thì để trống', () => {
    expect(createExpenseDraft({ id: 'e1', today: '2026-10-26', members, paidBy: 'ZZ' }).paidBy).toBeNull()
    expect(createExpenseDraft({ id: 'e1', today: '2026-10-26', members }).paidBy).toBeNull()
  })
})

describe('draftFromExpense và expenseToInput', () => {
  const equal = makeExpense(
    'e1',
    'A',
    1_200_000,
    { A: 400_000, B: 400_000, C: 400_000 },
    { title: 'Lẩu gà', splitMode: 'equal', note: 'Quán Bà Tư', version: 3 },
  )
  const exact = makeExpense('e2', 'B', 1_000_000, { A: 700_000, C: 300_000 }, { splitMode: 'exact', version: 2 })

  it('nạp khoản chi chia đều vào form sửa', () => {
    expect(draftFromExpense(equal)).toEqual({
      id: 'e1',
      version: 3,
      title: 'Lẩu gà',
      amountText: '1.200.000',
      paidBy: 'A',
      spentOn: '2026-10-26',
      splitMode: 'equal',
      participantIds: ['A', 'B', 'C'],
      exactAmountTexts: {},
      note: 'Quán Bà Tư',
    })
  })

  it('nạp khoản chi chia riêng: điền sẵn ô của từng người', () => {
    const draft = draftFromExpense(exact)
    expect(draft.splitMode).toBe('exact')
    expect(draft.exactAmountTexts).toEqual({ A: '700.000', C: '300.000' })
    expect(draft.participantIds).toEqual(['A', 'C'])
    expect(draft.note).toBe('')
  })

  it('sửa mà không đổi gì thì ra đúng dữ liệu của khoản chi gốc, kèm version hiện tại', () => {
    for (const expense of [equal, exact]) {
      const result = draftToInput(draftFromExpense(expense), members)
      expect(result.ok && result.input).toEqual(expenseToInput(expense))
    }
  })

  it('expenseToInput mặc định gửi version hiện tại, hoàn tác xóa thì truyền null và giữ nguyên id', () => {
    expect(expenseToInput(equal).expectedVersion).toBe(3)
    const undo = expenseToInput(equal, null)
    expect(undo.expectedVersion).toBeNull()
    expect(undo).toMatchObject({ id: 'e1', title: 'Lẩu gà', amount: 1_200_000, paidBy: 'A', note: 'Quán Bà Tư' })
    expect(undo.shares).toEqual(equal.shares)
    expect(undo.shares).not.toBe(equal.shares)
  })
})

describe('draftToInput', () => {
  const valid: ExpenseDraft = {
    ...createExpenseDraft({ id: 'e9', today: '2026-10-26', members, paidBy: 'A' }),
    title: '  Cơm trưa  ',
    amountText: '1tr2',
    note: '  ',
  }

  it('bản nháp hợp lệ: cắt khoảng trắng, ghi chú trống thành null, tạo mới thì không có version', () => {
    const result = draftToInput(valid, members)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input).toEqual({
      id: 'e9',
      title: 'Cơm trưa',
      amount: 1_200_000,
      paidBy: 'A',
      spentOn: '2026-10-26',
      splitMode: 'equal',
      shares: [
        { memberId: 'A', amount: 400_000 },
        { memberId: 'B', amount: 400_000 },
        { memberId: 'C', amount: 400_000 },
      ],
      note: null,
      expectedVersion: null,
    })
    expect(result.preview.issues).toEqual([])
  })

  it('sửa khoản chi thì mang theo version của bản nháp', () => {
    const result = draftToInput({ ...valid, version: 4, note: ' ghi chú ' }, members)
    expect(result.ok && result.input.expectedVersion).toBe(4)
    expect(result.ok && result.input.note).toBe('ghi chú')
  })

  it('còn vấn đề thì không ra dữ liệu, trả preview để hiện lỗi', () => {
    const result = draftToInput({ ...valid, title: '', amountText: 'abc' }, members)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.dateInvalid).toBe(false)
    expect(result.preview.issues).toEqual([{ kind: 'title_required' }, { kind: 'amount', error: 'invalid' }])
  })

  it('ngày trống hoặc ngoài khoảng thì không hợp lệ dù các ô khác đúng', () => {
    for (const spentOn of ['', '1999-01-01', '2026-02-30']) {
      const result = draftToInput({ ...valid, spentOn }, members)
      expect(result.ok, spentOn).toBe(false)
      expect(!result.ok && result.dateInvalid, spentOn).toBe(true)
      expect(!result.ok && result.preview.issues, spentOn).toEqual([])
    }
  })

  it('chia riêng lệch tổng thì không ra dữ liệu', () => {
    const draft: ExpenseDraft = { ...valid, splitMode: 'exact', exactAmountTexts: { A: '500k' } }
    const result = draftToInput(draft, members)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.preview.issues).toEqual([{ kind: 'sum_mismatch', remaining: 700_000 }])
  })
})
