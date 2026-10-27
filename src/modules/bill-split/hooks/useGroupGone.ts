import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useForgetGroup, useRecentGroups } from '@/modules/bill-split/hooks/useLocalState'
import { billSplitPaths } from '@/modules/bill-split/paths'
import { billSplitStore } from '@/modules/bill-split/storage'

export interface GroupGoneActions {
  /** Trang Chia tiền. */
  homeHref: string
  /** "Dán link khác": về trang Chia tiền và focus sẵn vào ô dán link. */
  onPasteOther: () => void
  /**
   * Chỉ có khi nhóm này đang lưu trên máy và không có lần đổi link nào đang chờ: xóa khỏi máy này rồi về trang Chia tiền.
   * Còn lần đổi link đang chờ thì không mời xóa, vì xóa khỏi máy cũng xóa luôn token mới và nhóm có thể vẫn còn dưới token đó.
   */
  onForget?: () => void
}

/**
 * Các hành động của trạng thái "không tìm thấy nhóm" (link sai, đã được đổi hoặc nhóm đã bị xóa), dùng chung cho
 * trang nhóm và form khoản chi. Nhóm còn nằm trong danh sách gần đây thì cho xóa khỏi máy này.
 */
export function useGroupGone(token: string): GroupGoneActions {
  const navigate = useNavigate()
  const recents = useRecentGroups()
  const forgetGroup = useForgetGroup()
  const homeHref = billSplitPaths.home()
  const saved = recents.some((group) => group.token === token)
  const hasPendingRotation = billSplitStore.getPendingRotation(token) !== null

  const onPasteOther = useCallback(() => navigate(homeHref, { state: { focusPaste: true } }), [navigate, homeHref])
  const onForget = useCallback(() => {
    forgetGroup(token)
    navigate(homeHref, { replace: true })
    toast.success('Đã xóa nhóm khỏi máy này')
  }, [forgetGroup, navigate, homeHref, token])

  return { homeHref, onPasteOther, onForget: saved && !hasPendingRotation ? onForget : undefined }
}
