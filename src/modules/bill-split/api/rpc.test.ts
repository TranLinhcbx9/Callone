// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import type { ExpenseInput, MemberInput, SettlementInput } from '@/modules/bill-split/domain/inputs'
import { AppError } from '@/shared/lib/errors'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn<(fn: string, args: object) => Promise<unknown>>() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc } }))

// Import sau khi mock để rpc.ts không tạo client Supabase thật.
import * as api from '@/modules/bill-split/api/rpc'

const TOKEN = 'dalat-demo-token-2026-ok'
const ID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const SNAPSHOT = {
  v: 1,
  group: { id: 'g1', name: 'Đà Lạt', currency: 'VND', created_at: '2026-10-20T03:00:00Z', updated_at: '2026-10-20T03:00:00Z' },
  members: [{ id: ID, name: 'Linh', position: 0, bank_bin: null, bank_account: null, bank_account_name: null }],
  expenses: [],
  settlements: [],
}

/** Token giả hợp lệ (24 ký tự) theo chỉ số. */
const tokenOf = (index: number) => `tok-${String(index).padStart(3, '0')}-`.padEnd(24, 'x')

/** Mốc thời gian tăng dần theo chỉ số giảm: chỉ số 0 muộn nhất. */
const minuteOf = (index: number) => new Date(Date.UTC(2026, 9, 27, 12, 0, 0) - index * 60_000).toISOString()

function summaryRow(token: string, updatedAt: string) {
  return {
    token,
    id: `id-${token}`,
    name: `Nhóm ${token}`,
    member_count: 3,
    expense_count: 2,
    total_spent: 1_000_000,
    updated_at: updatedAt,
  }
}

function respond(data: unknown) {
  rpc.mockResolvedValueOnce({ data, error: null, status: 200 })
}

function respondError(error: unknown, status: number) {
  rpc.mockResolvedValueOnce({ data: null, error, status })
}

/** Tên hàm và tham số của lần gọi supabase.rpc gần nhất. */
function lastCall(): { name: string; args: Record<string, unknown>; argCount: number } {
  const call = rpc.mock.calls[rpc.mock.calls.length - 1] as unknown[]
  return { name: call[0] as string, args: call[1] as Record<string, unknown>, argCount: call.length }
}

const expense = (overrides: Partial<ExpenseInput> = {}): ExpenseInput => ({
  id: ID,
  title: '  Lẩu gà  ',
  amount: 1_200_000,
  paidBy: OTHER,
  spentOn: '2026-10-26',
  splitMode: 'equal',
  shares: [
    { memberId: ID, amount: 600_000 },
    { memberId: OTHER, amount: 600_000 },
  ],
  note: null,
  expectedVersion: null,
  ...overrides,
})

beforeEach(() => {
  rpc.mockReset()
})

