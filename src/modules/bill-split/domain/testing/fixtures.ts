/**
 * Dữ liệu dựng nhanh cho test: thành viên, khoản chi, thanh toán, nhóm.
 * Chỉ dùng trong test, code chạy thật không import file này.
 */
import type { Expense, Group, Member, Settlement, Share } from '@/modules/bill-split/domain/types'

export function makeMember(id: string, position: number, name = `Người ${id}`): Member {
  return { id, name, position, bank: null }
}

export function makeMembers(ids: readonly string[]): Member[] {
  return ids.map((id, index) => makeMember(id, index))
}

export function makeExpense(
  id: string,
  paidBy: string,
  amount: number,
  shares: Record<string, number> | Share[],
  overrides: Partial<Expense> = {},
): Expense {
  const list = Array.isArray(shares)
    ? shares
    : Object.entries(shares).map(([memberId, shareAmount]) => ({ memberId, amount: shareAmount }))
  return {
    id,
    title: `Khoản ${id}`,
    amount,
    paidBy,
    spentOn: '2026-10-26',
    splitMode: 'exact',
    note: null,
    version: 1,
    createdAt: '2026-10-26T03:00:00.000Z',
    updatedAt: '2026-10-26T03:00:00.000Z',
    shares: list,
    ...overrides,
  }
}

export function makeSettlement(
  id: string,
  fromMemberId: string,
  toMemberId: string,
  amount: number,
  overrides: Partial<Settlement> = {},
): Settlement {
  return {
    id,
    fromMemberId,
    toMemberId,
    amount,
    settledOn: '2026-10-27',
    note: null,
    createdAt: '2026-10-27T03:00:00.000Z',
    updatedAt: '2026-10-27T03:00:00.000Z',
    ...overrides,
  }
}

export function makeGroup(
  members: Member[],
  expenses: Expense[] = [],
  settlements: Settlement[] = [],
  overrides: Partial<Group> = {},
): Group {
  return {
    id: 'group-1',
    name: 'Đà Lạt 3N2Đ',
    currency: 'VND',
    createdAt: '2026-10-20T03:00:00.000Z',
    updatedAt: '2026-10-27T03:00:00.000Z',
    members,
    expenses,
    settlements,
    ...overrides,
  }
}
