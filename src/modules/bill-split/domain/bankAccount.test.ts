// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { normalizeBankAccount } from '@/modules/bill-split/domain/bankAccount'

/** Ký tự theo mã code point, để file test không phải chứa ký tự vô hình. */
const ch = (...codePoints: number[]) => String.fromCodePoint(...codePoints)
const NBSP = ch(0xa0)
const ZWSP = ch(0x200b)
const ZWNJ = ch(0x200c)
const ZWJ = ch(0x200d)
const LRM = ch(0x200e)
const WORD_JOINER = ch(0x2060)
const BOM = ch(0xfeff)
const SOFT_HYPHEN = ch(0xad)

describe('normalizeBankAccount', () => {
  it('bỏ mọi khoảng trắng trong số tài khoản, tên chủ tài khoản thành chữ hoa không dấu', () => {
    expect(
      normalizeBankAccount({ bin: '970436', accountNumber: ' 0123 456\t789 ', accountName: '  Nguyễn  Văn Đạt ' }),
    ).toEqual({ bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN DAT' })
  })

  it('bỏ cả NBSP và ký tự vô hình hay lẫn vào khi dán số tài khoản từ app ngân hàng', () => {
    for (const junk of [NBSP, ZWSP, ZWNJ, ZWJ, LRM, WORD_JOINER, BOM, SOFT_HYPHEN, `${ZWSP}${NBSP}${LRM}`]) {
      const label = JSON.stringify(junk)
      const pasted = `${junk}0123${junk}456${junk}789${junk}`
      expect(normalizeBankAccount({ bin: '970436', accountNumber: pasted, accountName: null }).accountNumber, label).toBe(
        '0123456789',
      )
    }
  })

  it('số tài khoản có chữ cái vẫn giữ nguyên chữ hoa chữ thường', () => {
    expect(normalizeBankAccount({ bin: '970436', accountNumber: 'ab C1 2', accountName: null }).accountNumber).toBe('abC12')
  })

  it('tên chủ tài khoản trống hoặc không có thì là null', () => {
    for (const accountName of [null, '', '   ']) {
      expect(
        normalizeBankAccount({ bin: '970436', accountNumber: '1', accountName }).accountName,
        String(accountName),
      ).toBeNull()
    }
  })

  it('giữ nguyên BIN', () => {
    expect(normalizeBankAccount({ bin: '970436', accountNumber: '1', accountName: null }).bin).toBe('970436')
    expect(normalizeBankAccount({ bin: 'sai', accountNumber: '1', accountName: null }).bin).toBe('sai')
  })

  it('dạng đã chuẩn hóa thì giữ nguyên, và chuẩn hóa hai lần ra cùng kết quả', () => {
    const bank = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
    expect(normalizeBankAccount(bank)).toEqual(bank)
    const messy = { bin: '970436', accountNumber: `01 ${ZWSP}23`, accountName: 'nguyễn văn a' }
    expect(normalizeBankAccount(normalizeBankAccount(messy))).toEqual(normalizeBankAccount(messy))
  })

  it('không sửa đối tượng đầu vào', () => {
    const bank = { bin: '970436', accountNumber: '01 23', accountName: 'a' }
    normalizeBankAccount(bank)
    expect(bank).toEqual({ bin: '970436', accountNumber: '01 23', accountName: 'a' })
  })
})
