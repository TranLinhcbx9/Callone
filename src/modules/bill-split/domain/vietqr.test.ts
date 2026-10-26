// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import { createRng } from '@/modules/bill-split/domain/testing/prng'
import {
  buildTransferPayload,
  buildTransferQr,
  buildVietQrPayload,
  crc16Ccitt,
} from '@/modules/bill-split/domain/vietqr'

interface Field {
  id: string
  value: string
}

/** Tách chuỗi TLV, kiểm tra độ dài từng trường khớp với dữ liệu. */
function parseTlv(text: string): Field[] {
  const fields: Field[] = []
  let position = 0
  while (position < text.length) {
    const id = text.slice(position, position + 2)
    const lengthText = text.slice(position + 2, position + 4)
    expect(lengthText, `độ dài của trường ${id}`).toMatch(/^\d{2}$/)
    const length = Number(lengthText)
    const value = text.slice(position + 4, position + 4 + length)
    expect(value.length, `giá trị của trường ${id}`).toBe(length)
    fields.push({ id, value })
    position += 4 + length
  }
  return fields
}

function field(fields: Field[], id: string): string | undefined {
  return fields.find((f) => f.id === id)?.value
}

/** CRC-16/CCITT-FALSE theo cách khác (bảng tra) để đối chiếu với bản bit-từng-bit trong code. */
function crcByTable(text: string): string {
  const table = Array.from({ length: 256 }, (_, byte) => {
    let value = byte << 8
    for (let bit = 0; bit < 8; bit++) value = (value & 0x8000 ? (value << 1) ^ 0x1021 : value << 1) & 0xffff
    return value
  })
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc = ((crc << 8) & 0xffff) ^ (table[((crc >> 8) ^ byte) & 0xff] as number)
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

describe('crc16Ccitt', () => {
  it('giá trị kiểm chuẩn của CRC-16/CCITT-FALSE: "123456789" ra 29B1', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1')
  })

  it('chuỗi rỗng ra giá trị khởi tạo, luôn 4 ký tự hex viết hoa', () => {
    expect(crc16Ccitt('')).toBe('FFFF')
    for (const text of ['A', 'a', '0', 'VietQR', '00020101021138']) {
      expect(crc16Ccitt(text)).toMatch(/^[0-9A-F]{4}$/)
    }
  })

  it('khớp cách tính bằng bảng tra trên chuỗi ngẫu nhiên', () => {
    const rng = createRng(11)
    for (let i = 0; i < 500; i++) {
      let text = ''
      for (let c = rng.int(0, 120); c > 0; c--) text += String.fromCharCode(rng.int(32, 126))
      expect(crc16Ccitt(text), text).toBe(crcByTable(text))
    }
  })
})

describe('buildVietQrPayload: chuỗi mẫu đã kiểm CRC', () => {
  it('có số tiền và nội dung (TPBank 970423)', () => {
    expect(
      buildVietQrPayload({ bin: '970423', accountNumber: '0123456789', amount: 150000, message: 'DH123456' }),
    ).toBe(
      '00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB',
    )
  })

  it('không số tiền, không nội dung (Techcombank 970407): mã tĩnh', () => {
    expect(buildVietQrPayload({ bin: '970407', accountNumber: '9602091996' })).toBe(
      '00020101021138540010A00000072701240006970407011096020919960208QRIBFTTA53037045802VN630434A0',
    )
  })

  it('1000đ và nội dung có khoảng trắng (ACB 970416, tài khoản 9 số)', () => {
    expect(
      buildVietQrPayload({ bin: '970416', accountNumber: '257678859', amount: 1000, message: 'Chuyen tien' }),
    ).toBe(
      '00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA5303704540410005802VN62150811Chuyen tien6304BBB8',
    )
  })
})

