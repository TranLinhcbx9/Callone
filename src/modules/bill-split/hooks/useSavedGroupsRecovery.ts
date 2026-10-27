/**
 * Khôi phục các nhóm đã lưu trên máy mà có lần đổi link đang chờ server xác nhận (xem rotation.ts): đổi link xong trên server
 * nhưng phản hồi bị mất, nên máy này vẫn giữ token cũ (đã chết) và chỉ có token mới trong "lần đổi link đang chờ".
 *
 * Trang Chia tiền hỏi bs_get_groups chỉ với token cũ, nên nhóm đó trông như "đã bị xóa" và chỗ duy nhất giữ token mới (mục đang
 * chờ) bị xóa theo nếu người dùng bấm "Xóa khỏi máy": mất nhóm vĩnh viễn. Hook này hỏi server trước, chỉ ĐỌC, rồi chuyển danh
 * sách, "mình là ai" và cache sang token mới nếu nó còn sống (resumePendingRotation). Trang dùng kết quả để không xếp nhóm vào
 * "Không còn mở được" khi chưa hỏi xong, và không mời xóa khỏi máy khi còn lần đổi link đang chờ.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as rpc from '@/modules/bill-split/api/rpc'
import { resumePendingRotation } from '@/modules/bill-split/hooks/rotation'
import { billSplitStore } from '@/modules/bill-split/storage'

/** 'checking': đang hỏi server. 'unreachable': không hỏi được (mất mạng), lần đổi link vẫn được giữ để hỏi lại. */
export type SavedGroupRecoveryStatus = 'checking' | 'unreachable'

export interface SavedGroupsRecovery {
  /** Trạng thái của một nhóm đã lưu, hoặc null nếu nhóm đó không có lần đổi link nào đang chờ (hoặc đã hỏi xong mà chưa đổi). */
  statusOf: (token: string) => SavedGroupRecoveryStatus | null
  /** Còn nhóm đang được hỏi: danh sách chưa nên kết luận nhóm nào "không còn mở được". */
  checking: boolean
  /** Hỏi lại ngay các nhóm chưa hỏi được (nút "Thử lại", và tự gọi khi có mạng lại). */
  retry: () => void
}

interface Pair {
  oldToken: string
  newToken: string
}

const keyOf = (pair: Pair) => `${pair.oldToken}>${pair.newToken}`

/** Các nhóm trong danh sách có lần đổi link đang chờ, dạng chuỗi so sánh được ("cũ>mới,cũ>mới"). */
function snapshotOf(tokens: readonly string[]): string {
  const keys: string[] = []
  for (const oldToken of tokens) {
    const pending = billSplitStore.getPendingRotation(oldToken)
    if (pending) keys.push(keyOf({ oldToken, newToken: pending.newToken }))
  }
  return keys.join(',')
}

function parseSnapshot(snapshot: string): Pair[] {
  return snapshot
    .split(',')
    .filter(Boolean)
    .map((key) => {
      const [oldToken = '', newToken = ''] = key.split('>')
      return { oldToken, newToken }
    })
}

/** Hỏi server một lần về lần đổi link đang chờ của token này (chỉ đọc). Trả token mới nếu nó còn sống, null nếu không. Rớt mạng thì ném lỗi. */
export function recoverRotatedToken(queryClient: QueryClient, token: string): Promise<string | null> {
  return resumePendingRotation({ queryClient, api: rpc, store: billSplitStore }, token)
}

export function useSavedGroupsRecovery(tokens: readonly string[]): SavedGroupsRecovery {
  const queryClient = useQueryClient()
  // Chuỗi thay đổi khi một lần đổi link đang chờ được thêm hoặc bỏ đi, kể cả khi danh sách nhóm không đổi.
  const snapshot = useSyncExternalStore(billSplitStore.subscribe, () => snapshotOf(tokens))
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, 'done' | 'unreachable'>>>({})
  const started = useRef(new Set<string>())

  const check = useCallback(
    (pair: Pair) => {
      started.current.add(keyOf(pair))
      resumePendingRotation({ queryClient, api: rpc, store: billSplitStore }, pair.oldToken).then(
        () => setOutcomes((current) => ({ ...current, [keyOf(pair)]: 'done' })),
        // Rớt mạng: lần đổi link vẫn được giữ trong store, hỏi lại bằng retry() hoặc khi có mạng lại.
        () => setOutcomes((current) => ({ ...current, [keyOf(pair)]: 'unreachable' })),
      )
    },
    [queryClient],
  )

  // Mỗi lần đổi link đang chờ chỉ hỏi một lần khi nó xuất hiện (React StrictMode chạy effect hai lần nên có ref giữ chỗ).
  useEffect(() => {
    for (const pair of parseSnapshot(snapshot)) {
      if (!started.current.has(keyOf(pair))) check(pair)
    }
  }, [snapshot, check])

  const retry = useCallback(() => {
    for (const pair of parseSnapshot(snapshot)) {
      if (outcomes[keyOf(pair)] !== 'unreachable') continue
      setOutcomes((current) => {
        const next = { ...current }
        delete next[keyOf(pair)]
        return next
      })
      check(pair)
    }
  }, [snapshot, outcomes, check])

  useEffect(() => {
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [retry])

  const statusOf = useCallback(
    (token: string): SavedGroupRecoveryStatus | null => {
      const pair = parseSnapshot(snapshot).find((item) => item.oldToken === token)
      if (!pair) return null
      const outcome = outcomes[keyOf(pair)]
      if (outcome === 'unreachable') return 'unreachable'
      return outcome === 'done' ? null : 'checking'
    },
    [snapshot, outcomes],
  )

  const checking = parseSnapshot(snapshot).some((pair) => outcomes[keyOf(pair)] === undefined)
  return { statusOf, checking, retry }
}
