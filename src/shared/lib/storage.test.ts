import { describe, expect, it } from 'vitest'
import { createModuleStorage, type KeyValueStore } from '@/shared/lib/storage'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('createModuleStorage', () => {
  it('ghi và đọc JSON với tiền tố module', () => {
    const backend = memoryStore()
    const storage = createModuleStorage('bill-split', backend)
    storage.set('recent', [{ token: 'abc' }])
    expect(backend.data.has('callone:bill-split:recent')).toBe(true)
    expect(storage.get('recent', [])).toEqual([{ token: 'abc' }])
    storage.remove('recent')
    expect(storage.get('recent', 'mặc định')).toBe('mặc định')
  })

  it('không ném lỗi khi dữ liệu hỏng hoặc trình duyệt chặn', () => {
    const backend = memoryStore()
    backend.data.set('callone:x:bad', '{không phải json')
    expect(createModuleStorage('x', backend).get('bad', 1)).toBe(1)

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
    const storage = createModuleStorage('x', blocked)
    expect(() => storage.set('a', 1)).not.toThrow()
    expect(storage.get('a', 2)).toBe(2)
    expect(() => storage.remove('a')).not.toThrow()
    expect(createModuleStorage('x', null).get('a', 3)).toBe(3)
  })
})
