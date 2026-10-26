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
const members = makeMembers(['A', 'B', 'C'])
const even = { A: 100, B: 100, C: 100 }
const lunch = makeExpense('e1', 'A', 300, even, { title: 'Cơm trưa', version: 2 })
const refund = makeSettlement('s1', 'B', 'A', 100)
const before: Group = makeGroup(members, [lunch], [refund])
const after: Group = makeGroup(members, [], [], { name: 'Sau khi ghi', updatedAt: '2026-11-01T00:00:00Z' })

const network = () => new AppError({ kind: 'network', code: 'NETWORK', status: 0 })
const conflict = () => new AppError({ kind: 'app', code: 'BS_CONFLICT', status: 409, detail: { current_version: 3 } })

function memoryBackend(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

function setup() {
  const queryClient = new QueryClient()
  const store = createBillSplitStore({
    storage: createModuleStorage('bill-split', memoryBackend()),
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
  const options = createMutationOptions({
    queryClient,
    api: api as unknown as BillSplitApi,
    store,
    retry: { sleep: async () => undefined, delayMs: () => 0 },
  })
  /** Chạy một mutation như useMutation làm: qua MutationObserver với cấu hình thật. */
  const run = <TData, TError, TVars>(opts: MutationObserverOptions<TData, TError, TVars>, variables: TVars) =>
    new MutationObserver(queryClient, opts).mutate(variables)
  const cacheOf = (token: string) => queryClient.getQueryData<Group>(billSplitKeys.group(token))
  return { queryClient, store, api, options, run, cacheOf }
}

describe('createGroup', () => {
  it('đặt nhóm mới vào cache, ghi nhớ nhóm trên máy, đánh dấu danh sách tóm tắt cần làm mới', async () => {
    const { api, options, run, cacheOf, store, queryClient } = setup()
    const summariesKey = billSplitKeys.summariesFor([T2])
    queryClient.setQueryData(summariesKey, [])
    api.createGroup.mockResolvedValueOnce({ token: T1, group: before })

    const result = await run(options.createGroup, { name: 'Đà Lạt', memberNames: ['A', 'B', 'C'] })

    expect(result).toEqual({ token: T1, group: before })
    expect(api.createGroup).toHaveBeenCalledWith({ name: 'Đà Lạt', memberNames: ['A', 'B', 'C'] })
    expect(cacheOf(T1)).toEqual(before)
    expect(store.getRecentGroups().map((g) => [g.token, g.name])).toEqual([[T1, before.name]])
    expect(queryClient.getQueryState(summariesKey)?.isInvalidated).toBe(true)
  })

  it('rớt mạng không bao giờ tự gửi lại, vì gửi hai lần sẽ tạo hai nhóm', async () => {
    const { api, options, run, cacheOf, store } = setup()
    api.createGroup.mockRejectedValue(network())
    await expect(run(options.createGroup, { name: 'X', memberNames: ['A'] })).rejects.toMatchObject({ kind: 'network' })
    expect(api.createGroup).toHaveBeenCalledTimes(1)
    expect(options.createGroup.retry).toBe(false)
    expect(cacheOf(T1)).toBeUndefined()
    expect(store.getRecentGroups()).toEqual([])
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

    api.saveExpense.mockResolvedValueOnce(before)
    await run(options.saveExpense, { token: T1, expense: expenseToInput(deleted as NonNullable<typeof deleted>, null) })

    const [token, sent] = api.saveExpense.mock.calls[0] as [string, ExpenseInput]
    expect(token).toBe(T1)
    expect(sent).toMatchObject({ id: 'e1', title: 'Cơm trưa', amount: 300, paidBy: 'A', expectedVersion: null })
    expect(sent.shares).toEqual(lunch.shares)
    expect(cacheOf(T1)).toEqual(before)
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

  it('lưu thành viên có ngân hàng thì nhớ ngân hàng đó để điền sẵn lần sau', async () => {
    const { api, options, run, cacheOf, store } = setup()
    api.saveMember.mockResolvedValueOnce(before)
    await run(options.saveMember, { token: T1, member: { id: 'A', name: 'An', bank } })
    expect(cacheOf(T1)).toEqual(before)
    expect(store.getLastBank()).toEqual(bank)
  })

  it('lưu thành viên không có ngân hàng thì không đụng tới ngân hàng đã nhớ', async () => {
    const { api, options, run, store } = setup()
    store.setLastBank(bank)
    api.saveMember.mockResolvedValue(before)
    await run(options.saveMember, { token: T1, member: { id: 'B', name: 'Bình', bank: null } })
    expect(store.getLastBank()).toEqual(bank)
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

describe('nhóm: đổi tên, đổi link, xóa', () => {
  it('đổi tên cập nhật cache và tên trong danh sách gần đây', async () => {
    const { api, options, run, cacheOf, store } = setup()
    store.rememberGroup(T1, 'Tên cũ')
    api.updateGroup.mockResolvedValueOnce(after)
    await run(options.updateGroup, { token: T1, name: 'Sau khi ghi' })
    expect(api.updateGroup).toHaveBeenCalledWith(T1, 'Sau khi ghi')
    expect(cacheOf(T1)).toEqual(after)
    expect(store.getRecentGroups()[0]).toMatchObject({ token: T1, name: 'Sau khi ghi' })
  })

  it('đổi link: chép cache sang token mới, chuyển danh sách gần đây và "mình là ai", không tự thử lại', async () => {
    const { api, options, run, cacheOf, queryClient, store } = setup()
    queryClient.setQueryData(billSplitKeys.group(T1), before)
    store.rememberGroup(T1, before.name)
    store.setMe(T1, 'A')
    api.rotateToken.mockResolvedValueOnce(T2)

    expect(await run(options.rotateToken, { token: T1 })).toBe(T2)

    expect(cacheOf(T2)).toEqual(before)
    expect(store.getRecentGroups().map((g) => g.token)).toEqual([T2])
    expect(store.getMe(T2)).toBe('A')
    expect(store.getMe(T1)).toBeNull()

    api.rotateToken.mockRejectedValueOnce(network())
    await expect(run(options.rotateToken, { token: T2 })).rejects.toMatchObject({ kind: 'network' })
    expect(api.rotateToken).toHaveBeenCalledTimes(2)
    expect(options.rotateToken.retry).toBe(false)
  })

  it('xóa nhóm: quên nhóm trên máy, không tự thử lại', async () => {
    const { api, options, run, store } = setup()
    store.rememberGroup(T1, 'A')
    store.setMe(T1, 'm1')
    api.deleteGroup.mockResolvedValueOnce(undefined)
    await run(options.deleteGroup, { token: T1 })
    expect(store.getRecentGroups()).toEqual([])
    expect(store.getMe(T1)).toBeNull()

    api.deleteGroup.mockRejectedValueOnce(network())
    await expect(run(options.deleteGroup, { token: T1 })).rejects.toMatchObject({ kind: 'network' })
    expect(api.deleteGroup).toHaveBeenCalledTimes(2)
  })

  it('xóa nhóm thất bại thì giữ nhóm trong danh sách gần đây', async () => {
    const { api, options, run, store } = setup()
    store.rememberGroup(T1, 'A')
    api.deleteGroup.mockRejectedValueOnce(new AppError({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 }))
    await expect(run(options.deleteGroup, { token: T1 })).rejects.toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
    expect(store.getRecentGroups()).toHaveLength(1)
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
