// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it, vi } from 'vitest'
import { TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import { newGroupToken, toBase64Url } from '@/modules/bill-split/api/token'
import { createRng } from '@/modules/bill-split/domain/testing/prng'

/** base64url theo cách khác: btoa có sẵn của môi trường, đổi + / thành - _ và bỏ dấu = đệm. */
function referenceBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Nguồn ngẫu nhiên giả luôn điền đúng các byte đã chọn. */
function fixedBytes(bytes: number[]) {
  const spy = vi.fn<(array: ArrayBufferView) => void>((array) => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes)
  })
  const source = {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array) spy(array)
      return array
    },
  }
  return { source, spy }
}

describe('toBase64Url', () => {
  it('khớp base64url tính bằng btoa trên mọi độ dài, không có dấu = đệm', () => {
    const rng = createRng(18)
    for (let length = 0; length <= 40; length++) {
      const bytes = Uint8Array.from({ length }, () => rng.int(0, 255))
      expect(toBase64Url(bytes), `length=${length}`).toBe(referenceBase64Url(bytes))
    }
  })

  it('ví dụ cố định, gồm cả hai ký tự riêng của base64url', () => {
    expect(toBase64Url(new Uint8Array(3))).toBe('AAAA')
    expect(toBase64Url(Uint8Array.of(0xff, 0xff, 0xff))).toBe('____')
    expect(toBase64Url(Uint8Array.of(0xfb, 0xef, 0xbe))).toBe('----')
    expect(toBase64Url(new TextEncoder().encode('Man'))).toBe('TWFu')
  })
})

describe('newGroupToken', () => {
  it('lấy đúng 18 byte từ getRandomValues và ra 24 ký tự khớp TOKEN_PATTERN', () => {
    const bytes = Array.from({ length: 18 }, (_, index) => index * 14)
    const { source, spy } = fixedBytes(bytes)
    const token = newGroupToken(source)
    expect(spy).toHaveBeenCalledTimes(1)
    const [array] = spy.mock.calls[0] as [Uint8Array]
    expect(array).toBeInstanceOf(Uint8Array)
    expect(array).toHaveLength(18)
    expect(token).toHaveLength(24)
    expect(token).toMatch(TOKEN_PATTERN)
    expect(token).toBe(referenceBase64Url(Uint8Array.from(bytes)))
  })

  it('byte toàn 0 và toàn 255 vẫn ra token hợp lệ', () => {
    expect(newGroupToken(fixedBytes(new Array<number>(18).fill(0)).source)).toBe('A'.repeat(24))
    expect(newGroupToken(fixedBytes(new Array<number>(18).fill(255)).source)).toBe('_'.repeat(24))
  })

  it('dùng crypto thật mặc định: mọi token hợp lệ và không trùng nhau', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const token = newGroupToken()
      expect(token).toMatch(TOKEN_PATTERN)
      tokens.add(token)
    }
    expect(tokens.size).toBe(2000)
  })

  it('không bao giờ ra ký tự ngoài bảng base64url hay dấu đệm', () => {
    for (let i = 0; i < 500; i++) expect(newGroupToken()).not.toMatch(/[+/=]/)
  })
})
