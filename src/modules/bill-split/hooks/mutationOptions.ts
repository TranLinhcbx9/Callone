/**
 * Cấu hình cho các mutation của module, tách khỏi React để test được bằng MutationObserver.
 * Hook trong các file useXxx.ts chỉ việc đưa cấu hình này vào useMutation.
 *
 * Quy tắc chung:
 * - Mọi lần ghi thành công đều đặt snapshot trả về vào cache của nhóm, không gọi lại bs_get_group.
 * - Chỉ thử lại khi rớt mạng, và chỉ với thao tác gửi hai lần vẫn an toàn (ghi theo id do client sinh,
 *   xóa theo id). bs_create_group, bs_rotate_token, bs_delete_group và sửa theo version không bao giờ thử lại.
 */
import { mutationOptions, type QueryClient } from '@tanstack/react-query'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import type * as rpc from '@/modules/bill-split/api/rpc'
import type {
  CreateGroupInput,
  ExpenseInput,
  MemberInput,
  SettlementInput,
} from '@/modules/bill-split/domain/inputs'
import type { Expense, Group, Settlement } from '@/modules/bill-split/domain/types'
import { cachedGroup, commitGroup, invalidateSummaries, refreshGroupIfStale } from '@/modules/bill-split/hooks/cache'
import { retryOnNetworkError, type RetryOptions } from '@/modules/bill-split/hooks/retry'
import type { BillSplitStore } from '@/modules/bill-split/storage'
import type { AppError } from '@/shared/lib/errors'

/** Tầng gọi API, truyền vào để test thay bằng bản giả. Thật là `import * as rpc`. */
export type BillSplitApi = typeof rpc

export interface MutationDeps {
  queryClient: QueryClient
  api: BillSplitApi
  store: BillSplitStore
  retry?: RetryOptions
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

export function createMutationOptions({ queryClient, api, store, retry }: MutationDeps) {
  const safely = <T>(run: () => Promise<T>) => retryOnNetworkError(run, retry)
  const commit = (group: Group, variables: { token: string }) => commitGroup(queryClient, variables.token, group)
  const refreshIfStale = (error: unknown, variables: { token: string }) =>
    refreshGroupIfStale(queryClient, variables.token, error)

  return {
    /** Không bao giờ tự thử lại: gửi hai lần sẽ tạo hai nhóm. */
    createGroup: mutationOptions<{ token: string; group: Group }, AppError, CreateGroupInput>({
      mutationFn: (input) => api.createGroup(input),
      retry: false,
      onSuccess: ({ token, group }) => {
        queryClient.setQueryData(billSplitKeys.group(token), group)
        invalidateSummaries(queryClient)
        store.rememberGroup(token, group.name)
      },
    }),

    updateGroup: mutationOptions<Group, AppError, { token: string; name: string }>({
      mutationFn: ({ token, name }) => safely(() => api.updateGroup(token, name)),
      onSuccess: async (group, variables) => {
        await commit(group, variables)
        store.rememberGroup(variables.token, group.name)
      },
      onError: refreshIfStale,
    }),

    /**
     * Trả token mới. Cache của nhóm được sao sang key mới, key cũ để nguyên cho tới khi bị dọn (không xóa ngay
     * để trang đang mở không nháy lỗi trước khi điều hướng sang link mới). Danh sách gần đây và "mình là ai"
     * chuyển sang token mới.
     */
    rotateToken: mutationOptions<string, AppError, { token: string }>({
      mutationFn: ({ token }) => api.rotateToken(token),
      retry: false,
      onSuccess: async (newToken, { token }) => {
        await queryClient.cancelQueries({ queryKey: billSplitKeys.group(token) })
        const group = cachedGroup(queryClient, token)
        if (group) queryClient.setQueryData(billSplitKeys.group(newToken), group)
        invalidateSummaries(queryClient)
        store.replaceToken(token, newToken)
      },
    }),

    deleteGroup: mutationOptions<void, AppError, { token: string }>({
      mutationFn: ({ token }) => api.deleteGroup(token),
      retry: false,
      onSuccess: async (_data, { token }) => {
        await queryClient.cancelQueries({ queryKey: billSplitKeys.group(token) })
        invalidateSummaries(queryClient)
        store.forgetGroup(token)
      },
    }),

    saveMember: mutationOptions<Group, AppError, { token: string; member: MemberInput }>({
      mutationFn: ({ token, member }) => safely(() => api.saveMember(token, member)),
      onSuccess: async (group, variables) => {
        await commit(group, variables)
        if (variables.member.bank) store.setLastBank(variables.member.bank)
      },
      onError: refreshIfStale,
    }),

    deleteMember: mutationOptions<Group, AppError, { token: string; memberId: string }>({
      mutationFn: ({ token, memberId }) => safely(() => api.deleteMember(token, memberId)),
      onSuccess: commit,
      onError: refreshIfStale,
    }),

    /**
     * Tạo mới (expectedVersion null, cũng là hoàn tác xóa) gửi lại an toàn nhờ id do client sinh.
     * Sửa theo version thì không thử lại: nếu lần đầu đã thành công mà mất phản hồi, lần gửi lại sẽ báo xung đột giả.
     */
    saveExpense: mutationOptions<Group, AppError, { token: string; expense: ExpenseInput }>({
      mutationFn: ({ token, expense }) => {
        const run = () => api.saveExpense(token, expense)
        return expense.expectedVersion === null ? safely(run) : run()
      },
      onSuccess: commit,
      onError: refreshIfStale,
    }),

    /** Trả kèm khoản chi vừa xóa để giao diện hiện nút "Hoàn tác" (lưu lại bằng saveExpense, expectedVersion null). */
    deleteExpense: mutationOptions<DeleteExpenseResult, AppError, { token: string; expenseId: string }>({
      mutationFn: async ({ token, expenseId }) => {
        const deleted = cachedGroup(queryClient, token)?.expenses.find((expense) => expense.id === expenseId) ?? null
        const group = await safely(() => api.deleteExpense(token, expenseId))
        return { group, deleted }
      },
      onSuccess: ({ group }, variables) => commit(group, variables),
      onError: refreshIfStale,
    }),

    saveSettlement: mutationOptions<Group, AppError, { token: string; settlement: SettlementInput }>({
      mutationFn: ({ token, settlement }) => safely(() => api.saveSettlement(token, settlement)),
      onSuccess: commit,
      onError: refreshIfStale,
    }),

    deleteSettlement: mutationOptions<DeleteSettlementResult, AppError, { token: string; settlementId: string }>({
      mutationFn: async ({ token, settlementId }) => {
        const deleted = cachedGroup(queryClient, token)?.settlements.find((s) => s.id === settlementId) ?? null
        const group = await safely(() => api.deleteSettlement(token, settlementId))
        return { group, deleted }
      },
      onSuccess: ({ group }, variables) => commit(group, variables),
      onError: refreshIfStale,
    }),
  }
}

export type MutationOptionsMap = ReturnType<typeof createMutationOptions>
