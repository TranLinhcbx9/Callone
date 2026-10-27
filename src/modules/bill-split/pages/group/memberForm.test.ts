// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import type { BsErrorCode } from '@/modules/bill-split/api/contract'
import { describeInvalid } from '@/modules/bill-split/api/errors'
import type { MemberFormValues } from '@/modules/bill-split/components/MemberForm'
import type { BankAccount, Member } from '@/modules/bill-split/domain/types'
import {
  cleanMemberName,
  describeMemberDeleteError,
  describeMemberSaveError,
  initialMemberValues,
  validateMemberValues,
  type ValidateMemberOptions,
} from '@/modules/bill-split/pages/group/memberForm'

const STATUS: Record<BsErrorCode, number> = {
  BS_GROUP_NOT_FOUND: 404,
  BS_NOT_FOUND: 404,
  BS_CONFLICT: 409,
  BS_MEMBER_IN_USE: 409,
  BS_INVALID: 422,
  BS_LIMIT: 422,
  BS_RATE_LIMITED: 429,
}

/** Lỗi đúng như PostgREST trả về cho hàm raise 'PTxyz'. */
function postgrestError(code: BsErrorCode, detail?: unknown) {
  return {
    code: `PT${STATUS[code]}`,
    message: code,
    details: detail === undefined ? '' : JSON.stringify(detail),
    hint: null,
  }
}

const VCB = '970436'
const TPB = '970423'

