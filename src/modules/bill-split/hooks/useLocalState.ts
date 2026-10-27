/**
 * Hook đọc dữ liệu lưu trên máy (nhóm gần đây, "mình là ai", ngân hàng gần nhất) và tự cập nhật khi đổi,
 * kể cả khi tab khác của cùng trình duyệt ghi vào.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { MAX_RECENT_GROUPS, billSplitStore, type RecentGroup } from '@/modules/bill-split/storage'

export function useRecentGroups(): readonly RecentGroup[] {
  return useSyncExternalStore(billSplitStore.subscribe, billSplitStore.getRecentGroups)
}

/** memberId của "mình" trong nhóm này (null nếu chưa chọn), và hàm đặt lại. */
export function useMe(token: string | undefined): readonly [string | null, (memberId: string | null) => void] {
  const memberId = useSyncExternalStore(billSplitStore.subscribe, () => (token ? billSplitStore.getMe(token) : null))
  const setMe = useCallback(
    (next: string | null) => {
      if (token) billSplitStore.setMe(token, next)
    },
    [token],
  )
  return [memberId, setMe]
}

/** Hàm xóa một nhóm khỏi máy này (danh sách gần đây và "mình là ai"), không đụng tới nhóm trên server. */
export function useForgetGroup(): (token: string) => void {
  return useCallback((token: string) => billSplitStore.forgetGroup(token), [])
}

export function useLastBank(): BankAccount | null {
  return useSyncExternalStore(billSplitStore.subscribe, billSplitStore.getLastBank)
}

/** Đã báo "danh sách đầy" trong lần chạy app này: báo một lần thôi, không nhắc lại ở mỗi nhóm mở sau. */
let warnedListFull = false

/**
 * Ghi nhớ nhóm vào danh sách gần đây khi trang nhóm mở xong (có tên nhóm), và khi nhóm đổi tên.
 * Danh sách có trần MAX_RECENT_GROUPS và không tự bỏ nhóm cũ: đầy thì nhóm mới không được lưu. Khi đó báo nhẹ một lần,
 * vì nhóm vẫn mở được bằng link, chỉ là sẽ không hiện ở trang Chia tiền.
 */
export function useRememberGroup(token: string | undefined, groupName: string | undefined): void {
  useEffect(() => {
    if (!token || !groupName) return
    if (billSplitStore.rememberGroup(token, groupName) === 'full' && !warnedListFull) {
      warnedListFull = true
      toast.info(
        `Máy này đã lưu đủ ${MAX_RECENT_GROUPS} nhóm nên nhóm này chưa hiện ở trang Chia tiền. Bạn vẫn mở được bằng link.`,
        { duration: 8000 },
      )
    }
  }, [token, groupName])
}
