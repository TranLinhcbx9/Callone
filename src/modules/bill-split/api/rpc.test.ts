// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('bs_create_group: cắt khoảng trắng tên nhóm và tên thành viên', async () => {
    respond({ token: TOKEN, snapshot: SNAPSHOT })
    const result = await api.createGroup({ name: '  Đà Lạt  ', memberNames: [' Linh ', 'Hưng'] })
    expect(lastCall()).toEqual({
      name: 'bs_create_group',
      args: { p_name: 'Đà Lạt', p_member_names: ['Linh', 'Hưng'] },
      argCount: 2,
    })
    expect(result.token).toBe(TOKEN)
    expect(result.group.name).toBe('Đà Lạt')
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

  it('bs_get_groups: bỏ token trùng, tối đa 50, không gọi khi rỗng', async () => {
    expect(await api.getGroupSummaries([])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()

    respond([])
    const many = Array.from({ length: 70 }, (_, i) => `token-${String(i).padStart(2, '0')}-xxxxxxxxxxxxx`)
    await api.getGroupSummaries([...many, many[0] as string])
    const { name, args } = lastCall()
    expect(name).toBe('bs_get_groups')
    expect(args.p_tokens).toEqual(many.slice(0, 50))
  })

  it('bs_rotate_token trả token mới, bs_delete_group trả undefined', async () => {
    respond({ token: 'abcdefghijklmnopqrstuvwx' })
    expect(await api.rotateToken(TOKEN)).toBe('abcdefghijklmnopqrstuvwx')
    expect(lastCall()).toEqual({ name: 'bs_rotate_token', args: { p_token: TOKEN }, argCount: 2 })

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
