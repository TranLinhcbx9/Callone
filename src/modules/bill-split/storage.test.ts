// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RECENT_GROUPS,
  createBillSplitStore,
  readLastBank,
  readMeMap,
  readPendingRotations,
  readRecentGroups,
  type RecentGroup,
} from '@/modules/bill-split/storage'
import { createModuleStorage, type KeyValueStore } from '@/shared/lib/storage'

const T1 = 'dalat-demo-token-2026-ok'
const T2 = 'lau-thu-sau-demo-token-1'
const T3 = 'Ab_-Cd0123456789EfGhIjKl'
const NEW = 'NewTokenAfterRotate_0123'
const NEW2 = 'SecondCandidateToken_012'
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

  it('không phải mảng thì rỗng; cắt tên dài; không cắt bớt số nhóm vì đọc lại không được làm rớt nhóm nào', () => {
    for (const raw of [null, undefined, {}, 'x', 5]) expect(readRecentGroups(raw)).toEqual([])
    const many = Array.from({ length: MAX_RECENT_GROUPS + 40 }, (_, index) => ({
      token: tokenOf(index),
      name: 'x'.repeat(200),
      lastOpenedAt: index,
    }))
    const result = readRecentGroups(many)
    expect(result).toHaveLength(MAX_RECENT_GROUPS + 40)
    expect(result[0]?.lastOpenedAt).toBe(MAX_RECENT_GROUPS + 39)
    expect(result.at(-1)?.lastOpenedAt).toBe(0)
    expect(result[0]?.name).toHaveLength(80)
  })
})

describe('readPendingRotations', () => {
  it('giữ mục hợp lệ, bỏ mục sai hình dạng, token sai định dạng hoặc token mới trùng token cũ', () => {
    const raw = {
      [T1]: { newToken: NEW, startedAt: 5 },
      [T2]: { newToken: T2, startedAt: 6 },
      [T3]: { newToken: 'ngan', startedAt: 7 },
      ngan: { newToken: NEW, startedAt: 8 },
      ['y'.repeat(24)]: { newToken: NEW, startedAt: '9' },
      ['z'.repeat(24)]: { newToken: NEW, startedAt: Number.NaN },
      ['w'.repeat(24)]: null,
      ['v'.repeat(24)]: 'chuỗi',
    }
    expect(readPendingRotations(raw)).toEqual({ [T1]: { newToken: NEW, startedAt: 5 } })
    for (const bad of [null, undefined, [], 'x', 3]) expect(readPendingRotations(bad)).toEqual({})
  })
})

