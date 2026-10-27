/**
 * Hàng đợi ghi theo nhóm: các lần ghi vào cùng một nhóm chạy lần lượt, đúng thứ tự bắt đầu; nhóm khác nhau chạy song song.
 * Lần sau chỉ bắt đầu khi lần trước đã xong hẳn, gồm cả việc đặt snapshot vào cache, nên hai phản hồi không bao giờ về
 * lệch thứ tự để lần ghi cũ đè lên lần ghi mới trong cache. Lần trước lỗi thì lần sau vẫn chạy.
 *
 * Đây là phần việc của `scope: { id: 'bill-split:' + token }` trong TanStack Query, nhưng scope chỉ đặt được cố định
 * trên options của observer (một giá trị cho mọi lần mutate của hook đó), không đặt được theo variables.token, mà các
 * hook của module không biết token lúc dựng options. Hàng đợi này cùng id nhóm, dùng chung cho mọi hook của cùng
 * một QueryClient, và chạy ngay trong mutationFn.
 */
import type { QueryClient } from '@tanstack/react-query'

/** Id nhóm trong hàng đợi, giống id scope của TanStack Query. */
export function groupScopeId(token: string): string {
  return `bill-split:${token}`
}

export interface GroupWriteQueue {
  /** Chạy task sau mọi task đã xếp trước đó cho cùng token. Kết quả hoặc lỗi của task được trả nguyên cho người gọi. */
  run<T>(token: string, task: () => Promise<T>): Promise<T>
}

export function createGroupWriteQueue(): GroupWriteQueue {
  const tails = new Map<string, Promise<void>>()
  return {
    run<T>(token: string, task: () => Promise<T>): Promise<T> {
      const id = groupScopeId(token)
      const previous = tails.get(id) ?? Promise.resolve()
      // `previous` không bao giờ reject (đuôi đã nuốt lỗi), nên task luôn được gọi, kể cả khi lần trước lỗi.
      const result = previous.then(task)
      const tail = result.then(
        () => undefined,
        () => undefined,
      )
      tails.set(id, tail)
      void tail.then(() => {
        if (tails.get(id) === tail) tails.delete(id)
      })
      return result
    },
  }
}

const queues = new WeakMap<QueryClient, GroupWriteQueue>()

/** Hàng đợi dùng chung của một QueryClient. Mọi hook (mỗi hook dựng options riêng) cùng QueryClient thì cùng hàng đợi. */
export function groupWriteQueue(queryClient: QueryClient): GroupWriteQueue {
  let queue = queues.get(queryClient)
  if (!queue) {
    queue = createGroupWriteQueue()
    queues.set(queryClient, queue)
  }
  return queue
}