describe('tham số gửi lên', () => {
  it('bs_create_group: cắt khoảng trắng tên nhóm và tên thành viên, gửi token do client chọn', async () => {
    respond({ token: TOKEN, snapshot: SNAPSHOT })
    const result = await api.createGroup({ name: '  Đà Lạt  ', memberNames: [' Linh ', 'Hưng'], token: TOKEN })
    expect(lastCall()).toEqual({
      name: 'bs_create_group',
      args: { p_name: 'Đà Lạt', p_member_names: ['Linh', 'Hưng'], p_token: TOKEN },
      argCount: 2,
    })
    expect(result.token).toBe(TOKEN)
    expect(result.group.name).toBe('Đà Lạt')
  })

  it('bs_create_group: không có token thì rpc tự sinh một token mới hợp lệ cho mỗi lần gọi, và dùng token server trả về', async () => {
    const tokens: string[] = []
    for (let i = 0; i < 3; i++) {
      respond({ token: TOKEN, snapshot: SNAPSHOT })
      const result = await api.createGroup({ name: 'Đà Lạt', memberNames: ['Linh'] })
      const { args } = lastCall()
      expect(Object.keys(args)).toEqual(['p_name', 'p_member_names', 'p_token'])
      expect(args.p_token).toMatch(TOKEN_PATTERN)
      tokens.push(args.p_token as string)
      expect(result.token).toBe(TOKEN)
    }
    expect(new Set(tokens).size).toBe(3)
  })

  it('bs_create_group: token rỗng coi như không có', async () => {
    respond({ token: TOKEN, snapshot: SNAPSHOT })
    await api.createGroup({ name: 'Đà Lạt', memberNames: ['Linh'], token: '' })
    expect(lastCall().args.p_token).toMatch(TOKEN_PATTERN)
  })

  it('bs_create_group: gửi lại cùng token (replay) nhận lại đúng nhóm đã tạo, kể cả khi nội dung gửi lại khác', async () => {
    respond({ token: TOKEN, snapshot: SNAPSHOT })
    const first = await api.createGroup({ name: 'Đà Lạt', memberNames: ['Linh'], token: TOKEN })
    // Server trả nhóm cũ cho p_token đã có, bỏ qua tên và thành viên mới.
    respond({ token: TOKEN, snapshot: SNAPSHOT })
    const replay = await api.createGroup({ name: 'Tên khác', memberNames: ['Hưng', 'Mai'], token: TOKEN })
    expect(replay).toEqual(first)
    expect(lastCall().args.p_token).toBe(TOKEN)
  })

  it('bs_create_group: BS_INVALID token/id_taken và BS_RATE_LIMITED báo thẳng lên', async () => {
    respondError({ code: 'PT422', message: 'BS_INVALID', details: '{"field":"token","reason":"id_taken"}', hint: null }, 422)
    expect(await api.createGroup({ name: 'A', memberNames: ['B'], token: TOKEN }).catch((e: unknown) => e)).toMatchObject({
      code: 'BS_INVALID',
      status: 422,
      detail: { field: 'token', reason: 'id_taken' },
    })
    respondError({ code: 'PT429', message: 'BS_RATE_LIMITED', details: '', hint: null }, 429)
    expect(await api.createGroup({ name: 'A', memberNames: ['B'], token: TOKEN }).catch((e: unknown) => e)).toMatchObject({
      code: 'BS_RATE_LIMITED',
      status: 429,
    })
  })

  it('bs_get_group, bs_update_group, bs_delete_member, bs_delete_expense, bs_delete_settlement', async () => {
    for (let i = 0; i < 5; i++) respond(SNAPSHOT)
    await api.getGroup(TOKEN)
    expect(lastCall()).toEqual({ name: 'bs_get_group', args: { p_token: TOKEN }, argCount: 2 })
    await api.updateGroup(TOKEN, ' Tên mới ')
    expect(lastCall()).toEqual({ name: 'bs_update_group', args: { p_token: TOKEN, p_name: 'Tên mới' }, argCount: 2 })
    await api.deleteMember(TOKEN, ID)
    expect(lastCall()).toEqual({ name: 'bs_delete_member', args: { p_token: TOKEN, p_member_id: ID }, argCount: 2 })
    await api.deleteExpense(TOKEN, ID)
    expect(lastCall()).toEqual({ name: 'bs_delete_expense', args: { p_token: TOKEN, p_expense_id: ID }, argCount: 2 })
    await api.deleteSettlement(TOKEN, ID)
    expect(lastCall()).toEqual({
      name: 'bs_delete_settlement',
      args: { p_token: TOKEN, p_settlement_id: ID },
      argCount: 2,
    })
  })

  it('bs_get_groups: bỏ token trùng, không gọi khi rỗng, một lô khi không quá 50 token', async () => {
    expect(await api.getGroupSummaries([])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()

    respond([])
    const tokens = Array.from({ length: 50 }, (_, i) => tokenOf(i))
    expect(await api.getGroupSummaries([...tokens, tokens[0] as string, tokens[49] as string])).toEqual([])
    expect(rpc).toHaveBeenCalledTimes(1)
    const { name, args } = lastCall()
    expect(name).toBe('bs_get_groups')
    expect(args.p_tokens).toEqual(tokens)
  })

  it('bs_get_groups: chia lô 50 token để truyền bao nhiêu token cũng được, không token nào bị cắt', async () => {
    const tokens = Array.from({ length: 120 }, (_, i) => tokenOf(i))
    // Giả server: trả về tóm tắt của đúng các token trong lô, cập nhật càng muộn khi chỉ số càng nhỏ.
    rpc.mockImplementation(async (_name: string, args: object) => {
      const batch = (args as { p_tokens: string[] }).p_tokens
      const rows = batch
        .map((token) => summaryRow(token, minuteOf(tokens.indexOf(token))))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      return { data: rows, error: null, status: 200 }
    })

    const result = await api.getGroupSummaries(tokens)

    expect(rpc.mock.calls.map(([, args]) => (args as { p_tokens: string[] }).p_tokens.length)).toEqual([50, 50, 20])
    expect(rpc.mock.calls.flatMap(([, args]) => (args as { p_tokens: string[] }).p_tokens)).toEqual(tokens)
    expect(result).toHaveLength(120)
    expect(new Set(result.map((item) => item.token)).size).toBe(120)
    // Gộp lại rồi sắp mới cập nhật trước trên cả 3 lô: chỉ số nhỏ nhất (cập nhật muộn nhất) đứng đầu.
    expect(result.map((item) => item.token)).toEqual(tokens)
  })

  it('bs_get_groups: gộp lô sắp theo thời gian chính xác tới micro giây', async () => {
    const tokens = Array.from({ length: 60 }, (_, i) => tokenOf(i))
    const stamps: Record<string, string> = {
      [tokens[0] as string]: '2026-10-27T13:28:38.123456+00:00',
      [tokens[55] as string]: '2026-10-27T13:28:38.123457+00:00',
    }
    rpc.mockImplementation(async (_name: string, args: object) => {
      const batch = (args as { p_tokens: string[] }).p_tokens
      const rows = batch.map((token) => summaryRow(token, stamps[token] ?? '2026-01-01T00:00:00+00:00'))
      return { data: rows, error: null, status: 200 }
    })
    const result = await api.getGroupSummaries(tokens)
    expect(result.slice(0, 2).map((item) => item.token)).toEqual([tokens[55], tokens[0]])
  })

  it('bs_get_groups: một lô lỗi thì cả lượt lỗi, không trả kết quả thiếu', async () => {
    const tokens = Array.from({ length: 80 }, (_, i) => tokenOf(i))
    respond([summaryRow(tokenOf(0), minuteOf(0))])
    respondError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, 0)
    expect(await api.getGroupSummaries(tokens).catch((e: unknown) => e)).toMatchObject({ kind: 'network' })
  })

  it('bs_rotate_token: gửi p_new_token do client chọn, không gửi khi bỏ trống, trả token server xác nhận', async () => {
    const fresh = 'abcdefghijklmnopqrstuvwx'
    respond({ token: fresh })
    expect(await api.rotateToken(TOKEN, fresh)).toBe(fresh)
    expect(lastCall()).toEqual({
      name: 'bs_rotate_token',
      args: { p_token: TOKEN, p_new_token: fresh },
      argCount: 2,
    })

    respond({ token: fresh })
    expect(await api.rotateToken(TOKEN)).toBe(fresh)
    expect(lastCall()).toEqual({ name: 'bs_rotate_token', args: { p_token: TOKEN }, argCount: 2 })
    expect('p_new_token' in lastCall().args).toBe(false)
  })

  it('bs_rotate_token: gửi lại đúng cặp (replay) nhận lại cùng token mới; cả hai cùng không còn thì BS_GROUP_NOT_FOUND', async () => {
    const fresh = 'abcdefghijklmnopqrstuvwx'
    respond({ token: fresh })
    respond({ token: fresh })
    expect(await api.rotateToken(TOKEN, fresh)).toBe(fresh)
    expect(await api.rotateToken(TOKEN, fresh)).toBe(fresh)
    expect(rpc.mock.calls.map(([, args]) => args)).toEqual([
      { p_token: TOKEN, p_new_token: fresh },
      { p_token: TOKEN, p_new_token: fresh },
    ])

    respondError({ code: 'PT404', message: 'BS_GROUP_NOT_FOUND', details: '', hint: null }, 404)
    expect(await api.rotateToken(TOKEN, 'zyxwvutsrqponmlkjihgfedc').catch((e: unknown) => e)).toMatchObject({
      code: 'BS_GROUP_NOT_FOUND',
      status: 404,
    })
    respondError({ code: 'PT422', message: 'BS_INVALID', details: '{"field":"new_token","reason":"id_taken"}', hint: null }, 422)
    expect(await api.rotateToken(TOKEN, fresh).catch((e: unknown) => e)).toMatchObject({
      code: 'BS_INVALID',
      detail: { field: 'new_token', reason: 'id_taken' },
    })
  })

  it('bs_rotate_token: server trả token sai dạng thì báo lỗi dữ liệu, không để lọt', async () => {
    respond({ token: 'ngan' })
    expect(await api.rotateToken(TOKEN, 'abcdefghijklmnopqrstuvwx').catch((e: unknown) => e)).toMatchObject({ kind: 'unknown' })
  })

  it('bs_delete_group trả undefined', async () => {
    respond(null)
    expect(await api.deleteGroup(TOKEN)).toBeUndefined()
    expect(lastCall()).toEqual({ name: 'bs_delete_group', args: { p_token: TOKEN }, argCount: 2 })
  })
})

