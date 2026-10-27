// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { compareTimestamps, timestampMicros } from '@/modules/bill-split/api/timestamp'

describe('timestampMicros', () => {
  it('đọc dạng PostgREST với phần lẻ giây độ dài bất kỳ', () => {
    const base = BigInt(Date.parse('2026-10-27T13:28:38Z')) * 1000n
    expect(timestampMicros('2026-10-27T13:28:38+00:00')).toBe(base)
    expect(timestampMicros('2026-10-27T13:28:38.1+00:00')).toBe(base + 100_000n)
    expect(timestampMicros('2026-10-27T13:28:38.12+00:00')).toBe(base + 120_000n)
    expect(timestampMicros('2026-10-27T13:28:38.123+00:00')).toBe(base + 123_000n)
    expect(timestampMicros('2026-10-27T13:28:38.123456+00:00')).toBe(base + 123_456n)
    expect(timestampMicros('2026-10-27T13:28:38.000001Z')).toBe(base + 1n)
    // Quá micro giây thì bỏ phần dư.
    expect(timestampMicros('2026-10-27T13:28:38.1234567+00:00')).toBe(base + 123_456n)
  })

  it('múi giờ khác nhau nhưng cùng thời điểm thì ra cùng số', () => {
    const utc = timestampMicros('2026-10-27T13:28:38.5+00:00')
    expect(utc).not.toBeNull()
    expect(timestampMicros('2026-10-27T20:28:38.5+07:00')).toBe(utc)
    expect(timestampMicros('2026-10-27T20:28:38.5+0700')).toBe(utc)
    expect(timestampMicros('2026-10-27T20:28:38.5+07')).toBe(utc)
    expect(timestampMicros('2026-10-27T13:28:38.5Z')).toBe(utc)
    expect(timestampMicros('2026-10-27 13:28:38.5+00')).toBe(utc)
    expect(timestampMicros('2026-10-27T13:28:38.5')).toBe(utc)
    expect(timestampMicros('2026-10-27T08:58:38.5-04:30')).toBe(utc)
  })

  it('chuỗi không đúng dạng hoặc ngày không có thật thì null', () => {
    for (const text of ['', 'abc', '2026-10-27', '13:28:38', '2026-13-45T25:61:61Z', '2026-10-27T13:28Z', '1761571718000']) {
      expect(timestampMicros(text), text).toBeNull()
    }
  })
})

describe('compareTimestamps', () => {
  it('sắp đúng thứ tự, kể cả khi chỉ khác nhau vài micro giây (Date.parse sẽ coi là bằng nhau)', () => {
    const a = '2026-10-27T13:28:38.123456+00:00'
    const b = '2026-10-27T13:28:38.123457+00:00'
    expect(Date.parse(a)).toBe(Date.parse(b))
    expect(compareTimestamps(a, b)).toBe(-1)
    expect(compareTimestamps(b, a)).toBe(1)
    expect(compareTimestamps(a, a)).toBe(0)
  })

  it('so đúng khi độ dài phần lẻ giây khác nhau (số 0 thừa ở cuối bị server bỏ)', () => {
    expect(compareTimestamps('2026-10-27T13:28:38.1+00:00', '2026-10-27T13:28:38.12+00:00')).toBe(-1)
    expect(compareTimestamps('2026-10-27T13:28:38.9+00:00', '2026-10-27T13:28:38.10+00:00')).toBe(1)
    expect(compareTimestamps('2026-10-27T13:28:38.1+00:00', '2026-10-27T13:28:38.100000+00:00')).toBe(0)
    expect(compareTimestamps('2026-10-27T13:28:38+00:00', '2026-10-27T13:28:38.000001+00:00')).toBe(-1)
  })

  it('cùng thời điểm khác múi giờ thì bằng nhau', () => {
    expect(compareTimestamps('2026-10-27T20:00:00+07:00', '2026-10-27T13:00:00Z')).toBe(0)
    expect(compareTimestamps('2026-10-27T20:00:01+07:00', '2026-10-27T13:00:00Z')).toBe(1)
  })

  it('không đọc được một trong hai thì null, không đoán thứ tự', () => {
    expect(compareTimestamps('abc', '2026-10-27T13:00:00Z')).toBeNull()
    expect(compareTimestamps('2026-10-27T13:00:00Z', '')).toBeNull()
  })
})
