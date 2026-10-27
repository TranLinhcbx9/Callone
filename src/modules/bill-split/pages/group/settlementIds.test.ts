// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import type { Transfer } from '@/modules/bill-split/domain/types'
import {
  createSettlementIdBook,
  isDefiniteRejection,
  settlementKey,
} from '@/modules/bill-split/pages/group/settlementIds'

const TOKEN = 'dalat-demo-token-2026-ok'
const transfer: Transfer = { fromMemberId: 'hung', toMemberId: 'linh', amount: 150_000 }

/** Bộ sinh id đếm tăng dần, để thấy rõ khi nào id được sinh mới. */
function counter() {
  let next = 0
  return () => `id-${++next}`
}

describe('settlementKey', () => {
  it('cùng nhóm, người trả, người nhận và số tiền thì cùng khóa', () => {
    expect(settlementKey(TOKEN, transfer)).toBe(settlementKey(TOKEN, { ...transfer }))
  })

  it('khác số tiền, người trả, người nhận hoặc nhóm thì khác khóa', () => {
    const base = settlementKey(TOKEN, transfer)
    expect(settlementKey(TOKEN, { ...transfer, amount: 150_001 })).not.toBe(base)
    expect(settlementKey(TOKEN, { ...transfer, fromMemberId: 'mai' })).not.toBe(base)
    expect(settlementKey(TOKEN, { ...transfer, toMemberId: 'tu' })).not.toBe(base)
    expect(settlementKey('lau-thu-sau-demo-token-1', transfer)).not.toBe(base)
  })

  it('đổi chỗ người trả và người nhận không nhầm với nhau', () => {
    const reverse = { ...transfer, fromMemberId: transfer.toMemberId, toMemberId: transfer.fromMemberId }
    expect(settlementKey(TOKEN, reverse)).not.toBe(settlementKey(TOKEN, transfer))
  })
})

describe('createSettlementIdBook', () => {
  it('bấm lại khi chưa biết kết quả thì dùng lại đúng id cũ', () => {
    const book = createSettlementIdBook(counter())
    const key = settlementKey(TOKEN, transfer)
    const first = book.claim(key)
    expect(book.claim(key)).toBe(first)
    expect(book.claim(key)).toBe(first)
  })

  it('đã biết kết quả thì lần bấm sau là một lần trả mới với id mới', () => {
    const book = createSettlementIdBook(counter())
    const key = settlementKey(TOKEN, transfer)
    const first = book.claim(key)
    book.settle(key)
    const second = book.claim(key)
    expect(second).not.toBe(first)
    expect(book.claim(key)).toBe(second)
  })

  it('mỗi khóa có id riêng, quên một khóa không ảnh hưởng khóa khác', () => {
    const book = createSettlementIdBook(counter())
    const a = settlementKey(TOKEN, transfer)
    const b = settlementKey(TOKEN, { ...transfer, amount: 200_000 })
    const idA = book.claim(a)
    const idB = book.claim(b)
    expect(idA).not.toBe(idB)
    book.settle(a)
    expect(book.claim(b)).toBe(idB)
    expect(book.claim(a)).not.toBe(idA)
  })

  it('quên một khóa chưa từng nhận id thì không sao', () => {
    const book = createSettlementIdBook(counter())
    expect(() => book.settle('khong-co')).not.toThrow()
  })

  it('mặc định sinh id hợp lệ cho server (uuid)', () => {
    const id = createSettlementIdBook().claim('khoa')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('isDefiniteRejection', () => {
  const postgrestError = (code: string, message: string) => ({ code, message, details: '', hint: null })

  it('mã BS_* của server là từ chối rõ ràng', () => {
    expect(isDefiniteRejection(postgrestError('PT404', 'BS_GROUP_NOT_FOUND'))).toBe(true)
    expect(isDefiniteRejection(postgrestError('PT422', 'BS_INVALID'))).toBe(true)
    expect(isDefiniteRejection(postgrestError('PT422', 'BS_LIMIT'))).toBe(true)
  })

  it('rớt mạng, lỗi lạ và app cũ chưa biết server đã ghi hay chưa', () => {
    expect(isDefiniteRejection(new TypeError('Failed to fetch'))).toBe(false)
    expect(isDefiniteRejection(new Error('đứt giữa chừng'))).toBe(false)
    expect(isDefiniteRejection(postgrestError('PGRST202', 'Could not find the function'))).toBe(false)
    expect(isDefiniteRejection(postgrestError('57014', 'canceling statement due to statement timeout'))).toBe(false)
    expect(isDefiniteRejection(undefined)).toBe(false)
  })
})
