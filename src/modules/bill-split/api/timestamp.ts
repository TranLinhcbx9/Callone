/**
 * So sánh mốc thời gian server trả về. Postgres lưu timestamptz tới micro giây và PostgREST trả dạng ISO như
 * "2026-10-27T13:28:38.123456+00:00" (bỏ số 0 thừa ở cuối phần lẻ giây, múi giờ theo phiên của server). Date chỉ chính
 * xác tới mili giây, nên phần lẻ giây được tách ra tự tính: hai mốc cách nhau vài micro giây không bị coi là bằng nhau.
 */
const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

/** Múi giờ về dạng Date.parse hiểu được: "Z", "+07" thành "+07:00", "+0700" thành "+07:00". Thiếu thì coi là UTC. */
function normalizeZone(zone: string): string {
  if (zone === '' || zone === 'Z') return 'Z'
  const sign = zone.slice(0, 1)
  const digits = zone.slice(1).replace(':', '')
  return `${sign}${digits.slice(0, 2)}:${digits.slice(2, 4) || '00'}`
}

/** Số micro giây kể từ epoch của một mốc ISO, hoặc null nếu chuỗi không đúng dạng. */
export function timestampMicros(text: string): bigint | null {
  const match = ISO_TIMESTAMP.exec(text.trim())
  if (!match) return null
  const [, date = '', time = '', fraction = '', zone = ''] = match
  const seconds = Date.parse(`${date}T${time}${normalizeZone(zone)}`)
  if (Number.isNaN(seconds)) return null
  return BigInt(seconds) * 1000n + BigInt(fraction.padEnd(6, '0').slice(0, 6))
}

/**
 * Âm nếu a trước b, dương nếu a sau b, 0 nếu cùng một thời điểm. null nếu một trong hai không phải mốc ISO hợp lệ,
 * khi đó người gọi không được suy luận gì về thứ tự.
 */
export function compareTimestamps(a: string, b: string): number | null {
  const left = timestampMicros(a)
  const right = timestampMicros(b)
  if (left === null || right === null) return null
  return left < right ? -1 : left > right ? 1 : 0
}
