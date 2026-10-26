// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import { amountToInputText, parseMoney, parseShareAmount } from '@/modules/bill-split/domain/money'
import { createRng } from '@/modules/bill-split/domain/testing/prng'
import type { MoneyParseError } from '@/modules/bill-split/domain/types'

const ok = (value: number) => ({ ok: true, value })
const fail = (error: MoneyParseError) => ({ ok: false, error })

describe('parseMoney: đơn vị', () => {
  it.each<[string, number]>([
    // nghìn
    ['150k', 150_000],
    ['150K', 150_000],
    ['150 k', 150_000],
    ['  150k  ', 150_000],
    ['150 nghìn', 150_000],
    ['150nghìn', 150_000],
    ['150 NGHÌN', 150_000],
    ['150 ngàn', 150_000],
    ['150 nghin', 150_000],
    ['150 ngan', 150_000],
    ['1k', 1_000],
    ['999k', 999_000],
    // triệu
    ['1tr', 1_000_000],
    ['1 TR', 1_000_000],
    ['1 triệu', 1_000_000],
    [' 1 triệu ', 1_000_000],
    ['2 Triệu', 2_000_000],
    ['2 trieu', 2_000_000],
    ['3m', 3_000_000],
    ['3M', 3_000_000],
    ['10tr', 10_000_000],
    // tỷ
    ['2 tỷ', 2_000_000_000],
    ['2 TỶ', 2_000_000_000],
    ['2tỷ', 2_000_000_000],
    ['2ty', 2_000_000_000],
    ['2 tỉ', 2_000_000_000],
    ['2ti', 2_000_000_000],
    ['2b', 2_000_000_000],
    ['2B', 2_000_000_000],
    ['999 tỷ', 999_000_000_000],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })

  it('đọc được chữ có dấu viết ở dạng tổ hợp (NFD), như bàn phím hoặc nguồn dán ra', () => {
    const decomposed = '1 triệu'.normalize('NFD')
    expect(decomposed).not.toBe('1 triệu')
    expect(parseMoney(decomposed)).toEqual(ok(1_000_000))
    expect(parseMoney('2 TỶ'.normalize('NFD'))).toEqual(ok(2_000_000_000))
    expect(parseMoney('3 nghìn'.normalize('NFD'))).toEqual(ok(3_000))
  })
})

describe('parseMoney: dấu thập phân trước đơn vị', () => {
  it.each<[string, number]>([
    ['1.5tr', 1_500_000],
    ['1,5tr', 1_500_000],
    ['1.5 triệu', 1_500_000],
    ['1,5 triệu', 1_500_000],
    ['0.5tr', 500_000],
    ['0,5tr', 500_000],
    ['1.005tr', 1_005_000],
    ['1,005tr', 1_005_000],
    ['1.05tr', 1_050_000],
    ['1.50tr', 1_500_000],
    ['1.5k', 1_500],
    ['2.25k', 2_250],
    ['2.050k', 2_050],
    ['1.25 tỷ', 1_250_000_000],
    ['1.000k', 1_000],
    ['1,000k', 1_000],
    ['1.0k', 1_000],
    ['1.0000k', 1_000],
    ['1.0005 tỷ', 1_000_500_000],
    ['0.001 tỷ', 1_000_000],
    ['12.345 triệu', 12_345_000],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })
})

describe('parseMoney: chữ số đứng sau đơn vị là phần thập phân của đơn vị đó', () => {
  it.each<[string, number]>([
    ['1tr2', 1_200_000],
    ['1tr25', 1_250_000],
    ['1tr250', 1_250_000],
    ['1tr20', 1_200_000],
    ['1tr005', 1_005_000],
    ['1tr05', 1_050_000],
    ['1m2', 1_200_000],
    ['1 triệu 2', 1_200_000],
    ['1 triệu 500', 1_500_000],
    ['1 tr 500', 1_500_000],
    ['2k5', 2_500],
    ['2k05', 2_050],
    ['2k500', 2_500],
    ['2k 5', 2_500],
    ['3 tỷ 5', 3_500_000_000],
    ['1ty25', 1_250_000_000],
    ['1tỷ005', 1_005_000_000],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })
})

