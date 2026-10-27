// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BANKS, bankDisplayName, findBankByBin, searchBanks } from '@/modules/bill-split/domain/banks'
import type { Bank } from '@/modules/bill-split/domain/types'

const small: Bank[] = [
  { bin: '111111', code: 'AAA', shortName: 'Alpha', name: 'Ngân hàng MB Alpha' },
  { bin: '222222', code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '333333', code: 'MBV', shortName: 'MBV', name: 'Ngân hàng Việt Nam Hiện Đại' },
  { bin: '444444', code: 'ZZZ', shortName: 'Zeta', name: 'Ngân hàng TMCP Á Châu Zeta' },
]

describe('BANKS', () => {
  it('có đủ trường, đã trim, BIN là 6 chữ số và không trùng', () => {
    expect(BANKS).toHaveLength(76)
    for (const bank of BANKS) {
      expect(bank.bin, bank.code).toMatch(/^\d{6}$/)
      for (const value of [bank.code, bank.shortName, bank.name]) {
        expect(value.length, JSON.stringify(bank)).toBeGreaterThan(0)
        expect(value, JSON.stringify(bank)).toBe(value.trim())
      }
      expect(Object.keys(bank).sort()).toEqual(['bin', 'code', 'name', 'shortName'])
    }
    expect(new Set(BANKS.map((bank) => bank.bin)).size).toBe(BANKS.length)
    expect(new Set(BANKS.map((bank) => bank.code)).size).toBe(BANKS.length)
  })

  it('giữ thứ tự của API VietQR và có các ngân hàng dùng trong mã mẫu', () => {
    expect(BANKS[0]?.code).toBe('ICB')
    const byCode = Object.fromEntries(BANKS.map((bank) => [bank.code, bank.bin]))
    expect(byCode).toMatchObject({
      VCB: '970436',
      MB: '970422',
      TCB: '970407',
      ACB: '970416',
      TPB: '970423',
      BIDV: '970418',
    })
  })

  it('giữ cả những ngân hàng mà app của họ không quét được QR (transferSupported = 0), vì cờ đó không nói về người nhận', () => {
    const byCode = new Map(BANKS.map((bank) => [bank.code, bank]))
    // Mười mục lấy rải trong số 28 mục có transferSupported = 0 của API.
    for (const [code, bin] of [
      ['HSBC', '458761'],
      ['CITIBANK', '533948'],
      ['UOB', '970458'],
      ['VRB', '970421'],
      ['GPB', '970408'],
      ['DBS', '796500'],
      ['SCVN', '970410'],
      ['VTLMONEY', '971005'],
      ['TNEX', '963326'],
      ['MAFC', '977777'],
    ] as const) {
      expect(byCode.get(code)?.bin, code).toBe(bin)
    }
  })

  it('đúng thứ tự của API: mục đầu và cuối, và các mục bị bỏ qua trước đây nằm xen giữa chứ không dồn xuống cuối', () => {
    expect(BANKS.map((bank) => bank.code).slice(0, 3)).toEqual(['ICB', 'VCB', 'BIDV'])
    expect(BANKS.at(-1)?.code).toBe('KBHCM')
    const codes = BANKS.map((bank) => bank.code)
    expect(codes.slice(19, 24)).toEqual(['Ubank', 'TIMO', 'VTLMONEY', 'VNPTMONEY', 'SGICB'])
    expect(codes.indexOf('HSBC')).toBe(57)
    expect(codes.indexOf('UOB')).toBe(69)
  })

  it('tên không còn khoảng trắng thừa ở hai đầu (mục MAFC trong API có dấu cách cuối)', () => {
    expect(findBankByBin('977777')?.name).toBe('Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)')
  })
})

describe('bankDisplayName', () => {
  it('BIN có trong danh sách thì là tên ngắn', () => {
    expect(bankDisplayName('970436')).toBe('Vietcombank')
    expect(bankDisplayName('970422')).toBe('MBBank')
    expect(bankDisplayName('458761')).toBe('HSBC')
  })

  it('BIN lạ (server nhận mọi BIN 6 chữ số) thì là "Ngân hàng <bin>"', () => {
    expect(bankDisplayName('999999')).toBe('Ngân hàng 999999')
    expect(bankDisplayName('000001')).toBe('Ngân hàng 000001')
  })

  it('không có BIN thì chỉ là "Ngân hàng", không bao giờ rỗng', () => {
    for (const bin of ['', null, undefined]) expect(bankDisplayName(bin), String(bin)).toBe('Ngân hàng')
  })

  it('tra trong danh sách tùy chọn', () => {
    expect(bankDisplayName('333333', small)).toBe('MBV')
    expect(bankDisplayName('970436', small)).toBe('Ngân hàng 970436')
  })
})

