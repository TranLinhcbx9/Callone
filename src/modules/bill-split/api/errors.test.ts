// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BS_ERROR_CODES, BS_INVALID_REASONS, type BsErrorCode } from '@/modules/bill-split/api/contract'
import {
  BILL_SPLIT_ERROR_MESSAGES,
  describeInvalid,
  getBillSplitErrorMessage,
  getConflictVersion,
  getInvalidDetail,
  isBillSplitError,
} from '@/modules/bill-split/api/errors'
import { COMMON_ERROR_MESSAGES, toAppError } from '@/shared/lib/errors'

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

const invalid = (field: string, reason: string) => postgrestError('BS_INVALID', { field, reason })

const FIELDS = [
  'name',
  'member_names',
  'title',
  'amount',
  'paid_by',
  'spent_on',
  'split_mode',
  'shares',
  'note',
  'bank_bin',
  'bank_account',
  'bank_account_name',
  'from_member',
  'to_member',
  'settled_on',
  'tokens',
  'member_id',
  'expense_id',
  'settlement_id',
]

describe('getBillSplitErrorMessage: mã lỗi hợp đồng', () => {
  it('mọi mã lỗi đều có câu tiếng Việt riêng, không rơi vào câu lỗi lạ', () => {
    expect(Object.keys(BILL_SPLIT_ERROR_MESSAGES).sort()).toEqual([...BS_ERROR_CODES].sort())
    for (const code of BS_ERROR_CODES) {
      const message = getBillSplitErrorMessage(postgrestError(code))
      expect(message, code).toBe(BILL_SPLIT_ERROR_MESSAGES[code])
      expect(message, code).not.toBe(COMMON_ERROR_MESSAGES.UNKNOWN)
      expect(message.length, code).toBeGreaterThan(10)
    }
  })

  it('xử lý cả AppError đã chuẩn hóa lẫn lỗi thô của PostgREST', () => {
    const raw = postgrestError('BS_GROUP_NOT_FOUND')
    expect(getBillSplitErrorMessage(toAppError(raw, 404))).toBe(getBillSplitErrorMessage(raw))
  })

  it('BS_LIMIT: nói rõ giới hạn nào', () => {
    const message = (limit: unknown) => getBillSplitErrorMessage(postgrestError('BS_LIMIT', { limit }))
    expect(message('members')).toBe('Nhóm đã đủ 50 thành viên.')
    expect(message('expenses')).toMatch(/^Nhóm đã đạt tối đa 5\.000 khoản chi\.$/)
    expect(message('settlements')).toMatch(/^Nhóm đã đạt tối đa 5\.000 lần trả nợ\.$/)
    expect(message('lạ')).toBe(BILL_SPLIT_ERROR_MESSAGES.BS_LIMIT)
    expect(message(undefined)).toBe(BILL_SPLIT_ERROR_MESSAGES.BS_LIMIT)
  })

  it('BS_NOT_FOUND: khoản chi riêng, còn lại dùng câu chung', () => {
    expect(getBillSplitErrorMessage(postgrestError('BS_NOT_FOUND', { entity: 'expense' }))).toContain('Khoản chi')
    expect(getBillSplitErrorMessage(postgrestError('BS_NOT_FOUND'))).toBe(BILL_SPLIT_ERROR_MESSAGES.BS_NOT_FOUND)
  })

  it('lỗi mạng, app cũ, lỗi lạ dùng câu chung', () => {
    const network = getBillSplitErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })
    expect(network).toBe(COMMON_ERROR_MESSAGES.NETWORK)
    expect(getBillSplitErrorMessage({ code: 'PGRST202', message: 'x' })).toBe(COMMON_ERROR_MESSAGES.OUTDATED)
    expect(getBillSplitErrorMessage(new Error('boom'))).toBe(COMMON_ERROR_MESSAGES.UNKNOWN)
    expect(getBillSplitErrorMessage({ code: 'PT418', message: 'BS_MA_LA' })).toBe(COMMON_ERROR_MESSAGES.UNKNOWN)
    expect(getBillSplitErrorMessage(undefined)).toBe(COMMON_ERROR_MESSAGES.UNKNOWN)
  })
})