describe('parseMoney: nhiều cụm có đơn vị giảm dần thì cộng lại', () => {
  it.each<[string, number]>([
    ['1tr200k', 1_200_000],
    ['1tr 200k', 1_200_000],
    ['1 triệu 200 nghìn', 1_200_000],
    ['1tr20k', 1_020_000],
    ['1tr2k', 1_002_000],
    ['1tr500k', 1_500_000],
    ['1 tỷ 2 triệu', 1_002_000_000],
    ['1 tỷ 500 triệu', 1_500_000_000],
    ['1tỷ2triệu3k', 1_002_003_000],
    ['1ty500tr250k', 1_500_250_000],
    ['1tr200k5', 1_200_500],
    ['2tr 300k 5', 2_300_500],
    ['1.5tr 200k', 1_700_000],
    ['999 tỷ 999 triệu 999 nghìn 999', 999_999_999_999],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })
})

describe('parseMoney: đuôi tiền tệ', () => {
  it.each<[string, number]>([
    ['150k đ', 150_000],
    ['150kđ', 150_000],
    ['150k₫', 150_000],
    ['150k ₫', 150_000],
    ['150k VND', 150_000],
    ['150kvnd', 150_000],
    ['150k vnđ', 150_000],
    ['150kVNĐ', 150_000],
    ['1tr2 vnđ', 1_200_000],
    ['1 triệu đ', 1_000_000],
    ['120.000đ', 120_000],
    ['120.000 ₫', 120_000],
    ['120.000 VND', 120_000],
    ['150000Đ', 150_000],
    ['1.250.000 ₫', 1_250_000],
    ['  1.250.000 ₫  ', 1_250_000],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })

  it('đọc lại được chuỗi do formatVnd của app tạo ra', async () => {
    const { formatVnd } = await import('@/shared/lib/format')
    for (const amount of [1, 999, 1_000, 15_000, 1_250_000, 999_999_999_999]) {
      expect(parseMoney(formatVnd(amount))).toEqual(ok(amount))
    }
  })
})

describe('parseMoney: không đơn vị, dấu . và , chỉ là dấu hàng nghìn', () => {
  it.each<[string, number]>([
    ['1', 1],
    ['7', 7],
    ['150', 150],
    ['150000', 150_000],
    [' 150000 ', 150_000],
    ['0150', 150],
    ['120.000', 120_000],
    ['120,000', 120_000],
    ['1.000', 1_000],
    ['1,000', 1_000],
    ['12.000', 12_000],
    ['1.200.000', 1_200_000],
    ['1,200,000', 1_200_000],
    ['12.345.678.901', 12_345_678_901],
    ['999.999.999.999', 999_999_999_999],
    ['999999999999', 999_999_999_999],
  ])('%j thành %i', (input, expected) => {
    expect(parseMoney(input)).toEqual(ok(expected))
  })
})

