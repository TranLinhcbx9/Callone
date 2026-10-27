/**
 * Cấu hình cho các mutation của module, tách khỏi React để test được bằng MutationObserver.
 * Hook trong các file useXxx.ts chỉ việc đưa cấu hình này vào useMutation.
 *
 * Quy tắc chung:
 * - Các lần ghi vào cùng một nhóm chạy lần lượt (hàng đợi trong writeQueue.ts), nhóm khác nhau chạy song song.
 * - Mọi lần ghi thành công đều đặt snapshot trả về vào cache của nhóm, không gọi lại bs_get_group. Việc đó nằm trong
 *   hàng đợi, nên lần ghi kế tiếp chỉ bắt đầu khi cache đã mới.
 * - Chỉ thử lại khi rớt mạng, và chỉ với thao tác gửi hai lần vẫn an toàn: ghi theo id do client sinh, xóa theo id, và
 *   (hợp đồng v1.1) tạo nhóm hoặc đổi link bằng token do client chọn, mọi lần thử lại dùng đúng token đó.
 *   bs_delete_group và sửa khoản chi theo version không bao giờ thử lại.
 */
import { mutationOptions, type QueryClient } from '@tanstack/react-query'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import type * as rpc from '@/modules/bill-split/api/rpc'
import { newGroupToken } from '@/modules/bill-split/api/token'
import type {
  CreateGroupInput,
  ExpenseInput,
  MemberInput,
  SettlementInput,
} from '@/modules/bill-split/domain/inputs'
import type { Expense, Group, Settlement } from '@/modules/bill-split/domain/types'
import {
  cachedGroup,
  commitGroup,
  invalidateSummaries,
  refreshGroupIfStale,
  removeGroupQueries,
} from '@/modules/bill-split/hooks/cache'
import { retryOnNetworkError, type RetryOptions } from '@/modules/bill-split/hooks/retry'
import { adoptRotatedToken, isSettledRotationFailure, rotationFlights } from '@/modules/bill-split/hooks/rotation'
import { groupWriteQueue } from '@/modules/bill-split/hooks/writeQueue'
import type { BillSplitStore } from '@/modules/bill-split/storage'
import type { AppError } from '@/shared/lib/errors'

/** Tầng gọi API, truyền vào để test thay bằng bản giả. Thật là `import * as rpc`. */
export type BillSplitApi = typeof rpc

export interface MutationDeps {
  queryClient: QueryClient
  api: BillSplitApi
  store: BillSplitStore
  retry?: RetryOptions
  /** Nguồn token nhóm mới (cho nhóm mới và cho lần đổi link), để test cố định. Mặc định là newGroupToken. */
  newToken?: () => string
}

export interface DeleteExpenseResult {
  group: Group
  /** Khoản chi vừa xóa lấy từ cache, để hoàn tác bằng cách lưu lại đúng id cũ. null nếu cache không có. */
  deleted: Expense | null
}

export interface DeleteSettlementResult {
  group: Group
  deleted: Settlement | null
}

export interface CreateGroupResult {
  token: string
  group: Group
}

