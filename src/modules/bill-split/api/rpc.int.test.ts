// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
/**
 * Test tích hợp tầng api với Supabase local: npm run test:int
 * Cần `npm run db:start` và .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
 * Mỗi lần chạy tạo vài nhóm thật, tự xóa mềm khi xong. Toàn hệ thống giới hạn 30 nhóm mới trong 10 phút
 * (nhóm đã xóa vẫn tính), nên đừng chạy liên tục hàng chục lần.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Phải đứng trước mọi import kéo theo supabase client (xem nội dung file).
import '@/modules/bill-split/api/testing/websocket-shim'
import { TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import { getBillSplitErrorMessage, getConflictVersion, getInvalidDetail } from '@/modules/bill-split/api/errors'
import * as api from '@/modules/bill-split/api/rpc'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { expenseToInput } from '@/modules/bill-split/domain/draft'
import type { ExpenseInput } from '@/modules/bill-split/domain/inputs'
import { suggestTransfers } from '@/modules/bill-split/domain/settle'
import { splitEqually } from '@/modules/bill-split/domain/split'
import type { Group } from '@/modules/bill-split/domain/types'
import { AppError } from '@/shared/lib/errors'
import { newId } from '@/shared/lib/id'

/** Chạy hàm và trả về lỗi AppError mà nó ném, hoặc báo hỏng test nếu không ném. */
async function failure(run: () => Promise<unknown>): Promise<AppError> {
  const outcome = await run().then(
    () => null,
    (error: unknown) => error,
  )
  expect(outcome, 'Mong đợi lỗi nhưng hàm chạy thành công').toBeInstanceOf(AppError)
  return outcome as AppError
}

const created: string[] = []