describe('parseMoney: lỗi', () => {
  it.each<[string, MoneyParseError]>([
    // empty
    ['', 'empty'],
    ['   ', 'empty'],
    ['\t\n', 'empty'],
    [' ', 'empty'],
    // fraction: lẻ dưới 1 đồng
    ['1.5', 'fraction'],
    ['1,5', 'fraction'],
    ['12.34', 'fraction'],
    ['10.5', 'fraction'],
    ['1.0', 'fraction'],
    ['1.50', 'fraction'],
    ['1.2345', 'fraction'],
    ['1234.567', 'fraction'],
    ['0.5', 'fraction'],
    ['0.500', 'fraction'],
    ['0,120', 'fraction'],
    ['1.200.00', 'fraction'],
    ['1.000.5', 'fraction'],
    ['1.200,5', 'fraction'],
    ['1,200.50', 'fraction'],
    ['1.0005k', 'fraction'],
    ['1,0005k', 'fraction'],
    ['0.0005k', 'fraction'],
    ['1.0000005tr', 'fraction'],
    ['1.0000000005 tỷ', 'fraction'],
    ['2k0005', 'fraction'],
    ['1tr1234567', 'fraction'],
    // zero
    ['0', 'zero'],
    ['00', 'zero'],
    ['0k', 'zero'],
    ['0.0k', 'zero'],
    ['0 triệu', 'zero'],
    ['0đ', 'zero'],
    ['0₫', 'zero'],
    ['0tr0', 'zero'],
    // too_large
    ['1000 tỷ', 'too_large'],
    ['1000000000000', 'too_large'],
    ['1.000.000.000.000', 'too_large'],
    ['999 tỷ 1000 triệu', 'too_large'],
    ['99999999999999999999k', 'too_large'],
    ['1000000 tr', 'too_large'],
    ['9'.repeat(50), 'too_large'],
    // invalid
    ['abc', 'invalid'],
    ['k', 'invalid'],
    ['tr', 'invalid'],
    ['đ', 'invalid'],
    ['₫', 'invalid'],
    ['vnd', 'invalid'],
    ['1 2', 'invalid'],
    ['1k 1tr', 'invalid'],
    ['1k5tr', 'invalid'],
    ['1tr 1tr', 'invalid'],
    ['1k1k', 'invalid'],
    ['1tr1tỷ', 'invalid'],
    ['-5k', 'invalid'],
    ['-100', 'invalid'],
    ['-0', 'invalid'],
    ['+5k', 'invalid'],
    ['5-', 'invalid'],
    ['1e6', 'invalid'],
    ['0x10', 'invalid'],
    ['1_000', 'invalid'],
    ['(100)', 'invalid'],
    ['100%', 'invalid'],
    ['１００', 'invalid'],
    ['1..5tr', 'invalid'],
    ['1.tr', 'invalid'],
    ['.5tr', 'invalid'],
    [',5k', 'invalid'],
    ['1.2.3tr', 'invalid'],
    ['1.5tr2', 'invalid'],
    ['1tr 2 3', 'invalid'],
    ['1 000', 'invalid'],
    ['1.000.000k', 'invalid'],
    ['1,,000', 'invalid'],
    ['120.', 'invalid'],
    ['.5', 'invalid'],
    ['1,2.3,4', 'invalid'],
    ['1 trăm', 'invalid'],
    ['1triệuk', 'invalid'],
    ['ab1000', 'invalid'],
    ['1000ab', 'invalid'],
    ['150kk', 'invalid'],
    ['150 đ k', 'invalid'],
    ['9'.repeat(101), 'invalid'],
  ])('%j báo lỗi %s', (input, error) => {
    expect(parseMoney(input)).toEqual(fail(error))
  })

  it('xử lý giá trị không phải chuỗi như ô trống', () => {
    expect(parseMoney(undefined as unknown as string)).toEqual(fail('empty'))
    expect(parseMoney(null as unknown as string)).toEqual(fail('empty'))
  })
})

describe('parseMoney: ranh giới', () => {
  it('chấp nhận đúng tới BS_LIMITS.maxAmount', () => {
    expect(parseMoney(String(BS_LIMITS.maxAmount))).toEqual(ok(BS_LIMITS.maxAmount))
    expect(parseMoney(String(BS_LIMITS.maxAmount + 1))).toEqual(fail('too_large'))
    expect(parseMoney('1')).toEqual(ok(BS_LIMITS.minAmount))
  })

  it('không sai số thực: 1.005tr đúng 1005000 chứ không phải 1004999.9999999999', () => {
    expect(parseMoney('1.005tr')).toEqual(ok(1_005_000))
    expect(parseMoney('4.35tr')).toEqual(ok(4_350_000))
    expect(parseMoney('0.285tr')).toEqual(ok(285_000))
    expect(parseMoney('8.2 tỷ')).toEqual(ok(8_200_000_000))
    expect(parseMoney('1.1 tỷ')).toEqual(ok(1_100_000_000))
  })
})

describe('parseMoney: thuộc tính', () => {
  it('amountToInputText rồi parseMoney trả lại đúng giá trị', () => {
    const rng = createRng(20261026)
    const samples = [1, 9, 10, 99, 100, 999, 1_000, 1_001, 12_345, 999_999, 1_000_000, BS_LIMITS.maxAmount]
    for (let i = 0; i < 3000; i++) samples.push(rng.int(1, rng.pick([999, 99_999, 9_999_999, BS_LIMITS.maxAmount])))
    for (const value of samples) {
      expect(parseMoney(amountToInputText(value)), `value=${value}`).toEqual(ok(value))
    }
  })

  it('khớp với phép tính BigInt độc lập trên các chuỗi dựng ngẫu nhiên có đơn vị', () => {
    const rng = createRng(777)
    const units = [
      { exponent: 9, names: ['tỷ', 'ty', 'tỉ', 'b', 'TỶ'] },
      { exponent: 6, names: ['tr', 'triệu', 'm', 'TR', 'trieu'] },
      { exponent: 3, names: ['k', 'nghìn', 'ngàn', 'K', 'ngan'] },
    ]
    for (let i = 0; i < 3000; i++) {
      // Chọn ngẫu nhiên tập con của [tỷ, triệu, nghìn], luôn theo thứ tự giảm dần.
      let chosen = units.filter(() => rng.chance(0.5))
      if (chosen.length === 0) chosen = [rng.pick(units)]
      let text = ''
      let expected = 0n
      chosen.forEach((unit, index) => {
        const digits = String(rng.int(0, 999))
        const isLast = index === chosen.length - 1
        // Chữ số lẻ chỉ đứng ở cuối chuỗi, dài tối đa 3 nên không vượt số mũ của đơn vị nhỏ nhất (3).
        const tail = isLast && rng.chance(0.5) ? String(rng.int(0, 999)).padStart(rng.int(1, 3), '0') : ''
        text += digits + rng.pick(['', ' ']) + rng.pick(unit.names)
        if (tail) text += rng.pick(['', ' ']) + tail
        text += rng.pick(['', ' '])
        expected += BigInt(digits) * 10n ** BigInt(unit.exponent)
        if (tail) expected += BigInt(tail) * 10n ** BigInt(unit.exponent - tail.length)
      })
      expect(parseMoney(text), text).toEqual(expected === 0n ? fail('zero') : ok(Number(expected)))
    }
  })
})

