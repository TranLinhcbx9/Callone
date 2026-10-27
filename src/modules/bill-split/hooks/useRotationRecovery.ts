/**
 * Khôi phục sau một lần đổi link mà phản hồi bị mất (xem rotation.ts). Trang nhóm dùng hook này khi link báo
 * không tìm thấy: đó có thể là phía cũ của một lần đổi link đã thành công trên server nhưng máy này chưa biết link mới.
 *
 * Hook chỉ HỎI server (đọc), không bao giờ tự đổi link. Link mới chỉ hiện ra sau khi server xác nhận.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as rpc from '@/modules/bill-split/api/rpc'
import { resumePendingRotation } from '@/modules/bill-split/hooks/rotation'
import { billSplitStore } from '@/modules/bill-split/storage'

/** 'checking': đang hỏi server. 'unreachable': lần hỏi gần nhất không tới được server (mạng). Còn lại là 'idle'. */
export type RotationRecoveryStatus = 'idle' | 'checking' | 'unreachable'

export interface RotationRecovery {
  status: RotationRecoveryStatus
  /** Người dùng đã bấm "Đổi link" cho token này và server chưa xác nhận. */
  hasPending: boolean
  /** Hỏi server lại ngay (nút "Thử lại"). */
  retry: () => void
}

export interface RotationRecoveryOptions {
  /** Truy vấn nhóm của token này vừa trả BS_GROUP_NOT_FOUND. */
  notFound: boolean
  /** Server xác nhận link mới đang sống: kho lưu trên máy và cache đã chuyển sang đó, trang nên mở nhóm bằng link mới. */
  onRecovered: (newToken: string) => void
}

type Outcome = 'running' | 'done' | 'unreachable'

export interface RecoveryAttempt {
  /** Lần đang chờ mà lần hỏi này thuộc về. */
  key: string
  outcome: Outcome
}

/**
 * Trạng thái hiển thị. Token báo không tìm thấy mà có lần đang chờ chưa hỏi bao giờ thì đã là 'checking' ngay từ lần
 * render đầu (hook chỉ bắt đầu hỏi trong effect, sau lần render đó), để trang không nháy màn hình "không tìm thấy".
 */
export function deriveRecoveryStatus(
  pendingKey: string | null,
  attempt: RecoveryAttempt | null,
  notFound: boolean,
): RotationRecoveryStatus {
  if (pendingKey === null) return 'idle'
  const outcome = attempt?.key === pendingKey ? attempt.outcome : null
  if (outcome === 'running') return 'checking'
  if (outcome === 'unreachable') return 'unreachable'
  if (outcome === null && notFound) return 'checking'
  return 'idle'
}

export function useRotationRecovery(
  token: string | undefined,
  { notFound, onRecovered }: RotationRecoveryOptions,
): RotationRecovery {
  const queryClient = useQueryClient()
  const getPending = () => (token ? billSplitStore.getPendingRotation(token) : null)
  const pending = useSyncExternalStore(billSplitStore.subscribe, getPending, getPending)
  const pendingKey = token && pending ? `${token}>${pending.newToken}` : null
  const [attempt, setAttempt] = useState<RecoveryAttempt | null>(null)

  const onRecoveredRef = useRef(onRecovered)
  useEffect(() => {
    onRecoveredRef.current = onRecovered
  }, [onRecovered])

  // Chỉ ghi kết quả sau khi server trả lời. Trạng thái "đang hỏi" của lần đầu suy ra từ notFound (xem
  // deriveRecoveryStatus), của các lần hỏi lại do người dùng hoặc sự kiện online thì đặt trong begin.
  const check = useCallback(async () => {
    if (!token || pendingKey === null) return
    try {
      const recovered = await resumePendingRotation({ queryClient, api: rpc, store: billSplitStore }, token)
      if (recovered) onRecoveredRef.current(recovered)
      setAttempt({ key: pendingKey, outcome: 'done' })
    } catch {
      // Rớt mạng: lần đang chờ vẫn được giữ, sự kiện online kế tiếp hoặc retry() sẽ hỏi lại.
      setAttempt({ key: pendingKey, outcome: 'unreachable' })
    }
  }, [token, pendingKey, queryClient])

  const begin = useCallback(() => {
    if (pendingKey === null) return
    setAttempt({ key: pendingKey, outcome: 'running' })
    void check()
  }, [pendingKey, check])

  // Token báo không tìm thấy mà có lần đổi link đang chờ: hỏi server ngay, một lần cho mỗi lần đang chờ.
  const askedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!notFound || pendingKey === null || askedRef.current === pendingKey) return
    askedRef.current = pendingKey
    void check()
  }, [notFound, pendingKey, check])

  // Có lại mạng thì hỏi lại, kể cả khi trang đang hiện nhóm bình thường.
  useEffect(() => {
    if (pendingKey === null) return
    window.addEventListener('online', begin)
    return () => window.removeEventListener('online', begin)
  }, [pendingKey, begin])

  return { status: deriveRecoveryStatus(pendingKey, attempt, notFound), hasPending: pendingKey !== null, retry: begin }
}
