import { useCallback, useState } from 'react'
import type { Member } from '@/modules/bill-split/domain/types'

interface MemberDialogState {
  open: boolean
  /** Người đang sửa, null là thêm người mới. Giữ nguyên khi đóng để nội dung không đổi giữa lúc hộp trượt xuống. */
  member: Member | null
  /** Tăng mỗi lần mở. Dùng làm `key` của MemberDialog để mỗi lần mở là một form mới, không dính chữ lần trước. */
  session: number
}

/**
 * Trạng thái mở, đóng hộp thành viên, dùng chung cho tab Số dư ("Nhập ngay") và tab Thành viên.
 * Dùng cùng MemberDialog: `<MemberDialog key={dialog.session} ... member={dialog.member} open={dialog.open} />`.
 */
export function useMemberDialog() {
  const [state, setState] = useState<MemberDialogState>({ open: false, member: null, session: 0 })

  const openFor = useCallback((member: Member | null) => {
    setState((current) => ({ open: true, member, session: current.session + 1 }))
  }, [])

  const onOpenChange = useCallback((open: boolean) => {
    setState((current) => ({ ...current, open }))
  }, [])

  return { ...state, openFor, onOpenChange }
}