describe('bs_save_member: không gửi tham số tùy chọn khi rỗng', () => {
  const member = (overrides: Partial<MemberInput> = {}): MemberInput => ({ id: ID, name: ' Linh ', bank: null, ...overrides })

  it('không có ngân hàng: chỉ gửi token, id, tên', async () => {
    respond(SNAPSHOT)
    await api.saveMember(TOKEN, member())
    expect(lastCall().args).toEqual({ p_token: TOKEN, p_member_id: ID, p_name: 'Linh' })
    expect(Object.keys(lastCall().args)).toEqual(['p_token', 'p_member_id', 'p_name'])
  })

  it('có ngân hàng: bỏ khoảng trắng số tài khoản, tên chủ tài khoản thành chữ hoa không dấu', async () => {
    respond(SNAPSHOT)
    const bank = { bin: '970436', accountNumber: '0123 4567 89', accountName: 'Nguyễn Văn Linh' }
    await api.saveMember(TOKEN, member({ bank }))
    expect(lastCall().args).toEqual({
      p_token: TOKEN,
      p_member_id: ID,
      p_name: 'Linh',
      p_bank_bin: '970436',
      p_bank_account: '0123456789',
      p_bank_account_name: 'NGUYEN VAN LINH',
    })
  })

  it('số tài khoản dán từ app ngân hàng có NBSP và ký tự vô hình: gửi lên đã sạch, giống thứ được nhớ lại', async () => {
    respond(SNAPSHOT)
    const junk = String.fromCodePoint(0xa0, 0x200b, 0x200e, 0x2060, 0xfeff)
    await api.saveMember(TOKEN, member({ bank: { bin: '970436', accountNumber: `0123${junk}456 789${junk}`, accountName: null } }))
    expect(lastCall().args).toMatchObject({ p_bank_bin: '970436', p_bank_account: '0123456789' })
  })

  it('có ngân hàng nhưng tên chủ tài khoản trống: không gửi p_bank_account_name', async () => {
    for (const accountName of [null, '', '   ']) {
      respond(SNAPSHOT)
      await api.saveMember(TOKEN, member({ bank: { bin: '970436', accountNumber: '0123456789', accountName } }))
      expect(Object.keys(lastCall().args), String(accountName)).toEqual([
        'p_token',
        'p_member_id',
        'p_name',
        'p_bank_bin',
        'p_bank_account',
      ])
    }
  })
})

