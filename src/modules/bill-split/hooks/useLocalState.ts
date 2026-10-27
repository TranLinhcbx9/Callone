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

/** Hàm xóa một nhóm khỏi máy này (danh sách gần đây và "mình là ai"), không đụng tới nhóm trên server. */
export function useForgetGroup(): (token: string) => void {
  return useCallback((token: string) => billSplitStore.forgetGroup(token), [])
}

export function useLastBank(): BankAccount | null {
  return useSyncExternalStore(billSplitStore.subscribe, billSplitStore.getLastBank)
}

/** Danh sách nhóm trên máy đã đủ MAX_RECENT_GROUPS: nhóm mới (tạo hoặc mở bằng link) sẽ không được lưu vào đó. */
export function useRecentGroupsFull(): boolean {
  return useSyncExternalStore(billSplitStore.subscribe, billSplitStore.isRecentGroupsFull)
}

/**
 * Ghi nhớ nhóm vào danh sách gần đây khi trang nhóm mở xong (có tên nhóm), và khi nhóm đổi tên.
 * Danh sách có trần và không tự bỏ nhóm cũ: đầy thì nhóm mới không được lưu. Trang nhóm tự nhận ra điều đó
 * (useRecentGroupsFull và nhóm không có trong useRecentGroups) và báo cố định, không chỉ một lần.
 */
export function useRememberGroup(token: string | undefined, groupName: string | undefined): void {
  useEffect(() => {
    if (token && groupName) billSplitStore.rememberGroup(token, groupName)
  }, [token, groupName])
}
