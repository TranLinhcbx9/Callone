/** Mọi ngày trong app tính theo giờ Việt Nam, kể cả khi máy đang ở múi giờ khác. */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function dateParts(date: Date, timeZone: string): { year: string; month: string; day: string } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => formatted.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Ngày hôm nay dạng YYYY-MM-DD theo giờ Việt Nam. Không dùng toISOString vì đó là giờ UTC. */
export function todayIsoDate(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  const { year, month, day } = dateParts(now, timeZone)
  return `${year}-${month}-${day}`
}

function toUtcDate(iso: string): Date | null {
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid ? date : null
}

export function isIsoDate(value: string): boolean {
  return toUtcDate(value) !== null
}

export function addDaysIso(iso: string, days: number): string {
  const date = toUtcDate(iso)
  if (!date) throw new Error(`Ngày không hợp lệ: ${iso}`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export type DateStyle = 'short' | 'medium' | 'long'

const longFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * "2026-10-26" thành "26/10" (short), "26/10/2026" (medium) hoặc "Thứ Hai, 26 tháng 10, 2026" (long).
 * Dạng short và medium tự ghép vì ICU của từng trình duyệt có thể in "26-10".
 */
export function formatIsoDate(iso: string, style: DateStyle = 'medium'): string {
  const date = toUtcDate(iso)
  if (!date) return iso
  if (style === 'long') return longFormatter.format(date)
  const [year, month, day] = iso.split('-')
  return style === 'short' ? `${day}/${month}` : `${day}/${month}/${year}`
}

/** "Hôm nay", "Hôm qua", hoặc null nếu xa hơn. */
export function relativeDayLabel(iso: string, today: string = todayIsoDate()): string | null {
  if (iso === today) return 'Hôm nay'
  if (iso === addDaysIso(today, -1)) return 'Hôm qua'
  return null
}
