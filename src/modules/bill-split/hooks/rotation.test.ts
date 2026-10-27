// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import { makeGroup, makeMembers } from '@/modules/bill-split/domain/testing/fixtures'
import type { Group, GroupSummary } from '@/modules/bill-split/domain/types'
import {
  adoptRotatedToken,
  isSettledRotationFailure,
  resumePendingRotation,
  rotationFlights,
} from '@/modules/bill-split/hooks/rotation'
import { createBillSplitStore } from '@/modules/bill-split/storage'
import { AppError } from '@/shared/lib/errors'
import { createModuleStorage, type KeyValueStore } from '@/shared/lib/storage'

const OLD = 'dalat-demo-token-2026-ok'
const NEW = 'NewTokenAfterRotate_0123'
const OTHER = 'lau-thu-sau-demo-token-1'
const group: Group = makeGroup(makeMembers(['A', 'B']), [], [], { name: 'Đà Lạt' })

function summary(token: string): GroupSummary {
  return { token, id: 'group-1', name: 'Đà Lạt', memberCount: 2, expenseCount: 0, totalSpent: 0, updatedAt: group.updatedAt }
}

function setup() {
  const data = new Map<string, string>()
  const backend: KeyValueStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
  const store = createBillSplitStore({ storage: createModuleStorage('bill-split', backend), now: () => 5_000, eventTarget: null })
  const queryClient = new QueryClient()
  const getGroupSummaries = vi.fn<(tokens: readonly string[]) => Promise<GroupSummary[]>>()
  const deps = { queryClient, store, api: { getGroupSummaries } }
  return { queryClient, store, getGroupSummaries, deps }
}

describe('resumePendingRotation', () => {
  it('không có lần đổi link đang chờ thì trả null và không hỏi server', async () => {
    const { deps, getGroupSummaries } = setup()
    expect(await resumePendingRotation(deps, OLD)).toBeNull()
    expect(getGroupSummaries).not.toHaveBeenCalled()
  })

  it('server đã đổi xong nhưng phản hồi bị mất: token mới đang sống thì chuyển mọi thứ sang đó và trả token mới', async () => {
    const { deps, getGroupSummaries, store, queryClient } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    store.setMe(OLD, 'm1')
    store.beginRotation(OLD, NEW)
    queryClient.setQueryData(billSplitKeys.group(OLD), group)
    const summaries = billSplitKeys.summariesFor([OLD])
    queryClient.setQueryData(summaries, [])
    getGroupSummaries.mockResolvedValue([summary(NEW)])

    expect(await resumePendingRotation(deps, OLD)).toBe(NEW)

    expect(getGroupSummaries).toHaveBeenCalledTimes(1)
    expect(getGroupSummaries).toHaveBeenCalledWith([OLD, NEW])
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([NEW])
    expect(store.getMe(NEW)).toBe('m1')
    expect(store.getMe(OLD)).toBeNull()
    expect(store.getPendingRotation(OLD)).toBeNull()
    expect(queryClient.getQueryData(billSplitKeys.group(NEW))).toBe(group)
    expect(queryClient.getQueryState(summaries)?.isInvalidated).toBe(true)
  })

  it('lần đổi link chưa tới server (token cũ còn sống, token mới chưa có): không làm gì, giữ lần đang chờ, không tự đổi', async () => {
    const { deps, getGroupSummaries, store } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    const pending = store.beginRotation(OLD, NEW)
    getGroupSummaries.mockResolvedValue([summary(OLD)])

    expect(await resumePendingRotation(deps, OLD)).toBeNull()

    expect(store.getPendingRotation(OLD)).toBe(pending)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([OLD])
  })

  it('cả hai đều không sống (nhóm đã xóa, hoặc người khác đã đổi link): bỏ lần đang chờ và trả null', async () => {
    const { deps, getGroupSummaries, store } = setup()
    store.beginRotation(OLD, NEW)
    getGroupSummaries.mockResolvedValue([summary(OTHER)])

    expect(await resumePendingRotation(deps, OLD)).toBeNull()

    expect(store.getPendingRotation(OLD)).toBeNull()
  })

  it('rớt mạng thì ném lỗi và giữ nguyên lần đang chờ', async () => {
    const { deps, getGroupSummaries, store } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    const pending = store.beginRotation(OLD, NEW)
    getGroupSummaries.mockRejectedValue(new AppError({ kind: 'network', code: 'NETWORK', status: 0 }))

    await expect(resumePendingRotation(deps, OLD)).rejects.toMatchObject({ kind: 'network' })

    expect(store.getPendingRotation(OLD)).toBe(pending)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([OLD])
  })

  it('lần đang chờ đổi sang token khác trong lúc chờ server thì không bỏ nhầm lần mới', async () => {
    const { deps, getGroupSummaries, store } = setup()
    store.beginRotation(OLD, NEW)
    getGroupSummaries.mockImplementation(async () => {
      store.clearPendingRotation(OLD)
      store.beginRotation(OLD, 'SecondCandidateToken_012')
      return []
    })

    expect(await resumePendingRotation(deps, OLD)).toBeNull()

    expect(store.getPendingRotation(OLD)).toMatchObject({ newToken: 'SecondCandidateToken_012' })
  })

  it('gọi lại sau khi đã khôi phục thì không còn gì để làm', async () => {
    const { deps, getGroupSummaries, store } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    store.beginRotation(OLD, NEW)
    getGroupSummaries.mockResolvedValue([summary(NEW)])
    expect(await resumePendingRotation(deps, OLD)).toBe(NEW)
    expect(await resumePendingRotation(deps, OLD)).toBeNull()
    expect(getGroupSummaries).toHaveBeenCalledTimes(1)
  })

  it('chỉ đọc: không bao giờ gọi hàm ghi nào của server', async () => {
    const { queryClient, store, getGroupSummaries } = setup()
    store.beginRotation(OLD, NEW)
    getGroupSummaries.mockResolvedValue([summary(OLD)])
    // deps chỉ có đúng một hàm của api, gọi hàm nào khác sẽ ném TypeError.
    await expect(resumePendingRotation({ queryClient, store, api: { getGroupSummaries } }, OLD)).resolves.toBeNull()
  })
})

