/**
 * Dữ liệu người dùng gửi lên khi ghi (camelCase, cùng kiểu với domain/types.ts).
 * Tầng api/rpc.ts đổi chúng sang tham số snake_case của hàm RPC, chuẩn hóa chữ và bỏ tham số rỗng.
 */
import type { BankAccount, Share, SplitMode } from '@/modules/bill-split/domain/types'

export interface CreateGroupInput {
  name: string
  /** Tên thành viên ban đầu, theo thứ tự hiển thị. */
  memberNames: string[]
  /**
   * Token do client chọn cho nhóm mới (newGroupToken()), gửi là p_token từ hợp đồng v1.1. Gửi lại cùng token thì server
   * trả đúng nhóm đã tạo thay vì tạo thêm, nên form giữ nguyên token giữa các lần bấm cho cùng một nội dung.
   * Bỏ trống thì rpc tự sinh token mới cho mỗi lần gọi.
   */
  token?: string
}

/** Tạo mới (id chưa có trong nhóm) hoặc ghi đè (id đã có) một thành viên cùng thông tin ngân hàng. */
export interface MemberInput {
  id: string
  name: string
  /** null nghĩa là không có thông tin ngân hàng, và xóa thông tin cũ nếu đang sửa. */
  bank: BankAccount | null
}

export interface ExpenseInput {
  id: string
  title: string
  amount: number
  paidBy: string
  /** YYYY-MM-DD */
  spentOn: string
  splitMode: SplitMode
  /** Chỉ gồm người có phần lớn hơn 0, tổng bằng amount. */
  shares: Share[]
  note: string | null
  /** null khi tạo mới hoặc hoàn tác xóa, bằng version hiện tại khi sửa (server báo xung đột nếu đã đổi). */
  expectedVersion: number | null
}

export interface SettlementInput {
  id: string
  fromMemberId: string
  toMemberId: string
  amount: number
  /** YYYY-MM-DD */
  settledOn: string
  note: string | null
}
