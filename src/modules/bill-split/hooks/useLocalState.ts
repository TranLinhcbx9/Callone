/**
 * Hook đọc dữ liệu lưu trên máy (nhóm gần đây, "mình là ai", ngân hàng gần nhất) và tự cập nhật khi đổi,
 * kể cả khi tab khác của cùng trình duyệt ghi vào.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { billSplitStore, type RecentGroup } from '@/modules/bill-split/storage'

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

export function useLastBank(): BankAccount | null {
  return useSyncExternalStore(billSplitStore.subscribe, billSplitStore.getLastBank)
}

/** Ghi nhớ nhóm vào danh sách gần đây khi trang nhóm mở xong (có tên nhóm), và khi nhóm đổi tên. */
export function useRememberGroup(token: string | undefined, groupName: string | undefined): void {
  useEffect(() => {
    if (token && groupName) billSplitStore.rememberGroup(token, groupName)
  }, [token, groupName])
}