describe('getBillSplitErrorMessage: BS_INVALID', () => {
  const message = (field: string, reason: string) => getBillSplitErrorMessage(invalid(field, reason))

  it('dịch theo trường và lý do', () => {
    expect(message('name', 'duplicate')).toBe('Đã có người tên này trong nhóm.')
    expect(message('member_names', 'duplicate')).toBe('Có hai thành viên trùng tên.')
    expect(message('shares', 'sum_mismatch')).toBe('Tổng các phần chia phải bằng số tiền.')
    expect(message('shares', 'unequal_split')).toContain('1 ₫')
    expect(message('to_member', 'same_member')).toBe('Người trả và người nhận phải là hai người khác nhau.')
    expect(message('bank_account', 'format')).toContain('19')
    expect(message('amount', 'out_of_range')).toContain('999 tỷ')
    expect(message('note', 'too_long')).toBe('Ghi chú quá dài.')
    expect(message('expense_id', 'id_taken')).toContain('Thử lại')
  })

  it('mọi tổ hợp trường và lý do đều ra câu tiếng Việt hoàn chỉnh', () => {
    for (const field of FIELDS) {
      for (const reason of BS_INVALID_REASONS) {
        const text = describeInvalid({ field, reason })
        expect(text, `${field}:${reason}`).toMatch(/\.$/)
        expect(text, `${field}:${reason}`).not.toMatch(/undefined|null|\$\{/)
      }
    }
  })

  it('trường hoặc lý do lạ vẫn có câu trả lời', () => {
    expect(describeInvalid({ field: 'p_khong_ro', reason: 'required' })).toBe('Dữ liệu không được để trống.')
    expect(describeInvalid({ field: 'name', reason: 'ly_do_la' as never })).toBe(BILL_SPLIT_ERROR_MESSAGES.BS_INVALID)
  })

  it('thiếu hoặc hỏng chi tiết thì dùng câu mặc định', () => {
    const base = postgrestError('BS_INVALID')
    const details = ['', 'không phải json', '{"field":"name"}', '{"reason":"required"}', '[1,2]', 'null']
    for (const text of details) {
      expect(getBillSplitErrorMessage({ ...base, details: text }), text).toBe(BILL_SPLIT_ERROR_MESSAGES.BS_INVALID)
    }
  })
})

describe('đọc chi tiết lỗi', () => {
  it('getInvalidDetail trả field và reason cho BS_INVALID', () => {
    expect(getInvalidDetail(toAppError(invalid('title', 'required'), 422))).toEqual({
      field: 'title',
      reason: 'required',
    })
    expect(getInvalidDetail(toAppError(postgrestError('BS_CONFLICT')))).toBeNull()
    expect(getInvalidDetail(toAppError(postgrestError('BS_INVALID')))).toBeNull()
    expect(getInvalidDetail(new Error('x'))).toBeNull()
  })

  it('getConflictVersion lấy current_version từ BS_CONFLICT', () => {
    const conflict = postgrestError('BS_CONFLICT', { entity: 'expense', current_version: 3 })
    expect(getConflictVersion(conflict)).toBe(3)
    expect(getConflictVersion(postgrestError('BS_CONFLICT'))).toBeNull()
    expect(getConflictVersion(postgrestError('BS_INVALID', { current_version: 3 }))).toBeNull()
  })

  it('isBillSplitError so khớp mã lỗi', () => {
    expect(isBillSplitError(postgrestError('BS_GROUP_NOT_FOUND'), 'BS_GROUP_NOT_FOUND')).toBe(true)
    expect(isBillSplitError(postgrestError('BS_GROUP_NOT_FOUND'), 'BS_CONFLICT')).toBe(false)
    expect(isBillSplitError(new Error('x'), 'BS_CONFLICT')).toBe(false)
  })
})
