/**
 * Cập nhật cache React Query sau khi ghi. Mọi hàm ghi của server trả về snapshot mới nhất,
 * nên ghi thẳng snapshot đó vào cache, không cần gọi lại bs_get_group.
 */
import type { QueryClient } from '@tanstack/react-query'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import type { Group } from '@/modules/bill-split/domain/types'
import { toAppError } from '@/shared/lib/errors'

/** Làm mới mọi danh sách tóm tắt nhóm (trang Home). Chỉ query đang hiển thị mới tải lại ngay. */
export function invalidateSummaries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: billSplitKeys.summaries() })
}

/**
 * Đặt snapshot mới nhất của nhóm vào cache. Hủy trước các lần tải đang chạy, vì một lần tải bắt đầu
 * trước khi ghi có thể trả về sau và đè dữ liệu cũ lên snapshot mới.
 */
export async function commitGroup(queryClient: QueryClient, token: string, group: Group): Promise<void> {
  await queryClient.cancelQueries({ queryKey: billSplitKeys.group(token) })
  queryClient.setQueryData(billSplitKeys.group(token), group)
  invalidateSummaries(queryClient)
}

/** Mã lỗi cho biết bản nhóm đang có trong cache đã cũ so với server. */
const STALE_CACHE_CODES: ReadonlySet<string> = new Set([
  'BS_CONFLICT',
  'BS_NOT_FOUND',
  'BS_MEMBER_IN_USE',
  'BS_GROUP_NOT_FOUND',
])

/**
 * Sau một lần ghi thất bại vì dữ liệu đã đổi (xung đột, đã bị xóa, thành viên đã có giao dịch, link đã đổi),
 * đánh dấu cache của nhóm là cũ để tải lại ngay, giao diện thấy bản mới nhất mà không cần người dùng làm gì.
 */
export function refreshGroupIfStale(queryClient: QueryClient, token: string, error: unknown): void {
  if (!STALE_CACHE_CODES.has(toAppError(error).code)) return
  void queryClient.invalidateQueries({ queryKey: billSplitKeys.group(token) })
}

/** Nhóm đang có trong cache, để lấy khoản chi hoặc thanh toán vừa xóa phục vụ hoàn tác. */
export function cachedGroup(queryClient: QueryClient, token: string): Group | undefined {
  return queryClient.getQueryData<Group>(billSplitKeys.group(token))
}
