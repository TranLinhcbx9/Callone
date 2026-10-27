/**
 * Chuẩn hóa thông tin ngân hàng của thành viên về đúng dạng gửi lên server (rpc.saveMember). Số tài khoản dán từ app
 * ngân hàng hay lẫn khoảng trắng và ký tự vô hình; làm sạch ở client để server không phải từ chối.
 * Chỉ dùng cho dữ liệu gửi đi: máy này không nhớ số tài khoản hay tên chủ tài khoản của ai (xem storage.ts).
 */
import { normalizeAccountName, normalizeAccountNumber } from '@/modules/bill-split/domain/text'
import type { BankAccount } from '@/modules/bill-split/domain/types'

/**
 * Ký tự định dạng vô hình (Unicode Cf): độ rộng bằng 0, dấu hướng chữ, gạch nối mềm, BOM. Client bỏ TOÀN BỘ nhóm này
 * trước khi gửi. Server chỉ bỏ đúng tập trong hợp đồng (NBSP, U+200B tới U+200D, U+2060, U+FEFF và khoảng trắng
 * Unicode) trong bs_save_member; các ký tự Cf còn lại như U+200E, U+200F, U+00AD hay ký tự điều khiển hai chiều thì
 * server từ chối với BS_INVALID format. Bỏ sớm ở client để số dán từ app ngân hàng có chúng vẫn lưu được.
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
