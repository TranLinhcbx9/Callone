/**
 * Đổi link (bs_rotate_token) an toàn khi mất phản hồi, theo hợp đồng v1.1.
 *
 * Vấn đề: server đổi token xong mà phản hồi không về tới máy. Token cũ đã chết, token mới chỉ server biết, nhóm mất link.
 * Cách giải: token mới do máy này chọn và ghi xuống localStorage TRƯỚC khi gọi server (store.beginRotation). Gửi lại
 * đúng cặp (token cũ, token mới) thì server nhận ra và trả token mới thay vì lỗi. Link mới chỉ được đưa ra giao diện
 * sau khi server xác nhận.
 *
 * File này gồm hai việc dùng chung cho mutation đổi link và cho đường khôi phục:
 * - adoptRotatedToken: sau khi server xác nhận, chuyển cache, danh sách gần đây và "mình là ai" sang token mới.
 * - resumePendingRotation: hỏi server xem lần đổi link đang chờ của một token đã thành chưa.
 */
import type { QueryClient } from '@tanstack/react-query'
import { getInvalidDetail } from '@/modules/bill-split/api/errors'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import type * as rpc from '@/modules/bill-split/api/rpc'
import { copyGroupCache, invalidateSummaries } from '@/modules/bill-split/hooks/cache'
import type { BillSplitStore } from '@/modules/bill-split/storage'
import { toAppError } from '@/shared/lib/errors'

export interface RotationDeps {
  queryClient: QueryClient
  store: BillSplitStore
}

export interface ResumeDeps extends RotationDeps {
  api: Pick<typeof rpc, 'getGroupSummaries'>
}

/**
 * Server đã xác nhận token mới: sao cache nhóm sang key mới (key cũ để nguyên cho tới khi bị dọn, để trang đang mở không
 * nháy lỗi trước khi điều hướng), làm mới danh sách tóm tắt, chuyển danh sách gần đây và "mình là ai" sang token mới
 * và xóa lần đổi link đang chờ, hai việc cuối trong cùng một lần ghi. Gọi lại nhiều lần cũng an toàn.
 */
export async function adoptRotatedToken(
  { queryClient, store }: RotationDeps,
  oldToken: string,
  newToken: string,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: billSplitKeys.group(oldToken) })
  copyGroupCache(queryClient, oldToken, newToken)
  invalidateSummaries(queryClient)
  store.replaceToken(oldToken, newToken)
}

/**
 * Lỗi mà sau đó lần đổi link đang chờ không thể thành công nữa, nên bỏ nó đi (lần sau chọn token mới):
 * - BS_GROUP_NOT_FOUND: token cũ đã chết và không nhóm nào giữ token mới, nghĩa là người khác đã đổi link hoặc xóa nhóm.
 * - BS_INVALID ở new_token: token mới đã bị chiếm (id_taken) hoặc sai dạng, gửi lại vẫn vậy.
 * - Server cũ chưa có chữ ký hàm mới (outdated): lần gọi chắc chắn chưa được áp dụng.
 * Rớt mạng, lỗi 5xx, lỗi lạ thì KHÔNG nằm trong đây: không biết server đã làm hay chưa, phải giữ token mới để hỏi lại.
 */
export function isSettledRotationFailure(error: unknown): boolean {
  const appError = toAppError(error)
  if (appError.kind === 'outdated') return true
  if (appError.code === 'BS_GROUP_NOT_FOUND') return true
  return getInvalidDetail(appError)?.field === 'new_token'
}

/**
 * Xác nhận với server lần đổi link đang chờ của oldToken, CHỈ ĐỌC (bs_get_groups [token cũ, token mới]), không bao giờ
 * tự đổi link:
 * - Token mới đang sống: lần đổi đã thành công nhưng phản hồi bị mất. Chuyển mọi thứ sang token mới và trả nó.
 * - Token cũ còn sống: lần đổi chưa tới server. Giữ nguyên lần đang chờ, trả null (người dùng bấm "Đổi link" lại thì
 *   dùng đúng token mới đã chọn).
 * - Cả hai đều không sống: không còn gì để khôi phục (nhóm bị xóa, hoặc người khác đã đổi link). Bỏ lần đang chờ, trả null.
 * Không có lần đang chờ thì trả null. Rớt mạng thì ném AppError và giữ nguyên lần đang chờ.
 */
export async function resumePendingRotation(deps: ResumeDeps, oldToken: string): Promise<string | null> {
  const pending = deps.store.getPendingRotation(oldToken)
  if (!pending) return null

  const alive = new Set((await deps.api.getGroupSummaries([oldToken, pending.newToken])).map((item) => item.token))
  if (alive.has(pending.newToken)) {
    await adoptRotatedToken(deps, oldToken, pending.newToken)
    return pending.newToken
  }
  // Lần đang chờ có thể đã đổi trong lúc chờ phản hồi (xong, hoặc bắt đầu lại): chỉ bỏ đúng lần đã hỏi.
  const stillSame = deps.store.getPendingRotation(oldToken)?.newToken === pending.newToken
  if (!alive.has(oldToken) && stillSame) deps.store.clearPendingRotation(oldToken)
  return null
}

const flights = new WeakMap<QueryClient, Map<string, Promise<string>>>()

/** Các lần đổi link đang chạy của một QueryClient, theo token cũ. Bấm hai lần thì dùng chung một lần chạy. */
export function rotationFlights(queryClient: QueryClient): Map<string, Promise<string>> {
  let map = flights.get(queryClient)
  if (!map) {
    map = new Map()
    flights.set(queryClient, map)
  }
  return map
}
