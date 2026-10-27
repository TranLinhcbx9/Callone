// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// rpc.ts (qua useRotationRecovery.ts) import supabase client, nên thay bằng bản giả để không dựng client thật.
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc: vi.fn<() => void>() } }))

import {
  deriveRecoveryStatus,
  useRotationRecovery,
  type RecoveryAttempt,
} from '@/modules/bill-split/hooks/useRotationRecovery'
import { billSplitStore } from '@/modules/bill-split/storage'

const KEY = 'tokenA>tokenB'
const attempt = (outcome: RecoveryAttempt['outcome'], key = KEY): RecoveryAttempt => ({ key, outcome })

describe('deriveRecoveryStatus', () => {
  it('không có lần đổi link đang chờ thì luôn là idle', () => {
    for (const notFound of [true, false]) {
      expect(deriveRecoveryStatus(null, null, notFound)).toBe('idle')
      expect(deriveRecoveryStatus(null, attempt('running'), notFound)).toBe('idle')
      expect(deriveRecoveryStatus(null, attempt('unreachable'), notFound)).toBe('idle')
    }
  })

  it('token báo không tìm thấy mà có lần đang chờ chưa hỏi lần nào: checking ngay từ lần render đầu (không nháy "không tìm thấy")', () => {
    expect(deriveRecoveryStatus(KEY, null, true)).toBe('checking')
  })

  it('có lần đang chờ nhưng trang đang hiện nhóm bình thường và chưa hỏi: idle', () => {
    expect(deriveRecoveryStatus(KEY, null, false)).toBe('idle')
  })

  it('đang hỏi thì checking, dù notFound hay không (hỏi lại do người dùng hoặc do có lại mạng)', () => {
    expect(deriveRecoveryStatus(KEY, attempt('running'), true)).toBe('checking')
    expect(deriveRecoveryStatus(KEY, attempt('running'), false)).toBe('checking')
  })

  it('lần hỏi gần nhất không tới được server: unreachable, kể cả khi notFound', () => {
    expect(deriveRecoveryStatus(KEY, attempt('unreachable'), true)).toBe('unreachable')
    expect(deriveRecoveryStatus(KEY, attempt('unreachable'), false)).toBe('unreachable')
  })

  it('hỏi xong mà không có gì để khôi phục: idle, không kẹt ở checking dù trang vẫn báo không tìm thấy', () => {
    expect(deriveRecoveryStatus(KEY, attempt('done'), true)).toBe('idle')
    expect(deriveRecoveryStatus(KEY, attempt('done'), false)).toBe('idle')
  })

  it('kết quả của một lần đang chờ khác (token mới khác, hoặc nhóm khác) không tính cho lần đang chờ hiện tại', () => {
    const stale = attempt('unreachable', 'tokenA>tokenOld')
    expect(deriveRecoveryStatus(KEY, stale, true)).toBe('checking')
    expect(deriveRecoveryStatus(KEY, stale, false)).toBe('idle')
    expect(deriveRecoveryStatus(KEY, attempt('done', 'tokenZ>tokenB'), true)).toBe('checking')
  })
})

describe('useRotationRecovery: lần render đầu', () => {
  const OLD = 'dalat-demo-token-2026-ok'
  const NEW = 'NewTokenAfterRotate_0123'

  /** Render một lần trên server (không chạy effect): đúng thứ người dùng thấy trong khung hình đầu tiên. */
  function firstRender(token: string | undefined, notFound: boolean): string {
    function Probe() {
      const recovery = useRotationRecovery(token, { notFound, onRecovered: () => undefined })
      return createElement('p', null, `${recovery.status}|${String(recovery.hasPending)}`)
    }
    const html = renderToString(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Probe)),
    )
    return html.replace(/<[^>]+>/g, '')
  }

  afterEach(() => {
    billSplitStore.clearPendingRotation(OLD)
  })

  it('không có lần đổi link đang chờ: idle, dù trang báo không tìm thấy hay không', () => {
    expect(firstRender(OLD, false)).toBe('idle|false')
    expect(firstRender(OLD, true)).toBe('idle|false')
    expect(firstRender(undefined, true)).toBe('idle|false')
  })

  it('có lần đang chờ và token báo không tìm thấy: checking ngay từ khung hình đầu, nên không nháy "không tìm thấy"', () => {
    billSplitStore.beginRotation(OLD, NEW)
    expect(firstRender(OLD, true)).toBe('checking|true')
  })

  it('có lần đang chờ nhưng trang đang hiện nhóm bình thường: idle, chỉ báo hasPending', () => {
    billSplitStore.beginRotation(OLD, NEW)
    expect(firstRender(OLD, false)).toBe('idle|true')
  })

  it('lần đang chờ của nhóm khác không ảnh hưởng', () => {
    billSplitStore.beginRotation(OLD, NEW)
    expect(firstRender('lau-thu-sau-demo-token-1', true)).toBe('idle|false')
  })
})
