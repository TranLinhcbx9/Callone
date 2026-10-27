import { MutationObserver, QueryClient, type MutationObserverOptions } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import { expenseToInput, settlementToInput } from '@/modules/bill-split/domain/draft'
import type { ExpenseInput } from '@/modules/bill-split/domain/inputs'
import { makeExpense, makeGroup, makeMembers, makeSettlement } from '@/modules/bill-split/domain/testing/fixtures'
import type { Group } from '@/modules/bill-split/domain/types'
import { createMutationOptions, type BillSplitApi } from '@/modules/bill-split/hooks/mutationOptions'
import { createBillSplitStore } from '@/modules/bill-split/storage'
import { AppError } from '@/shared/lib/errors'
import { createModuleStorage, type KeyValueStore } from '@/shared/lib/storage'

const T1 = 'dalat-demo-token-2026-ok'
const T2 = 'lau-thu-sau-demo-token-1'
/** Token mới thứ n mà newToken giả sinh ra (24 ký tự hợp lệ). */
const minted = (n: number) => `minted-${String(n).padStart(2, '0')}-`.padEnd(24, 'x')
const members = makeMembers(['A', 'B', 'C'])
const even = { A: 100, B: 100, C: 100 }
const lunch = makeExpense('e1', 'A', 300, even, { title: 'Cơm trưa', version: 2 })
const refund = makeSettlement('s1', 'B', 'A', 100)
const before: Group = makeGroup(members, [lunch], [refund])
const after: Group = makeGroup(members, [], [], { name: 'Sau khi ghi', updatedAt: '2026-11-01T00:00:00Z' })
/** Bản sau cùng về mặt thời gian, dùng cho lần ghi cuối của một chuỗi thao tác. */
const later = (group: Group, updatedAt = '2026-11-02T00:00:00Z'): Group => ({ ...group, updatedAt })

const network = () => new AppError({ kind: 'network', code: 'NETWORK', status: 0 })
const conflict = () => new AppError({ kind: 'app', code: 'BS_CONFLICT', status: 409, detail: { current_version: 3 } })
const notFound = () => new AppError({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 })
const invalid = (field: string, reason: string) =>
  new AppError({ kind: 'app', code: 'BS_INVALID', status: 422, detail: { field, reason } })

