// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { billSplitKeys } from '@/modules/bill-split/api/keys'
import { makeExpense, makeGroup, makeMembers } from '@/modules/bill-split/domain/testing/fixtures'
import type { Group } from '@/modules/bill-split/domain/types'
import {
  cachedGroup,
  commitGroup,
  copyGroupCache,
  invalidateSummaries,
  refreshGroupIfStale,
  removeGroupQueries,
} from '@/modules/bill-split/hooks/cache'
import { AppError } from '@/shared/lib/errors'

const T1 = 'dalat-demo-token-2026-ok'
const T2 = 'lau-thu-sau-demo-token-1'
const members = makeMembers(['A', 'B'])
const at = (updatedAt: string, name = 'Nhóm', id = 'group-1'): Group => makeGroup(members, [], [], { updatedAt, name, id })
const stateOf = (client: QueryClient, token: string) => client.getQueryState(billSplitKeys.group(token))

describe('commitGroup', () => {
  it('ghi snapshot vào cache và đánh dấu danh sách tóm tắt cần làm mới', async () => {
    const client = new QueryClient()
    const summaries = billSplitKeys.summariesFor([T1])
    client.setQueryData(summaries, [])
    await commitGroup(client, T1, at('2026-11-01T00:00:00Z'))
    expect(cachedGroup(client, T1)).toEqual(at('2026-11-01T00:00:00Z'))
    expect(client.getQueryState(summaries)?.isInvalidated).toBe(true)
    expect(stateOf(client, T1)?.isInvalidated).toBe(false)
  })

  it('cache đang có bản cũ hơn thì thay bằng bản mới', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z', 'Cũ'))
    await commitGroup(client, T1, at('2026-11-01T00:00:01Z', 'Mới'))
    expect(cachedGroup(client, T1)?.name).toBe('Mới')
  })

  it('không lùi về snapshot cũ hơn: giữ bản mới hơn trong cache và đánh dấu cũ để tải lại', async () => {
    const client = new QueryClient()
    const newer = at('2026-11-01T00:00:10Z', 'Bản mới (đã thấy thay đổi của máy khác)')
    client.setQueryData(billSplitKeys.group(T1), newer)
    await commitGroup(client, T1, at('2026-11-01T00:00:05Z', 'Phản hồi của lần ghi, đến muộn'))
    expect(cachedGroup(client, T1)).toBe(newer)
    expect(stateOf(client, T1)?.isInvalidated).toBe(true)
  })

  it('cùng mốc thì ghi (cùng thời điểm là cùng nội dung, như khi gửi lại không ghi gì)', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z', 'Cũ'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00Z', 'Mới'))
    expect(cachedGroup(client, T1)?.name).toBe('Mới')
    expect(stateOf(client, T1)?.isInvalidated).toBe(false)
  })

  it('mốc bằng nhau dù viết khác nhau (múi giờ, độ dài phần lẻ giây) vẫn là bằng nhau nên ghi', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T07:00:00.5+07:00', 'Cũ'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00.500000Z', 'Mới'))
    expect(cachedGroup(client, T1)?.name).toBe('Mới')
  })

  it('so chính xác tới micro giây: cũ hơn 1 micro giây cũng bị bỏ qua, mới hơn 1 micro giây thì được ghi', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00.123457+00:00', 'Giữ'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00.123456+00:00', 'Cũ hơn 1µs'))
    expect(cachedGroup(client, T1)?.name).toBe('Giữ')

    await commitGroup(client, T1, at('2026-11-01T00:00:00.123458+00:00', 'Mới hơn 1µs'))
    expect(cachedGroup(client, T1)?.name).toBe('Mới hơn 1µs')
  })

  it('khác nhóm (id khác) hoặc mốc không đọc được thì không suy luận, cứ ghi', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:10Z', 'Giữ', 'group-1'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00Z', 'Nhóm khác', 'group-2'))
    expect(cachedGroup(client, T1)?.name).toBe('Nhóm khác')

    client.setQueryData(billSplitKeys.group(T1), at('không phải mốc', 'Hỏng'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00Z', 'Mới'))
    expect(cachedGroup(client, T1)?.name).toBe('Mới')

    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:10Z', 'Giữ'))
    await commitGroup(client, T1, at('', 'Mốc rỗng'))
    expect(cachedGroup(client, T1)?.name).toBe('Mốc rỗng')
  })

  it('nhóm này không ảnh hưởng nhóm khác trong cache', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T2), at('2026-11-01T00:00:10Z', 'Nhóm 2'))
    await commitGroup(client, T1, at('2026-11-01T00:00:00Z', 'Nhóm 1'))
    expect(cachedGroup(client, T2)?.name).toBe('Nhóm 2')
    expect(stateOf(client, T2)?.isInvalidated).toBe(false)
  })

  it('đang xem nhóm: bản bị bỏ qua kéo theo một lần tải lại, và giao diện thấy bản đúng nhất từ server', async () => {
    const client = new QueryClient()
    const fromServer = at('2026-11-01T00:00:20Z', 'Bản đúng nhất trên server')
    const queryFn = vi.fn<() => Promise<Group>>(async () => fromServer)
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:10Z', 'Bản trong cache'))
    const observer = new QueryObserver(client, { queryKey: billSplitKeys.group(T1), queryFn, staleTime: Infinity })
    const unsubscribe = observer.subscribe(() => undefined)
    expect(queryFn).not.toHaveBeenCalled()

    await commitGroup(client, T1, at('2026-11-01T00:00:05Z', 'Phản hồi đến muộn'))
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(cachedGroup(client, T1)?.name).toBe('Bản đúng nhất trên server'))
    unsubscribe()
  })

  it('lần tải bắt đầu trước khi ghi bị hủy, kết quả muộn của nó không đè lên', async () => {
    const client = new QueryClient()
    let finish: (group: Group) => void = () => undefined
    const slow = new Promise<Group>((resolve) => (finish = resolve))
    const fetching = client.fetchQuery({ queryKey: billSplitKeys.group(T1), queryFn: () => slow }).catch(() => null)
    await commitGroup(client, T1, at('2026-11-01T00:00:10Z', 'Sau khi ghi'))
    finish(at('2026-11-01T00:00:00Z', 'Dữ liệu cũ của lần tải'))
    await fetching
    expect(cachedGroup(client, T1)?.name).toBe('Sau khi ghi')
  })

  it('có khoản chi trong snapshot thì vẫn giữ nguyên tham chiếu bản đã ghi (không sao chép)', async () => {
    const client = new QueryClient()
    const group = makeGroup(members, [makeExpense('e1', 'A', 100, { A: 50, B: 50 })], [], { updatedAt: '2026-11-01T00:00:00Z' })
    await commitGroup(client, T1, group)
    expect(cachedGroup(client, T1)).toBe(group)
  })
})