describe('adoptRotatedToken', () => {
  it('chuyển cache, danh sách gần đây và "mình là ai", xóa lần đang chờ; key cũ để nguyên', async () => {
    const { deps, store, queryClient } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    store.setMe(OLD, 'm1')
    store.beginRotation(OLD, NEW)
    queryClient.setQueryData(billSplitKeys.group(OLD), group)

    await adoptRotatedToken(deps, OLD, NEW)

    expect(queryClient.getQueryData(billSplitKeys.group(NEW))).toBe(group)
    expect(queryClient.getQueryData(billSplitKeys.group(OLD))).toBe(group)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([NEW])
    expect(store.getMe(NEW)).toBe('m1')
    expect(store.getPendingRotation(OLD)).toBeNull()
  })

  it('không đè dữ liệu đã có ở key mới', async () => {
    const { deps, queryClient } = setup()
    const newer: Group = { ...group, name: 'Bản mới hơn' }
    queryClient.setQueryData(billSplitKeys.group(OLD), group)
    queryClient.setQueryData(billSplitKeys.group(NEW), newer)
    await adoptRotatedToken(deps, OLD, NEW)
    expect(queryClient.getQueryData(billSplitKeys.group(NEW))).toBe(newer)
  })

  it('gọi hai lần liên tiếp (đường khôi phục chạy cùng lúc với mutation) vẫn đúng', async () => {
    const { deps, store } = setup()
    store.rememberGroup(OLD, 'Đà Lạt')
    store.beginRotation(OLD, NEW)
    await Promise.all([adoptRotatedToken(deps, OLD, NEW), adoptRotatedToken(deps, OLD, NEW)])
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([NEW])
    expect(store.getPendingRotation(OLD)).toBeNull()
  })

  it('hủy lần tải đang chạy của key cũ, vì nó sắp trả BS_GROUP_NOT_FOUND', async () => {
    const { deps, queryClient } = setup()
    const failing = queryClient
      .fetchQuery({
        queryKey: billSplitKeys.group(OLD),
        queryFn: () => new Promise<Group>((_resolve, reject) => setTimeout(() => reject(new Error('404')), 20)),
      })
      .catch((error: unknown) => error)
    await adoptRotatedToken(deps, OLD, NEW)
    await failing
    expect(queryClient.getQueryState(billSplitKeys.group(OLD))?.status).not.toBe('error')
  })
})

describe('isSettledRotationFailure', () => {
  const app = (code: string, detail?: unknown, status = 422) => new AppError({ kind: 'app', code, status, detail })

  it('chắc chắn không thể thành công nữa: bỏ lần đang chờ', () => {
    expect(isSettledRotationFailure(app('BS_GROUP_NOT_FOUND', undefined, 404))).toBe(true)
    expect(isSettledRotationFailure(app('BS_INVALID', { field: 'new_token', reason: 'id_taken' }))).toBe(true)
    expect(isSettledRotationFailure(app('BS_INVALID', { field: 'new_token', reason: 'format' }))).toBe(true)
    expect(isSettledRotationFailure(new AppError({ kind: 'outdated', code: 'OUTDATED' }))).toBe(true)
  })

  it('nhận cả lỗi thô của PostgREST chưa qua toAppError', () => {
    expect(isSettledRotationFailure({ code: 'PT404', message: 'BS_GROUP_NOT_FOUND', details: '', hint: null })).toBe(true)
    expect(
      isSettledRotationFailure({
        code: 'PT422',
        message: 'BS_INVALID',
        details: '{"field":"new_token","reason":"id_taken"}',
        hint: null,
      }),
    ).toBe(true)
  })

  it('không rõ server đã làm hay chưa: giữ lần đang chờ', () => {
    expect(isSettledRotationFailure(new AppError({ kind: 'network', code: 'NETWORK', status: 0 }))).toBe(false)
    expect(isSettledRotationFailure(new AppError({ kind: 'unknown', code: 'UNKNOWN', status: 500 }))).toBe(false)
    expect(isSettledRotationFailure(app('BS_INVALID', { field: 'name', reason: 'duplicate' }))).toBe(false)
    expect(isSettledRotationFailure(app('BS_INVALID'))).toBe(false)
    expect(isSettledRotationFailure(app('BS_RATE_LIMITED', undefined, 429))).toBe(false)
    expect(isSettledRotationFailure(new TypeError('Failed to fetch'))).toBe(false)
    expect(isSettledRotationFailure('lạ')).toBe(false)
  })
})

describe('rotationFlights', () => {
  it('mỗi QueryClient một bảng riêng, cùng QueryClient thì cùng bảng', () => {
    const client = new QueryClient()
    expect(rotationFlights(client)).toBe(rotationFlights(client))
    expect(rotationFlights(new QueryClient())).not.toBe(rotationFlights(client))
  })
})
