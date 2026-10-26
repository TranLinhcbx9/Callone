/**
 * Xử lý chữ tiếng Việt: bỏ dấu, chuẩn hóa để tìm kiếm, và làm sạch nội dung chuyển khoản.
 * Chỉ dùng hàm chuẩn của JS (normalize, regex Unicode), không phụ thuộc bảng ánh xạ tự viết.
 */

/** Bỏ dấu tiếng Việt, đổi đ thành d và Đ thành D. Giữ nguyên hoa thường và mọi ký tự khác. */
export function stripDiacritics(text: string): string {
  // đ và Đ là chữ cái riêng, NFD không tách ra dấu, nên phải đổi tay.
  return text.normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

/** Dạng dùng để so khớp khi tìm kiếm: bỏ dấu, chữ thường, khoảng trắng liên tiếp thành một, cắt hai đầu. */
export function normalizeSearch(text: string): string {
  return stripDiacritics(text).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Dấu nháy bị bỏ hẳn thay vì thành khoảng trắng, để "don't" ra "dont" chứ không phải "don t". */
const APOSTROPHES = /['’‘`´]/g

/**
 * Nội dung chuyển khoản cho VietQR: chỉ gồm chữ cái, chữ số và khoảng trắng ASCII, không dấu,
 * khoảng trắng liên tiếp thành một, cắt hai đầu, rồi cắt cho vừa maxLength. Giữ nguyên hoa thường.
 * Nhiều ngân hàng giới hạn khoảng 25 ký tự và từ chối ký tự đặc biệt, nên mặc định cắt ở 25.
 */
export function toTransferMessage(text: string, maxLength = 25): string {
  const limit = Math.floor(maxLength)
  if (!(limit > 0)) return ''
  const ascii = stripDiacritics(text)
    .replace(APOSTROPHES, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  return ascii.slice(0, limit).trimEnd()
}

/**
 * Tên chủ tài khoản theo chuẩn ngân hàng: chữ hoa không dấu, khoảng trắng liên tiếp thành một.
 * Server chỉ trim, việc chuẩn hóa này thuộc về client.
 */
export function normalizeAccountName(text: string): string {
  return stripDiacritics(text).toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Số tài khoản: bỏ mọi khoảng trắng, người dùng hay dán dạng "0123 4567 89". */
export function normalizeAccountNumber(text: string): string {
  return text.replace(/\s+/g, '')
}
