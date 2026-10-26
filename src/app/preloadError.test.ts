import { describe, expect, it, vi } from 'vitest'
import { RELOAD_FLAG_KEY, createPreloadErrorHandler } from '@/app/preloadError'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const preloadEvent = () => new Event('vite:preloadError', { cancelable: true })

describe('createPreloadErrorHandler', () => {
  it('lần lỗi đầu tiên: đặt cờ, chặn lỗi gốc và tải lại trang', () => {
    const storage = fakeStorage()
    const reload = vi.fn<() => void>()
    const event = preloadEvent()
    createPreloadErrorHandler({ storage, reload })(event)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(storage.data.has(RELOAD_FLAG_KEY)).toBe(true)
  })

  it('đã tải lại một lần trong phiên thì không tải lại nữa, để lỗi hiện ra (không có vòng lặp)', () => {
    const storage = fakeStorage()
    const reload = vi.fn<() => void>()
    const handler = createPreloadErrorHandler({ storage, reload })
    handler(preloadEvent())
    const second = preloadEvent()
    handler(second)
    handler(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('phiên mới (sessionStorage trống) lại được tải lại một lần', () => {
    const reload = vi.fn<() => void>()
    createPreloadErrorHandler({ storage: fakeStorage(), reload })(preloadEvent())
    createPreloadErrorHandler({ storage: fakeStorage(), reload })(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('không có sessionStorage thì không tự tải lại, vì không chặn được vòng lặp', () => {
    const reload = vi.fn<() => void>()
    const event = preloadEvent()
    createPreloadErrorHandler({ storage: null, reload })(event)
    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('sessionStorage ném lỗi (bị chặn, đầy) thì không tự tải lại', () => {
    const reload = vi.fn<() => void>()
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    const event = preloadEvent()
    createPreloadErrorHandler({ storage: throwing, reload })(event)
    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    const readOnly = { getItem: () => null, setItem: throwing.setItem }
    createPreloadErrorHandler({ storage: readOnly, reload })(preloadEvent())
    expect(reload).not.toHaveBeenCalled()
  })
})