describe('readMeMap và readLastBank', () => {
  it('readMeMap giữ mục hợp lệ', () => {
    expect(readMeMap({ [T1]: 'member-1', ngan: 'x', [T2]: 5, [T3]: '', ['x'.repeat(24)]: 'y'.repeat(65) })).toEqual({
      [T1]: 'member-1',
    })
    for (const raw of [null, [], 'x', 3]) expect(readMeMap(raw)).toEqual({})
  })

  it('readLastBank chỉ lấy BIN: bỏ số tài khoản và tên chủ tài khoản của dữ liệu cũ, từ chối BIN sai', () => {
    const noAccount = { bin: '970436', accountNumber: '', accountName: null }
    expect(readLastBank({ bin: '970436' })).toEqual(noAccount)
    expect(readLastBank({ bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' })).toEqual(noAccount)
    expect(readLastBank({ bin: '970436', accountNumber: 5, accountName: 5 })).toEqual(noAccount)
    for (const bad of [null, undefined, 'x', 5, [], {}, { bin: '97043' }, { bin: 970436 }, { bin: '97043a' }, { accountNumber: '1' }]) {
      expect(readLastBank(bad), JSON.stringify(bad)).toBeNull()
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

  it('tối đa 200 nhóm: nhóm thứ 201 bị từ chối chứ không xóa nhóm cũ nào, và "mình là ai" còn nguyên', () => {
    expect(MAX_RECENT_GROUPS).toBe(200)
    const { store, tick, backend } = setup()
    for (let index = 0; index < MAX_RECENT_GROUPS; index++) {
      expect(store.rememberGroup(tokenOf(index), `Nhóm ${index}`), String(index)).toBe('saved')
      store.setMe(tokenOf(index), `member-${index}`)
      tick()
    }
    expect(store.getRecentGroups()).toHaveLength(MAX_RECENT_GROUPS)
    expect(store.isRecentGroupsFull()).toBe(true)

    const before = store.getRecentGroups()
    const listener = vi.fn<() => void>()
    store.subscribe(listener)
    expect(store.rememberGroup(tokenOf(999), 'Nhóm thứ 201')).toBe('full')
    // Không đổi gì, không ghi xuống máy, không báo người nghe.
    expect(store.getRecentGroups()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    expect(store.getRecentGroups().some((g) => g.token === tokenOf(999))).toBe(false)
    expect(store.getRecentGroups().some((g) => g.token === tokenOf(0))).toBe(true)
    expect(store.getMe(tokenOf(0))).toBe('member-0')
    expect(JSON.parse(backend.data.get(KEY('recent-groups')) ?? '[]')).toHaveLength(MAX_RECENT_GROUPS)

    // Nhóm đã có thì vẫn cập nhật được dù danh sách đầy.
    tick()
    expect(store.rememberGroup(tokenOf(0), 'Nhóm 0 đổi tên')).toBe('saved')
    expect(store.getRecentGroups()[0]).toMatchObject({ token: tokenOf(0), name: 'Nhóm 0 đổi tên' })
    expect(store.getRecentGroups()).toHaveLength(MAX_RECENT_GROUPS)

    // Quên bớt một nhóm thì có chỗ cho nhóm mới.
    store.forgetGroup(tokenOf(5))
    expect(store.isRecentGroupsFull()).toBe(false)
    expect(store.rememberGroup(tokenOf(999), 'Nhóm thứ 201')).toBe('saved')
    expect(store.getRecentGroups()).toHaveLength(MAX_RECENT_GROUPS)
    expect(store.getMe(tokenOf(5))).toBeNull()
    expect(store.getMe(tokenOf(6))).toBe('member-6')
  })

  it('rememberGroup báo invalid khi token sai định dạng', () => {
    const { store } = setup()
    expect(store.rememberGroup('ngan', 'Sai')).toBe('invalid')
    expect(store.rememberGroup('', 'Rỗng')).toBe('invalid')
    expect(store.rememberGroup(T1, 'Đúng')).toBe('saved')
  })

  it('dữ liệu ghi xuống được store mới đọc lại đúng, và dữ liệu hỏng trong storage bị bỏ', () => {
    const { store, create, backend } = setup()
    store.rememberGroup(T1, 'Đà Lạt')
    store.setMe(T1, 'member-1')
    store.setLastBank({ bin: '970436', accountNumber: '0123456789', accountName: null })
    const reopened = create()
    expect(reopened.getRecentGroups()).toEqual(store.getRecentGroups())
    expect(reopened.getMe(T1)).toBe('member-1')
    expect(reopened.getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })

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

  it('forgetGroup bỏ luôn lần đổi link đang chờ của nhóm đó, giữ lần của nhóm khác', () => {
    const { store, backend } = setup()
    store.rememberGroup(T1, 'A')
    store.beginRotation(T1, NEW)
    store.beginRotation(T2, NEW2)
    store.forgetGroup(T1)
    expect(store.getPendingRotation(T1)).toBeNull()
    expect(store.getPendingRotation(T2)).toMatchObject({ newToken: NEW2 })
    expect(Object.keys(JSON.parse(backend.data.get(KEY('pending-rotations')) ?? '{}'))).toEqual([T2])
    store.forgetGroup(T2)
    expect(backend.data.has(KEY('pending-rotations'))).toBe(false)
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

  it('replaceToken xóa luôn lần đổi link đang chờ của token cũ trong cùng một lần ghi', () => {
    const { store, backend } = setup()
    store.rememberGroup(T1, 'Đà Lạt')
    store.setMe(T1, 'm1')
    store.beginRotation(T1, NEW)
    store.beginRotation(T2, NEW2)
    const listener = vi.fn<() => void>()
    store.subscribe(listener)

    store.replaceToken(T1, NEW)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getPendingRotation(T1)).toBeNull()
    expect(store.getPendingRotation(T2)).toEqual({ newToken: NEW2, startedAt: 1_000 })
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([NEW])
    expect(store.getMe(NEW)).toBe('m1')
    expect(JSON.parse(backend.data.get(KEY('pending-rotations')) ?? 'null')).toEqual({
      [T2]: { newToken: NEW2, startedAt: 1_000 },
    })
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

  it('nhớ ngân hàng nhập gần nhất, xóa được, từ chối BIN sai', () => {
    const { store, backend } = setup()
    const bank = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
    store.setLastBank(bank)
    expect(store.getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })
    expect(JSON.parse(backend.data.get(KEY('last-bank')) ?? 'null')).toEqual({ bin: '970436' })

    store.setLastBank({ ...bank, bin: 'sai' })
    expect(store.getLastBank()).toBeNull()
    expect(backend.data.has(KEY('last-bank'))).toBe(false)

    store.setLastBank(bank)
    store.setLastBank(null)
    expect(store.getLastBank()).toBeNull()
    expect(backend.data.has(KEY('last-bank'))).toBe(false)
  })

  it('riêng tư: số tài khoản và tên chủ tài khoản của người vừa lưu không nằm lại trong bộ nhớ lẫn localStorage', () => {
    const { store, backend, create } = setup()
    const junk = String.fromCodePoint(0xa0, 0x200b, 0x2060, 0xfeff)
    store.setLastBank({ bin: '970436', accountNumber: `0123 456${junk}789`, accountName: 'Nguyễn Văn Dũng' })

    expect(store.getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })
    const everythingOnDisk = [...backend.data.values()].join(' ')
    expect(everythingOnDisk).not.toMatch(/0123|456|789|NGUYEN|Nguy|Dũng|DUNG/)
    expect(create().getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })

    // Lưu thêm người khác (hoặc cùng ngân hàng) cũng chỉ còn BIN.
    store.setLastBank({ bin: '970422', accountNumber: ' 9 8 7 ', accountName: 'Trần Thị B' })
    expect(JSON.parse(backend.data.get(KEY('last-bank')) ?? 'null')).toEqual({ bin: '970422' })
  })

  it('chỉ cần BIN đúng: số tài khoản hay tên chủ tài khoản sai dạng cũng không làm mất ngân hàng đã nhớ', () => {
    const { store } = setup()
    store.setLastBank({ bin: '970436', accountNumber: '', accountName: null })
    expect(store.getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })
    store.setLastBank({ bin: '970422', accountNumber: '01-23', accountName: 'x'.repeat(200) })
    expect(store.getLastBank()?.bin).toBe('970422')
  })

  it('dữ liệu cũ còn kèm số tài khoản và tên: đọc ra chỉ còn BIN và localStorage được ghi đè ngay, không còn hai trường đó', () => {
    const { create, backend } = setup()
    backend.data.set(
      KEY('last-bank'),
      JSON.stringify({ bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }),
    )

    const store = create()
    expect(store.getLastBank()).toEqual({ bin: '970436', accountNumber: '', accountName: null })
    expect(JSON.parse(backend.data.get(KEY('last-bank')) ?? 'null')).toEqual({ bin: '970436' })
    expect([...backend.data.values()].join(' ')).not.toMatch(/0123456789|NGUYEN/)
  })

  it('dữ liệu cũ sai hình dạng (BIN sai, không phải object) bị xóa hẳn khỏi localStorage; chưa có gì thì không ghi gì', () => {
    const { create, backend } = setup()
    for (const raw of [{ bin: 'x', accountNumber: '0123456789' }, 'chuỗi', 5, [], { accountNumber: '0123456789' }]) {
      backend.data.set(KEY('last-bank'), JSON.stringify(raw))
      expect(create().getLastBank(), JSON.stringify(raw)).toBeNull()
      expect(backend.data.has(KEY('last-bank')), JSON.stringify(raw)).toBe(false)
    }
    backend.data.clear()
    expect(create().getLastBank()).toBeNull()
    expect(backend.data.size).toBe(0)
  })

  it('dữ liệu đã đúng dạng mới thì đọc lại không ghi thêm gì', () => {
    const { create, backend } = setup()
    backend.data.set(KEY('last-bank'), JSON.stringify({ bin: '970436' }))
    const writes: string[] = []
    const original = backend.setItem
    backend.setItem = (key, value) => {
      writes.push(key)
      original(key, value)
    }
    expect(create().getLastBank()?.bin).toBe('970436')
    expect(writes).toEqual([])
  })
})

describe('createBillSplitStore: lần đổi link đang chờ server xác nhận', () => {
  it('beginRotation ghi xuống máy ngay (đồng bộ) và trả về lần đang chờ', () => {
    const { store, backend, tick } = setup()
    tick()
    const pending = store.beginRotation(T1, NEW)
    expect(pending).toEqual({ newToken: NEW, startedAt: 2_000 })
    // Không có await nào giữa lời gọi và dòng này: dữ liệu đã nằm trong localStorage.
    expect(JSON.parse(backend.data.get(KEY('pending-rotations')) ?? 'null')).toEqual({ [T1]: pending })
    expect(store.getPendingRotation(T1)).toBe(pending)
    expect(store.getPendingRotation(T2)).toBeNull()
  })

  it('đang chờ thì mọi lần beginRotation sau trả đúng lần cũ, không bao giờ chọn token mới thứ hai', () => {
    const { store, tick } = setup()
    const first = store.beginRotation(T1, NEW)
    tick()
    expect(store.beginRotation(T1, NEW2)).toBe(first)
    expect(store.beginRotation(T1, 'AnotherCandidateToken_01')).toBe(first)
    expect(store.getPendingRotation(T1)).toEqual({ newToken: NEW, startedAt: 1_000 })
    // Token cũ khác nhau thì độc lập.
    expect(store.beginRotation(T2, NEW2)).toEqual({ newToken: NEW2, startedAt: 2_000 })
  })

  it('còn nguyên sau khi mở lại app (store mới đọc từ localStorage)', () => {
    const { store, create } = setup()
    const pending = store.beginRotation(T1, NEW)
    expect(create().getPendingRotation(T1)).toEqual(pending)
    expect(create().beginRotation(T1, NEW2)).toEqual(pending)
  })

  it('clearPendingRotation bỏ mục đó, xóa hẳn khóa khi hết mục, và không báo người nghe nếu không có gì để bỏ', () => {
    const { store, backend } = setup()
    store.beginRotation(T1, NEW)
    store.beginRotation(T2, NEW2)
    const listener = vi.fn<() => void>()
    store.subscribe(listener)

    store.clearPendingRotation(T3)
    expect(listener).not.toHaveBeenCalled()

    store.clearPendingRotation(T1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getPendingRotation(T1)).toBeNull()
    expect(Object.keys(JSON.parse(backend.data.get(KEY('pending-rotations')) ?? '{}'))).toEqual([T2])

    store.clearPendingRotation(T2)
    expect(backend.data.has(KEY('pending-rotations'))).toBe(false)
    // Sau khi bỏ thì lần sau chọn token mới được.
    expect(store.beginRotation(T1, NEW2)).toMatchObject({ newToken: NEW2 })
  })

  it('báo người nghe khi có lần đổi link mới, và getter giữ cùng tham chiếu khi không đổi', () => {
    const { store } = setup()
    const listener = vi.fn<() => void>()
    store.subscribe(listener)
    const pending = store.beginRotation(T1, NEW)
    expect(listener).toHaveBeenCalledTimes(1)
    store.beginRotation(T1, NEW2)
    expect(listener).toHaveBeenCalledTimes(1)
    store.setMe(T2, 'm')
    expect(store.getPendingRotation(T1)).toBe(pending)
  })

  it('tab khác vừa ghi lần đổi link cho cùng token thì dùng lại token đó, không chọn token thứ hai', () => {
    const { store, create } = setup()
    expect(store.getPendingRotation(T1)).toBeNull()
    // Tab khác (store khác, cùng localStorage) bắt đầu đổi link trước khi tab này kịp nhận sự kiện storage.
    const other = create().beginRotation(T1, NEW)
    const listener = vi.fn<() => void>()
    store.subscribe(listener)
    expect(store.beginRotation(T1, NEW2)).toEqual(other)
    expect(store.getPendingRotation(T1)).toEqual(other)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sự kiện storage từ tab khác nạp lại lần đổi link đang chờ', () => {
    const { store, create, eventTarget } = setup()
    store.subscribe(() => undefined)
    expect(store.getPendingRotation(T1)).toBeNull()
    create().beginRotation(T1, NEW)
    eventTarget.dispatchEvent(Object.assign(new Event('storage'), { key: KEY('pending-rotations') }))
    expect(store.getPendingRotation(T1)).toMatchObject({ newToken: NEW })
  })

  it('trình duyệt chặn ghi thì vẫn giữ lần đang chờ trong bộ nhớ của phiên, không chọn token thứ hai', () => {
    const blocked: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createBillSplitStore({ storage: createModuleStorage('bill-split', blocked), eventTarget: null })
    const first = store.beginRotation(T1, NEW)
    expect(store.beginRotation(T1, NEW2)).toBe(first)
    expect(store.getPendingRotation(T1)).toBe(first)
    store.clearPendingRotation(T1)
    expect(store.getPendingRotation(T1)).toBeNull()
  })

  it('token sai định dạng hoặc trùng nhau là lỗi lập trình nên ném RangeError và không ghi gì', () => {
    const { store, backend } = setup()
    expect(() => store.beginRotation('ngan', NEW)).toThrow(RangeError)
    expect(() => store.beginRotation(T1, 'ngan')).toThrow(RangeError)
    expect(() => store.beginRotation(T1, T1)).toThrow(RangeError)
    expect(backend.data.has(KEY('pending-rotations'))).toBe(false)
  })

  it('dữ liệu hỏng trong storage bị bỏ', () => {
    const { create, backend } = setup()
    backend.data.set(KEY('pending-rotations'), JSON.stringify({ [T1]: { newToken: 'ngan', startedAt: 1 }, [T2]: 5 }))
    expect(create().getPendingRotation(T1)).toBeNull()
    expect(create().getPendingRotation(T2)).toBeNull()
    backend.data.set(KEY('pending-rotations'), '{không phải json')
    expect(create().getPendingRotation(T1)).toBeNull()
  })
})

describe('createBillSplitStore: khóa trùng tên thuộc tính của Object', () => {
  it('"constructor" hay "toString" làm token thì không trả về hàm của Object và không ghi gì thừa', () => {
    const { store, backend } = setup()
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(store.getMe(key), key).toBeNull()
      expect(store.getPendingRotation(key), key).toBeNull()
      store.clearPendingRotation(key)
      store.forgetGroup(key)
    }
    expect(backend.data.has(KEY('pending-rotations'))).toBe(false)
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