describe('bs_* RPC với Supabase local', () => {
  let token: string
  let group: Group
  let firstExpense: ExpenseInput

  beforeAll(async () => {
    const result = await api.createGroup({ name: `  Test tích hợp ${Date.now()}  `, memberNames: ['An', 'Bình', 'Chi'] })
    token = result.token
    group = result.group
    created.push(token)
  })

  afterAll(async () => {
    await Promise.all(created.map((t) => api.deleteGroup(t).catch(() => undefined)))
  })

  it('tạo nhóm: trả token 24 ký tự và snapshot đã đổi sang Group, thành viên theo thứ tự nhập', () => {
    expect(token).toMatch(TOKEN_PATTERN)
    expect(group.name).toMatch(/^Test tích hợp \d+$/)
    expect(group.currency).toBe('VND')
    expect(group.members.map((m) => [m.name, m.position])).toEqual([['An', 0], ['Bình', 1], ['Chi', 2]])
    expect(group.expenses).toEqual([])
    expect(group.settlements).toEqual([])
    expect(JSON.stringify(group)).not.toContain(token)
  })

  it('đọc lại nhóm bằng token cho đúng snapshot lúc tạo', async () => {
    expect(await api.getGroup(token)).toEqual(group)
  })

  it('thêm thành viên có ngân hàng, rồi sửa tên và xóa ngân hàng', async () => {
    const id = newId()
    const bank = { bin: '970436', accountNumber: '0123 456 789', accountName: 'Nguyễn Văn Dũng' }
    let next = await api.saveMember(token, { id, name: ' Dũng ', bank })
    expect(next.members).toHaveLength(4)
    expect(next.members[3]).toEqual({
      id,
      name: 'Dũng',
      position: 3,
      bank: { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN DUNG' },
    })

    next = await api.saveMember(token, { id, name: 'Dũng Béo', bank: null })
    expect(next.members[3]).toMatchObject({ name: 'Dũng Béo', position: 3, bank: null })
    group = next
  })

  it('tên trùng không phân biệt hoa thường thì BS_INVALID name/duplicate (422)', async () => {
    const error = await failure(() => api.saveMember(token, { id: newId(), name: 'AN', bank: null }))
    expect(error).toMatchObject({ kind: 'app', code: 'BS_INVALID', status: 422 })
    expect(getInvalidDetail(error)).toEqual({ field: 'name', reason: 'duplicate' })
    expect(getBillSplitErrorMessage(error)).toBe('Đã có người tên này trong nhóm.')
  })

  it('lưu khoản chi chia đều, gửi lại cùng id không tạo bản ghi thứ hai', async () => {
    const [an, binh, chi] = group.members
    const ids = [an, binh, chi].map((m) => m?.id as string)
    firstExpense = {
      id: newId(),
      title: 'Lẩu gà lá é',
      amount: 1_000_001,
      paidBy: ids[1] as string,
      spentOn: '2026-10-26',
      splitMode: 'equal',
      shares: splitEqually(1_000_001, ids, ids[1] as string),
      note: null,
      expectedVersion: null,
    }
    const saved = await api.saveExpense(token, firstExpense)
    expect(saved.expenses).toHaveLength(1)
    expect(saved.expenses[0]).toMatchObject({ id: firstExpense.id, amount: 1_000_001, version: 1, note: null })
    expect(saved.expenses[0]?.shares).toEqual(firstExpense.shares)

    const resent = await api.saveExpense(token, firstExpense)
    expect(resent.expenses).toHaveLength(1)
    expect(resent.expenses).toEqual(saved.expenses)
    group = resent
  })

  it('sửa khoản chi bằng version đúng thì tăng version, bản cũ thì BS_CONFLICT (409) kèm version hiện tại', async () => {
    const edited = await api.saveExpense(token, { ...firstExpense, title: 'Lẩu gà (đã sửa)', expectedVersion: 1 })
    expect(edited.expenses[0]).toMatchObject({ title: 'Lẩu gà (đã sửa)', version: 2 })

    const error = await failure(() => api.saveExpense(token, { ...firstExpense, title: 'Sửa trên bản cũ', expectedVersion: 1 }))
    expect(error).toMatchObject({ kind: 'app', code: 'BS_CONFLICT', status: 409 })
    expect(getConflictVersion(error)).toBe(2)
    expect((await api.getGroup(token)).expenses[0]?.title).toBe('Lẩu gà (đã sửa)')
    group = edited
  })

  it('sửa khoản chi không còn thì BS_NOT_FOUND (404)', async () => {
    const error = await failure(() => api.saveExpense(token, { ...firstExpense, id: newId(), expectedVersion: 1 }))
    expect(error).toMatchObject({ kind: 'app', code: 'BS_NOT_FOUND', status: 404 })
  })

  it('phần chia sai tổng hoặc lệch quá 1 đồng khi chia đều thì BS_INVALID trên shares', async () => {
    const [an, binh] = group.members
    const base = { ...firstExpense, id: newId(), amount: 100, expectedVersion: null }
    const wrongSum = await failure(() =>
      api.saveExpense(token, { ...base, shares: [{ memberId: an?.id as string, amount: 99 }] }),
    )
    expect(getInvalidDetail(wrongSum)).toEqual({ field: 'shares', reason: 'sum_mismatch' })

    const unequal = await failure(() =>
      api.saveExpense(token, {
        ...base,
        shares: [
          { memberId: an?.id as string, amount: 70 },
          { memberId: binh?.id as string, amount: 30 },
        ],
      }),
    )
    expect(getInvalidDetail(unequal)).toEqual({ field: 'shares', reason: 'unequal_split' })
  })

  it('khoản chi chia riêng, rồi xóa và hoàn tác bằng cách lưu lại đúng id, không version', async () => {
    const [an, binh] = group.members
    const exact: ExpenseInput = {
      id: newId(),
      title: 'Vé xe',
      amount: 500_000,
      paidBy: an?.id as string,
      spentOn: '2026-10-27',
      splitMode: 'exact',
      shares: [
        { memberId: an?.id as string, amount: 200_000 },
        { memberId: binh?.id as string, amount: 300_000 },
      ],
      note: 'Xe giường nằm',
      expectedVersion: null,
    }
    const saved = await api.saveExpense(token, exact)
    const stored = saved.expenses.find((e) => e.id === exact.id)
    expect(stored).toMatchObject({ splitMode: 'exact', note: 'Xe giường nằm', version: 1 })
    expect(saved.expenses.map((e) => e.spentOn)).toEqual(['2026-10-27', '2026-10-26'])

    const deleted = await api.deleteExpense(token, exact.id)
    expect(deleted.expenses.map((e) => e.id)).toEqual([firstExpense.id])
    expect((await api.deleteExpense(token, exact.id)).expenses).toHaveLength(1)

    const restored = await api.saveExpense(token, expenseToInput(stored as NonNullable<typeof stored>, null))
    expect(restored.expenses.find((e) => e.id === exact.id)).toMatchObject({ version: 1, title: 'Vé xe', note: 'Xe giường nằm' })
    group = restored
  })

  it('trả nợ: số dư từ dữ liệu thật cộng về 0, xóa thanh toán thì số dư quay lại', async () => {
    const [an] = group.members
    const before = computeBalances(group)
    expect(before.reduce((sum, b) => sum + b.net, 0)).toBe(0)
    const plan = suggestTransfers(before, group.members)
    expect(plan.length).toBeGreaterThan(0)

    const first = plan[0]
    if (!first) throw new Error('Không có gợi ý chuyển khoản')
    const settlementId = newId()
    const paid = await api.saveSettlement(token, { id: settlementId, fromMemberId: first.fromMemberId, toMemberId: first.toMemberId, amount: first.amount, settledOn: '2026-10-28', note: 'Trả tiền lẩu' })
    expect(paid.settlements).toHaveLength(1)
    expect(paid.settlements[0]).toMatchObject({ id: settlementId, amount: first.amount, note: 'Trả tiền lẩu' })
    const after = computeBalances(paid)
    expect(after.reduce((sum, b) => sum + b.net, 0)).toBe(0)
    expect(after.find((b) => b.memberId === first.fromMemberId)?.net).toBe(
      (before.find((b) => b.memberId === first.fromMemberId)?.net ?? 0) + first.amount,
    )

    const same = await failure(() =>
      api.saveSettlement(token, { id: newId(), fromMemberId: an?.id as string, toMemberId: an?.id as string, amount: 1, settledOn: '2026-10-28', note: null }),
    )
    expect(getInvalidDetail(same)).toEqual({ field: 'to_member', reason: 'same_member' })

    const removed = await api.deleteSettlement(token, settlementId)
    expect(removed.settlements).toEqual([])
    expect(computeBalances(removed)).toEqual(before)
    group = removed
  })

  it('xóa thành viên đã có giao dịch thì BS_MEMBER_IN_USE (409), chưa có thì xóa được', async () => {
    const [an] = group.members
    const error = await failure(() => api.deleteMember(token, an?.id as string))
    expect(error).toMatchObject({ kind: 'app', code: 'BS_MEMBER_IN_USE', status: 409 })

    const unused = group.members.find((m) => m.name === 'Dũng Béo')
    const removed = await api.deleteMember(token, unused?.id as string)
    expect(removed.members.map((m) => m.name)).toEqual(['An', 'Bình', 'Chi'])
    expect((await api.deleteMember(token, unused?.id as string)).members).toHaveLength(3)
  })

  it('đổi tên nhóm', async () => {
    const renamed = await api.updateGroup(token, '  Tên mới  ')
    expect(renamed.name).toBe('Tên mới')
    expect((await api.getGroup(token)).name).toBe('Tên mới')
  })

  it('tóm tắt nhóm cho trang Home: bỏ qua token lạ, đếm đúng', async () => {
    const unknown = 'A'.repeat(24)
    const summaries = await api.getGroupSummaries([unknown, token, 'sai-dinh-dang'])
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      token,
      name: 'Tên mới',
      memberCount: 3,
      expenseCount: 2,
    })
    expect(summaries[0]?.totalSpent).toBe(1_000_001 + 500_000)
    expect(await api.getGroupSummaries([unknown])).toEqual([])
  })

  it('token sai đều ra BS_GROUP_NOT_FOUND (404) như nhau, dù sai định dạng hay không tồn tại', async () => {
    for (const bad of ['A'.repeat(24), 'ngan', '', 'có dấu có dấu có dấu có dấu', 'x'.repeat(200)]) {
      const error = await failure(() => api.getGroup(bad))
      expect(error, JSON.stringify(bad)).toMatchObject({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 })
    }
    const write = await failure(() => api.saveMember('A'.repeat(24), { id: newId(), name: 'X', bank: null }))
    expect(write).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
  })

  it('đổi link: token mới dùng được, token cũ hết hiệu lực ngay', async () => {
    const fresh = await api.createGroup({ name: 'Đổi link', memberNames: ['Một', 'Hai'] })
    created.push(fresh.token)
    const newToken = await api.rotateToken(fresh.token)
    created.push(newToken)
    expect(newToken).toMatch(TOKEN_PATTERN)
    expect(newToken).not.toBe(fresh.token)

    expect((await api.getGroup(newToken)).id).toBe(fresh.group.id)
    const error = await failure(() => api.getGroup(fresh.token))
    expect(error).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
  })

  it('xóa nhóm: sau đó mọi hàm với token này đều BS_GROUP_NOT_FOUND', async () => {
    const doomed = await api.createGroup({ name: 'Sắp xóa', memberNames: ['Một'] })
    created.push(doomed.token)
    await api.deleteGroup(doomed.token)
    expect(await failure(() => api.getGroup(doomed.token))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
    expect(await failure(() => api.updateGroup(doomed.token, 'X'))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
    expect(await api.getGroupSummaries([doomed.token])).toEqual([])
  })

  it('tạo nhóm sai dữ liệu: BS_INVALID trên member_names', async () => {
    const empty = await failure(() => api.createGroup({ name: 'Nhóm', memberNames: [] }))
    expect(getInvalidDetail(empty)).toEqual({ field: 'member_names', reason: 'empty' })
    const duplicate = await failure(() => api.createGroup({ name: 'Nhóm', memberNames: ['Linh', 'linh'] }))
    expect(getInvalidDetail(duplicate)).toEqual({ field: 'member_names', reason: 'duplicate' })
    const noName = await failure(() => api.createGroup({ name: '   ', memberNames: ['Linh'] }))
    expect(getInvalidDetail(noName)).toMatchObject({ field: 'name', reason: 'required' })
  })
})
