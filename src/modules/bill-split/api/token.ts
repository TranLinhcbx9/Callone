/**
 * Token nhóm do client sinh. Từ hợp đồng v1.1, bs_create_group và bs_rotate_token nhận token do client chọn
 * (p_token, p_new_token) và gửi lại cùng token thì server trả đúng kết quả cũ. Nhờ đó mất phản hồi giữa chừng
 * không còn làm mất link hay tạo trùng nhóm: client giữ token đã chọn và gửi lại y nguyên.
 */

type RandomSource = Pick<Crypto, 'getRandomValues'>

/** Bảng chữ base64url (RFC 4648 mục 5): thay + bằng - và / bằng _. */
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 18 byte là bội của 3 nên mã hóa ra đúng 24 ký tự và không có đệm. */
const TOKEN_BYTES = 18

/** Mã hóa base64url không đệm. Tự viết thay vì dùng btoa để không phụ thuộc môi trường và không phải thay ký tự. */
export function toBase64Url(bytes: Uint8Array): string {
  let text = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0)
    const remaining = bytes.length - index
    text += BASE64URL.charAt((chunk >> 18) & 63) + BASE64URL.charAt((chunk >> 12) & 63)
    if (remaining > 1) text += BASE64URL.charAt((chunk >> 6) & 63)
    if (remaining > 2) text += BASE64URL.charAt(chunk & 63)
  }
  return text
}

/**
 * Token mới cho một nhóm: 18 byte từ crypto.getRandomValues, mã hóa base64url không đệm, đúng 24 ký tự
 * và khớp TOKEN_PATTERN. Không dùng Math.random: token là chìa khóa truy cập duy nhất của nhóm.
 */
export function newGroupToken(random: RandomSource = globalThis.crypto): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  random.getRandomValues(bytes)
  return toBase64Url(bytes)
}
