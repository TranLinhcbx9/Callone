import { describe, expect, it } from 'vitest'
import type { GroupSnapshotDto } from '@/modules/bill-split/api/contract'
import {
  parseCreateGroupResult,
  parseGroupSummaries,
  parseRotateTokenResult,
  parseSnapshot,
  toGroup,
} from '@/modules/bill-split/api/mappers'
import { AppError } from '@/shared/lib/errors'

const TOKEN = 'dalat-demo-token-2026-ok'

function snapshot(): GroupSnapshotDto {
  return {
    v: 1,
    group: {
      id: 'g1',
      name: 'Đà Lạt 3N2Đ',
      currency: 'VND',
      created_at: '2026-10-20T03:00:00+00:00',
      updated_at: '2026-10-27T03:00:00+00:00',
    },
    members: [
      {
        id: 'm1',
        name: 'Linh',
        position: 0,
        bank_bin: '970436',
        bank_account: '0123456789',
        bank_account_name: 'NGUYEN VAN LINH',
      },
      { id: 'm2', name: 'Hưng', position: 1, bank_bin: '970422', bank_account: '0987654321', bank_account_name: null },
      { id: 'm3', name: 'Mai', position: 2, bank_bin: null, bank_account: null, bank_account_name: null },
    ],
    expenses: [
      {
        id: 'e1',
        title: 'Lẩu gà lá é',
        amount: 1_200_000,
        paid_by: 'm1',
        spent_on: '2026-10-26',
        split_mode: 'equal',
        note: null,
        version: 2,
        created_at: '2026-10-26T03:00:00+00:00',
        updated_at: '2026-10-26T04:00:00+00:00',
        shares: [
          { member_id: 'm1', amount: 400_000 },
          { member_id: 'm2', amount: 400_000 },
          { member_id: 'm3', amount: 400_000 },
        ],
      },
    ],
    settlements: [
      {
        id: 's1',
        from_member: 'm2',
        to_member: 'm1',
        amount: 300_000,
        settled_on: '2026-10-27',
        note: 'Trả tiền lẩu',
        created_at: '2026-10-27T03:00:00+00:00',
        updated_at: '2026-10-27T03:00:00+00:00',
      },
    ],
  }
}

/** Sao chép sâu rồi cho phép sửa tùy ý để dựng dữ liệu hỏng. */
function mutated(change: (copy: Record<string, any>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(snapshot())) as Record<string, any>
  change(copy)
  return copy
}

function thrownBy(run: () => unknown): AppError {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(AppError)
  return caught as AppError
}

