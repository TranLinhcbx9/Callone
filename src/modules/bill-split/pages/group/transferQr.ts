/**
 * Mã VietQR cho một lần chuyển khoản trả nợ trong nhóm.
 *
 * Nội dung chuyển khoản gợi ý là "Chia tien <tên nhóm>". Domain (toTransferMessage) bỏ dấu, chỉ giữ chữ và số
 * rồi cắt còn 25 ký tự cho vừa giới hạn của ngân hàng, nên "Chia tiền Đà Lạt 3N2Đ" thành "Chia tien Da Lat 3N2D".
 * Người nhận thấy ngay khoản này thuộc nhóm nào; người gửi đã có tên trong lịch sử giao dịch của ngân hàng.
 */
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { tryBuildTransferQr, type TransferQr } from '@/modules/bill-split/domain/vietqr'

/** Chữ gợi ý trước khi làm sạch. Dùng hàm này ở cả giao diện lẫn test để hai bên luôn cùng một nội dung. */
export function transferNote(groupName: string): string {
  return `Chia tiền ${groupName}`
}

/**
 * Mã QR trả `amount` đồng vào tài khoản `bank` ({ payload, message }: chuỗi để vẽ mã và nội dung đã làm sạch nằm trong đó).
 * Trả null nếu domain từ chối (số tiền ngoài 1 tới MAX_QR_AMOUNT, tài khoản sai dạng), để giao diện báo lỗi thay vì sập trang.
 */
export function buildGroupTransferQr(bank: BankAccount, amount: number, groupName: string): TransferQr | null {
  return tryBuildTransferQr(bank, amount, transferNote(groupName))
}
