/**
 * Đọc số tiền người dùng gõ ("150k", "1tr2", "1,5 triệu", "120.000") thành số nguyên đồng.
 *
 * Chỉ dùng xử lý chuỗi và BigInt, không bao giờ dùng số thực: parseFloat('1.005') * 1e6 ra 1004999.9999999999.
 *
 * Quy tắc:
 * - Đơn vị, không phân biệt hoa thường: k, nghìn, ngàn = 10^3. tr, triệu, m = 10^6. tỷ, tỉ, ty, ti, b = 10^9.
 *   Chấp nhận thêm dạng không dấu (nghin, ngan, trieu). Cho phép khoảng trắng ("150 k"), đuôi tiền tệ đ, ₫, vnd, vnđ.
 * - Có đơn vị: dấu . hoặc , là dấu thập phân ("1.5tr", "1,5tr", "1.005tr" = 1.005.000).
 *   Chữ số đứng sau đơn vị cuối là phần thập phân của đơn vị đó ("1tr2" = 1.2tr, "2k05" = 2.050).
 *   Nhiều cụm có đơn vị giảm dần thì cộng lại ("1tr200k", "1 tỷ 2 triệu").
 * - Không đơn vị: . hoặc , chỉ là dấu phân cách hàng nghìn, và phải nhóm đúng 3 chữ số ("1.200.000", "120,000").
 *   Còn lại ("1.5", "12.34") là số lẻ nên báo lỗi fraction.
 */
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import type { MoneyParseError, MoneyParseResult } from '@/modules/bill-split/domain/types'

const MAX_AMOUNT = BigInt(BS_LIMITS.maxAmount)

/** Chặn chuỗi dán quá dài để không treo giao diện khi đổi sang BigInt. */
const MAX_INPUT_LENGTH = 100

/** Số mũ của 10 theo từng đơn vị. */
const UNIT_EXPONENTS: ReadonlyMap<string, number> = new Map(
  Object.entries({
    k: 3,
    nghìn: 3,
    ngàn: 3,
    nghin: 3,
    ngan: 3,
    tr: 6,
    triệu: 6,
    trieu: 6,
    m: 6,
    tỷ: 9,
    tỉ: 9,
    ty: 9,
    ti: 9,
    b: 9,
  }).map(([unit, exponent]) => [unit.normalize('NFC'), exponent]),
)

const CURRENCY_SUFFIX = /\s*(?:₫|đ|vnd|vnđ)$/u

function fail(error: MoneyParseError): MoneyParseResult {
  return { ok: false, error }
}

function finish(total: bigint): MoneyParseResult {
  if (total === 0n) return fail('zero')
  if (total > MAX_AMOUNT) return fail('too_large')
  return { ok: true, value: Number(total) }
}

interface UnitTerm {
  integer: string
  /** Phần thập phân của đơn vị, chưa bỏ số 0 cuối. */
  fraction: string
  exponent: number
  /** Đã có dấu thập phân ghi rõ trong số, ví dụ "1.5tr". */
  hasSeparator: boolean
}

/** Giá trị của một cụm "số + đơn vị" tính bằng đồng, hoặc null nếu có phần lẻ dưới 1 đồng. */
function unitTermValue(term: UnitTerm): bigint | null {
  const fraction = term.fraction.replace(/0+$/, '')
  if (fraction.length > term.exponent) return null
  return BigInt(term.integer + fraction.padEnd(term.exponent, '0'))
}