export function createMutationOptions({ queryClient, api, store, retry, newToken = newGroupToken }: MutationDeps) {
  const queue = groupWriteQueue(queryClient)
  const flights = rotationFlights(queryClient)
  const safely = <T>(run: () => Promise<T>) => retryOnNetworkError(run, retry)
  const refreshIfStale = (error: unknown, variables: { token: string }) =>
    refreshGroupIfStale(queryClient, variables.token, error)

  /**
   * Một lần ghi vào nhóm, trả snapshot mới: chờ tới lượt trong hàng đợi của nhóm, gọi server, rồi đặt snapshot vào cache
   * trước khi nhả lượt cho lần ghi sau.
   */
  const write = (token: string, call: () => Promise<Group>): Promise<Group> =>
    queue.run(token, async () => {
      const group = await call()
      await commitGroup(queryClient, token, group)
      return group
    })

  /**
   * Đổi link một lần: ghi token mới xuống máy trước khi gọi server, gửi cặp (cũ, mới) với lần thử lại khi rớt mạng, và
   * chỉ khi server xác nhận mới chuyển mọi thứ sang token mới. Lỗi mà sau đó không thể thành công thì bỏ token đã chọn;
   * rớt mạng thì giữ lại, lần bấm sau (hoặc đường khôi phục trong rotation.ts) dùng lại đúng token đó.
   */
  const rotate = async (oldToken: string): Promise<string> => {
    const { newToken: chosen } = store.beginRotation(oldToken, newToken())
    let confirmed: string
    try {
      confirmed = await safely(() => api.rotateToken(oldToken, chosen))
    } catch (error) {
      if (isSettledRotationFailure(error)) store.clearPendingRotation(oldToken)
      throw error
    }
    await adoptRotatedToken({ queryClient, store }, oldToken, confirmed)
    return confirmed
  }

  return {
    /**
     * Token nhóm được chọn đúng một lần cho cả lần gọi (input.token, hoặc token mới nếu bỏ trống) và mọi lần thử lại sau
     * khi rớt mạng gửi đúng token đó: nếu lần trước đã tạo xong mà mất phản hồi, server trả lại nhóm đó thay vì tạo thêm.
     * Muốn gửi lại an toàn cả khi người dùng bấm lần nữa sau khi báo lỗi, trang phải giữ token và truyền vào mọi lần bấm.
     */
    createGroup: mutationOptions<CreateGroupResult, AppError, CreateGroupInput>({
      mutationFn: (input) => {
        const token = input.token ? input.token : newToken()
        return queue.run(token, () => safely(() => api.createGroup({ ...input, token })))
      },
      retry: false,
      onSuccess: ({ token, group }) => {
        queryClient.setQueryData(billSplitKeys.group(token), group)
        invalidateSummaries(queryClient)
        store.rememberGroup(token, group.name)
      },
    }),

    updateGroup: mutationOptions<Group, AppError, { token: string; name: string }>({
      mutationFn: ({ token, name }) => write(token, () => safely(() => api.updateGroup(token, name))),
      onSuccess: (group, { token }) => {
        store.rememberGroup(token, group.name)
      },
      onError: refreshIfStale,
    }),

    /**
     * Trả token mới. Token mới chỉ được trả ra (và chỉ chuyển cache, danh sách gần đây, "mình là ai" sang đó) sau khi
     * server xác nhận. Rớt mạng thì lần đổi link đang chờ được giữ trên máy: bấm lại dùng đúng token đã chọn, và nếu server
     * thật ra đã đổi xong thì nhận ngay token đó. Bấm hai lần khi lần đầu còn chạy thì dùng chung một lần chạy.
     * Phản hồi bị mất hẳn rồi mở lại app: xem resumePendingRotation trong rotation.ts và useRotationRecovery.
     */
    rotateToken: mutationOptions<string, AppError, { token: string }>({
      mutationFn: ({ token }) => {
        const running = flights.get(token)
        if (running) return running
        const flight = queue.run(token, () => rotate(token))
        flights.set(token, flight)
        const done = () => {
          if (flights.get(token) === flight) flights.delete(token)
        }
        void flight.then(done, done)
        return flight
      },
      retry: false,
      onError: refreshIfStale,
    }),

    /** Không tự thử lại: gửi lại sau khi mất phản hồi sẽ báo BS_GROUP_NOT_FOUND giả, trang đã xử lý trường hợp đó. */
    deleteGroup: mutationOptions<void, AppError, { token: string }>({
      mutationFn: ({ token }) => queue.run(token, () => api.deleteGroup(token)),
      retry: false,
      onSuccess: async (_data, { token }) => {
        await removeGroupQueries(queryClient, token)
        invalidateSummaries(queryClient)
        store.forgetGroup(token)
      },
    }),

    saveMember: mutationOptions<Group, AppError, { token: string; member: MemberInput }>({
      mutationFn: ({ token, member }) => write(token, () => safely(() => api.saveMember(token, member))),
      onSuccess: (_group, { member }) => {
        if (member.bank) store.setLastBank(member.bank)
      },
      onError: refreshIfStale,
    }),

    deleteMember: mutationOptions<Group, AppError, { token: string; memberId: string }>({
      mutationFn: ({ token, memberId }) => write(token, () => safely(() => api.deleteMember(token, memberId))),
      onError: refreshIfStale,
    }),

    /**
     * Tạo mới (expectedVersion null, cũng là hoàn tác xóa) gửi lại an toàn nhờ id do client sinh.
     * Sửa theo version thì không thử lại: nếu lần đầu đã thành công mà mất phản hồi, lần gửi lại sẽ báo xung đột giả.
     */
    saveExpense: mutationOptions<Group, AppError, { token: string; expense: ExpenseInput }>({
      mutationFn: ({ token, expense }) =>
        write(token, () => {
          const run = () => api.saveExpense(token, expense)
          return expense.expectedVersion === null ? safely(run) : run()
        }),
      onError: refreshIfStale,
    }),

    /** Trả kèm khoản chi vừa xóa để giao diện hiện nút "Hoàn tác" (lưu lại bằng saveExpense, expectedVersion null). */
    deleteExpense: mutationOptions<DeleteExpenseResult, AppError, { token: string; expenseId: string }>({
      mutationFn: ({ token, expenseId }) =>
        queue.run(token, async () => {
          // Đọc cache khi đã tới lượt: các lần ghi trước trong hàng đợi đã cập nhật xong.
          const deleted = cachedGroup(queryClient, token)?.expenses.find((expense) => expense.id === expenseId) ?? null
          const group = await safely(() => api.deleteExpense(token, expenseId))
          await commitGroup(queryClient, token, group)
          return { group, deleted }
        }),
      onError: refreshIfStale,
    }),

    saveSettlement: mutationOptions<Group, AppError, { token: string; settlement: SettlementInput }>({
      mutationFn: ({ token, settlement }) => write(token, () => safely(() => api.saveSettlement(token, settlement))),
      onError: refreshIfStale,
    }),

    deleteSettlement: mutationOptions<DeleteSettlementResult, AppError, { token: string; settlementId: string }>({
      mutationFn: ({ token, settlementId }) =>
        queue.run(token, async () => {
          const deleted = cachedGroup(queryClient, token)?.settlements.find((s) => s.id === settlementId) ?? null
          const group = await safely(() => api.deleteSettlement(token, settlementId))
          await commitGroup(queryClient, token, group)
          return { group, deleted }
        }),
      onError: refreshIfStale,
    }),
  }
}

export type MutationOptionsMap = ReturnType<typeof createMutationOptions>
