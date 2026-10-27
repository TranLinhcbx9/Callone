// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import { createHistoryTrail, pathOf } from '@/shared/lib/historyTrail'

function setup(initialIndex: number | null = 0) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
  const state = { index: initialIndex }
  const create = () => createHistoryTrail({ storage, getIndex: () => state.index })
  return { data, storage, state, create, trail: create() }
}

describe('pathOf', () => {
  it('bỏ ?query và #hash', () => {
    expect(pathOf('/bill-split/g/abc?tab=so-du')).toBe('/bill-split/g/abc')
    expect(pathOf('/bill-split#top')).toBe('/bill-split')
    expect(pathOf('/')).toBe('/')
  })
})

describe('historyTrail', () => {
  it('mục đầu tiên chưa có mục trước', () => {
    const { trail } = setup(0)
    trail.record('/bill-split')
    expect(trail.previousPath()).toBeNull()
    expect(trail.previousIs('/')).toBe(false)
  })

  it('đi từ trang cha vào trang con: mục trước là trang cha', () => {
    const { trail, state } = setup(0)
    trail.record('/bill-split')
    state.index = 1
    trail.record('/bill-split/g/abc')
    expect(trail.previousPath()).toBe('/bill-split')
    expect(trail.previousIs('/bill-split')).toBe(true)
    expect(trail.previousIs('/')).toBe(false)
  })

  it('so khớp bỏ qua ?query và #hash ở cả hai phía', () => {
    const { trail, state } = setup(0)
    trail.record('/bill-split?x=1')
    state.index = 1
    trail.record('/bill-split/new')
    expect(trail.previousIs('/bill-split#a')).toBe(true)
  })

  it('replace ghi đè mục hiện tại chứ không thêm mục', () => {
    const { trail, state } = setup(0)
    trail.record('/bill-split')
    state.index = 1
    trail.record('/bill-split/new')
    trail.record('/bill-split/g/abc')
    expect(trail.previousPath()).toBe('/bill-split')
    state.index = 0
    expect(trail.previousPath()).toBeNull()
  })

  it('lùi rồi đi tới lại: mỗi mục vẫn nhớ đúng đường dẫn của nó', () => {
    const { trail, state } = setup(0)
    trail.record('/')
    state.index = 1
    trail.record('/bill-split')
    state.index = 2
    trail.record('/bill-split/g/abc')
    state.index = 1
    trail.record('/bill-split')
    expect(trail.previousPath()).toBe('/')
    state.index = 2
    expect(trail.previousPath()).toBe('/bill-split')
  })

  it('đi sang nhánh khác sau khi lùi: mục mới ghi đè mục cũ cùng chỉ số', () => {
    const { trail, state } = setup(0)
    trail.record('/')
    state.index = 1
    trail.record('/bill-split')
    state.index = 2
    trail.record('/bill-split/g/abc')
    state.index = 1
    state.index = 2
    trail.record('/bill-split/new')
    expect(trail.previousPath()).toBe('/bill-split')
  })

  it('tải lại trang vẫn nhớ mục trước nhờ sessionStorage', () => {
    const { trail, state, create } = setup(0)
    trail.record('/bill-split')
    state.index = 1
    trail.record('/bill-split/g/abc')
    const reloaded = create()
    expect(reloaded.previousIs('/bill-split')).toBe(true)
  })

  it('chưa có chỉ số lịch sử thì không ghi và không biết mục trước', () => {
    const { trail, data, state } = setup(null)
    trail.record('/bill-split')
    expect(data.size).toBe(0)
    state.index = 3
    expect(trail.previousPath()).toBeNull()
  })

  it('dữ liệu hỏng trong storage bị bỏ qua', () => {
    const { data, create, state } = setup(1)
    data.set('callone:history-trail', '{"0":"/bill-split","x":"/no","1":5}')
    expect(create().previousPath()).toBe('/bill-split')
    data.set('callone:history-trail', 'không phải json')
    expect(create().previousPath()).toBeNull()
    state.index = 1
  })

  it('storage không dùng được thì vẫn nhớ trong bộ nhớ của lần chạy này', () => {
    const state = { index: 0 }
    const trail = createHistoryTrail({ storage: null, getIndex: () => state.index })
    trail.record('/bill-split')
    state.index = 1
    trail.record('/bill-split/new')
    expect(trail.previousIs('/bill-split')).toBe(true)
  })

  it('storage ném lỗi khi ghi thì không làm hỏng việc ghi nhớ', () => {
    const state = { index: 0 }
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('hết dung lượng')
      },
    }
    const trail = createHistoryTrail({ storage, getIndex: () => state.index })
    trail.record('/bill-split')
    state.index = 1
    trail.record('/bill-split/new')
    expect(trail.previousIs('/bill-split')).toBe(true)
  })

  it('giữ tối đa 200 mục, bỏ các mục cũ nhất', () => {
    const { trail, state } = setup(0)
    for (let index = 0; index < 250; index++) {
      state.index = index
      trail.record(`/trang/${index}`)
    }
    expect(trail.previousPath()).toBe('/trang/248')
    state.index = 50
    expect(trail.previousPath()).toBeNull()
    state.index = 51
    expect(trail.previousPath()).toBe('/trang/50')
    state.index = 120
    expect(trail.previousPath()).toBe('/trang/119')
  })
})
