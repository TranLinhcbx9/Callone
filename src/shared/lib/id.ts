type CryptoLike = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string }

/**
 * Sinh UUID v4 ở client. Id do client sinh giúp gửi lại request khi rớt mạng mà không tạo bản ghi trùng.
 * crypto.randomUUID chỉ có trên HTTPS hoặc localhost, mở app qua http://192.168.x.x thì không có,
 * nên có đường dự phòng bằng getRandomValues.
 */
export function newId(cryptoImpl: CryptoLike = globalThis.crypto): string {
  if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID()

  const bytes = new Uint8Array(16)
  cryptoImpl.getRandomValues(bytes)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
