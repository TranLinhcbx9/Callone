import { describe, expect, it } from 'vitest'
import { formatNumber, formatVnd } from '@/shared/lib/format'

const NBSP = ' '

describe('formatVnd', () => {
  it('định dạng kiểu Việt Nam, dấu chấm ngăn nghìn, NBSP trước ₫', () => {
    expect(formatVnd(1_250_000)).toBe(`1.250.000${NBSP}₫`)
    expect(formatVnd(0)).toBe(`0${NBSP}₫`)
    expect(formatVnd(999_999_999_999)).toBe(`999.999.999.999${NBSP}₫`)
  })

  it('giữ dấu âm', () => {
    expect(formatVnd(-150_000)).toBe(`-150.000${NBSP}₫`)
  })
})

describe('formatNumber', () => {
  it('chỉ có số, không có ký hiệu tiền', () => {
    expect(formatNumber(1_200_000)).toBe('1.200.000')
  })
})
