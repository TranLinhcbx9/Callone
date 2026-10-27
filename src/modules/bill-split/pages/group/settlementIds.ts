/**
 * Id của lần ghi nhận trả nợ, giữ nguyên giữa các lần bấm cho tới khi biết chắc kết quả.
 *
 * Vì sao: bấm "Đã trả" gửi một lần ghi lên server, và phản hồi có thể bị mất sau khi server đã ghi xong (rớt mạng giữa
 * chừng). Người dùng thấy lỗi nên bấm lại; nếu mỗi lần bấm sinh một id mới thì lần hai ghi thêm một lần trả nữa và số dư
 * bị đảo chiều. Server ghi đè theo id (bs_save_settlement), nên gửi lại đúng id cũ chỉ ghi đè chính nó, an toàn.
 *
 * Khóa là (nhóm, người trả, người nhận, số tiền): cùng một món nợ thì cùng id, số tiền khác (nhóm vừa có khoản chi mới)
 * là một lần trả khác nên id khác. Id bị bỏ khi biết chắc kết quả: đã ghi xong, hoặc server từ chối rõ ràng bằng một lỗi
 * BS_* (lần ghi đó chắc chắn chưa xảy ra). Rớt mạng và lỗi lạ thì chưa biết server đã ghi hay chưa nên giữ id.
 * Dữ liệu chỉ nằm trong bộ nhớ của trang: tải lại trang thì mất, và lúc đó lần bấm tiếp theo là một lần trả mới.
 */
import type { Transfer } from '@/modules/bill-split/domain/types'
import { toAppError } from '@/shared/lib/errors'
import { newId } from '@/shared/lib/id'

/** Khóa của một món nợ cần trả: nhóm, người trả, người nhận và số tiền. */
export function settlementKey(token: string, transfer: Transfer): string {
  return `${token}:${transfer.fromMemberId}:${transfer.toMemberId}:${transfer.amount}`
}

export interface SettlementIdBook {
  /** Id cho lần ghi của khóa này: dùng lại id đang chờ kết quả nếu có, không thì sinh mới và nhớ lại. */
  claim(key: string): string
  /** Đã biết chắc kết quả (ghi xong, hoặc bị server từ chối rõ ràng): quên id, lần bấm sau là một lần trả mới. */
  settle(key: string): void
}

/** Sổ id riêng, để test được mà không đụng sổ dùng chung của app. */
export function createSettlementIdBook(makeId: () => string = newId): SettlementIdBook {
  const pending = new Map<string, string>()
  return {
    claim(key) {
      const existing = pending.get(key)
      if (existing !== undefined) return existing
      const id = makeId()
      pending.set(key, id)
      return id
    },
    settle(key) {
      pending.delete(key)
    },
  }
}

/** Sổ dùng chung của app. Nằm ngoài component để đổi tab rồi quay lại vẫn bấm lại được với đúng id cũ. */
export const settlementIds: SettlementIdBook = createSettlementIdBook()

/**
 * Lỗi là câu trả lời rõ ràng của server (một mã BS_*), tức lần ghi chắc chắn chưa xảy ra. Rớt mạng, mất phản hồi,
 * lỗi 5xx hay lỗi lạ thì không biết server đã ghi hay chưa, nên không tính là từ chối.
 */
export function isDefiniteRejection(error: unknown): boolean {
  return toAppError(error).kind === 'app'
}
