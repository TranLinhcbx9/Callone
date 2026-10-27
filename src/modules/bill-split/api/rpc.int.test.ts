// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
/**
 * Test tích hợp tầng api với Supabase local theo hợp đồng v1.1: npm run test:int
 * Cần `npm run db:start` và .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
 *
 * Giới hạn tạo nhóm của server là 5 nhóm mỗi client và 100 nhóm toàn hệ thống trong 10 phút, nhóm đã xóa vẫn tính
 * (gửi lại cùng token không tính). Mỗi lần chạy file này tạo đúng 2 nhóm thật rồi xóa mềm khi xong, nên đừng chạy
 * liên tục: quá 2 lần trong 10 phút sẽ gặp BS_RATE_LIMITED ngay ở beforeAll. Không test việc chạm giới hạn ở đây
 * vì sẽ khóa các lần chạy sau; phần đó do pgTAP trong supabase/tests lo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Phải đứng trước mọi import kéo theo supabase client (xem nội dung file).
import '@/modules/bill-split/api/testing/websocket-shim'
import { BS_LIMITS, TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import { getBillSplitErrorMessage, getConflictVersion, getInvalidDetail } from '@/modules/bill-split/api/errors'
import * as api from '@/modules/bill-split/api/rpc'
import { newGroupToken } from '@/modules/bill-split/api/token'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { expenseToInput } from '@/modules/bill-split/domain/draft'
import type { ExpenseInput } from '@/modules/bill-split/domain/inputs'
import { suggestTransfers } from '@/modules/bill-split/domain/settle'
import { splitEqually } from '@/modules/bill-split/domain/split'
import type { Group } from '@/modules/bill-split/domain/types'
import { AppError } from '@/shared/lib/errors'
import { newId } from '@/shared/lib/id'
import { supabase } from '@/shared/lib/supabase'

/** Chạy hàm và trả về lỗi AppError mà nó ném, hoặc báo hỏng test nếu không ném. */
async function failure(run: () => Promise<unknown>): Promise<AppError> {
  const outcome = await run().then(
    () => null,
    (error: unknown) => error,
  )
  expect(outcome, 'Mong đợi lỗi nhưng hàm chạy thành công').toBeInstanceOf(AppError)
  return outcome as AppError
}

/** Gọi thẳng supabase.rpc, không qua rpc.ts, để thử các chuỗi mà rpc.ts sẽ tự cắt trước khi gửi (ví dụ NBSP). */
async function rawRpc(name: string, args: object): Promise<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }> {
  const client = supabase as unknown as {
    rpc(fn: string, args: object): PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }>
  }
  return client.rpc(name, args)
}

const created: string[] = []