const linhBank: BankAccount = { bin: VCB, accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
const linh: Member = { id: 'm1', name: 'Linh', position: 0, bank: linhBank }
const hung: Member = { id: 'm2', name: 'Hưng', position: 1, bank: null }

const empty: MemberFormValues = { name: '', bankBin: null, accountNumber: '', accountName: '' }
const NO_OTHERS: ValidateMemberOptions = { others: [], bankTouched: false }

function values(patch: Partial<MemberFormValues>): MemberFormValues {
  return { ...empty, ...patch }
}

describe('cleanMemberName', () => {
  it('cắt hai đầu và gộp khoảng trắng liên tiếp', () => {
    expect(cleanMemberName('  Nguyễn   Văn  Linh ')).toBe('Nguyễn Văn Linh')
  })

  it('coi NBSP, NEL và ký tự rộng bằng không là ký tự trắng như server', () => {
    expect(cleanMemberName(' ​Linh⁠\u0085 ')).toBe('Linh')
    expect(cleanMemberName('Linh ​Anh')).toBe('Linh Anh')
    expect(cleanMemberName(' ​‌‍⁠﻿\u0085')).toBe('')
  })

  it('đưa chữ có dấu về dạng dựng sẵn (NFC) để hai cách gõ cùng ra một tên', () => {
    const composed = 'Hưng Đức'.normalize('NFC')
    const decomposed = composed.normalize('NFD')
    expect(decomposed).not.toBe(composed)
    expect(cleanMemberName(decomposed)).toBe(composed)
  })
})

describe('initialMemberValues', () => {
  it('người đã có tài khoản: điền đủ tên, ngân hàng, số tài khoản và tên chủ tài khoản', () => {
    expect(initialMemberValues(linh, null)).toEqual({
      name: 'Linh',
      bankBin: VCB,
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN LINH',
    })
  })

  it('tài khoản không có tên chủ thì ô tên chủ để trống', () => {
    const member: Member = { ...linh, bank: { ...linhBank, accountName: null } }
    expect(initialMemberValues(member, null).accountName).toBe('')
  })

  it('thêm người mới: chỉ điền sẵn ngân hàng nhập gần nhất, không chép số tài khoản hay tên chủ tài khoản', () => {
    const last: BankAccount = { bin: TPB, accountNumber: '999', accountName: 'AI DO' }
    expect(initialMemberValues(null, last)).toEqual({ name: '', bankBin: TPB, accountNumber: '', accountName: '' })
  })

  it('người chưa có tài khoản cũng được điền sẵn ngân hàng gần nhất, giữ nguyên tên', () => {
    expect(initialMemberValues(hung, { bin: TPB, accountNumber: '1', accountName: null })).toEqual({
      name: 'Hưng',
      bankBin: TPB,
      accountNumber: '',
      accountName: '',
    })
  })

  it('chưa từng nhập ngân hàng nào thì để trống', () => {
    expect(initialMemberValues(null, null)).toEqual(empty)
  })
})

describe('validateMemberValues: tên', () => {
  it('tên trống hoặc chỉ khoảng trắng (kể cả NBSP, ký tự rộng bằng không) là lỗi "Nhập tên."', () => {
    for (const name of ['', '   ', '  ', '​​']) {
      const result = validateMemberValues(values({ name }), NO_OTHERS)
      expect(result, `tên "${name}"`).toEqual({ ok: false, errors: { name: 'Nhập tên.' } })
    }
  })

  it('tên đúng 40 ký tự được, 41 ký tự là lỗi', () => {
    expect(validateMemberValues(values({ name: 'a'.repeat(40) }), NO_OTHERS).ok).toBe(true)
    const result = validateMemberValues(values({ name: 'a'.repeat(41) }), NO_OTHERS)
    expect(result).toEqual({ ok: false, errors: { name: 'Tên tối đa 40 ký tự.' } })
  })

  it('đếm theo ký tự như Postgres: 40 emoji vẫn hợp lệ dù mỗi emoji chiếm hai đơn vị UTF-16', () => {
    expect(validateMemberValues(values({ name: '😀'.repeat(40) }), NO_OTHERS).ok).toBe(true)
  })

  it('trùng tên người khác trong nhóm, không phân biệt hoa thường, là lỗi', () => {
    const result = validateMemberValues(values({ name: ' hưng ' }), { others: [hung, linh], bankTouched: false })
    expect(result).toEqual({ ok: false, errors: { name: 'Đã có người tên này trong nhóm.' } })
  })

  it('giữ nguyên tên của chính mình khi sửa không bị tính là trùng (nơi gọi bỏ người đang sửa khỏi others)', () => {
    const result = validateMemberValues(values({ name: 'Hưng' }), { others: [linh], bankTouched: false })
    expect(result).toEqual({ ok: true, name: 'Hưng', bank: null })
  })

  it('trả về tên đã làm sạch', () => {
    const result = validateMemberValues(values({ name: '  Mai   Anh ' }), NO_OTHERS)
    expect(result).toEqual({ ok: true, name: 'Mai Anh', bank: null })
  })
})

describe('validateMemberValues: tài khoản ngân hàng', () => {
  const named = (patch: Partial<MemberFormValues>) => values({ name: 'Mai', ...patch })

  it('không nhập gì về ngân hàng thì lưu người không có tài khoản', () => {
    expect(validateMemberValues(named({}), NO_OTHERS)).toEqual({ ok: true, name: 'Mai', bank: null })
  })

  it('ngân hàng chỉ được điền sẵn (chưa đụng tới) mà không có số tài khoản thì bỏ qua, không báo lỗi', () => {
    const result = validateMemberValues(named({ bankBin: TPB }), { others: [], bankTouched: false })
    expect(result).toEqual({ ok: true, name: 'Mai', bank: null })
  })

  it('người dùng tự chọn ngân hàng mà thiếu số tài khoản là lỗi "Nhập số tài khoản."', () => {
    const result = validateMemberValues(named({ bankBin: TPB }), { others: [], bankTouched: true })
    expect(result).toEqual({ ok: false, errors: { accountNumber: 'Nhập số tài khoản.' } })
  })

  it('có số tài khoản mà chưa chọn ngân hàng là lỗi "Chọn ngân hàng."', () => {
    const result = validateMemberValues(named({ accountNumber: '0123456789' }), NO_OTHERS)
    expect(result).toEqual({ ok: false, errors: { bank: 'Chọn ngân hàng.' } })
  })

  it('chỉ có tên chủ tài khoản cũng buộc phải có ngân hàng và số tài khoản', () => {
    const result = validateMemberValues(named({ accountName: 'Mai' }), NO_OTHERS)
    expect(result).toEqual({ ok: false, errors: { bank: 'Chọn ngân hàng.', accountNumber: 'Nhập số tài khoản.' } })
  })

  it('bỏ khoảng trắng trong số tài khoản trước khi kiểm và lưu', () => {
    const result = validateMemberValues(named({ bankBin: VCB, accountNumber: ' 0123 4567 89 ' }), NO_OTHERS)
    expect(result).toEqual({
      ok: true,
      name: 'Mai',
      bank: { bin: VCB, accountNumber: '0123456789', accountName: null },
    })
  })

  it('số tài khoản có ký tự lạ hoặc dài quá 19 ký tự là lỗi định dạng, 19 ký tự thì được', () => {
    const message = describeInvalid({ field: 'bank_account', reason: 'format' })
    for (const accountNumber of ['0123-456', '012345678901234567890', 'tài khoản']) {
      const result = validateMemberValues(named({ bankBin: VCB, accountNumber }), NO_OTHERS)
      expect(result, accountNumber).toEqual({ ok: false, errors: { accountNumber: message } })
    }
    const edge = validateMemberValues(named({ bankBin: VCB, accountNumber: '1'.repeat(19) }), NO_OTHERS)
    expect(edge.ok).toBe(true)
  })

  it('tên chủ tài khoản được đổi thành chữ hoa không dấu', () => {
    const result = validateMemberValues(
      named({ bankBin: VCB, accountNumber: '0123456789', accountName: 'Nguyễn  Văn Đức' }),
      NO_OTHERS,
    )
    expect(result).toEqual({
      ok: true,
      name: 'Mai',
      bank: { bin: VCB, accountNumber: '0123456789', accountName: 'NGUYEN VAN DUC' },
    })
  })

  it('tên chủ tài khoản dài quá 50 ký tự là lỗi', () => {
    const result = validateMemberValues(
      named({ bankBin: VCB, accountNumber: '0123456789', accountName: 'A'.repeat(51) }),
      NO_OTHERS,
    )
    expect(result).toEqual({
      ok: false,
      errors: { accountName: describeInvalid({ field: 'bank_account_name', reason: 'too_long' }) },
    })
  })

  it('xóa trống số tài khoản và tên chủ tài khoản của người đang có tài khoản là bỏ tài khoản đó', () => {
    const form = initialMemberValues(linh, null)
    const cleared = { ...form, accountNumber: '', accountName: '' }
    expect(validateMemberValues(cleared, { others: [], bankTouched: false })).toEqual({
      ok: true,
      name: 'Linh',
      bank: null,
    })
  })

  it('gom mọi lỗi cùng lúc để hiện đủ dưới từng ô', () => {
    const result = validateMemberValues(values({ name: '', accountNumber: 'x-y' }), NO_OTHERS)
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'Nhập tên.',
        bank: 'Chọn ngân hàng.',
        accountNumber: describeInvalid({ field: 'bank_account', reason: 'format' }),
      },
    })
  })
})