describe('bs_save_expense và bs_save_settlement', () => {
  it('tạo mới: không gửi p_expected_version và p_note khi rỗng, p_shares dùng tên cột snake_case', async () => {
    respond(SNAPSHOT)
    await api.saveExpense(TOKEN, expense())
    const { name, args, argCount } = lastCall()
    expect(name).toBe('bs_save_expense')
    expect(argCount).toBe(2)
    expect(args).toEqual({
      p_token: TOKEN,
      p_expense_id: ID,
      p_title: 'Lẩu gà',
      p_amount: 1_200_000,
      p_paid_by: OTHER,
      p_spent_on: '2026-10-26',
      p_split_mode: 'equal',
      p_shares: [
        { member_id: ID, amount: 600_000 },
        { member_id: OTHER, amount: 600_000 },
      ],
    })
    expect('p_expected_version' in args).toBe(false)
    expect('p_note' in args).toBe(false)
  })

  it('ghi chú toàn khoảng trắng coi như rỗng', async () => {
    respond(SNAPSHOT)
    await api.saveExpense(TOKEN, expense({ note: '   ' }))
    expect('p_note' in lastCall().args).toBe(false)
  })

  it('sửa: gửi p_expected_version, kể cả 0 không bị coi là rỗng; ghi chú được cắt khoảng trắng', async () => {
    respond(SNAPSHOT)
    await api.saveExpense(TOKEN, expense({ expectedVersion: 3, note: ' Quán Bà Tư ' }))
    expect(lastCall().args).toMatchObject({ p_expected_version: 3, p_note: 'Quán Bà Tư' })

    respond(SNAPSHOT)
    await api.saveExpense(TOKEN, expense({ expectedVersion: 0 }))
    expect(lastCall().args.p_expected_version).toBe(0)
  })

  it('bs_save_settlement: ghi chú chỉ gửi khi có', async () => {
    const settlement: SettlementInput = {
      id: ID,
      fromMemberId: OTHER,
      toMemberId: ID,
      amount: 300_000,
      settledOn: '2026-10-27',
      note: null,
    }
    respond(SNAPSHOT)
    await api.saveSettlement(TOKEN, settlement)
    expect(lastCall()).toEqual({
      name: 'bs_save_settlement',
      args: {
        p_token: TOKEN,
        p_settlement_id: ID,
        p_from_member: OTHER,
        p_to_member: ID,
        p_amount: 300_000,
        p_settled_on: '2026-10-27',
      },
      argCount: 2,
    })

    respond(SNAPSHOT)
    await api.saveSettlement(TOKEN, { ...settlement, note: ' Trả tiền lẩu ' })
    expect(lastCall().args.p_note).toBe('Trả tiền lẩu')
  })
})