describe('findBankByBin', () => {
  it('tìm đúng ngân hàng theo BIN', () => {
    expect(findBankByBin('970436')).toMatchObject({ code: 'VCB', shortName: 'Vietcombank' })
    expect(findBankByBin('970423')).toMatchObject({ code: 'TPB' })
  })

  it('BIN lạ, rỗng hoặc thiếu thì không tìm thấy', () => {
    for (const bin of ['000000', '97043', '', null, undefined]) {
      expect(findBankByBin(bin), String(bin)).toBeUndefined()
    }
  })

  it('tìm trong danh sách tùy chọn', () => {
    expect(findBankByBin('333333', small)?.code).toBe('MBV')
    expect(findBankByBin('970436', small)).toBeUndefined()
  })
})

describe('searchBanks', () => {
  it('query rỗng trả về cả danh sách (bản sao)', () => {
    for (const query of ['', '   ']) {
      const result = searchBanks(BANKS, query)
      expect(result).toEqual([...BANKS])
      expect(result).not.toBe(BANKS)
    }
  })

  it('tìm theo tên ngắn, mã, tên đầy đủ, không phân biệt hoa thường và dấu', () => {
    expect(searchBanks(BANKS, 'vietcom')[0]?.code).toBe('VCB')
    expect(searchBanks(BANKS, 'VCB')[0]?.code).toBe('VCB')
    expect(searchBanks(BANKS, 'TECHCOMBANK')[0]?.code).toBe('TCB')
    expect(searchBanks(BANKS, 'kỹ thương').map((bank) => bank.code)).toContain('TCB')
    expect(searchBanks(BANKS, 'ky thuong').map((bank) => bank.code)).toContain('TCB')
    expect(searchBanks(BANKS, 'Á CHÂU').map((bank) => bank.code)).toContain('ACB')
    expect(searchBanks(BANKS, 'ngan hang a chau').map((bank) => bank.code)).toEqual(['ACB'])
  })

  it('nhiều từ: mỗi từ phải có mặt, thứ tự bất kỳ', () => {
    expect(searchBanks(BANKS, 'quan doi tmcp').map((bank) => bank.code)).toEqual(['MB'])
    expect(searchBanks(BANKS, 'tmcp quan doi')[0]?.code).toBe('MB')
  })

  it('không khớp thì trả mảng rỗng', () => {
    expect(searchBanks(BANKS, 'khong co ngan hang nay')).toEqual([])
    expect(searchBanks([], 'abc')).toEqual([])
  })

  it('xếp khớp đúng mã hoặc tên ngắn trước, rồi khớp đầu chữ, rồi các khớp còn lại; cùng hạng giữ thứ tự gốc', () => {
    expect(searchBanks(small, 'mb').map((bank) => bank.code)).toEqual(['MB', 'MBV', 'AAA'])
    expect(searchBanks(small, 'MBBank').map((bank) => bank.code)).toEqual(['MB'])
    expect(searchBanks(small, 'ngan hang').map((bank) => bank.code)).toEqual(['AAA', 'MB', 'MBV', 'ZZZ'])
  })

  it('tìm được cả theo BIN, khớp đúng BIN xếp đầu', () => {
    expect(searchBanks(BANKS, '970436').map((bank) => bank.code)).toEqual(['VCB'])
    expect(searchBanks(BANKS, '97043')[0]?.bin.startsWith('97043')).toBe(true)
    expect(searchBanks(small, '222222').map((bank) => bank.code)).toEqual(['MB'])
    expect(searchBanks(BANKS, 'vietcombank 970436').map((bank) => bank.code)).toEqual(['VCB'])
    expect(searchBanks(BANKS, '999999')).toEqual([])
  })

  it('tìm "mb" trong danh sách thật thì MB đứng đầu', () => {
    expect(searchBanks(BANKS, 'mb')[0]?.code).toBe('MB')
  })

  it('không sửa danh sách đầu vào', () => {
    const before = JSON.stringify(small)
    searchBanks(small, 'mb')
    expect(JSON.stringify(small)).toBe(before)
  })
})
