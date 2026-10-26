/**
 * Bộ sinh số ngẫu nhiên có seed cho test dạng thuộc tính (mulberry32).
 * Cùng seed luôn ra cùng một dãy, nên test ngẫu nhiên vẫn tái lập được khi có lỗi.
 * Chỉ dùng trong test, code chạy thật không import file này.
 */
export interface Rng {
  /** Số thực trong [0, 1). */
  next(): number
  /** Số nguyên trong [min, max], kể cả khi khoảng rộng hơn 2^32. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(probability: number): boolean
  shuffle<T>(items: readonly T[]): T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    const range = max - min + 1
    if (range <= 4294967296) return min + Math.floor(next() * range)
    // 53 bit ngẫu nhiên ghép từ hai lần rút, đủ phủ khoảng tới 999 tỷ.
    const wide = Math.floor(next() * 2 ** 21) * 2 ** 32 + Math.floor(next() * 2 ** 32)
    return min + (wide % range)
  }

  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      const item = items[int(0, items.length - 1)]
      if (item === undefined) throw new Error('pick: danh sách rỗng')
      return item
    },
    chance: (probability: number): boolean => next() < probability,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items]
      for (let index = copy.length - 1; index > 0; index--) {
        const other = int(0, index)
        const held = copy[index] as T
        copy[index] = copy[other] as T
        copy[other] = held
      }
      return copy
    },
  }
}
