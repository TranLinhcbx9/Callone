/**
 * Chữ cái đại diện lấy từ TỪ CUỐI của tên, theo cách gọi tên của người Việt:
 * "Nguyễn Văn Linh" thành "L", "Đức" thành "Đ". Tên rỗng trả về "?".
 */
export function memberInitial(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean)
  const last = words[words.length - 1]
  if (!last) return '?'
  const first = Array.from(last)[0] ?? '?'
  return first.toLocaleUpperCase('vi-VN')
}

/** 8 góc màu cách đều nhau, tránh vùng xanh lá và đỏ chói. */
const AVATAR_HUES = [18, 62, 112, 168, 215, 262, 305, 350] as const

/** Góc màu ổn định theo id (băm FNV-1a), cùng một id luôn ra cùng một màu trên mọi máy. */
export function avatarHue(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return AVATAR_HUES[(hash >>> 0) % AVATAR_HUES.length] ?? AVATAR_HUES[0]
}