describe('lỗi', () => {
  it('lỗi nghiệp vụ thành AppError có mã BS_* và status HTTP', async () => {
    respondError({ code: 'PT404', message: 'BS_GROUP_NOT_FOUND', details: '', hint: null }, 404)
    const error = await api.getGroup(TOKEN).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ kind: 'app', code: 'BS_GROUP_NOT_FOUND', status: 404 })
  })

  it('chi tiết JSON được parse sẵn', async () => {
    const details = JSON.stringify({ entity: 'expense', current_version: 4 })
    respondError({ code: 'PT409', message: 'BS_CONFLICT', details, hint: null }, 409)
    const error = (await api.saveExpense(TOKEN, expense({ expectedVersion: 1 })).catch((e: unknown) => e)) as AppError
    expect(error).toMatchObject({ code: 'BS_CONFLICT', status: 409, detail: { entity: 'expense', current_version: 4 } })
  })

  it('rớt mạng (status 0 hoặc fetch ném lỗi) là lỗi NETWORK', async () => {
    respondError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, 0)
    expect(await api.getGroup(TOKEN).catch((e: unknown) => e)).toMatchObject({ kind: 'network', code: 'NETWORK' })

    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await api.getGroup(TOKEN).catch((e: unknown) => e)).toMatchObject({ kind: 'network', code: 'NETWORK' })
  })

  it('snapshot hỏng hoặc phiên bản lạ thành AppError, không để lọt dữ liệu sai', async () => {
    respond({ ...SNAPSHOT, v: 2 })
    expect(await api.getGroup(TOKEN).catch((e: unknown) => e)).toMatchObject({ kind: 'outdated', code: 'OUTDATED' })
    respond({ v: 1, group: null })
    expect(await api.getGroup(TOKEN).catch((e: unknown) => e)).toMatchObject({ kind: 'unknown' })
    respond(null)
    expect(await api.deleteExpense(TOKEN, ID).catch((e: unknown) => e)).toMatchObject({ kind: 'unknown' })
  })
})