describe('bs_* RPC với Supabase local (hợp đồng v1.1)', () => {
  let token: string
  let group: Group
  let firstExpense: ExpenseInput
  /** Token server trả về cho lần tạo đầu tiên. */
  let returnedToken: string
  /** Nhóm thứ hai, dùng cho test gửi lại khi tạo nhóm và test token mới đã bị giữ. */
  let other: { token: string; group: Group }

  beforeAll(async () => {
    token = newGroupToken()
    const result = await api.createGroup({
      name: `  Test tích hợp ${Date.now()}  `,
      memberNames: ['An', 'Bình', 'Chi'],
      token,
    })
    returnedToken = result.token
    group = result.group
    created.push(token)
  })

  afterAll(async () => {
    await Promise.all(created.map((t) => api.deleteGroup(t).catch(() => undefined)))
  })

  it('tạo nhóm bằng token do client chọn: server trả đúng token đó và snapshot đã đổi sang Group, thành viên theo thứ tự nhập', () => {
    expect(token).toMatch(TOKEN_PATTERN)
    expect(returnedToken).toBe(token)
    expect(group.name).toMatch(/^Test tích hợp \d+$/)
    expect(group.currency).toBe('VND')
    expect(group.members.map((m) => [m.name, m.position])).toEqual([['An', 0], ['Bình', 1], ['Chi', 2]])
    expect(group.expenses).toEqual([])
    expect(group.settlements).toEqual([])
    expect(JSON.stringify(group)).not.toContain(token)
  })

  it('không truyền token: rpc tự sinh token hợp lệ và server dùng đúng token đó', async () => {
    // Dùng nhóm thứ hai của file này cho cả bài kiểm tra gửi lại bên dưới, nên tạo ở đây với token tự sinh.
    const first = await api.createGroup({ name: 'Nhóm thứ hai', memberNames: ['Một', 'Hai'] })
    expect(first.token).toMatch(TOKEN_PATTERN)
    created.push(first.token)
    other = first
    expect(await api.getGroup(first.token)).toEqual(first.group)
  })

  it('gửi lại bs_create_group cùng token: trả đúng nhóm đã tạo, không tạo thêm, bỏ qua nội dung gửi lại và không tính vào giới hạn tốc độ', async () => {
    // Quá giới hạn 5 lần/10 phút nếu mỗi lần gửi lại bị tính là một lần tạo.
    for (let attempt = 0; attempt < 8; attempt++) {
      const replay = await api.createGroup({ name: `Tên khác ${attempt}`, memberNames: ['Ai đó', 'Người khác', 'Nữa'], token })
      expect(replay.token).toBe(token)
      expect(replay.group.id).toBe(group.id)
      expect(replay.group.name).toBe(group.name)
      expect(replay.group.members.map((m) => m.name)).toEqual(['An', 'Bình', 'Chi'])
    }
    const again = await api.createGroup({ name: 'Nhóm thứ hai', memberNames: ['Một', 'Hai'], token: other.token })
    expect(again.group.id).toBe(other.group.id)
    // Vẫn chỉ có một nhóm với token này.
    const summaries = await api.getGroupSummaries([token, other.token])
    expect(summaries.map((s) => s.token).sort()).toEqual([token, other.token].sort())
  })

  it('token tạo nhóm sai dạng thì BS_INVALID token/format (422)', async () => {
    for (const bad of ['ngan', 'a'.repeat(23), 'a'.repeat(25), `${'a'.repeat(23)}+`, `${'a'.repeat(23)}=`, 'có dấu có dấu có dấu có', ' '.repeat(24)]) {
      const error = await failure(() => api.createGroup({ name: 'Nhóm', memberNames: ['Linh'], token: bad }))
      expect(error, JSON.stringify(bad)).toMatchObject({ kind: 'app', code: 'BS_INVALID', status: 422 })
      expect(getInvalidDetail(error), JSON.stringify(bad)).toEqual({ field: 'token', reason: 'format' })
    }
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

  it('NBSP, ký tự độ rộng bằng 0 và mọi khoảng trắng Unicode được coi là trống khi cắt và khi kiểm bắt buộc', async () => {
    const blanks = ['\u00a0', '\u200b', '\u200c\u200d', '\u2060', '\ufeff', '\u2003\u2009', ' \u00a0\u200b\t\u3000 ']
    for (const blank of blanks) {
      const label = JSON.stringify(blank)
      const rename = await failure(() => api.updateGroup(token, blank))
      expect(getInvalidDetail(rename), label).toEqual({ field: 'name', reason: 'required' })
      const member = await failure(() => api.saveMember(token, { id: newId(), name: blank, bank: null }))
      expect(getInvalidDetail(member), label).toEqual({ field: 'name', reason: 'required' })
      const create = await failure(() => api.createGroup({ name: blank, memberNames: ['Linh'] }))
      expect(getInvalidDetail(create), label).toEqual({ field: 'name', reason: 'required' })
      const names = await failure(() => api.createGroup({ name: 'Nhóm', memberNames: [blank] }))
      expect(getInvalidDetail(names), label).toEqual({ field: 'member_names', reason: 'required' })
    }
  })

  it('NBSP và ký tự độ rộng bằng 0 ở hai đầu bị cắt bỏ, kể cả NBSP mà rpc.ts không có dịp cắt vì gửi thẳng', async () => {
    const renamed = await api.updateGroup(token, '\u200b\u200cTên nhóm thử\u200d\u2060')
    expect(renamed.name).toBe('Tên nhóm thử')

    // Gửi thẳng supabase.rpc: không qua trim() của JS, nên NBSP tới được server nguyên vẹn.
    const raw = await rawRpc('bs_update_group', { p_token: token, p_name: '\u00a0\u00a0Tên nhóm gốc\u00a0\u2003' })
    expect(raw.error).toBeNull()
    expect((raw.data as { group: { name: string } }).group.name).toBe('Tên nhóm gốc')
    group = await api.getGroup(token)
    expect(group.name).toBe('Tên nhóm gốc')
  })

  it('số tài khoản có NBSP và ký tự độ rộng bằng 0 giữa các chữ số: server bỏ hết, gửi thẳng không qua rpc.ts cũng vậy', async () => {
    const junk = String.fromCodePoint(0xa0, 0x200b, 0x200e, 0x2060, 0xfeff)
    const id = newId()
    const raw = await rawRpc('bs_save_member', {
      p_token: token,
      p_member_id: id,
      p_name: 'Mai',
      p_bank_bin: '970436',
      p_bank_account: `0123${junk}456 789${junk}`,
    })
    expect(raw.error).toBeNull()
    const stored = (raw.data as { members: { id: string; bank_account: string | null }[] }).members.find((m) => m.id === id)
    expect(stored?.bank_account).toBe('0123456789')

    // Qua rpc.ts thì client đã chuẩn hóa trước khi gửi, kết quả giống hệt.
    const viaClient = await api.saveMember(token, {
      id,
      name: 'Mai',
      bank: { bin: '970436', accountNumber: `0123${junk}456 789${junk}`, accountName: null },
    })
    expect(viaClient.members.find((m) => m.id === id)?.bank?.accountNumber).toBe('0123456789')

    // Trả nhóm về như cũ cho các test sau.
    expect((await api.deleteMember(token, id)).members.some((m) => m.id === id)).toBe(false)
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

  it('tóm tắt nhiều hơn 50 nhóm: rpc tự chia lô, server không báo too_many và không token nào bị bỏ sót', async () => {
    const strangers = Array.from({ length: 118 }, () => newGroupToken())
    // Hai nhóm thật đặt ở hai đầu và giữa, để chắc mỗi lô đều được gửi đi.
    const tokens = [token, ...strangers.slice(0, 59), other.token, ...strangers.slice(59)]
    expect(tokens.length).toBeGreaterThan(BS_LIMITS.tokensPerLookup * 2)
    const summaries = await api.getGroupSummaries(tokens)
    expect(summaries.map((s) => s.token).sort()).toEqual([token, other.token].sort())
    // Gọi thẳng với 51 token thì server từ chối, đúng như hợp đồng.
    const direct = await rawRpc('bs_get_groups', { p_tokens: tokens.slice(0, 51) })
    expect(direct.error?.message).toBe('BS_INVALID')
  })

  it('token sai đều ra BS_GROUP_NOT_FOUND (404) như nhau, dù sai định dạng hay không tồn tại', async () => {
    for (const bad of ['A'.repeat(24), 'ngan', '', 'có dấu có dấu có dấu có dấu', 'x'.repeat(200)]) {
      const error = await failure(() => api.getGroup(bad))
      expect(error, JSON.stringify(bad)).toMatchObject({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 })
    }
    const write = await failure(() => api.saveMember('A'.repeat(24), { id: newId(), name: 'X', bank: null }))
    expect(write).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
  })

  describe('đổi link với token do client chọn', () => {
    it('token mới sai dạng hoặc trùng token cũ thì BS_INVALID new_token/format và nhóm không bị đụng tới', async () => {
      for (const bad of [token, 'ngan', 'a'.repeat(25), `${'a'.repeat(23)}/`]) {
        const error = await failure(() => api.rotateToken(token, bad))
        expect(error, JSON.stringify(bad)).toMatchObject({ kind: 'app', code: 'BS_INVALID', status: 422 })
        expect(getInvalidDetail(error), JSON.stringify(bad)).toEqual({ field: 'new_token', reason: 'format' })
      }
      expect((await api.getGroup(token)).id).toBe(group.id)
    })

    it('token mới đã có nhóm khác giữ thì BS_INVALID new_token/id_taken, cả hai nhóm vẫn dùng được bằng token cũ', async () => {
      const error = await failure(() => api.rotateToken(token, other.token))
      expect(getInvalidDetail(error)).toEqual({ field: 'new_token', reason: 'id_taken' })
      expect((await api.getGroup(token)).id).toBe(group.id)
      expect((await api.getGroup(other.token)).id).toBe(other.group.id)
    })

    it('đổi sang token do client chọn: server trả đúng token đó, token cũ chết ngay, token mới dùng được', async () => {
      const chosen = newGroupToken()
      created.push(chosen)
      expect(await api.rotateToken(token, chosen)).toBe(chosen)

      expect(await failure(() => api.getGroup(token))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
      const moved = await api.getGroup(chosen)
      expect(moved.id).toBe(group.id)
      expect(moved.members.map((m) => m.name)).toEqual(['An', 'Bình', 'Chi'])
      expect((await api.getGroupSummaries([token, chosen])).map((s) => s.token)).toEqual([chosen])
      token = chosen
      group = moved
    })

    it('gửi lại đúng cặp (token cũ đã chết, token mới đang sống): server trả lại token mới và không ghi gì', async () => {
      const oldToken = token
      const chosen = newGroupToken()
      created.push(chosen)
      expect(await api.rotateToken(oldToken, chosen)).toBe(chosen)
      const after = await api.getGroup(chosen)

      // Mô phỏng mất phản hồi rồi gửi lại: token cũ đã chết, token mới đang sống nên server chỉ xác nhận.
      for (let attempt = 0; attempt < 3; attempt++) expect(await api.rotateToken(oldToken, chosen)).toBe(chosen)

      expect(await api.getGroup(chosen)).toEqual(after)
      expect(await failure(() => api.getGroup(oldToken))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
      token = chosen
      group = after
    })

    it('token cũ chết và không nhóm nào giữ token mới thì BS_GROUP_NOT_FOUND', async () => {
      const dead = newGroupToken()
      const neverUsed = newGroupToken()
      const error = await failure(() => api.rotateToken(dead, neverUsed))
      expect(error).toMatchObject({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 })
    })

    it('không truyền token mới: server tự sinh, vẫn đổi được và trả token hợp lệ khác token cũ', async () => {
      const generated = await api.rotateToken(token)
      created.push(generated)
      expect(generated).toMatch(TOKEN_PATTERN)
      expect(generated).not.toBe(token)
      expect(await failure(() => api.getGroup(token))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
      expect((await api.getGroup(generated)).id).toBe(group.id)
      token = generated
    })
  })

  describe('xóa nhóm và token đã bị giữ', () => {
    it('xóa nhóm: sau đó mọi hàm với token này đều BS_GROUP_NOT_FOUND', async () => {
      await api.deleteGroup(other.token)
      expect(await failure(() => api.getGroup(other.token))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
      expect(await failure(() => api.updateGroup(other.token, 'X'))).toMatchObject({ code: 'BS_GROUP_NOT_FOUND' })
      expect(await api.getGroupSummaries([other.token])).toEqual([])
    })

    it('tạo nhóm với token của nhóm đã xóa mềm thì BS_INVALID token/id_taken, không gửi lại được như nhóm còn sống', async () => {
      const error = await failure(() => api.createGroup({ name: 'Dùng lại', memberNames: ['Một'], token: other.token }))
      expect(getInvalidDetail(error)).toEqual({ field: 'token', reason: 'id_taken' })
    })

    it('đổi link sang token của nhóm đã xóa mềm cũng là BS_INVALID new_token/id_taken, nhóm đang sống không bị đụng tới', async () => {
      const error = await failure(() => api.rotateToken(token, other.token))
      expect(getInvalidDetail(error)).toEqual({ field: 'new_token', reason: 'id_taken' })
      expect((await api.getGroup(token)).id).toBe(group.id)
    })

    it('gửi lại đổi link mà nhóm giữ token mới đã bị xóa thì không còn gì để xác nhận: BS_GROUP_NOT_FOUND', async () => {
      const dead = newGroupToken()
      const error = await failure(() => api.rotateToken(dead, other.token))
      expect(error).toMatchObject({ code: 'BS_GROUP_NOT_FOUND', status: 404 })
    })
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