describe('toGroup', () => {
  it('đổi snapshot sang model camelCase, giữ nguyên thứ tự', () => {
    const group = toGroup(parseSnapshot(snapshot()))
    expect(group).toEqual({
      id: 'g1',
      name: 'Đà Lạt 3N2Đ',
      currency: 'VND',
      createdAt: '2026-10-20T03:00:00+00:00',
      updatedAt: '2026-10-27T03:00:00+00:00',
      members: [
        {
          id: 'm1',
          name: 'Linh',
          position: 0,
          bank: { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' },
        },
        { id: 'm2', name: 'Hưng', position: 1, bank: { bin: '970422', accountNumber: '0987654321', accountName: null } },
        { id: 'm3', name: 'Mai', position: 2, bank: null },
      ],
      expenses: [
        {
          id: 'e1',
          title: 'Lẩu gà lá é',
          amount: 1_200_000,
          paidBy: 'm1',
          spentOn: '2026-10-26',
          splitMode: 'equal',
          note: null,
          version: 2,
          createdAt: '2026-10-26T03:00:00+00:00',
          updatedAt: '2026-10-26T04:00:00+00:00',
          shares: [
            { memberId: 'm1', amount: 400_000 },
            { memberId: 'm2', amount: 400_000 },
            { memberId: 'm3', amount: 400_000 },
          ],
        },
      ],
      settlements: [
        {
          id: 's1',
          fromMemberId: 'm2',
          toMemberId: 'm1',
          amount: 300_000,
          settledOn: '2026-10-27',
          note: 'Trả tiền lẩu',
          createdAt: '2026-10-27T03:00:00+00:00',
          updatedAt: '2026-10-27T03:00:00+00:00',
        },
      ],
    })
  })

  it('từ chối snapshot có v khác 1 ngay cả khi không qua parseSnapshot', () => {
    for (const v of [0, 2, 99]) {
      const error = thrownBy(() => toGroup({ ...snapshot(), v } as unknown as GroupSnapshotDto))
      expect(error).toMatchObject({ kind: 'outdated', code: 'OUTDATED' })
    }
  })

  it('mảng rỗng giữ là mảng rỗng', () => {
    const empty = mutated((s) => {
      s.members = []
      s.expenses = []
      s.settlements = []
    })
    expect(toGroup(parseSnapshot(empty))).toMatchObject({ members: [], expenses: [], settlements: [] })
  })

  it('thành viên chỉ có một nửa thông tin ngân hàng hoặc tên chủ tài khoản rỗng', () => {
    const odd = mutated((s) => {
      s.members[0].bank_account = null
      s.members[1].bank_account_name = ''
    })
    const [first, second] = toGroup(parseSnapshot(odd)).members
    expect(first?.bank).toBeNull()
    expect(second?.bank).toEqual({ bin: '970422', accountNumber: '0987654321', accountName: null })
  })

  it('không chứa token hay mã băm nào trong kết quả', () => {
    expect(JSON.stringify(toGroup(parseSnapshot(snapshot())))).not.toMatch(/token/i)
  })
})

describe('parseSnapshot', () => {
  it('nhận snapshot phiên bản 1 hợp lệ và trả lại đúng đối tượng đó', () => {
    const input = snapshot()
    expect(parseSnapshot(input)).toBe(input)
  })

  it.each([2, 0, -1, 1.5])('phiên bản %s: báo app cũ (outdated) để người dùng tải lại trang', (v) => {
    const error = thrownBy(() => parseSnapshot(mutated((s) => (s.v = v))))
    expect(error.kind).toBe('outdated')
    expect(error.code).toBe('OUTDATED')
    expect(error.detail).toEqual({ version: v })
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['chuỗi', 'snapshot'],
    ['mảng', []],
    ['thiếu v', mutated((s) => delete s.v)],
    ['v là chuỗi', mutated((s) => (s.v = '1'))],
    ['thiếu group', mutated((s) => delete s.group)],
    ['group.name không phải chuỗi', mutated((s) => (s.group.name = 5))],
    ['currency lạ', mutated((s) => (s.group.currency = 'USD'))],
    ['members là null', mutated((s) => (s.members = null))],
    ['thành viên thiếu position', mutated((s) => delete s.members[1].position)],
    ['thành viên có bank_bin là số', mutated((s) => (s.members[0].bank_bin = 970436))],
    ['expenses không phải mảng', mutated((s) => (s.expenses = {}))],
    ['amount là chuỗi', mutated((s) => (s.expenses[0].amount = '1200000'))],
    ['split_mode lạ', mutated((s) => (s.expenses[0].split_mode = 'ratio'))],
    ['shares thiếu', mutated((s) => delete s.expenses[0].shares)],
    ['phần chia thiếu member_id', mutated((s) => delete s.expenses[0].shares[0].member_id)],
    ['settlements có phần tử null', mutated((s) => (s.settlements = [null]))],
    ['thanh toán thiếu amount', mutated((s) => delete s.settlements[0].amount)],
  ])('JSON sai định dạng (%s) thì ném AppError unknown', (_name, input) => {
    const error = thrownBy(() => parseSnapshot(input))
    expect(error.kind).toBe('unknown')
    expect(error.code).toBe('UNKNOWN')
  })

  it('thông báo lỗi nói rõ trường nào sai', () => {
    const error = thrownBy(() => parseSnapshot(mutated((s) => delete s.expenses[0].shares[0].member_id)))
    expect(error.message).toContain('snapshot.expenses[0].shares[0].member_id')
  })
})

describe('parseGroupSummaries', () => {
  const row = {
    token: TOKEN,
    id: 'g1',
    name: 'Đà Lạt 3N2Đ',
    member_count: 4,
    expense_count: 5,
    total_spent: 6_500_000,
    updated_at: '2026-10-27T03:00:00+00:00',
  }

  it('đổi sang GroupSummary và giữ thứ tự server', () => {
    expect(parseGroupSummaries([row, { ...row, token: 'lau-thu-sau-demo-token-1', name: 'Lẩu thứ Sáu' }])).toEqual([
      {
        token: TOKEN,
        id: 'g1',
        name: 'Đà Lạt 3N2Đ',
        memberCount: 4,
        expenseCount: 5,
        totalSpent: 6_500_000,
        updatedAt: '2026-10-27T03:00:00+00:00',
      },
      expect.objectContaining({ token: 'lau-thu-sau-demo-token-1', name: 'Lẩu thứ Sáu' }),
    ])
  })

  it('mảng rỗng là hợp lệ', () => {
    expect(parseGroupSummaries([])).toEqual([])
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['object', {}],
    ['phần tử null', [null]],
    ['thiếu token', [{ ...row, token: undefined }]],
    ['total_spent là chuỗi', [{ ...row, total_spent: '6500000' }]],
    ['thiếu member_count', [{ ...row, member_count: undefined }]],
  ])('sai định dạng (%s) thì ném lỗi', (_name, input) => {
    expect(thrownBy(() => parseGroupSummaries(input)).kind).toBe('unknown')
  })
})

describe('parseCreateGroupResult và parseRotateTokenResult', () => {
  it('tạo nhóm: lấy token và đổi snapshot sang Group', () => {
    const result = parseCreateGroupResult({ token: TOKEN, snapshot: snapshot() })
    expect(result.token).toBe(TOKEN)
    expect(result.group.name).toBe('Đà Lạt 3N2Đ')
    expect(result.group.members).toHaveLength(3)
  })

  it.each<[string, unknown]>([
    ['không phải object', 'x'],
    ['thiếu token', { snapshot: snapshot() }],
    ['token sai độ dài', { token: 'abc', snapshot: snapshot() }],
    ['token có ký tự lạ', { token: 'dalat demo token 2026 ok', snapshot: snapshot() }],
    ['thiếu snapshot', { token: TOKEN }],
    ['snapshot phiên bản mới', { token: TOKEN, snapshot: { ...snapshot(), v: 2 } }],
  ])('tạo nhóm sai định dạng (%s) thì ném lỗi', (_name, input) => {
    expect(thrownBy(() => parseCreateGroupResult(input))).toBeInstanceOf(AppError)
  })

  it('đổi link: lấy token mới', () => {
    expect(parseRotateTokenResult({ token: TOKEN })).toBe(TOKEN)
    expect(thrownBy(() => parseRotateTokenResult({ token: 'ngan' })).kind).toBe('unknown')
    expect(thrownBy(() => parseRotateTokenResult(null)).kind).toBe('unknown')
  })
})
