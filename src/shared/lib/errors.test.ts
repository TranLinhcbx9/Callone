import { describe, expect, it } from 'vitest'
import { AppError, COMMON_ERROR_MESSAGES, getErrorMessage, isRetryableError, toAppError } from '@/shared/lib/errors'

describe('toAppError', () => {
  it('đọc lỗi app từ SQLSTATE PTxyz, lấy status và parse chi tiết JSON', () => {
    const error = toAppError(
      { code: 'PT422', message: 'BS_INVALID', details: '{"field":"name","reason":"duplicate"}', hint: null },
      422,
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error.kind).toBe('app')
    expect(error.code).toBe('BS_INVALID')
    expect(error.status).toBe(422)
    expect(error.detail).toEqual({ field: 'name', reason: 'duplicate' })
  })

  it('giữ nguyên chi tiết dạng chữ nếu không phải JSON', () => {
    const error = toAppError({ code: 'PT404', message: 'BS_GROUP_NOT_FOUND', details: 'không có' })
    expect(error.status).toBe(404)
    expect(error.detail).toBe('không có')
  })

  it('nhận ra lỗi mạng qua status 0 hoặc thông điệp fetch', () => {
    expect(toAppError({ message: 'TypeError: Failed to fetch', code: '' }, 0).kind).toBe('network')
    expect(toAppError(new TypeError('Load failed')).kind).toBe('network')
    expect(toAppError(new TypeError('fetch failed')).code).toBe('NETWORK')
  })

  it('nhận ra app cũ khi hàm RPC đã đổi chữ ký', () => {
    expect(toAppError({ code: 'PGRST202', message: 'Could not find the function' }, 404).kind).toBe('outdated')
    expect(toAppError({ code: 'PGRST203', message: 'Could not choose the best candidate' }).code).toBe('OUTDATED')
  })

  it('lỗi lạ thành UNKNOWN và giữ nguyên nếu đã là AppError', () => {
    expect(toAppError('boom').code).toBe('UNKNOWN')
    expect(toAppError(null).kind).toBe('unknown')
    const original = new AppError({ kind: 'app', code: 'BS_CONFLICT', status: 409 })
    expect(toAppError(original)).toBe(original)
  })
})

describe('isRetryableError', () => {
  it('chỉ thử lại lỗi mạng', () => {
    expect(isRetryableError({ message: 'Failed to fetch' })).toBe(true)
    expect(isRetryableError({ code: 'PT404', message: 'BS_GROUP_NOT_FOUND' })).toBe(false)
    expect(isRetryableError(new Error('x'))).toBe(false)
  })
})

describe('getErrorMessage', () => {
  it('ưu tiên bảng dịch của module', () => {
    const messages = { BS_CONFLICT: 'Người khác vừa sửa khoản chi này.' }
    expect(getErrorMessage({ code: 'PT409', message: 'BS_CONFLICT' }, messages)).toBe(messages.BS_CONFLICT)
  })

  it('dùng thông báo chung khi module không dịch', () => {
    expect(getErrorMessage({ message: 'Failed to fetch' })).toBe(COMMON_ERROR_MESSAGES.NETWORK)
    expect(getErrorMessage({ code: 'PGRST202', message: '' })).toBe(COMMON_ERROR_MESSAGES.OUTDATED)
    expect(getErrorMessage({ code: 'PT404', message: 'BS_LẠ' })).toBe(COMMON_ERROR_MESSAGES.UNKNOWN)
  })
})
