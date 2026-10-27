import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import { getGroup, getGroupSummaries } from '@/modules/bill-split/api/rpc'
import type { Group, GroupSummary } from '@/modules/bill-split/domain/types'
import { AppError, toAppError } from '@/shared/lib/errors'

/**
 * Cấu hình truy vấn một nhóm. Token sai định dạng báo luôn BS_GROUP_NOT_FOUND ở client, không tốn một lượt gọi mạng,
 * để trang xử lý chung một đường lỗi với trường hợp token đúng dạng nhưng không tồn tại.
 */
export function groupQueryOptions(token: string) {
  return queryOptions<Group, AppError>({
    queryKey: billSplitKeys.group(token),
    queryFn: async () => {
      if (!TOKEN_PATTERN.test(token)) {
        throw new AppError({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404, message: 'Token sai định dạng' })
      }
      try {
        return await getGroup(token)
      } catch (error) {
        throw toAppError(error)
      }
    },
  })
}

/**
 * Toàn bộ một nhóm (thành viên, khoản chi, thanh toán). Tải lại khi quay lại app (cấu hình chung ở providers).
 * Mọi hàm ghi cập nhật thẳng cache này bằng snapshot server trả về.
 */
export function useGroup(token: string | undefined) {
  return useQuery({ ...groupQueryOptions(token ?? ''), enabled: Boolean(token) })
}

/**
 * Tóm tắt các nhóm đã lưu trên máy, cho trang Home. Token sai hoặc nhóm đã xóa bị server bỏ qua nên không có
 * trong kết quả. Giữ kết quả cũ trong lúc danh sách token đổi để danh sách không nhấp nháy. Danh sách dài hơn 50 token
 * được rpc.getGroupSummaries tự chia lô và gộp lại.
 */
export function useGroupSummaries(tokens: readonly string[]) {
  return useQuery<GroupSummary[], AppError>({
    queryKey: billSplitKeys.summariesFor(tokens),
    queryFn: async () => {
      try {
        return await getGroupSummaries(tokens)
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: tokens.length > 0,
    placeholderData: keepPreviousData,
  })
}
