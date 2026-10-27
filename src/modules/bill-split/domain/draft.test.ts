// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import {
  createExpenseDraft,
  draftFromExpense,
  draftsEqual,
  draftToInput,
  expenseMatchesInput,
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

describe('draftsEqual', () => {
  const base = createExpenseDraft({ id: 'e1', today: '2026-10-26', members, paidBy: 'A' })

  it('hai bản nháp giống nhau, kể cả khi là bản sao', () => {
    expect(draftsEqual(base, base)).toBe(true)
    expect(draftsEqual(base, { ...base, participantIds: [...base.participantIds] })).toBe(true)
  })

  it('đổi bất kỳ ô nào cũng thành khác', () => {
    const changes: Partial<ExpenseDraft>[] = [
      { title: 'Lẩu' },
      { amountText: '1k' },
      { paidBy: 'B' },
      { spentOn: '2026-10-25' },
      { note: 'x' },
      { version: 2 },
      { id: 'e2' },
      { splitMode: 'exact' },
    ]
    for (const change of changes) expect(draftsEqual(base, { ...base, ...change }), JSON.stringify(change)).toBe(false)
  })

  it('chia đều: thứ tự người tham gia không quan trọng, bỏ hoặc thêm người thì khác', () => {
    expect(draftsEqual(base, { ...base, participantIds: ['C', 'A', 'B'] })).toBe(true)
    expect(draftsEqual(base, { ...base, participantIds: ['A', 'B'] })).toBe(false)
    expect(draftsEqual({ ...base, participantIds: ['A', 'B'] }, { ...base, participantIds: ['A', 'C'] })).toBe(false)
  })

  it('chia riêng: ô để trống coi như không có, gõ thêm số thì khác', () => {
    const exact: ExpenseDraft = { ...base, splitMode: 'exact', exactAmountTexts: { A: '300k' } }
    expect(draftsEqual(exact, { ...exact, exactAmountTexts: { A: '300k', B: '', C: '  ' } })).toBe(true)
    expect(draftsEqual(exact, { ...exact, exactAmountTexts: { A: '300k', B: '100k' } })).toBe(false)
    expect(draftsEqual(exact, { ...exact, exactAmountTexts: { A: '350k' } })).toBe(false)
  })

  it('chỉ so phần của cách chia đang dùng', () => {
    expect(draftsEqual(base, { ...base, exactAmountTexts: { A: '100k' } })).toBe(true)
    const exact: ExpenseDraft = { ...base, splitMode: 'exact' }
    expect(draftsEqual(exact, { ...exact, participantIds: [] })).toBe(true)
  })
})

describe('expenseMatchesInput', () => {
  const saved = makeExpense(
    'e1',
    'A',
    900,
    { A: 300, B: 300, C: 300 },
    { title: 'Cơm trưa', splitMode: 'equal', note: 'Quán Bà Tư', version: 2, spentOn: '2026-10-26' },
  )
  const sameInput = { ...expenseToInput(saved), expectedVersion: 1 }

  it('cùng nội dung thì khớp, bất kể id, version và thứ tự phần chia', () => {
    expect(expenseMatchesInput(saved, sameInput)).toBe(true)
    expect(expenseMatchesInput(saved, { ...sameInput, id: 'khac', expectedVersion: null })).toBe(true)
    expect(expenseMatchesInput(saved, { ...sameInput, shares: [...sameInput.shares].reverse() })).toBe(true)
  })

  it('ghi chú trống ở hai phía (null) là khớp', () => {
    expect(expenseMatchesInput({ ...saved, note: null }, { ...sameInput, note: null })).toBe(true)
    expect(expenseMatchesInput(saved, { ...sameInput, note: null })).toBe(false)
  })

  it('khác bất kỳ trường nào thì không khớp', () => {
    const changes = [
      { title: 'Cơm tối' },
      { amount: 1_200 },
      { paidBy: 'B' },
      { spentOn: '2026-10-25' },
      { splitMode: 'exact' as const },
      { note: 'Quán khác' },
      { shares: [{ memberId: 'A', amount: 500 }, { memberId: 'B', amount: 400 }] },
    ]
    for (const change of changes) expect(expenseMatchesInput(saved, { ...sameInput, ...change }), JSON.stringify(change)).toBe(false)
  })

  it('phần chia 0 đồng không tính (server không lưu)', () => {
    expect(expenseMatchesInput(saved, { ...sameInput, shares: [...sameInput.shares, { memberId: 'D', amount: 0 }] })).toBe(true)
  })
})
