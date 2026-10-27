// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { buildTransferPayload } from '@/modules/bill-split/domain/vietqr'
import { buildGroupTransferQr, transferNote } from '@/modules/bill-split/pages/group/transferQr'

const bank: BankAccount = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }

describe('buildGroupTransferQr', () => {
  it('nội dung chuyển khoản là "Chia tien <tên nhóm>" đã bỏ dấu', () => {
    const qr = buildGroupTransferQr(bank, 150_000, 'Đà Lạt 3N2Đ')
    expect(qr?.message).toBe('Chia tien Da Lat 3N2D')
  })

  it('payload khớp với buildTransferPayload của domain cho cùng đầu vào', () => {
    const qr = buildGroupTransferQr(bank, 150_000, 'Đà Lạt 3N2Đ')
    expect(qr?.payload).toBe(buildTransferPayload(bank, 150_000, transferNote('Đà Lạt 3N2Đ')))
  })

  it('payload mang số tiền và nội dung đã làm sạch', () => {
    const qr = buildGroupTransferQr(bank, 150_000, 'Đà Lạt 3N2Đ')
    expect(qr?.payload).toContain('5406150000')
    expect(qr?.payload).toContain('Chia tien Da Lat 3N2D')
  })

  it('tên nhóm dài thì nội dung bị cắt còn 25 ký tự, không bỏ dở khoảng trắng ở cuối', () => {
    const qr = buildGroupTransferQr(bank, 1000, 'Chuyến đi biển Phú Quốc cuối năm cùng hội bạn')
    expect(qr).not.toBeNull()
    expect(qr?.message.length).toBeLessThanOrEqual(25)
    expect(qr?.message).toBe(qr?.message.trim())
    expect(qr?.message.startsWith('Chia tien Chuyen di bien')).toBe(true)
  })

  it('tên nhóm toàn ký tự đặc biệt vẫn còn nội dung "Chia tien"', () => {
    expect(buildGroupTransferQr(bank, 1000, '🍻🍻🍻')?.message).toBe('Chia tien')
  })

  it('số tiền ngoài khoảng cho phép hoặc tài khoản sai dạng thì trả null thay vì ném lỗi', () => {
    expect(buildGroupTransferQr(bank, 0, 'Nhóm')).toBeNull()
    expect(buildGroupTransferQr(bank, BS_LIMITS.maxAmount + 1, 'Nhóm')).toBeNull()
    expect(buildGroupTransferQr({ ...bank, accountNumber: 'sai dinh dang' }, 1000, 'Nhóm')).toBeNull()
  })
})
