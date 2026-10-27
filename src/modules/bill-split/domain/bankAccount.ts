/**
 * Chuẩn hóa thông tin ngân hàng của thành viên về đúng dạng gửi lên server và lưu trên máy.
 * Một nơi duy nhất cho cả hai việc, để thứ gửi đi và thứ nhớ lại luôn giống nhau: nếu lưu "0123 456 789" nguyên
 * văn thì lần đọc lại bị từ chối vì có dấu cách, và ngân hàng gần nhất bị xóa mất.
 */
import { normalizeAccountName, normalizeAccountNumber } from '@/modules/bill-split/domain/text'
import type { BankAccount } from '@/modules/bill-split/domain/types'

/**
 * Ký tự định dạng vô hình (Unicode Cf): độ rộng bằng 0, dấu hướng chữ, gạch nối mềm, BOM. Số tài khoản dán từ app ngân
 * hàng hay mang theo chúng. Server cũng bỏ chúng (cùng với NBSP) trong bs_save_member, nên bỏ trước ở client để nhớ lại
 * đúng thứ đã gửi và để mã BIN, số tài khoản trong mã QR không lẫn ký tự lạ.
 */
const INVISIBLE_FORMAT_CHARS = /\p{Cf}+/gu

/**
 * Số tài khoản bỏ mọi khoảng trắng (kể cả NBSP) và ký tự vô hình, tên chủ tài khoản viết hoa không dấu (rỗng thì null).
 * BIN giữ nguyên. Chuẩn hóa hai lần ra cùng kết quả.
 */
export function normalizeBankAccount(bank: BankAccount): BankAccount {
  return {
    bin: bank.bin,
    accountNumber: normalizeAccountNumber(bank.accountNumber).replace(INVISIBLE_FORMAT_CHARS, ''),
    accountName: normalizeAccountName(bank.accountName ?? '') || null,
  }
}