describe('removeGroupQueries', () => {
  it('xóa hẳn query của đúng nhóm đó, giữ nhóm khác', async () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z'))
    client.setQueryData(billSplitKeys.group(T2), at('2026-11-01T00:00:00Z'))
    await removeGroupQueries(client, T1)
    expect(stateOf(client, T1)).toBeUndefined()
    expect(stateOf(client, T2)).toBeDefined()
  })

  it('không có gì để xóa cũng không sao', async () => {
    await expect(removeGroupQueries(new QueryClient(), T1)).resolves.toBeUndefined()
  })
})

describe('copyGroupCache', () => {
  it('sao dữ liệu sang key mới, key cũ để nguyên', () => {
    const client = new QueryClient()
    const group = at('2026-11-01T00:00:00Z')
    client.setQueryData(billSplitKeys.group(T1), group)
    copyGroupCache(client, T1, T2)
    expect(cachedGroup(client, T2)).toBe(group)
    expect(cachedGroup(client, T1)).toBe(group)
  })

  it('key đích đã có dữ liệu thì không đè (bản đó có thể mới hơn)', () => {
    const client = new QueryClient()
    const existing = at('2026-11-01T00:00:10Z', 'Có sẵn')
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z', 'Từ key cũ'))
    client.setQueryData(billSplitKeys.group(T2), existing)
    copyGroupCache(client, T1, T2)
    expect(cachedGroup(client, T2)).toBe(existing)
  })

  it('key nguồn không có dữ liệu thì không tạo gì', () => {
    const client = new QueryClient()
    copyGroupCache(client, T1, T2)
    expect(stateOf(client, T2)).toBeUndefined()
  })
})

describe('refreshGroupIfStale và invalidateSummaries', () => {
  const app = (code: string) => new AppError({ kind: 'app', code, status: 409 })

  it('chỉ các mã báo dữ liệu đã đổi mới đánh dấu cache cũ', () => {
    for (const [code, stale] of [
      ['BS_CONFLICT', true],
      ['BS_NOT_FOUND', true],
      ['BS_MEMBER_IN_USE', true],
      ['BS_GROUP_NOT_FOUND', true],
      ['BS_INVALID', false],
      ['BS_LIMIT', false],
      ['BS_RATE_LIMITED', false],
    ] as const) {
      const client = new QueryClient()
      client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z'))
      refreshGroupIfStale(client, T1, app(code))
      expect(stateOf(client, T1)?.isInvalidated, code).toBe(stale)
    }
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z'))
    refreshGroupIfStale(client, T1, new AppError({ kind: 'network', code: 'NETWORK' }))
    expect(stateOf(client, T1)?.isInvalidated).toBe(false)
  })

  it('invalidateSummaries đánh dấu mọi danh sách tóm tắt nhưng không đụng tới nhóm', () => {
    const client = new QueryClient()
    client.setQueryData(billSplitKeys.summariesFor([T1]), [])
    client.setQueryData(billSplitKeys.summariesFor([T1, T2]), [])
    client.setQueryData(billSplitKeys.group(T1), at('2026-11-01T00:00:00Z'))
    invalidateSummaries(client)
    expect(client.getQueryState(billSplitKeys.summariesFor([T1]))?.isInvalidated).toBe(true)
    expect(client.getQueryState(billSplitKeys.summariesFor([T1, T2]))?.isInvalidated).toBe(true)
    expect(stateOf(client, T1)?.isInvalidated).toBe(false)
  })
})
