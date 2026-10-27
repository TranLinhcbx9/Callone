import { describe, expect, it } from 'vitest'
import {
  BILL_SPLIT_BASE_PATH,
  GROUP_TAB_PARAMS,
  billSplitPaths,
  groupLink,
  groupTabPath,
  parseGroupLink,
  parseGroupTab,
} from '@/modules/bill-split/paths'

const TOKEN = 'dalat-demo-token-2026-ok'
const OTHER = 'Ab_-Cd0123456789EfGhIjKl'

describe('billSplitPaths', () => {
  it('dựng đúng các đường dẫn của module', () => {
    expect(BILL_SPLIT_BASE_PATH).toBe('/bill-split')
    expect(billSplitPaths.home()).toBe('/bill-split')
    expect(billSplitPaths.newGroup()).toBe('/bill-split/new')
    expect(billSplitPaths.group(TOKEN)).toBe('/bill-split/g/dalat-demo-token-2026-ok')
    expect(billSplitPaths.newExpense(TOKEN)).toBe('/bill-split/g/dalat-demo-token-2026-ok/expense/new')
    expect(billSplitPaths.expense(TOKEN, 'e-1')).toBe('/bill-split/g/dalat-demo-token-2026-ok/expense/e-1')
  })

  it('mã hóa ký tự đặc biệt để không phá đường dẫn', () => {
    expect(billSplitPaths.group('a/b?c#d')).toBe('/bill-split/g/a%2Fb%3Fc%23d')
    expect(billSplitPaths.expense(TOKEN, 'x y')).toBe(`/bill-split/g/${TOKEN}/expense/x%20y`)
  })

  it('groupLink ghép origin với đường dẫn nhóm, bỏ dấu / thừa', () => {
    expect(groupLink('https://callone.app', TOKEN)).toBe(`https://callone.app/bill-split/g/${TOKEN}`)
    expect(groupLink('http://192.168.1.5:5173/', TOKEN)).toBe(`http://192.168.1.5:5173/bill-split/g/${TOKEN}`)
  })
})

describe('parseGroupLink', () => {
  it.each<[string, string]>([
    [TOKEN, TOKEN],
    [`  ${TOKEN} \n`, TOKEN],
    [OTHER, OTHER],
    [`https://callone.vercel.app/bill-split/g/${TOKEN}`, TOKEN],
    [`http://localhost:5173/bill-split/g/${TOKEN}`, TOKEN],
    [`http://192.168.1.5:5173/bill-split/g/${TOKEN}/`, TOKEN],
    [`https://callone.app/bill-split/g/${TOKEN}?utm=zalo#top`, TOKEN],
    [`https://callone.app/bill-split/g/${TOKEN}/expense/new`, TOKEN],
    [`https://callone.app/bill-split/g/${TOKEN}/expense/abc-123`, TOKEN],
    [`callone.app/bill-split/g/${TOKEN}`, TOKEN],
    [`/bill-split/g/${TOKEN}`, TOKEN],
    [`bill-split/g/${TOKEN}`, TOKEN],
    [`/bill-split/g/${OTHER}`, OTHER],
    [`#/bill-split/g/${TOKEN}`, TOKEN],
    [`Vào nhóm Đà Lạt nè: https://callone.app/bill-split/g/${TOKEN} nhớ nhập tên nha`, TOKEN],
    [`(https://callone.app/bill-split/g/${TOKEN}).`, TOKEN],
    [`https://callone.app/bill-split/g/${OTHER} https://callone.app/bill-split/g/${TOKEN}`, OTHER],
  ])('%j cho token %s', (input, expected) => {
    expect(parseGroupLink(input)).toBe(expected)
  })

  it.each<string>([
    '',
    '   ',
    'abc',
    TOKEN.slice(1),
    `${TOKEN}x`,
    'dalat demo token 2026 ok!',
    'dalat-demo-token-2026-ok.',
    `https://callone.app/bill-split/g/${TOKEN}x`,
    `https://callone.app/bill-split/g/${TOKEN.slice(1)}`,
    'https://callone.app/bill-split/g/',
    'https://callone.app/bill-split/new',
    'https://callone.app/bill-split',
    `https://callone.app/other/g/${TOKEN}`,
    `https://callone.app/g/${TOKEN}`,
    `https://callone.app/bill-split/group/${TOKEN}`,
    `https://callone.app/xbill-split/g/${TOKEN}`,
  ])('%j không phải link nhóm', (input) => {
    expect(parseGroupLink(input)).toBeNull()
  })

  it('không ném lỗi với đầu vào không phải chuỗi', () => {
    expect(parseGroupLink(undefined as unknown as string)).toBeNull()
    expect(parseGroupLink(null as unknown as string)).toBeNull()
  })

  it('đọc lại được đường dẫn và link do chính module dựng ra', () => {
    expect(parseGroupLink(billSplitPaths.group(OTHER))).toBe(OTHER)
    expect(parseGroupLink(billSplitPaths.newExpense(OTHER))).toBe(OTHER)
    expect(parseGroupLink(billSplitPaths.expense(OTHER, 'e1'))).toBe(OTHER)
    expect(parseGroupLink(groupLink('https://callone.app', OTHER))).toBe(OTHER)
  })
})

describe('tab của trang nhóm', () => {
  it('parseGroupTab đọc đúng ba giá trị, thiếu hoặc lạ thì về Chi tiêu', () => {
    expect(parseGroupTab('chi-tieu')).toBe('expenses')
    expect(parseGroupTab('so-du')).toBe('balances')
    expect(parseGroupTab('thanh-vien')).toBe('members')
    for (const value of [null, undefined, '', 'expenses', 'Số dư', 'SO-DU']) expect(parseGroupTab(value)).toBe('expenses')
  })

  it('groupTabPath bỏ ?tab= với tab mặc định, các tab khác ghi đúng giá trị mà parseGroupTab đọc lại được', () => {
    expect(groupTabPath(TOKEN, 'expenses')).toBe(billSplitPaths.group(TOKEN))
    expect(groupTabPath(TOKEN, 'members')).toBe(`/bill-split/g/${TOKEN}?tab=thanh-vien`)
    for (const tab of Object.keys(GROUP_TAB_PARAMS) as (keyof typeof GROUP_TAB_PARAMS)[]) {
      const query = groupTabPath(TOKEN, tab).split('?tab=')[1] ?? null
      expect(parseGroupTab(query)).toBe(tab)
    }
  })
})