function parseWithUnits(text: string): MoneyParseResult {
  const terms: UnitTerm[] = []
  const termPattern = /(\d+)(?:[.,](\d+))?\s*(\p{L}+)\s*/uy
  let position = 0
  while (position < text.length) {
    termPattern.lastIndex = position
    const match = termPattern.exec(text)
    if (!match) break
    const exponent = UNIT_EXPONENTS.get(match[3] ?? '')
    if (exponent === undefined) return fail('invalid')
    terms.push({
      integer: match[1] ?? '',
      fraction: match[2] ?? '',
      exponent,
      hasSeparator: match[2] !== undefined,
    })
    position = termPattern.lastIndex
  }

  const last = terms[terms.length - 1]
  if (!last) return fail('invalid')

  // Phần còn lại chỉ được là dãy số đứng cuối, nối tiếp phần thập phân của đơn vị cuối ("1tr2", "1 triệu 500").
  const rest = text.slice(position)
  if (rest !== '') {
    if (!/^\d+$/.test(rest) || last.hasSeparator) return fail('invalid')
    last.fraction = rest
  }

  for (let index = 1; index < terms.length; index++) {
    const previous = terms[index - 1]
    const current = terms[index]
    if (!previous || !current || current.exponent >= previous.exponent) return fail('invalid')
  }

  let total = 0n
  for (const term of terms) {
    const value = unitTermValue(term)
    if (value === null) return fail('fraction')
    total += value
  }
  return finish(total)
}

/** [1-9] đầu, tối đa 3 chữ số, các nhóm sau đúng 3 chữ số. */
function isThousandsGrouped(parts: readonly string[]): boolean {
  const [first = '', ...rest] = parts
  return /^[1-9]\d{0,2}$/.test(first) && rest.every((part) => /^\d{3}$/.test(part))
}

/** Chữ số thuần của số không đơn vị, hoặc mã lỗi nếu có dấu . , không phải dấu hàng nghìn. */
function unitlessDigits(text: string): string | MoneyParseError {
  if (!/[.,]/.test(text)) return text
  if (/[.,]{2}/.test(text)) return 'invalid'

  const separators = new Set(text.match(/[.,]/g))
  if (separators.size === 1) {
    const parts = text.split(separators.has('.') ? '.' : ',')
    return isThousandsGrouped(parts) ? parts.join('') : 'fraction'
  }

  // Lẫn cả . và , như "1.200,5" hay "1,200.50": dấu cuối là dấu thập phân, dấu còn lại phải là dấu hàng nghìn.
  const lastIndex = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','))
  const decimalSeparator = text.charAt(lastIndex)
  const groupSeparator = decimalSeparator === '.' ? ',' : '.'
  const integerPart = text.slice(0, lastIndex)
  if (integerPart.includes(decimalSeparator)) return 'invalid'
  return isThousandsGrouped(integerPart.split(groupSeparator)) ? 'fraction' : 'invalid'
}

function parseWithoutUnits(text: string): MoneyParseResult {
  if (!/^\d(?:[\d.,]*\d)?$/.test(text)) return fail('invalid')
  const digits = unitlessDigits(text)
  if (digits === 'invalid' || digits === 'fraction') return fail(digits)
  return finish(BigInt(digits))
}

/** Đọc số tiền. Xem quy tắc ở đầu file. */
export function parseMoney(text: string): MoneyParseResult {
  const original = typeof text === 'string' ? text : ''
  if (original.trim() === '') return fail('empty')

  const cleaned = original.normalize('NFC').toLowerCase().trim().replace(CURRENCY_SUFFIX, '').trim()
  if (cleaned === '' || cleaned.length > MAX_INPUT_LENGTH) return fail('invalid')

  return /\p{L}/u.test(cleaned) ? parseWithUnits(cleaned) : parseWithoutUnits(cleaned)
}

/**
 * Ô số tiền của từng người khi chia riêng: để trống hoặc gõ 0 nghĩa là người đó không chịu phần nào,
 * khác với ô tổng tiền, nơi số 0 là lỗi.
 */
export function parseShareAmount(text: string): MoneyParseResult {
  const result = parseMoney(text)
  if (!result.ok && (result.error === 'empty' || result.error === 'zero')) return { ok: true, value: 0 }
  return result
}

/**
 * Số tiền thành chữ để điền vào ô nhập khi sửa, nhóm hàng nghìn bằng dấu chấm ("1200000" thành "1.200.000").
 * parseMoney đọc lại đúng giá trị này. Số không hợp lệ (âm, lẻ, vô hạn) trả chuỗi rỗng.
 */
export function amountToInputText(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) return ''
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