describe('parseMoney: số thập phân trước đơn vị, kiểm tra ngẫu nhiên', () => {
  it('lẻ dưới 1 đồng luôn bị từ chối, số 0 thừa ở cuối thì không', () => {
    const rng = createRng(99)
    const units = [
      { exponent: 3, name: 'k' },
      { exponent: 6, name: 'tr' },
      { exponent: 9, name: 'tỷ' },
    ]
    for (let i = 0; i < 3000; i++) {
      const unit = rng.pick(units)
      const fractionLength = rng.int(1, unit.exponent + 4)
      let fraction = ''
      for (let d = 0; d < fractionLength; d++) fraction += String(rng.int(0, 9))
      const integer = String(rng.int(0, 50))
      const text = `${integer}.${fraction}${unit.name}`
      const trimmed = fraction.replace(/0+$/, '')
      const whole = BigInt(integer) * 10n ** BigInt(unit.exponent)
      const part = BigInt(trimmed || '0') * 10n ** BigInt(Math.max(unit.exponent - trimmed.length, 0))
      const exact = whole + part
      const expected =
        trimmed.length > unit.exponent ? fail('fraction') : exact === 0n ? fail('zero') : ok(Number(exact))
      expect(parseMoney(text), text).toEqual(expected)
    }
  })

  it('không ném lỗi và chỉ trả số nguyên hợp lệ với chuỗi ngẫu nhiên', () => {
    const rng = createRng(31337)
    const alphabet = ['0', '1', '2', '5', '9', '.', ',', ' ', 'k', 'K', 't', 'r', 'm', 'b', 'đ', '₫', '-', 'y', 'ỷ', 'ệ', 'x']
    const allowedErrors = new Set(['empty', 'invalid', 'fraction', 'zero', 'too_large'])
    for (let i = 0; i < 5000; i++) {
      const length = rng.int(0, 14)
      let text = ''
      for (let c = 0; c < length; c++) text += rng.pick(alphabet)
      const result = parseMoney(text)
      const wellFormed = result.ok
        ? Number.isSafeInteger(result.value) && result.value >= 1 && result.value <= BS_LIMITS.maxAmount
        : allowedErrors.has(result.error)
      expect(wellFormed, text).toBe(true)
    }
  })
})

describe('parseShareAmount', () => {
  it('ô trống hoặc 0 nghĩa là không chịu phần nào', () => {
    for (const text of ['', '  ', '0', '0đ', '0k']) expect(parseShareAmount(text), text).toEqual(ok(0))
  })

  it('giữ nguyên các lỗi khác và giá trị hợp lệ', () => {
    expect(parseShareAmount('300k')).toEqual(ok(300_000))
    expect(parseShareAmount('1tr2')).toEqual(ok(1_200_000))
    expect(parseShareAmount('abc')).toEqual(fail('invalid'))
    expect(parseShareAmount('1.5')).toEqual(fail('fraction'))
    expect(parseShareAmount('1000 tỷ')).toEqual(fail('too_large'))
  })
})

describe('amountToInputText', () => {
  it.each<[number, string]>([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1_000, '1.000'],
    [12_345, '12.345'],
    [150_000, '150.000'],
    [1_200_000, '1.200.000'],
    [999_999_999_999, '999.999.999.999'],
  ])('%i thành %j', (amount, expected) => {
    expect(amountToInputText(amount)).toBe(expected)
  })

  it('số không hợp lệ cho chuỗi rỗng', () => {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(amountToInputText(value), String(value)).toBe('')
    }
  })
})
