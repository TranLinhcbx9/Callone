/**
 * Các mutation của module. Mọi lần ghi thành công đều cập nhật cache của nhóm bằng snapshot server trả về,
 * giao diện thấy dữ liệu mới ngay mà không phải tải lại.
 *
 * Hoàn tác xóa khoản chi: useDeleteExpense trả kèm `deleted`; để hoàn tác gọi useSaveExpense với
 * expenseToInput(deleted, null), tức lưu lại đúng id cũ và không có expectedVersion.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import * as rpc from '@/modules/bill-split/api/rpc'
import { createMutationOptions } from '@/modules/bill-split/hooks/mutationOptions'
import { billSplitStore } from '@/modules/bill-split/storage'

function useMutationOptions() {
  const queryClient = useQueryClient()
  return useMemo(() => createMutationOptions({ queryClient, api: rpc, store: billSplitStore }), [queryClient])
}

export const useCreateGroup = () => useMutation(useMutationOptions().createGroup)
export const useUpdateGroup = () => useMutation(useMutationOptions().updateGroup)
export const useRotateToken = () => useMutation(useMutationOptions().rotateToken)
export const useDeleteGroup = () => useMutation(useMutationOptions().deleteGroup)
export const useSaveMember = () => useMutation(useMutationOptions().saveMember)
export const useDeleteMember = () => useMutation(useMutationOptions().deleteMember)
export const useSaveExpense = () => useMutation(useMutationOptions().saveExpense)
export const useDeleteExpense = () => useMutation(useMutationOptions().deleteExpense)
export const useSaveSettlement = () => useMutation(useMutationOptions().saveSettlement)
export const useDeleteSettlement = () => useMutation(useMutationOptions().deleteSettlement)
