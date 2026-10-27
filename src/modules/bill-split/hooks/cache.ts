/**
 * Cập nhật cache React Query sau khi ghi. Mọi hàm ghi của server trả về snapshot mới nhất,
 * nên ghi thẳng snapshot đó vào cache, không cần gọi lại bs_get_group.
 */
import type { QueryClient } from '@tanstack/react-query'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import { compareTimestamps } from '@/modules/bill-split/api/timestamp'
import type { Group } from '@/modules/bill-split/domain/types'
import { toAppError } from '@/shared/lib/errors'

/** Làm mới mọi danh sách tóm tắt nhóm (trang Home). Chỉ query đang hiển thị mới tải lại ngay. */
export function invalidateSummaries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: billSplitKeys.summaries() })
}

/** Nhóm đang có trong cache, để lấy khoản chi hoặc thanh toán vừa xóa phục vụ hoàn tác. */
export function cachedGroup(queryClient: QueryClient, token: string): Group | undefined {
  return queryClient.getQueryData<Group>(billSplitKeys.group(token))
}

/**
 * snapshot có CŨ HƠN bản đang có trong cache không? Chỉ khi cùng một nhóm và updatedAt của server (micro giây) nhỏ hơn
 * hẳn. Bằng nhau thì không: cùng thời điểm là cùng nội dung (gửi lại không ghi gì), và thiếu thông tin thì không đoán.
 */
function isOlderThanCached(snapshot: Group, cached: Group): boolean {
  if (snapshot.id !== cached.id) return false
  return (compareTimestamps(snapshot.updatedAt, cached.updatedAt) ?? 0) < 0
}

/**
 * Đặt snapshot mới nhất của nhóm vào cache. Hủy trước các lần tải đang chạy, vì một lần tải bắt đầu
 * trước khi ghi có thể trả về sau và đè dữ liệu cũ lên snapshot mới.
 *
 * Không lùi về bản cũ hơn: nếu cache đang giữ bản có updatedAt mới hơn hẳn (ví dụ một lần tải xong trong lúc lần ghi
 * này còn trên đường về, và đã thấy cả thay đổi của máy khác) thì snapshot này bị bỏ qua. Để chắc ăn, cache còn được
 * đánh dấu cũ và tải lại ngay: updatedAt là now() của server, tức giờ bắt đầu giao dịch chứ không phải giờ khóa được
 * dòng nhóm, nên hai lần ghi chồng nhau trong vài mili giây có thể mang mốc ngược thứ tự, và khi đó bản bị bỏ qua
 * mới là bản đúng. Tệ nhất tốn một lần tải. Mốc bằng nhau hoặc không so được thì ghi như bình thường.
 */
export async function commitGroup(queryClient: QueryClient, token: string, group: Group): Promise<void> {
  const queryKey = billSplitKeys.group(token)
  await queryClient.cancelQueries({ queryKey })
  const cached = cachedGroup(queryClient, token)
  if (cached && isOlderThanCached(group, cached)) {
    void queryClient.invalidateQueries({ queryKey })
  } else {
    queryClient.setQueryData(queryKey, group)
  }
  invalidateSummaries(queryClient)
}

/** Xóa hẳn mọi query của một nhóm khỏi cache (nhóm đã xóa), sau khi hủy các lần tải đang chạy. */
export async function removeGroupQueries(queryClient: QueryClient, token: string): Promise<void> {
  const queryKey = billSplitKeys.group(token)
  await queryClient.cancelQueries({ queryKey })
  queryClient.removeQueries({ queryKey })
}

/**
 * Sao dữ liệu cache của nhóm sang key của token khác, để trang mở bằng token mới có dữ liệu ngay. Không đè nếu key
 * đích đã có dữ liệu (bản đó có thể mới hơn). Key nguồn để nguyên cho tới khi bị dọn, để trang đang mở không nháy lỗi
 * trước khi điều hướng.
 */
export function copyGroupCache(queryClient: QueryClient, fromToken: string, toToken: string): void {
  const group = cachedGroup(queryClient, fromToken)
  if (group && cachedGroup(queryClient, toToken) === undefined) {
    queryClient.setQueryData(billSplitKeys.group(toToken), group)
  }
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
