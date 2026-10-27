import { isRetryableError } from '@/shared/lib/errors'

export interface RetryOptions {
  /** Số lần thử lại tối đa sau lần đầu. Mặc định 2. */
  retries?: number
  /** Chờ bao lâu trước lần thử lại thứ attempt (từ 0). Mặc định 500ms, 1s, 2s... */
  delayMs?: (attempt: number) => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Chạy lại khi rớt mạng, lỗi khác ném ngay. Chỉ dùng cho thao tác an toàn khi gửi hai lần: ghi theo id do client sinh,
 * xóa theo id, và (hợp đồng v1.1) bs_create_group với p_token, bs_rotate_token với p_new_token do client chọn, miễn là
 * mọi lần thử lại gửi đúng token đó. Không dùng cho bs_delete_group và sửa khoản chi theo version.
 */
export async function retryOnNetworkError<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, delayMs = (attempt: number) => 500 * 2 ** attempt, sleep = defaultSleep } = options
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= retries || !isRetryableError(error)) throw error
      await sleep(delayMs(attempt))
    }
  }
}
