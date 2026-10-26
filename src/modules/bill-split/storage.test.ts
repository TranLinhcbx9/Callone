// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RECENT_GROUPS,
  createBillSplitStore,
  readBank,
  readMeMap,
  readRecentGroups,
  type RecentGroup,
} from '@/modules/bill-split/storage'
import { createModuleStorage, type KeyValueStore } from '@/shared/lib/storage'

const T1 = 'dalat-demo-token-2026-ok'
const T2 = 'lau-thu-sau-demo-token-1'
const T3 = 'Ab_-Cd0123456789EfGhIjKl'
const NEW = 'NewTokenAfterRotate_0123'
const KEY = (name: string) => `callone:bill-split:${name}`

function memoryBackend(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Store dùng backend trong bộ nhớ và đồng hồ chỉ tăng khi gọi tick(). */
function setup() {
  const backend = memoryBackend()
  let time = 1_000
  const eventTarget = new EventTarget()
  const create = () =>
    createBillSplitStore({ storage: createModuleStorage('bill-split', backend), now: () => time, eventTarget })
  return { backend, store: create(), create, eventTarget, tick: () => (time += 1_000) }
}

const tokenOf = (index: number) => `token-${String(index).padStart(2, '0')}-`.padEnd(24, 'x')

describe('readRecentGroups', () => {
  it('bỏ mục sai hình dạng, token trùng, sắp mới nhất trước', () => {
    const raw = [
      { token: T1, name: 'Đà Lạt', lastOpenedAt: 100 },
      { token: T2, name: 'Lẩu', lastOpenedAt: 300 },
      { token: T1, name: 'Trùng', lastOpenedAt: 999 },
      { token: 'ngan', name: 'Token ngắn', lastOpenedAt: 1 },
      { token: T3, name: 5, lastOpenedAt: 1 },
      { token: T3, name: 'Thiếu thời gian' },
      { token: T3, name: 'NaN', lastOpenedAt: Number.NaN },
      null,
      'chuỗi',
      [],
    ]
    expect(readRecentGroups(raw)).toEqual([
      { token: T2, name: 'Lẩu', lastOpenedAt: 300 },
      { token: T1, name: 'Đà Lạt', lastOpenedAt: 100 },
    ])
  })

  it('không phải mảng thì rỗng; cắt tên dài và giữ tối đa 30 nhóm mới nhất', () => {
    for (const raw of [null, undefined, {}, 'x', 5]) expect(readRecentGroups(raw)).toEqual([])
    const many = Array.from({ length: 40 }, (_, index) => ({ token: tokenOf(index), name: 'x'.repeat(200), lastOpenedAt: index }))
    const result = readRecentGroups(many)
    expect(result).toHaveLength(MAX_RECENT_GROUPS)
    expect(result[0]?.lastOpenedAt).toBe(39)
    expect(result[MAX_RECENT_GROUPS - 1]?.lastOpenedAt).toBe(10)
    expect(result[0]?.name).toHaveLength(80)
  })
})

describe('readMeMap và readBank', () => {
  it('readMeMap giữ mục hợp lệ', () => {
    expect(readMeMap({ [T1]: 'member-1', ngan: 'x', [T2]: 5, [T3]: '', ['x'.repeat(24)]: 'y'.repeat(65) })).toEqual({
      [T1]: 'member-1',
    })
    for (const raw of [null, [], 'x', 3]) expect(readMeMap(raw)).toEqual({})
  })

  it('readBank kiểm tra BIN và số tài khoản', () => {
    const ok = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
    expect(readBank(ok)).toEqual(ok)
    expect(readBank({ ...ok, accountName: null })).toEqual({ ...ok, accountName: null })
    expect(readBank({ bin: ok.bin, accountNumber: ok.accountNumber })).toEqual({ ...ok, accountName: null })
    for (const bad of [null, 'x', { ...ok, bin: '97043' }, { ...ok, accountNumber: '' }, { ...ok, accountNumber: '12 34' }, { ...ok, accountName: 5 }]) {
      expect(readBank(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('createBillSplitStore: nhóm gần đây', () => {
  it('ghi nhớ nhóm, đưa nhóm vừa mở lên đầu và cập nhật tên và giờ', () => {
    const { store, backend, tick } = setup()
    expect(store.getRecentGroups()).toEqual([])

    store.rememberGroup(T1, ' Đà Lạt 3N2Đ ')
    tick()
    store.rememberGroup(T2, 'Lẩu thứ Sáu')
    tick()
    expect(store.getRecentGroups()).toEqual([
      { token: T2, name: 'Lẩu thứ Sáu', lastOpenedAt: 2_000 },
      { token: T1, name: 'Đà Lạt 3N2Đ', lastOpenedAt: 1_000 },
    ])

    store.rememberGroup(T1, 'Đà Lạt (đổi tên)')
    expect(store.getRecentGroups().map((g) => [g.token, g.name, g.lastOpenedAt])).toEqual([
      [T1, 'Đà Lạt (đổi tên)', 3_000],
      [T2, 'Lẩu thứ Sáu', 2_000],
    ])
    expect(JSON.parse(backend.data.get(KEY('recent-groups')) ?? 'null')).toEqual(store.getRecentGroups())
  })

  it('bỏ qua token sai định dạng', () => {
    const { store } = setup()
    store.rememberGroup('ngan', 'Sai')
    store.rememberGroup('', 'Rỗng')
    expect(store.getRecentGroups()).toEqual([])
  })

  it('giữ tối đa 30 nhóm, nhóm cũ nhất rớt khỏi danh sách cùng với "mình là ai" của nó', () => {
    const { store, tick } = setup()
    for (let index = 0; index < MAX_RECENT_GROUPS; index++) {
      store.rememberGroup(tokenOf(index), `Nhóm ${index}`)
      store.setMe(tokenOf(index), `member-${index}`)
      tick()
    }
    expect(store.getRecentGroups()).toHaveLength(MAX_RECENT_GROUPS)
    store.rememberGroup(tokenOf(99), 'Nhóm mới')
    const recents = store.getRecentGroups()
    expect(recents).toHaveLength(MAX_RECENT_GROUPS)
    expect(recents[0]?.token).toBe(tokenOf(99))
    expect(recents.some((g) => g.token === tokenOf(0))).toBe(false)
    expect(store.getMe(tokenOf(0))).toBeNull()
    expect(store.getMe(tokenOf(1))).toBe('member-1')
  })

  it('dữ liệu ghi xuống được store mới đọc lại đúng, và dữ liệu hỏng trong storage bị bỏ', () => {
    const { store, create, backend } = setup()
    store.rememberGroup(T1, 'Đà Lạt')
    store.setMe(T1, 'member-1')
    store.setLastBank({ bin: '970436', accountNumber: '0123456789', accountName: null })
    const reopened = create()
    expect(reopened.getRecentGroups()).toEqual(store.getRecentGroups())
    expect(reopened.getMe(T1)).toBe('member-1')
    expect(reopened.getLastBank()).toEqual({ bin: '970436', accountNumber: '0123456789', accountName: null })

    backend.data.set(KEY('recent-groups'), '{không phải json')
    backend.data.set(KEY('me'), JSON.stringify({ [T1]: 5 }))
    backend.data.set(KEY('last-bank'), JSON.stringify({ bin: 'x' }))
    const broken = create()
    expect(broken.getRecentGroups()).toEqual([])
    expect(broken.getMe(T1)).toBeNull()
    expect(broken.getLastBank()).toBeNull()
  })

  it('forgetGroup bỏ nhóm và "mình là ai" của nhóm đó, giữ nhóm khác', () => {
    const { store } = setup()
    store.rememberGroup(T1, 'A')
    store.rememberGroup(T2, 'B')
    store.setMe(T1, 'm1')
    store.setMe(T2, 'm2')
    store.forgetGroup(T1)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T2])
    expect(store.getMe(T1)).toBeNull()
    expect(store.getMe(T2)).toBe('m2')
    store.forgetGroup(T3)
    expect(store.getRecentGroups()).toHaveLength(1)
  })

  it('replaceToken chuyển nhóm và "mình là ai" sang token mới, đưa lên đầu', () => {
    const { store, tick } = setup()
    store.rememberGroup(T1, 'Đà Lạt')
    tick()
    store.rememberGroup(T2, 'Lẩu')
    store.setMe(T1, 'm1')
    tick()
    store.replaceToken(T1, NEW)
    expect(store.getRecentGroups().map((g) => [g.token, g.name])).toEqual([[NEW, 'Đà Lạt'], [T2, 'Lẩu']])
    expect(store.getMe(NEW)).toBe('m1')
    expect(store.getMe(T1)).toBeNull()
  })

  it('replaceToken không làm gì khi token mới sai định dạng hoặc trùng token cũ', () => {
    const { store } = setup()
    store.rememberGroup(T1, 'Đà Lạt')
    const before = store.getRecentGroups()
    store.replaceToken(T1, 'ngan')
    store.replaceToken(T1, T1)
    expect(store.getRecentGroups()).toBe(before)
  })
})

describe('createBillSplitStore: mình là ai và ngân hàng gần nhất', () => {
  it('đặt, đổi và xóa "mình là ai" theo từng nhóm', () => {
    const { store } = setup()
    expect(store.getMe(T1)).toBeNull()
    store.setMe(T1, 'm1')
    store.setMe(T2, 'm2')
    store.setMe(T1, 'm3')
    expect(store.getMe(T1)).toBe('m3')
    expect(store.getMe(T2)).toBe('m2')
    store.setMe(T1, null)
    expect(store.getMe(T1)).toBeNull()
    expect(store.getMe(T2)).toBe('m2')
    store.setMe('ngan', 'x')
    expect(store.getMe('ngan')).toBeNull()
  })

  it('nhớ ngân hàng nhập gần nhất, xóa được, từ chối dữ liệu sai', () => {
    const { store, backend } = setup()
    const bank = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
    store.setLastBank(bank)
    expect(store.getLastBank()).toEqual(bank)
    expect(JSON.parse(backend.data.get(KEY('last-bank')) ?? 'null')).toEqual(bank)

    store.setLastBank({ ...bank, bin: 'sai' })
    expect(store.getLastBank()).toBeNull()
    expect(backend.data.has(KEY('last-bank'))).toBe(false)

    store.setLastBank(bank)
    store.setLastBank(null)
    expect(store.getLastBank()).toBeNull()
  })
})

describe('createBillSplitStore: subscribe và tham chiếu ổn định', () => {
  it('báo cho người nghe sau mỗi lần ghi, hủy đăng ký thì thôi', () => {
    const { store } = setup()
    const listener = vi.fn<() => void>()
    const unsubscribe = store.subscribe(listener)
    store.rememberGroup(T1, 'A')
    store.setMe(T1, 'm1')
    store.setLastBank(null)
    store.forgetGroup(T1)
    expect(listener).toHaveBeenCalledTimes(4)
    unsubscribe()
    store.rememberGroup(T2, 'B')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('getter trả cùng một tham chiếu khi không có thay đổi (cho useSyncExternalStore)', () => {
    const { store } = setup()
    store.rememberGroup(T1, 'A')
    store.setLastBank({ bin: '970436', accountNumber: '1', accountName: null })
    const recents = store.getRecentGroups()
    const bank = store.getLastBank()
    expect(store.getRecentGroups()).toBe(recents)
    expect(store.getLastBank()).toBe(bank)
    store.setMe(T1, 'm1')
    expect(store.getRecentGroups()).toBe(recents)
    store.rememberGroup(T2, 'B')
    expect(store.getRecentGroups()).not.toBe(recents)
  })

  it('vẫn chạy trong phiên khi trình duyệt chặn ghi localStorage', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createBillSplitStore({ storage: createModuleStorage('bill-split', blocked), eventTarget: null })
    store.rememberGroup(T1, 'Đà Lạt')
    store.setMe(T1, 'm1')
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T1])
    expect(store.getMe(T1)).toBe('m1')
  })
})

describe('createBillSplitStore: đồng bộ giữa các tab', () => {
  it('chỉ nghe sự kiện storage khi còn người đăng ký', () => {
    const { store, eventTarget } = setup()
    const add = vi.spyOn(eventTarget, 'addEventListener')
    const remove = vi.spyOn(eventTarget, 'removeEventListener')
    const off1 = store.subscribe(() => undefined)
    const off2 = store.subscribe(() => undefined)
    expect(add).toHaveBeenCalledTimes(1)
    off1()
    expect(remove).not.toHaveBeenCalled()
    off2()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('tab khác ghi dữ liệu của module thì nạp lại và báo người nghe, khóa lạ thì bỏ qua', () => {
    const { store, backend, eventTarget } = setup()
    const listener = vi.fn<() => void>()
    store.subscribe(listener)
    store.rememberGroup(T1, 'A')
    expect(listener).toHaveBeenCalledTimes(1)

    const fire = (key: string | null) => eventTarget.dispatchEvent(Object.assign(new Event('storage'), { key }))
    backend.data.set(KEY('recent-groups'), JSON.stringify([{ token: T2, name: 'Từ tab khác', lastOpenedAt: 5 }]))

    fire('callone:other-module:x')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T1])

    fire(KEY('recent-groups'))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T2])

    backend.data.clear()
    fire(null)
    expect(listener).toHaveBeenCalledTimes(3)
    expect(store.getRecentGroups()).toEqual([])
  })

  it('kiểu RecentGroup có đúng ba trường', () => {
    const sample: RecentGroup = { token: T1, name: 'A', lastOpenedAt: 1 }
    expect(Object.keys(sample)).toEqual(['token', 'name', 'lastOpenedAt'])
  })
})
