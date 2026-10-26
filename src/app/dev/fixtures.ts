/**
 * Dữ liệu giả cho các trang mockup, gõ theo model thật ở @/modules/bill-split/domain/types.
 * Số liệu được chọn để ra số dư và gợi ý chuyển khoản gọn: Hưng nợ Linh đúng 150.000 ₫ (khớp mã VietQR mẫu).
 */
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { suggestTransfers } from '@/modules/bill-split/domain/settle'
import type { Expense, Group, GroupSummary, Member, Settlement } from '@/modules/bill-split/domain/types'

/** Ngày "hôm nay" cố định để ảnh chụp luôn giống nhau. */
export const TODAY = '2026-10-26'

export const LINH = '3a160000-0000-4000-8000-000000000001'
export const HUNG = '3a130000-0000-4000-8000-000000000002'
export const MAI = '3a100000-0000-4000-8000-000000000003'
export const TU = '3a110000-0000-4000-8000-000000000004'

/** Danh sách ngân hàng thật của domain (frontend), để mockup chọn ngân hàng giống bản chạy thật. */
export { BANKS } from '@/modules/bill-split/domain/banks'

export const MEMBERS: Member[] = [
  {
    id: LINH,
    name: 'Linh',
    position: 0,
    bank: { bin: '970423', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' },
  },
  {
    id: HUNG,
    name: 'Hưng',
    position: 1,
    bank: { bin: '970422', accountNumber: '0987654321', accountName: 'TRAN QUOC HUNG' },
  },
  { id: MAI, name: 'Mai', position: 2, bank: null },
  { id: TU, name: 'Tú', position: 3, bank: null },
]

export function memberName(id: string, members: Member[] = MEMBERS): string {
  return members.find((member) => member.id === id)?.name ?? '?'
}

const ALL_IDS = [LINH, HUNG, MAI, TU]

function equalShares(amount: number, memberIds: string[]) {
  const each = Math.floor(amount / memberIds.length)
  const rest = amount - each * memberIds.length
  return memberIds.map((memberId, index) => ({ memberId, amount: each + (index < rest ? 1 : 0) }))
}

function expense(
  id: string,
  title: string,
  amount: number,
  paidBy: string,
  spentOn: string,
  time: string,
  shares: Expense['shares'],
  splitMode: Expense['splitMode'] = 'equal',
  note: string | null = null,
): Expense {
  const stamp = `${spentOn}T${time}:00Z`
  return { id, title, amount, paidBy, spentOn, splitMode, note, version: 1, createdAt: stamp, updatedAt: stamp, shares }
}

/** Mới nhất trước, đúng thứ tự server trả về. */
export const EXPENSES: Expense[] = [
  expense('e1', 'Lẩu gà lá é', 1_200_000, HUNG, TODAY, '12:40', equalShares(1_200_000, ALL_IDS)),
  expense('e2', 'Cà phê Cầu Đất', 150_000, MAI, TODAY, '02:15', equalShares(150_000, [LINH, MAI, TU]), 'equal', 'Hưng ở lại khách sạn ngủ nướng.'),
  expense('e3', 'Vé Thung lũng Tình Yêu', 480_000, TU, '2026-10-25', '07:30', equalShares(480_000, ALL_IDS)),
  expense('e4', 'Xăng và gửi xe', 160_000, HUNG, '2026-10-24', '09:20', equalShares(160_000, ALL_IDS)),
  expense('e5', 'Thuê xe máy 2 ngày', 600_000, LINH, '2026-10-24', '01:10', equalShares(600_000, ALL_IDS)),
  expense(
    'e6',
    'Khách sạn 2 đêm',
    3_200_000,
    LINH,
    '2026-10-23',
    '08:00',
    [
      { memberId: LINH, amount: 800_000 },
      { memberId: HUNG, amount: 900_000 },
      { memberId: MAI, amount: 700_000 },
      { memberId: TU, amount: 800_000 },
    ],
    'exact',
    'Phòng của Hưng có thêm giường phụ.',
  ),
]

export const SETTLEMENTS: Settlement[] = [
  {
    id: 's1',
    fromMemberId: MAI,
    toMemberId: LINH,
    amount: 800_000,
    settledOn: TODAY,
    note: null,
    createdAt: `${TODAY}T10:30:00Z`,
    updatedAt: `${TODAY}T10:30:00Z`,
  },
  {
    id: 's2',
    fromMemberId: TU,
    toMemberId: LINH,
    amount: 600_000,
    settledOn: '2026-10-25',
    note: 'Chuyển khoản MB',
    createdAt: '2026-10-25T14:00:00Z',
    updatedAt: '2026-10-25T14:00:00Z',
  },
]

export const GROUP: Group = {
  id: 'dalat',
  name: 'Đà Lạt 3N2Đ',
  currency: 'VND',
  createdAt: '2026-10-22T09:00:00Z',
  updatedAt: `${TODAY}T13:05:00Z`,
  members: MEMBERS,
  expenses: EXPENSES,
  settlements: SETTLEMENTS,
}

export const GROUP_TOKEN = 'dalat-demo-token-2026-ok'
export const SHARE_URL = `https://callone.app/bill-split/g/${GROUP_TOKEN}`

export const TOTAL_SPENT = EXPENSES.reduce((sum, item) => sum + item.amount, 0)

export const GROUP_SUMMARIES: GroupSummary[] = [
  {
    token: GROUP_TOKEN,
    id: 'dalat',
    name: GROUP.name,
    memberCount: 4,
    expenseCount: EXPENSES.length,
    totalSpent: TOTAL_SPENT,
    updatedAt: GROUP.updatedAt,
  },
  {
    token: 'lau-thu-sau-demo-token-1',
    id: 'lau-thu-sau',
    name: 'Lẩu thứ Sáu',
    memberCount: 5,
    expenseCount: 12,
    totalSpent: 3_460_000,
    updatedAt: '2026-10-23T15:10:00Z',
  },
  {
    token: 'sinhnhat-mai-demo-token1',
    id: 'sinhnhat-mai',
    name: 'Sinh nhật Mai',
    memberCount: 8,
    expenseCount: 3,
    totalSpent: 2_150_000,
    updatedAt: '2026-09-14T11:00:00Z',
  },
]

/** Số dư và gợi ý chuyển khoản tính bằng domain thật, không viết lại ở đây. */
export const BALANCES = computeBalances(GROUP)
export const TRANSFERS = suggestTransfers(BALANCES, MEMBERS)

/** Mã VietQR mẫu hợp lệ: TPBank 970423, tài khoản 0123456789, 150.000 ₫, nội dung DH123456. */
export const VIETQR_PAYLOAD =
  '00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB'

/** Trong mọi mockup, "mình" là Hưng: còn nợ Linh đúng 150.000 ₫, khớp mã VietQR mẫu. */
export const ME_ID = HUNG