function memoryBackend(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Promise mà test tự quyết định lúc nào xong, để dàn dựng thứ tự các lần gọi server. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Cho các việc đang chờ trong hàng đợi vi tác vụ chạy xong. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function setup() {
  const queryClient = new QueryClient()
  const backend = memoryBackend()
  const store = createBillSplitStore({
    storage: createModuleStorage('bill-split', backend),
    now: () => 1_000,
    eventTarget: null,
  })
  const mock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>()
  const api = {
    createGroup: mock(),
    updateGroup: mock(),
    rotateToken: mock(),
    deleteGroup: mock(),
    saveMember: mock(),
    deleteMember: mock(),
    saveExpense: mock(),
    deleteExpense: mock(),
    saveSettlement: mock(),
    deleteSettlement: mock(),
  }
  let mintCount = 0
  const newToken = vi.fn<() => string>(() => minted(++mintCount))
  const make = () =>
    createMutationOptions({
      queryClient,
      api: api as unknown as BillSplitApi,
      store,
      retry: { sleep: async () => undefined, delayMs: () => 0 },
      newToken,
    })
  const options = make()
  /** Chạy một mutation như useMutation làm: qua MutationObserver với cấu hình thật. */
  const run = <TData, TError, TVars>(opts: MutationObserverOptions<TData, TError, TVars>, variables: TVars) =>
    new MutationObserver(queryClient, opts).mutate(variables)
  const cacheOf = (token: string) => queryClient.getQueryData<Group>(billSplitKeys.group(token))
  return { queryClient, store, backend, api, options, make, newToken, run, cacheOf }
}

describe('createGroup', () => {
  it('đặt nhóm mới vào cache, ghi nhớ nhóm trên máy, đánh dấu danh sách tóm tắt cần làm mới', async () => {
    const { api, options, run, cacheOf, store, queryClient } = setup()
    const summariesKey = billSplitKeys.summariesFor([T2])
    queryClient.setQueryData(summariesKey, [])
    api.createGroup.mockResolvedValueOnce({ token: T1, group: before })

    const result = await run(options.createGroup, { name: 'Đà Lạt', memberNames: ['A', 'B', 'C'] })

    expect(result).toEqual({ token: T1, group: before })
    // Không có token thì hook chọn một token mới và gửi kèm.
    expect(api.createGroup).toHaveBeenCalledWith({ name: 'Đà Lạt', memberNames: ['A', 'B', 'C'], token: minted(1) })
    expect(cacheOf(T1)).toEqual(before)
    expect(store.getRecentGroups().map((g) => [g.token, g.name])).toEqual([[T1, before.name]])
    expect(queryClient.getQueryState(summariesKey)?.isInvalidated).toBe(true)
  })

  it('token do trang truyền vào được gửi nguyên, hook không tự sinh token khác', async () => {
    const { api, options, run, newToken } = setup()
    api.createGroup.mockResolvedValueOnce({ token: T2, group: before })
    await run(options.createGroup, { name: 'X', memberNames: ['A'], token: T2 })
    expect(api.createGroup).toHaveBeenCalledWith({ name: 'X', memberNames: ['A'], token: T2 })
    expect(newToken).not.toHaveBeenCalled()
  })

  it('rớt mạng thì gửi lại với đúng cùng token, nên nhóm đã tạo ở lần trước được trả lại thay vì tạo thêm', async () => {
    const { api, options, run, cacheOf, store, newToken } = setup()
    api.createGroup
      .mockRejectedValueOnce(network())
      .mockRejectedValueOnce(network())
      .mockResolvedValueOnce({ token: minted(1), group: before })

    const result = await run(options.createGroup, { name: 'Đà Lạt', memberNames: ['A'] })

    expect(result.token).toBe(minted(1))
    expect(api.createGroup).toHaveBeenCalledTimes(3)
    expect(api.createGroup.mock.calls.map(([input]) => (input as { token: string }).token)).toEqual([
      minted(1),
      minted(1),
      minted(1),
    ])
    // Token chỉ được chọn đúng một lần cho cả lần gọi.
    expect(newToken).toHaveBeenCalledTimes(1)
    expect(cacheOf(minted(1))).toEqual(before)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([minted(1)])
    expect(options.createGroup.retry).toBe(false)
  })

  it('hết lượt thử lại vẫn rớt mạng thì báo lỗi, không đụng cache hay danh sách; bấm lại với cùng token là gửi lại đúng token đó', async () => {
    const { api, options, run, cacheOf, store } = setup()
    api.createGroup.mockRejectedValue(network())
    const input = { name: 'X', memberNames: ['A'], token: T2 }
    await expect(run(options.createGroup, input)).rejects.toMatchObject({ kind: 'network' })
    expect(api.createGroup).toHaveBeenCalledTimes(3)
    expect(cacheOf(T2)).toBeUndefined()
    expect(store.getRecentGroups()).toEqual([])

    api.createGroup.mockReset()
    api.createGroup.mockResolvedValueOnce({ token: T2, group: before })
    await run(options.createGroup, input)
    expect(api.createGroup).toHaveBeenCalledWith(input)
    expect(cacheOf(T2)).toEqual(before)
  })

  it('lỗi nghiệp vụ (đã có người giữ token, quá giới hạn tốc độ) báo thẳng, không thử lại', async () => {
    const { api, options, run } = setup()
    api.createGroup.mockRejectedValue(invalid('token', 'id_taken'))
    await expect(run(options.createGroup, { name: 'X', memberNames: ['A'] })).rejects.toMatchObject({
      code: 'BS_INVALID',
      detail: { field: 'token', reason: 'id_taken' },
    })
    expect(api.createGroup).toHaveBeenCalledTimes(1)

    api.createGroup.mockReset()
    api.createGroup.mockRejectedValue(new AppError({ kind: 'app', code: 'BS_RATE_LIMITED', status: 429 }))
    await expect(run(options.createGroup, { name: 'X', memberNames: ['A'] })).rejects.toMatchObject({
      code: 'BS_RATE_LIMITED',
    })
    expect(api.createGroup).toHaveBeenCalledTimes(1)
  })
})

describe('saveExpense', () => {
  const create: ExpenseInput = expenseToInput(lunch, null)
  const edit: ExpenseInput = expenseToInput(lunch)

  it('đặt snapshot trả về vào cache nhóm, không gọi lại bs_get_group', async () => {
    const { api, options, run, cacheOf } = setup()
    api.saveExpense.mockResolvedValueOnce(before)
    await run(options.saveExpense, { token: T1, expense: create })
    expect(api.saveExpense).toHaveBeenCalledWith(T1, create)
    expect(cacheOf(T1)).toEqual(before)
  })

  it('tạo mới thì thử lại khi rớt mạng, gửi lại đúng cùng dữ liệu và cùng id', async () => {
    const { api, options, run, cacheOf } = setup()
    api.saveExpense.mockRejectedValueOnce(network()).mockRejectedValueOnce(network()).mockResolvedValueOnce(before)
    await run(options.saveExpense, { token: T1, expense: create })
    expect(api.saveExpense).toHaveBeenCalledTimes(3)
    expect(api.saveExpense.mock.calls.every(([, sent]) => sent === create)).toBe(true)
    expect(cacheOf(T1)).toEqual(before)
  })

  it('sửa theo version thì không thử lại, tránh báo xung đột giả', async () => {
    const { api, options, run } = setup()
    api.saveExpense.mockRejectedValue(network())
    await expect(run(options.saveExpense, { token: T1, expense: edit })).rejects.toMatchObject({ kind: 'network' })
    expect(api.saveExpense).toHaveBeenCalledTimes(1)
  })

  it('xung đột báo thẳng lên, cache giữ nguyên', async () => {
    const { api, options, run, cacheOf, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.saveExpense.mockRejectedValue(conflict())
    await expect(run(options.saveExpense, { token: T1, expense: edit })).rejects.toMatchObject({
      code: 'BS_CONFLICT',
      detail: { current_version: 3 },
    })
    expect(api.saveExpense).toHaveBeenCalledTimes(1)
    expect(cacheOf(T1)).toEqual(before)
  })

  it('lần tải bắt đầu trước khi ghi không được đè snapshot mới bằng dữ liệu cũ', async () => {
    const { api, options, run, cacheOf, queryClient } = setup()
    let resolveStale: (group: Group) => void = () => undefined
    const stale = new Promise<Group>((resolve) => (resolveStale = resolve))
    const fetching = queryClient.fetchQuery({ queryKey: billSplitKeys.group(T1), queryFn: () => stale }).catch(() => null)

    api.saveExpense.mockResolvedValueOnce(after)
    await run(options.saveExpense, { token: T1, expense: create })
    resolveStale(before)
    await fetching

    expect(cacheOf(T1)).toEqual(after)
  })
})

describe('deleteExpense và hoàn tác', () => {
  it('trả kèm khoản chi vừa xóa lấy từ cache và cập nhật cache bằng snapshot mới', async () => {
    const { api, options, run, cacheOf, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.deleteExpense.mockResolvedValueOnce(after)

    const result = await run(options.deleteExpense, { token: T1, expenseId: 'e1' })

    expect(api.deleteExpense).toHaveBeenCalledWith(T1, 'e1')
    expect(result.deleted).toBe(lunch)
    expect(result.group).toBe(after)
    expect(cacheOf(T1)).toEqual(after)
  })

  it('cache không có khoản chi đó thì deleted là null', async () => {
    const { api, options, run } = setup()
    api.deleteExpense.mockResolvedValueOnce(after)
    expect((await run(options.deleteExpense, { token: T1, expenseId: 'e1' })).deleted).toBeNull()
  })

  it('xóa là thao tác an toàn khi gửi hai lần nên thử lại khi rớt mạng', async () => {
    const { api, options, run } = setup()
    api.deleteExpense.mockRejectedValueOnce(network()).mockResolvedValueOnce(after)
    await run(options.deleteExpense, { token: T1, expenseId: 'e1' })
    expect(api.deleteExpense).toHaveBeenCalledTimes(2)
  })

  it('hoàn tác: lưu lại khoản chi đã xóa với đúng id cũ và không có expectedVersion', async () => {
    const { api, options, run, queryClient, cacheOf } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.deleteExpense.mockResolvedValueOnce(after)
    const { deleted } = await run(options.deleteExpense, { token: T1, expenseId: 'e1' })

    // Lần ghi sau trả snapshot có mốc muộn hơn, như server thật.
    const restoredGroup = later(before)
    api.saveExpense.mockResolvedValueOnce(restoredGroup)
    await run(options.saveExpense, { token: T1, expense: expenseToInput(deleted as NonNullable<typeof deleted>, null) })

    const [token, sent] = api.saveExpense.mock.calls[0] as [string, ExpenseInput]
    expect(token).toBe(T1)
    expect(sent).toMatchObject({ id: 'e1', title: 'Cơm trưa', amount: 300, paidBy: 'A', expectedVersion: null })
    expect(sent.shares).toEqual(lunch.shares)
    expect(cacheOf(T1)).toEqual(restoredGroup)
  })
})

describe('thanh toán', () => {
  it('lưu thanh toán cập nhật cache và thử lại khi rớt mạng', async () => {
    const { api, options, run, cacheOf } = setup()
    api.saveSettlement.mockRejectedValueOnce(network()).mockResolvedValueOnce(before)
    await run(options.saveSettlement, { token: T1, settlement: settlementToInput(refund) })
    expect(api.saveSettlement).toHaveBeenCalledTimes(2)
    expect(cacheOf(T1)).toEqual(before)
  })

  it('xóa thanh toán trả kèm bản đã xóa để hoàn tác', async () => {
    const { api, options, run, cacheOf, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.deleteSettlement.mockResolvedValueOnce(after)
    const result = await run(options.deleteSettlement, { token: T1, settlementId: 's1' })
    expect(result.deleted).toBe(refund)
    expect(settlementToInput(result.deleted as NonNullable<typeof result.deleted>)).toEqual({
      id: 's1',
      fromMemberId: 'B',
      toMemberId: 'A',
      amount: 100,
      settledOn: '2026-10-27',
      note: null,
    })
    expect(cacheOf(T1)).toEqual(after)
  })
})

describe('thành viên', () => {
  const bank = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN A' }

  const onlyBin = { bin: '970436', accountNumber: '', accountName: null }

  it('lưu thành viên có ngân hàng thì nhớ ngân hàng đó để điền sẵn ô ngân hàng lần sau', async () => {
    const { api, options, run, cacheOf, store } = setup()
    api.saveMember.mockResolvedValueOnce(before)
    await run(options.saveMember, { token: T1, member: { id: 'A', name: 'An', bank } })
    expect(cacheOf(T1)).toEqual(before)
    expect(store.getLastBank()).toEqual(onlyBin)
  })

  it('chỉ nhớ BIN: số tài khoản và tên chủ tài khoản của bạn bè không nằm lại trên máy, kể cả khi dán có dấu cách', async () => {
    const { api, options, run, store, backend } = setup()
    api.saveMember.mockResolvedValueOnce(before)
    await run(options.saveMember, {
      token: T1,
      member: { id: 'A', name: 'An', bank: { bin: '970436', accountNumber: '0123 456 789', accountName: 'Nguyễn Văn A' } },
    })
    expect(store.getLastBank()).toEqual(onlyBin)
    expect([...backend.data.values()].join(' ')).not.toMatch(/0123|456789|NGUYEN|Nguy/)
  })

  it('lưu thành viên không có ngân hàng thì không đụng tới ngân hàng đã nhớ', async () => {
    const { api, options, run, store } = setup()
    store.setLastBank(bank)
    api.saveMember.mockResolvedValue(before)
    await run(options.saveMember, { token: T1, member: { id: 'B', name: 'Bình', bank: null } })
    expect(store.getLastBank()).toEqual(onlyBin)
  })

  it('xóa thành viên đang dùng: lỗi BS_MEMBER_IN_USE báo thẳng lên, cache giữ nguyên', async () => {
    const { api, options, run, cacheOf, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.deleteMember.mockRejectedValue(new AppError({ kind: 'app', code: 'BS_MEMBER_IN_USE', status: 409 }))
    await expect(run(options.deleteMember, { token: T1, memberId: 'A' })).rejects.toMatchObject({
      code: 'BS_MEMBER_IN_USE',
    })
    expect(cacheOf(T1)).toEqual(before)
  })
})

describe('nhóm: đổi tên, xóa', () => {
  it('đổi tên cập nhật cache và tên trong danh sách gần đây', async () => {
    const { api, options, run, cacheOf, store } = setup()
    store.rememberGroup(T1, 'Tên cũ')
    api.updateGroup.mockResolvedValueOnce(after)
    await run(options.updateGroup, { token: T1, name: 'Sau khi ghi' })
    expect(api.updateGroup).toHaveBeenCalledWith(T1, 'Sau khi ghi')
    expect(cacheOf(T1)).toEqual(after)
    expect(store.getRecentGroups()[0]).toMatchObject({ token: T1, name: 'Sau khi ghi' })
  })

  it('xóa nhóm: quên nhóm trên máy và xóa hẳn query của nhóm khỏi cache, không tự thử lại', async () => {
    const { api, options, run, store, queryClient, cacheOf } = setup()
    store.rememberGroup(T1, 'A')
    store.setMe(T1, 'm1')
    store.beginRotation(T1, minted(9))
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    queryClient.setQueryData(billSplitKeys.group(T2), before)
    api.deleteGroup.mockResolvedValueOnce(undefined)

    await run(options.deleteGroup, { token: T1 })

    expect(store.getRecentGroups()).toEqual([])
    expect(store.getMe(T1)).toBeNull()
    expect(store.getPendingRotation(T1)).toBeNull()
    // Query của nhóm bị xóa hẳn (không chỉ đánh dấu cũ), nhóm khác không bị đụng tới.
    expect(queryClient.getQueryState(billSplitKeys.group(T1))).toBeUndefined()
    expect(cacheOf(T1)).toBeUndefined()
    expect(cacheOf(T2)).toEqual(before)

    api.deleteGroup.mockRejectedValueOnce(network())
    await expect(run(options.deleteGroup, { token: T1 })).rejects.toMatchObject({ kind: 'network' })
    expect(api.deleteGroup).toHaveBeenCalledTimes(2)
    expect(options.deleteGroup.retry).toBe(false)
  })

  it('xóa nhóm hủy lần tải đang chạy của nhóm đó, kết quả tải muộn không dựng lại cache', async () => {
    const { api, options, run, queryClient, cacheOf } = setup()
    const slow = deferred<Group>()
    const fetching = queryClient.fetchQuery({ queryKey: billSplitKeys.group(T1), queryFn: () => slow.promise }).catch(() => null)
    api.deleteGroup.mockResolvedValueOnce(undefined)
    await run(options.deleteGroup, { token: T1 })
    slow.resolve(before)
    await fetching
    expect(cacheOf(T1)).toBeUndefined()
  })

  it('xóa nhóm thất bại thì giữ nhóm trong danh sách gần đây và trong cache', async () => {
    const { api, options, run, store, queryClient, cacheOf } = setup()
    store.rememberGroup(T1, 'A')
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.deleteGroup.mockRejectedValueOnce(notFound())
    await expect(run(options.deleteGroup, { token: T1 })).rejects.toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
    expect(store.getRecentGroups()).toHaveLength(1)
    expect(cacheOf(T1)).toEqual(before)
  })
})

describe('đổi link an toàn khi mất phản hồi', () => {
  const X = minted(1)

  it('ghi token mới xuống máy TRƯỚC khi gọi server, và chỉ chuyển sang token mới sau khi server xác nhận', async () => {
    const { api, options, run, cacheOf, queryClient, store, backend } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    store.rememberGroup(T1, before.name)
    store.setMe(T1, 'A')
    let seenDuringCall: unknown = null
    const reply = deferred<string>()
    api.rotateToken.mockImplementationOnce(async (oldToken, newToken) => {
      seenDuringCall = {
        pending: store.getPendingRotation(oldToken as string),
        stored: JSON.parse(backend.data.get('callone:bill-split:pending-rotations') ?? 'null'),
        recents: store.getRecentGroups().map((g) => g.token),
        newCache: cacheOf(newToken as string),
      }
      return reply.promise
    })

    const done = run(options.rotateToken, { token: T1 })
    await flush()

    // Trong lúc chờ server: token mới đã nằm trong localStorage, nhưng chưa được dùng ở đâu cả.
    expect(seenDuringCall).toEqual({
      pending: { newToken: X, startedAt: 1_000 },
      stored: { [T1]: { newToken: X, startedAt: 1_000 } },
      recents: [T1],
      newCache: undefined,
    })
    expect(store.getMe(X)).toBeNull()

    reply.resolve(X)
    expect(await done).toBe(X)

    expect(api.rotateToken).toHaveBeenCalledTimes(1)
    expect(api.rotateToken).toHaveBeenCalledWith(T1, X)
    expect(cacheOf(X)).toEqual(before)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([X])
    expect(store.getMe(X)).toBe('A')
    expect(store.getMe(T1)).toBeNull()
    expect(store.getPendingRotation(T1)).toBeNull()
    expect(backend.data.has('callone:bill-split:pending-rotations')).toBe(false)
    expect(options.rotateToken.retry).toBe(false)
  })

  it('rớt mạng: thử lại cùng cặp (cũ, mới), hết lượt thì giữ lần đang chờ và chưa chuyển gì sang token mới', async () => {
    const { api, options, run, cacheOf, queryClient, store } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    store.rememberGroup(T1, before.name)
    api.rotateToken.mockRejectedValue(network())

    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({ kind: 'network' })

    expect(api.rotateToken.mock.calls).toEqual([
      [T1, X],
      [T1, X],
      [T1, X],
    ])
    expect(store.getPendingRotation(T1)).toEqual({ newToken: X, startedAt: 1_000 })
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T1])
    expect(cacheOf(X)).toBeUndefined()
  })

  it('mất phản hồi lần đầu rồi bấm lại: dùng lại đúng token đã chọn, không bao giờ chọn token thứ hai', async () => {
    const { api, options, run, cacheOf, queryClient, store } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    store.rememberGroup(T1, before.name)
    // Lần 1: server đã đổi xong nhưng phản hồi không về tới máy (mọi lần thử lại cũng rớt mạng).
    api.rotateToken.mockRejectedValue(network())
    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({ kind: 'network' })

    // Lần 2: có mạng. Cùng cặp (cũ, mới), server nhận ra đã đổi xong và trả lại token mới.
    api.rotateToken.mockReset()
    api.rotateToken.mockResolvedValueOnce(X)
    expect(await run(options.rotateToken, { token: T1 })).toBe(X)

    expect(api.rotateToken).toHaveBeenCalledTimes(1)
    expect(api.rotateToken).toHaveBeenCalledWith(T1, X)
    expect(cacheOf(X)).toEqual(before)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([X])
    expect(store.getPendingRotation(T1)).toBeNull()
  })

  it('rớt mạng rồi thành công ngay trong lượt thử lại: một lần chạy, token mới chỉ chọn một lần', async () => {
    const { api, options, run, store } = setup()
    store.rememberGroup(T1, before.name)
    api.rotateToken.mockRejectedValueOnce(network()).mockResolvedValueOnce(X)
    expect(await run(options.rotateToken, { token: T1 })).toBe(X)
    expect(api.rotateToken.mock.calls).toEqual([
      [T1, X],
      [T1, X],
    ])
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([X])
  })

  it('BS_GROUP_NOT_FOUND (token cũ đã chết và không ai giữ token mới): bỏ lần đang chờ, đánh dấu cache cũ', async () => {
    const { api, options, run, store, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.rotateToken.mockRejectedValue(notFound())

    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })

    expect(api.rotateToken).toHaveBeenCalledTimes(1)
    expect(store.getPendingRotation(T1)).toBeNull()
    expect(queryClient.getQueryState(billSplitKeys.group(T1))?.isInvalidated).toBe(true)
  })

  it('BS_INVALID new_token (id_taken, format): bỏ token đã chọn, lần bấm sau chọn token mới', async () => {
    const { api, options, run, store } = setup()
    store.rememberGroup(T1, before.name)
    api.rotateToken.mockRejectedValueOnce(invalid('new_token', 'id_taken'))
    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({
      detail: { field: 'new_token', reason: 'id_taken' },
    })
    expect(store.getPendingRotation(T1)).toBeNull()

    api.rotateToken.mockResolvedValueOnce(minted(2))
    expect(await run(options.rotateToken, { token: T1 })).toBe(minted(2))
    expect(api.rotateToken.mock.calls).toEqual([
      [T1, X],
      [T1, minted(2)],
    ])
  })

  it('lỗi không rõ server đã làm hay chưa (lỗi lạ, 5xx, app cũ) thì giữ lần đang chờ, trừ khi chắc chắn chưa áp dụng', async () => {
    const { api, options, run, store } = setup()
    api.rotateToken.mockRejectedValueOnce(new AppError({ kind: 'unknown', code: 'UNKNOWN', status: 500 }))
    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({ code: 'UNKNOWN' })
    expect(store.getPendingRotation(T1)).toEqual({ newToken: X, startedAt: 1_000 })

    // Server chưa có chữ ký hàm mới: lần gọi chắc chắn chưa được áp dụng, bỏ đi.
    api.rotateToken.mockRejectedValueOnce(new AppError({ kind: 'outdated', code: 'OUTDATED' }))
    await expect(run(options.rotateToken, { token: T1 })).rejects.toMatchObject({ kind: 'outdated' })
    expect(store.getPendingRotation(T1)).toBeNull()
  })

  it('bấm hai lần khi lần đầu còn chạy: dùng chung một lần chạy, chỉ một lần gọi server', async () => {
    const { api, options, run, store } = setup()
    store.rememberGroup(T1, before.name)
    const reply = deferred<string>()
    api.rotateToken.mockReturnValue(reply.promise)

    const first = run(options.rotateToken, { token: T1 })
    const second = run(options.rotateToken, { token: T1 })
    await flush()
    reply.resolve(X)

    expect(await first).toBe(X)
    expect(await second).toBe(X)
    expect(api.rotateToken).toHaveBeenCalledTimes(1)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([X])
  })

  it('đổi link nhóm này không ảnh hưởng đổi link nhóm khác đang chờ', async () => {
    const { api, options, run, store } = setup()
    store.beginRotation(T2, minted(7))
    api.rotateToken.mockResolvedValueOnce(X)
    await run(options.rotateToken, { token: T1 })
    expect(store.getPendingRotation(T2)).toEqual({ newToken: minted(7), startedAt: 1_000 })
  })

  it('đổi link chờ đến lượt sau các lần ghi đã xếp trước cho cùng nhóm', async () => {
    const { api, options, run } = setup()
    const slowSave = deferred<Group>()
    api.saveMember.mockReturnValue(slowSave.promise)
    api.rotateToken.mockResolvedValue(X)

    const saving = run(options.saveMember, { token: T1, member: { id: 'A', name: 'An', bank: null } })
    const rotating = run(options.rotateToken, { token: T1 })
    await flush()
    expect(api.rotateToken).not.toHaveBeenCalled()

    slowSave.resolve(before)
    await saving
    expect(await rotating).toBe(X)
    expect(api.rotateToken).toHaveBeenCalledTimes(1)
  })
})

describe('ghi vào cùng một nhóm chạy lần lượt', () => {
  const ex = (id: string) => expenseToInput(makeExpense(id, 'A', 300, even), null)
  const snapshotWith = (ids: string[], updatedAt: string): Group =>
    makeGroup(members, ids.map((id) => makeExpense(id, 'A', 300, even)), [], { updatedAt })

  it('lần ghi sau chỉ gọi server khi lần trước đã xong, và cache cuối cùng là của lần ghi sau cùng', async () => {
    const { api, options, run, cacheOf } = setup()
    const first = deferred<Group>()
    const second = deferred<Group>()
    api.saveExpense.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const a = run(options.saveExpense, { token: T1, expense: ex('e1') })
    const b = run(options.saveExpense, { token: T1, expense: ex('e2') })
    await flush()
    expect(api.saveExpense).toHaveBeenCalledTimes(1)
    expect(api.saveExpense.mock.calls[0]?.[1]).toMatchObject({ id: 'e1' })

    first.resolve(snapshotWith(['e1'], '2026-11-01T00:00:00Z'))
    await a
    await flush()
    expect(api.saveExpense).toHaveBeenCalledTimes(2)
    expect(api.saveExpense.mock.calls[1]?.[1]).toMatchObject({ id: 'e2' })
    expect(cacheOf(T1)?.expenses.map((e) => e.id)).toEqual(['e1'])

    second.resolve(snapshotWith(['e1', 'e2'], '2026-11-01T00:00:01Z'))
    await b
    expect(cacheOf(T1)?.expenses.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('phản hồi không bao giờ đảo thứ tự: lần ghi đầu chậm hơn vẫn không đè lần ghi sau', async () => {
    const { api, options, run, cacheOf } = setup()
    // Server trả lời lần đầu rất chậm, lần hai rất nhanh. Không có hàng đợi thì lần đầu về sau và đè lên lần hai.
    api.saveExpense.mockImplementation(async (_token, expense) => {
      const id = (expense as ExpenseInput).id
      await new Promise((resolve) => setTimeout(resolve, id === 'e1' ? 30 : 1))
      return id === 'e1' ? snapshotWith(['e1'], '2026-11-01T00:00:00Z') : snapshotWith(['e1', 'e2'], '2026-11-01T00:00:01Z')
    })
    await Promise.all([
      run(options.saveExpense, { token: T1, expense: ex('e1') }),
      run(options.saveExpense, { token: T1, expense: ex('e2') }),
    ])
    expect(cacheOf(T1)?.expenses.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('các nhóm khác nhau chạy song song', async () => {
    const { api, options, run } = setup()
    const slow = deferred<Group>()
    api.saveExpense.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(after)
    const a = run(options.saveExpense, { token: T1, expense: ex('e1') })
    const b = run(options.saveExpense, { token: T2, expense: ex('e2') })
    await b
    expect(api.saveExpense).toHaveBeenCalledTimes(2)
    slow.resolve(before)
    await a
  })

  it('mọi loại ghi vào cùng nhóm đều chung một hàng đợi', async () => {
    const { api, options, run } = setup()
    const slow = deferred<Group>()
    api.updateGroup.mockReturnValue(slow.promise)
    api.saveMember.mockResolvedValue(before)
    api.deleteMember.mockResolvedValue(before)
    api.saveSettlement.mockResolvedValue(before)
    api.deleteSettlement.mockResolvedValue(before)
    api.deleteExpense.mockResolvedValue(before)

    const all = [
      run(options.updateGroup, { token: T1, name: 'Tên mới' }),
      run(options.saveMember, { token: T1, member: { id: 'A', name: 'An', bank: null } }),
      run(options.deleteMember, { token: T1, memberId: 'A' }),
      run(options.saveSettlement, { token: T1, settlement: settlementToInput(refund) }),
      run(options.deleteSettlement, { token: T1, settlementId: 's1' }),
      run(options.deleteExpense, { token: T1, expenseId: 'e1' }),
    ]
    await flush()
    for (const mock of [api.saveMember, api.deleteMember, api.saveSettlement, api.deleteSettlement, api.deleteExpense]) {
      expect(mock).not.toHaveBeenCalled()
    }
    slow.resolve(before)
    await Promise.all(all)
    for (const mock of [api.saveMember, api.deleteMember, api.saveSettlement, api.deleteSettlement, api.deleteExpense]) {
      expect(mock).toHaveBeenCalledTimes(1)
    }
  })

  it('lần ghi trước lỗi thì lần ghi sau vẫn chạy', async () => {
    const { api, options, run, cacheOf } = setup()
    api.saveExpense.mockRejectedValueOnce(conflict()).mockResolvedValueOnce(before)
    const a = run(options.saveExpense, { token: T1, expense: expenseToInput(lunch) })
    const b = run(options.saveExpense, { token: T1, expense: ex('e2') })
    await expect(a).rejects.toMatchObject({ code: 'BS_CONFLICT' })
    await b
    expect(cacheOf(T1)).toEqual(before)
  })

  it('nhiều hook (mỗi hook dựng options riêng) cùng một QueryClient dùng chung hàng đợi', async () => {
    const { api, make, run } = setup()
    const slow = deferred<Group>()
    api.saveExpense.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(before)
    const hookA = make()
    const hookB = make()
    const a = run(hookA.saveExpense, { token: T1, expense: ex('e1') })
    const b = run(hookB.saveExpense, { token: T1, expense: ex('e2') })
    await flush()
    expect(api.saveExpense).toHaveBeenCalledTimes(1)
    slow.resolve(before)
    await Promise.all([a, b])
    expect(api.saveExpense).toHaveBeenCalledTimes(2)
  })

  it('xóa khoản chi đọc cache khi tới lượt: thấy khoản chi vừa được lần ghi đứng trước thêm vào', async () => {
    const { api, options, run } = setup()
    const slow = deferred<Group>()
    api.saveExpense.mockReturnValueOnce(slow.promise)
    api.deleteExpense.mockResolvedValueOnce(snapshotWith([], '2026-11-02T00:00:00Z'))

    const adding = run(options.saveExpense, { token: T1, expense: ex('e9') })
    const removing = run(options.deleteExpense, { token: T1, expenseId: 'e9' })
    await flush()
    slow.resolve(snapshotWith(['e9'], '2026-11-01T00:00:00Z'))
    await adding
    const result = await removing
    expect(result.deleted).toMatchObject({ id: 'e9' })
  })
})

describe('ghi thất bại vì dữ liệu đã đổi', () => {
  const failing = (code: string, status = 409) => new AppError({ kind: 'app', code, status })
  const staleCodes = ['BS_CONFLICT', 'BS_NOT_FOUND', 'BS_MEMBER_IN_USE', 'BS_GROUP_NOT_FOUND']

  it.each(staleCodes)('%s: đánh dấu cache của nhóm là cũ để tải lại bản mới nhất', async (code) => {
    const { api, options, run, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.saveExpense.mockRejectedValueOnce(failing(code))
    await expect(run(options.saveExpense, { token: T1, expense: expenseToInput(lunch) })).rejects.toMatchObject({ code })
    expect(queryClient.getQueryState(billSplitKeys.group(T1))?.isInvalidated).toBe(true)
  })

  it('áp dụng cho mọi hàm ghi theo nhóm', async () => {
    const { api, options, run, queryClient } = setup()
    const isStale = () => queryClient.getQueryState(billSplitKeys.group(T1))?.isInvalidated
    const arm = () => queryClient.setQueryData(billSplitKeys.group(T1), before)
    const cases: [() => Promise<unknown>, ReturnType<typeof vi.fn>][] = [
      [() => run(options.updateGroup, { token: T1, name: 'X' }), api.updateGroup],
      [() => run(options.saveMember, { token: T1, member: { id: 'A', name: 'An', bank: null } }), api.saveMember],
      [() => run(options.deleteMember, { token: T1, memberId: 'A' }), api.deleteMember],
      [() => run(options.deleteExpense, { token: T1, expenseId: 'e1' }), api.deleteExpense],
      [() => run(options.saveSettlement, { token: T1, settlement: settlementToInput(refund) }), api.saveSettlement],
      [() => run(options.deleteSettlement, { token: T1, settlementId: 's1' }), api.deleteSettlement],
    ]
    for (const [start, mock] of cases) {
      arm()
      expect(isStale()).toBe(false)
      mock.mockRejectedValueOnce(failing('BS_NOT_FOUND', 404))
      await expect(start()).rejects.toMatchObject({ code: 'BS_NOT_FOUND' })
      expect(isStale()).toBe(true)
    }
  })

  it('lỗi mạng hoặc dữ liệu sai định dạng không làm cache bị đánh dấu cũ', async () => {
    const { api, options, run, queryClient } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    api.saveExpense.mockRejectedValueOnce(network())
    await expect(run(options.saveExpense, { token: T1, expense: expenseToInput(lunch) })).rejects.toBeDefined()
    api.saveExpense.mockRejectedValueOnce(failing('BS_INVALID', 422))
    await expect(run(options.saveExpense, { token: T1, expense: expenseToInput(lunch) })).rejects.toBeDefined()
    expect(queryClient.getQueryState(billSplitKeys.group(T1))?.isInvalidated).toBe(false)
  })
})
