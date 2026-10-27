import { describe, expect, it, vi } from 'vitest'
import { RELOAD_FLAG_KEY, RELOAD_WINDOW_MS, createPreloadErrorHandler } from '@/app/preloadError'

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

  it('cờ ghi giờ của lần tải lại gần nhất', () => {
    const storage = fakeStorage()
    createPreloadErrorHandler({ storage, reload: vi.fn<() => void>(), now: () => 1_700_000_000_000 })(preloadEvent())
    expect(storage.data.get(RELOAD_FLAG_KEY)).toBe('1700000000000')
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

describe('createPreloadErrorHandler: cờ hết hạn sau khoảng chặn', () => {
  /** Đồng hồ giả chỉnh tay và bộ xử lý dùng chung một sessionStorage giả, như một PWA mở lâu. */
  function longLivedApp(start = 1_000_000) {
    let time = start
    const storage = fakeStorage()
    const reload = vi.fn<() => void>()
    const handler = createPreloadErrorHandler({ storage, reload, now: () => time })
    return {
      storage,
      reload,
      advance: (ms: number) => void (time += ms),
      fire: () => {
        const event = preloadEvent()
        handler(event)
        return event
      },
    }
  }

  it('khoảng chặn là 60 giây', () => {
    expect(RELOAD_WINDOW_MS).toBe(60_000)
  })

  it('PWA mở lâu: quá 60 giây sau lần tải lại trước thì lỗi chunk lần sau lại được tự tải lại', () => {
    const app = longLivedApp()
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(1)

    app.advance(2 * 60 * 60 * 1000) // hai tiếng sau, lại có bản mới
    const event = app.fire()
    expect(app.reload).toHaveBeenCalledTimes(2)
    expect(event.defaultPrevented).toBe(true)
  })

  it('vẫn chặn vòng lặp: lỗi lặp lại trong 60 giây sau lần tải lại thì không tải lại nữa, để lỗi hiện ra', () => {
    const app = longLivedApp()
    app.fire()
    for (const ms of [1, 500, 5_000, 20_000, 30_000]) {
      app.advance(ms)
      const event = app.fire()
      expect(event.defaultPrevented).toBe(false)
    }
    expect(app.reload).toHaveBeenCalledTimes(1)
  })

  it('đúng ranh giới: 59.999 giây vẫn chặn, đủ 60 giây thì cho tải lại', () => {
    const app = longLivedApp()
    app.fire()
    app.advance(RELOAD_WINDOW_MS - 1)
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(1)
    app.advance(1)
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(2)
  })

  it('lỗi bị chặn không làm mới cờ: 60 giây tính từ lần tải lại, nên lỗi dồn dập không khóa vĩnh viễn', () => {
    const app = longLivedApp()
    app.fire()
    const flag = app.storage.data.get(RELOAD_FLAG_KEY)
    app.advance(30_000)
    app.fire()
    expect(app.storage.data.get(RELOAD_FLAG_KEY)).toBe(flag)
    app.advance(31_000) // 61 giây kể từ lần tải lại, dù mới 31 giây kể từ lỗi gần nhất
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(2)
  })

  it('mỗi lần tải lại ghi giờ mới, nên vòng lặp tải lại liên tục vẫn bị chặn ở lần thứ hai', () => {
    const app = longLivedApp()
    app.fire()
    app.advance(61_000)
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(2)
    app.advance(10_000)
    app.fire()
    expect(app.reload).toHaveBeenCalledTimes(2)
  })

  it('cờ hỏng hoặc từ phiên bản cũ (không phải số) thì coi như hết hạn, cho tải lại và ghi đè bằng giờ hợp lệ', () => {
    for (const bad of ['', '  ', 'abc', 'true', 'NaN', 'Infinity']) {
      const storage = fakeStorage({ [RELOAD_FLAG_KEY]: bad })
      const reload = vi.fn<() => void>()
      createPreloadErrorHandler({ storage, reload, now: () => 5_000 })(preloadEvent())
      expect(reload, JSON.stringify(bad)).toHaveBeenCalledTimes(1)
      expect(storage.data.get(RELOAD_FLAG_KEY)).toBe('5000')
    }
  })

  it('cờ ở tương lai (đồng hồ máy bị chỉnh lùi) cũng coi như hết hạn, rồi vòng lặp vẫn bị chặn như thường', () => {
    const storage = fakeStorage({ [RELOAD_FLAG_KEY]: String(9_999_999_999_999) })
    const reload = vi.fn<() => void>()
    const handler = createPreloadErrorHandler({ storage, reload, now: () => 5_000 })
    handler(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(1)
    handler(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('windowMs tùy chỉnh', () => {
    let time = 0
    const reload = vi.fn<() => void>()
    const handler = createPreloadErrorHandler({ storage: fakeStorage(), reload, now: () => time, windowMs: 1_000 })
    handler(preloadEvent())
    time = 999
    handler(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(1)
    time = 1_000
    handler(preloadEvent())
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