describe('buildVietQrPayload: cấu trúc', () => {
  const full = buildVietQrPayload({ bin: '970436', accountNumber: '0123456789', amount: 1_250_000, message: 'Tra no' })

  it('các trường đúng mã, đúng thứ tự', () => {
    const fields = parseTlv(full)
    expect(fields.map((f) => f.id)).toEqual(['00', '01', '38', '53', '54', '58', '62', '63'])
    expect(Object.fromEntries(fields.map((f) => [f.id, f.value]))).toMatchObject({
      '00': '01',
      '01': '12',
      '53': '704',
      '54': '1250000',
      '58': 'VN',
    })
  })

  it('trường 38 gồm GUID NAPAS, tài khoản người nhận (BIN và số tài khoản), dịch vụ chuyển nhanh', () => {
    const merchant = parseTlv(field(parseTlv(full), '38') ?? '')
    expect(merchant.map((f) => f.id)).toEqual(['00', '01', '02'])
    expect(merchant[0]?.value).toBe('A000000727')
    expect(merchant[2]?.value).toBe('QRIBFTTA')
    expect(parseTlv(merchant[1]?.value ?? '')).toEqual([
      { id: '00', value: '970436' },
      { id: '01', value: '0123456789' },
    ])
  })

  it('nội dung nằm trong trường 62 mã 08', () => {
    expect(parseTlv(field(parseTlv(full), '62') ?? '')).toEqual([{ id: '08', value: 'Tra no' }])
  })

  it('kết thúc bằng trường 63 dài 4 và CRC tính trên toàn bộ phần trước, gồm cả "6304"', () => {
    const body = full.slice(0, -4)
    expect(body.endsWith('6304')).toBe(true)
    expect(full.slice(-4)).toBe(crc16Ccitt(body))
    expect(full.slice(-4)).toBe(crcByTable(body))
  })

  it('có số tiền thì trường 01 là 12, không có thì là 11 và không có trường 54', () => {
    const fixed = parseTlv(buildVietQrPayload({ bin: '970436', accountNumber: '1', amount: 5 }))
    const open = parseTlv(buildVietQrPayload({ bin: '970436', accountNumber: '1' }))
    expect(field(fixed, '01')).toBe('12')
    expect(field(fixed, '54')).toBe('5')
    expect(field(open, '01')).toBe('11')
    expect(field(open, '54')).toBeUndefined()
  })

  it('không có nội dung thì không có trường 62', () => {
    for (const message of [undefined, null, '']) {
      const payload = buildVietQrPayload({ bin: '970436', accountNumber: '1', amount: 5, message })
      expect(field(parseTlv(payload), '62'), String(message)).toBeUndefined()
    }
  })

  it('amount null được coi như không có', () => {
    expect(buildVietQrPayload({ bin: '970407', accountNumber: '9602091996', amount: null })).toBe(
      buildVietQrPayload({ bin: '970407', accountNumber: '9602091996' }),
    )
  })

  it('số tiền nhỏ nhất và lớn nhất', () => {
    expect(field(parseTlv(buildVietQrPayload({ bin: '970436', accountNumber: '1', amount: 1 })), '54')).toBe('1')
    const max = buildVietQrPayload({ bin: '970436', accountNumber: '1', amount: BS_LIMITS.maxAmount })
    expect(field(parseTlv(max), '54')).toBe('999999999999')
  })

  it('số tài khoản có chữ cái và dài tối đa 19 ký tự', () => {
    expect(() => buildVietQrPayload({ bin: '970436', accountNumber: 'ABC123xyz' })).not.toThrow()
    expect(() => buildVietQrPayload({ bin: '970436', accountNumber: '1234567890123456789' })).not.toThrow()
  })

  it('thuộc tính: chuỗi dựng ngẫu nhiên luôn tách được và CRC đúng (seed cố định)', () => {
    const rng = createRng(2026)
    const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ']
    for (let i = 0; i < 500; i++) {
      const bin = String(rng.int(0, 999_999)).padStart(6, '0')
      const accountNumber = String(rng.int(1, 9_999_999_999)).slice(0, rng.int(1, 19))
      const amount = rng.chance(0.7) ? rng.int(1, BS_LIMITS.maxAmount) : undefined
      let message = ''
      if (rng.chance(0.7)) for (let c = rng.int(1, 40); c > 0; c--) message += rng.pick(chars)
      const payload = buildVietQrPayload({ bin, accountNumber, amount, message })
      const fields = parseTlv(payload)
      expect(fields[fields.length - 1]?.id).toBe('63')
      expect(payload.slice(-4)).toBe(crcByTable(payload.slice(0, -4)))
      expect(field(fields, '54')).toBe(amount === undefined ? undefined : String(amount))
      expect(payload).toMatch(/^[\x20-\x7e]+$/)
    }
  })
})

