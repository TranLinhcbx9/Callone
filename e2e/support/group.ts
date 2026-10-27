/**
 * Thao tác giao diện dùng chung cho các test của module Chia tiền: tạo nhóm, chọn "mình là ai", thêm khoản chi,
 * tìm dòng khoản chi, chụp ảnh từng bước. Dữ liệu dựng nhanh qua RPC thì dùng ./seed.
 */
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

/** Tên các tab của trang nhóm. Tên tab có kèm số đếm ("Chi tiêu 3") nên so khớp từ đầu chuỗi. */
export const TAB_NAMES = {
  expenses: /^Chi tiêu/,
  balances: /^Số dư/,
  members: /^Thành viên/,
} as const

/** Giá trị `?tab=` trên URL của từng tab. */
export const TAB_PARAMS = { expenses: 'chi-tieu', balances: 'so-du', members: 'thanh-vien' } as const

/**
 * Chụp ảnh một bước, lưu ở test-results/group/<project>-<tên>.png (không commit).
 * Không chụp cả trang: ảnh cả trang tạm đổi kích thước khung nhìn, làm ngăn kéo (vaul) trượt lệch khỏi màn hình
 * và nút bấm của form cố định ở chân trang bị đặt sai chỗ.
 */
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/group/${info.project.name}-${name}.png` })
}

/** Token của nhóm đang mở, lấy từ đường dẫn /bill-split/g/<token>. */
export function tokenFromUrl(page: Page): string {
  const match = /\/bill-split\/g\/([A-Za-z0-9_-]{24})(?:[/?#]|$)/.exec(page.url())
  if (!match?.[1]) throw new Error(`Không thấy token nhóm trong địa chỉ ${page.url()}`)
  return match[1]
}

export interface NewGroup {
  name: string
  members: readonly string[]
}

/**
 * Tạo nhóm qua trang "Tạo nhóm mới": gõ tên nhóm, thêm từng người bằng Enter, bấm "Tạo nhóm". Trả về token nhóm.
 * Trang nhóm mở ra sẽ tự hỏi "Bạn là ai trong nhóm?" (hộp đó do test tự đóng hoặc chọn).
 */
export async function createGroupViaUi(page: Page, group: NewGroup): Promise<string> {
  await page.goto('/bill-split/new')
  await page.getByLabel('Tên nhóm').fill(group.name)
  const members = page.locator('#group-members')
  for (const name of group.members) {
    await members.fill(name)
    await members.press('Enter')
  }
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()
  await page.waitForURL(/\/bill-split\/g\/[A-Za-z0-9_-]{24}/)
  return tokenFromUrl(page)
}

/** Hộp "Bạn là ai trong nhóm?" đang mở: chọn một người, hộp đóng lại. */
export async function pickWhoAmI(page: Page, memberName: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Bạn là ai trong nhóm?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: memberName }).click()
  await expect(dialog).toBeHidden()
}

/** Mở một nhóm bằng đường dẫn trên máy chưa từng mở nhóm đó, và chọn mình là ai khi hộp hỏi hiện ra. */
export async function openGroupAs(page: Page, token: string, memberName: string): Promise<void> {
  await page.goto(`/bill-split/g/${token}`)
  await pickWhoAmI(page, memberName)
  await expect(page.getByText(`Bạn là ${memberName}`)).toBeVisible()
}

export interface ExpenseToAdd {
  title: string
  /** Chữ gõ vào ô số tiền, ví dụ "1tr2" hay "450k". */
  amount: string
  /** Tên người trả. Bỏ trống thì giữ người mặc định (mình). */
  paidBy?: string
  /** Chia riêng: tên người sang chữ gõ vào ô của người đó. Bỏ trống thì chia đều cho cả nhóm. */
  exact?: Readonly<Record<string, string>>
}

/** Điền form khoản chi đang mở (không bấm Lưu). */
export async function fillExpenseForm(page: Page, expense: ExpenseToAdd): Promise<void> {
  await page.locator('#expense-amount').fill(expense.amount)
  await page.locator('#expense-title').fill(expense.title)
  if (expense.paidBy) await page.getByRole('radio', { name: expense.paidBy, exact: true }).click()
  if (expense.exact) {
    await page.getByRole('radio', { name: 'Số tiền riêng' }).click()
    for (const [name, text] of Object.entries(expense.exact)) {
      await page.getByLabel(`Số tiền của ${name}`).fill(text)
    }
  }
}

/** Từ trang nhóm: mở form "Thêm khoản chi", điền, bấm "Lưu khoản chi" và chờ về lại trang nhóm. */
export async function addExpenseViaUi(page: Page, expense: ExpenseToAdd): Promise<void> {
  await page.getByRole('link', { name: 'Thêm khoản chi' }).click()
  await expect(page.getByRole('heading', { name: 'Thêm khoản chi' })).toBeVisible()
  await fillExpenseForm(page, expense)
  await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
  await expect(expenseRow(page, expense.title)).toBeVisible()
}

/**
 * Dòng của một khoản chi trong danh sách, tìm theo tiêu đề. Dòng là thẻ <a> nhưng UI kit đặt role="listitem"
 * lên nó nên không tìm được bằng getByRole('link').
 */
export function expenseRow(page: Page, title: string): Locator {
  return page.locator('a[href*="/expense/"]').filter({ hasText: title })
}

/** Mở một tab của trang nhóm bằng cách bấm vào tên tab. */
export async function openTab(page: Page, tab: keyof typeof TAB_NAMES): Promise<void> {
  await page.getByRole('tab', { name: TAB_NAMES[tab] }).click()
  await expect(page.getByRole('tab', { name: TAB_NAMES[tab], selected: true })).toBeVisible()
}

/** Mở menu ba chấm ở header trang nhóm rồi chọn một mục. */
export async function chooseFromGroupMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Thêm tùy chọn' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/**
 * Thay navigator.share bằng bản ghi lại tham số, để test không mở hộp chia sẻ thật của hệ điều hành.
 * Đọc kết quả bằng readSharedLink().
 */
export async function stubNativeShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as { __shared?: { url?: string; title?: string } }
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { url?: string; title?: string }) => {
        target.__shared = data
        return Promise.resolve()
      },
    })
  })
}

/** Dữ liệu navigator.share đã được gọi với (sau stubNativeShare), hoặc null nếu chưa gọi. */
export async function readSharedLink(page: Page): Promise<{ url?: string; title?: string } | null> {
  return page.evaluate(() => (window as unknown as { __shared?: { url?: string; title?: string } }).__shared ?? null)
}
