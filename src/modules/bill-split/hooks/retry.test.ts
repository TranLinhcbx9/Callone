import { describe, expect, it, vi } from 'vitest'
import { retryOnNetworkError } from '@/modules/bill-split/hooks/retry'
import { AppError } from '@/shared/lib/errors'

const network = () => new AppError({ kind: 'network', code: 'NETWORK', status: 0 })
const business = () => new AppError({ kind: 'app', code: 'BS_CONFLICT', status: 409 })

function flaky<T>(failures: unknown[], result: T) {
  const queue = [...failures]
  return vi.fn<() => Promise<T>>(async () => {
    const next = queue.shift()
    if (next !== undefined) throw next
    return result
  })
}

describe('retryOnNetworkError', () => {
  it('thành công ngay lần đầu thì không chờ, không thử lại', async () => {
    const run = flaky([], 'ok')
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    expect(await retryOnNetworkError(run, { sleep })).toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('rớt mạng rồi thành công: thử lại, chờ tăng dần 500ms, 1000ms', async () => {
    const run = flaky([network(), network()], 'ok')
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    expect(await retryOnNetworkError(run, { sleep })).toBe('ok')
    expect(run).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000])
  })

  it('hết lượt thử lại thì ném lỗi mạng cuối cùng', async () => {
    const run = flaky([network(), network(), network(), network()], 'ok')
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    await expect(retryOnNetworkError(run, { sleep, retries: 2 })).rejects.toMatchObject({ kind: 'network' })
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('lỗi nghiệp vụ và lỗi lạ ném ngay, không thử lại', async () => {
    for (const error of [business(), new Error('boom'), 'chuỗi lạ']) {
      const run = flaky([error, network()], 'ok')
      const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
      await expect(retryOnNetworkError(run, { sleep })).rejects.toBe(error)
      expect(run).toHaveBeenCalledTimes(1)
      expect(sleep).not.toHaveBeenCalled()
    }
  })

  it('retries = 0 nghĩa là không thử lại', async () => {
    const run = flaky([network()], 'ok')
    await expect(retryOnNetworkError(run, { retries: 0 })).rejects.toMatchObject({ kind: 'network' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('nhận lỗi mạng thô của supabase-js (chưa qua toAppError)', async () => {
    const run = flaky([new TypeError('Failed to fetch')], 'ok')
    expect(await retryOnNetworkError(run, { sleep: async () => undefined })).toBe('ok')
  })

  it('delayMs tùy chỉnh được gọi với số lần thử từ 0', async () => {
    const run = flaky([network(), network()], 'ok')
    const delayMs = vi.fn<(attempt: number) => number>((attempt) => attempt * 10)
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    await retryOnNetworkError(run, { delayMs, sleep })
    expect(delayMs.mock.calls).toEqual([[0], [1]])
    expect(sleep.mock.calls).toEqual([[0], [10]])
  })
})