describe('buildVietQrPayload: đầu vào sai thì ném RangeError', () => {
  it.each<[string, Parameters<typeof buildVietQrPayload>[0]]>([
    ['BIN thiếu số', { bin: '97042', accountNumber: '1' }],
    ['BIN có chữ', { bin: '97042a', accountNumber: '1' }],
    ['BIN dài 7 số', { bin: '9704230', accountNumber: '1' }],
    ['số tài khoản rỗng', { bin: '970423', accountNumber: '' }],
    ['số tài khoản có khoảng trắng', { bin: '970423', accountNumber: '0123 456' }],
    ['số tài khoản có ký tự lạ', { bin: '970423', accountNumber: '01-23' }],
    ['số tài khoản dài 20', { bin: '970423', accountNumber: '12345678901234567890' }],
    ['số tiền 0', { bin: '970423', accountNumber: '1', amount: 0 }],
    ['số tiền âm', { bin: '970423', accountNumber: '1', amount: -5 }],
    ['số tiền lẻ', { bin: '970423', accountNumber: '1', amount: 1.5 }],
    ['số tiền NaN', { bin: '970423', accountNumber: '1', amount: Number.NaN }],
    ['số tiền quá lớn', { bin: '970423', accountNumber: '1', amount: BS_LIMITS.maxAmount + 1 }],
    ['nội dung có dấu', { bin: '970423', accountNumber: '1', message: 'Chuyển tiền' }],
    ['nội dung có ký tự điều khiển', { bin: '970423', accountNumber: '1', message: 'a\nb' }],
    ['nội dung quá dài', { bin: '970423', accountNumber: '1', message: 'a'.repeat(96) }],
  ])('%s', (_name, input) => {
    expect(() => buildVietQrPayload(input)).toThrow(RangeError)
  })

  it('nội dung dài đúng 95 ký tự thì được', () => {
    expect(() => buildVietQrPayload({ bin: '970423', accountNumber: '1', message: 'a'.repeat(95) })).not.toThrow()
  })
})

describe('buildTransferPayload', () => {
  const bank = { bin: '970423', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }

  it('làm sạch nội dung tiếng Việt rồi dựng mã', () => {
    expect(buildTransferPayload(bank, 150_000, 'Chia tiền Đà Lạt')).toBe(
      buildVietQrPayload({ bin: '970423', accountNumber: '0123456789', amount: 150_000, message: 'Chia tien Da Lat' }),
    )
  })

  it('cắt nội dung ở 25 ký tự', () => {
    const payload = buildTransferPayload(bank, 1000, 'Tra no chuyen di Da Lat thang muoi hai')
    const additional = parseTlv(field(parseTlv(payload), '62') ?? '')
    expect(additional[0]?.value).toBe('Tra no chuyen di Da Lat t')
    expect(additional[0]?.value.length).toBe(25)
  })

  it('không có nội dung, hoặc nội dung chỉ toàn ký tự đặc biệt, thì bỏ trường 62', () => {
    const expected = buildVietQrPayload({ bin: '970423', accountNumber: '0123456789', amount: 1000 })
    expect(buildTransferPayload(bank, 1000)).toBe(expected)
    expect(buildTransferPayload(bank, 1000, '')).toBe(expected)
    expect(buildTransferPayload(bank, 1000, '!!! ???')).toBe(expected)
  })
})

describe('buildTransferQr', () => {
  const bank = { bin: '970423', accountNumber: '0123456789', accountName: null }

  it('trả cả chuỗi mã lẫn nội dung đã làm sạch đúng như được mã hóa trong mã', () => {
    const { payload, message } = buildTransferQr(bank, 150_000, 'Trả nợ Đà Lạt tháng mười hai nhé')
    // Cắt ở ký tự thứ 25 là khoảng trắng nên bị bỏ nốt.
    expect(message).toBe('Tra no Da Lat thang muoi')
    expect(message.length).toBeLessThanOrEqual(25)
    expect(field(parseTlv(field(parseTlv(payload), '62') ?? ''), '08')).toBe(message)
    expect(payload).toBe(buildTransferPayload(bank, 150_000, 'Trả nợ Đà Lạt tháng mười hai nhé'))
  })

  it('không có nội dung thì message rỗng và mã không có trường 62', () => {
    const { payload, message } = buildTransferQr(bank, 1000)
    expect(message).toBe('')
    expect(field(parseTlv(payload), '62')).toBeUndefined()
  })
})
