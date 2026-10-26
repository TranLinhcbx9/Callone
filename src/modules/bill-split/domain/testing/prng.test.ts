import { describe, expect, it } from 'vitest'
import { createRng } from '@/modules/bill-split/domain/testing/prng'

describe('createRng', () => {
  it('cùng seed ra cùng dãy, khác seed ra dãy khác', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const seqA = Array.from({ length: 10 }, () => a.next())
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(seqA)
    expect(Array.from({ length: 10 }, () => c.next())).not.toEqual(seqA)
  })

  it('int nằm trong khoảng kể cả khoảng rộng hơn 2^32', () => {
    const rng = createRng(7)
    for (let i = 0; i < 2000; i++) {
      const small = rng.int(3, 9)
      expect(small).toBeGreaterThanOrEqual(3)
      expect(small).toBeLessThanOrEqual(9)
      const large = rng.int(1, 999_999_999_999)
      expect(Number.isSafeInteger(large)).toBe(true)
      expect(large).toBeGreaterThanOrEqual(1)
      expect(large).toBeLessThanOrEqual(999_999_999_999)
    }
  })

  it('shuffle giữ nguyên các phần tử và không đổi mảng gốc', () => {
    const rng = createRng(1)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffle(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...shuffled].sort((x, y) => x - y)).toEqual(source)
  })
})