describe('describeMemberSaveError', () => {
  it('BS_INVALID vào một ô thì hiện dưới ô đó', () => {
    expect(describeMemberSaveError(postgrestError('BS_INVALID', { field: 'name', reason: 'duplicate' }))).toEqual({
      errors: { name: 'Đã có người tên này trong nhóm.' },
    })
    expect(describeMemberSaveError(postgrestError('BS_INVALID', { field: 'bank_account', reason: 'format' }))).toEqual({
      errors: { accountNumber: describeInvalid({ field: 'bank_account', reason: 'format' }) },
    })
    expect(describeMemberSaveError(postgrestError('BS_INVALID', { field: 'bank_bin', reason: 'required' }))).toEqual({
      errors: { bank: 'Chọn ngân hàng.' },
    })
    expect(
      describeMemberSaveError(postgrestError('BS_INVALID', { field: 'bank_account_name', reason: 'too_long' })),
    ).toEqual({ errors: { accountName: describeInvalid({ field: 'bank_account_name', reason: 'too_long' }) } })
  })

  it('BS_INVALID của trường không có trong form thì thành một câu để hiện bằng toast', () => {
    const failure = describeMemberSaveError(postgrestError('BS_INVALID', { field: 'member_id', reason: 'id_taken' }))
    expect(failure).toEqual({ message: 'Mã này đã được dùng ở nơi khác. Thử lại.' })
  })

  it('lỗi khác (đủ 50 người, mạng, link đã đổi) thành một câu', () => {
    expect(describeMemberSaveError(postgrestError('BS_LIMIT', { limit: 'members' }))).toEqual({
      message: 'Nhóm đã đủ 50 thành viên.',
    })
    expect(describeMemberSaveError(new TypeError('Failed to fetch'))).toEqual({
      message: 'Không có kết nối mạng. Kiểm tra mạng rồi thử lại.',
    })
    expect(describeMemberSaveError(postgrestError('BS_GROUP_NOT_FOUND'))).toEqual({
      message: 'Không tìm thấy nhóm. Link có thể đã được đổi hoặc nhóm đã bị xóa.',
    })
  })
})

describe('describeMemberDeleteError', () => {
  it('BS_MEMBER_IN_USE nói rõ vì sao không xóa được và cần làm gì', () => {
    const message = describeMemberDeleteError(postgrestError('BS_MEMBER_IN_USE'), 'Tú')
    expect(message).toBe(
      'Không xóa được Tú vì người này đã có khoản chi hoặc lần trả nợ. Muốn xóa, hãy xóa hoặc sửa các khoản đó trước.',
    )
  })

  it('lỗi khác dùng câu chung của module', () => {
    expect(describeMemberDeleteError(new TypeError('Failed to fetch'), 'Tú')).toBe(
      'Không có kết nối mạng. Kiểm tra mạng rồi thử lại.',
    )
  })
})
