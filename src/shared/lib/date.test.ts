import { describe, expect, it } from 'vitest'
import { addDaysIso, formatIsoDate, isIsoDate, relativeDayLabel, todayIsoDate } from '@/shared/lib/date'

describe('todayIsoDate', () => {
  it('tính theo giờ Việt Nam: 06:30 sáng ở VN vẫn là ngày mới dù UTC còn ngày cũ', () => {
    // 2026-10-25T23:30:00Z là 06:30 sáng 26/10 ở Việt Nam (UTC+7).
    const now = new Date('2026-10-25T23:30:00Z')
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-25')
    expect(todayIsoDate(now)).toBe('2026-10-26')
  })

  it('cho múi giờ khác nếu truyền vào', () => {
    expect(todayIsoDate(new Date('2026-10-25T23:30:00Z'), 'UTC')).toBe('2026-10-25')
  })
})

describe('isIsoDate và addDaysIso', () => {
  it('kiểm tra ngày có thật', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('26/10/2026')).toBe(false)
  })

  it('cộng trừ ngày qua tháng và năm', () => {
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatIsoDate', () => {
  it('ba kiểu hiển thị', () => {
    expect(formatIsoDate('2026-10-26', 'short')).toBe('26/10')
    expect(formatIsoDate('2026-10-26', 'medium')).toBe('26/10/2026')
    expect(formatIsoDate('2026-10-26', 'long')).toBe('Thứ Hai, 26 tháng 10, 2026')
  })

  it('trả nguyên chuỗi nếu không phải ngày hợp lệ', () => {
    expect(formatIsoDate('abc')).toBe('abc')
  })
})

describe('relativeDayLabel', () => {
  it('hôm nay, hôm qua, còn lại là null', () => {
    expect(relativeDayLabel('2026-10-26', '2026-10-26')).toBe('Hôm nay')
    expect(relativeDayLabel('2026-10-25', '2026-10-26')).toBe('Hôm qua')
    expect(relativeDayLabel('2026-10-20', '2026-10-26')).toBeNull()
  })
})
