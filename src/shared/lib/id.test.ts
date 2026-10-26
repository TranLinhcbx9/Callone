import { describe, expect, it } from 'vitest'
import { newId } from '@/shared/lib/id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  it('dùng crypto.randomUUID khi có', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('dự phòng bằng getRandomValues khi không có randomUUID, ví dụ trang http không bảo mật', () => {
    const fallback = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) }
    const ids = new Set(Array.from({ length: 50 }, () => newId(fallback)))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  })
})
