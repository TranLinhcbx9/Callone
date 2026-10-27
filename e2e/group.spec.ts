import { expect, test, type Page } from '@playwright/test'
import {
  addExpenseViaUi,
  chooseFromGroupMenu,
  expenseRow,
  openGroupAs,
  openTab,
  pickWhoAmI,
  readSharedLink,
  shot,
  stubNativeShare,
  tokenFromUrl,
} from './support/group'
import { rpc } from './support/seed'

/**
 * Luồng chính của module Chia tiền qua giao diện thật, chạy với Supabase local (cần .cache/db-ready, xem README):
 * tạo nhóm, chọn "mình là ai", thêm khoản chi (gõ 1tr2, chia riêng), sửa, xóa rồi hoàn tác, đổi tên, chia sẻ,
 * dán link ở trang chủ, link không tồn tại, hai máy cùng sửa một khoản chi, nhóm bị xóa ở máy khác.
 *
 * Cả file dùng chung MỘT nhóm do test đầu tiên tạo qua giao diện (tạo nhóm bị giới hạn mỗi 10 phút trên toàn hệ thống,
 * mọi test dùng chung), các test chạy nối tiếp và bước sau dựa vào kết quả bước trước. Mỗi test mở context mới nên
 * mỗi lần là một "máy" mới: phải chọn lại mình là ai. Test cuối xóa nhóm. Gặp BS_RATE_LIMITED ở máy local thì dời mốc
 * thời gian của các nhóm vừa tạo thay vì chờ, câu lệnh nằm trong thông báo lỗi của e2e/support/seed.ts.
 * Ảnh chụp từng bước nằm ở test-results/group/ (không commit).
 *
 * Nhóm: Linh, Hưng, Mai; Hưng là "mình". Các khoản chi của test 2 (Hưng trả 1tr2 chia đều, Linh trả 450k chia riêng,
 * Mai trả 90k chia đều) cho tổng chi 1.740.000 ₫, Hưng đã trả 1.200.000 ₫ và chịu 580.000 ₫.
 */

const ME = 'Hưng'
const OTHER = 'Linh'
let groupName = 'Đà Lạt 3N2Đ'
let token = ''

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  // Xóa mềm nhóm cho gọn database nếu test cuối chưa kịp xóa. Lỗi ở đây không đáng làm hỏng kết quả test.
  if (token) await rpc('bs_delete_group', { p_token: token }).catch(() => undefined)
})

/** Thẻ tổng chi ở đầu tab Chi tiêu. */
const summaryOf = (page: Page) => page.locator('section').filter({ hasText: 'Tổng chi' })

test('tạo nhóm với 3 thành viên rồi chọn mình là ai', async ({ page }, info) => {
  await page.goto('/bill-split/new')
  await expect(page.getByLabel('Tên nhóm')).toBeFocused()

  // Bấm Tạo nhóm khi còn trống: báo lỗi đúng ô, chưa gọi server.
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()
  await expect(page.getByText('Nhập tên nhóm.')).toBeVisible()
  await expect(page.getByText('Thêm ít nhất một thành viên.')).toBeVisible()
  await shot(page, info, '01-tao-nhom-loi')

  await page.getByLabel('Tên nhóm').fill(groupName)
  const members = page.locator('#group-members')
  for (const name of ['Linh', 'Hưng']) {
    await members.fill(name)
    await members.press('Enter')
  }
  // Tên trùng (không phân biệt hoa thường) bị bỏ qua.
  await members.fill('linh')
  await members.press('Enter')
  await expect(page.getByRole('button', { name: /^Xóa / })).toHaveCount(2)
  // Người thứ ba gõ xong mà chưa bấm Enter vẫn được tính khi bấm Tạo nhóm (iPhone không làm ô mất focus khi bấm nút).
  await members.fill('Mai')
  await shot(page, info, '02-tao-nhom-dien-san')
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()

  await page.waitForURL(/\/bill-split\/g\/[A-Za-z0-9_-]{24}/)
  token = tokenFromUrl(page)

  // Lần đầu mở nhóm trên máy này: tự hỏi "Bạn là ai trong nhóm?".
  await expect(page.getByRole('dialog', { name: 'Bạn là ai trong nhóm?' })).toBeVisible()
  await shot(page, info, '03-ban-la-ai')
  await pickWhoAmI(page, ME)

  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  await expect(page.getByText(`3 người · Bạn là ${ME}`)).toBeVisible()
  await expect(page.getByText('Chưa có khoản chi nào')).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Thành viên\s*3/ })).toBeVisible()
  await shot(page, info, '04-nhom-moi-tao')
})

test('thêm ba khoản chi: gõ 1tr2, chia riêng từng người, người trả khác', async ({ page }, info) => {
  await openGroupAs(page, token, ME)

  // Lưu khi form còn trống: báo lỗi ở đúng ô. Người trả đã là mình nên không báo thiếu người trả.
  await page.getByRole('link', { name: 'Thêm khoản chi' }).click()
  await expect(page.getByRole('heading', { name: 'Thêm khoản chi' })).toBeVisible()
  await expect(page.locator('#expense-amount')).toBeFocused()
  await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
  await expect(page.getByText('Nhập số tiền.')).toBeVisible()
  await expect(page.getByText('Nhập tiêu đề cho khoản chi.')).toBeVisible()
  await expect(page.getByText('Chọn người trả.')).toHaveCount(0)
  await shot(page, info, '05-khoan-chi-loi')

  // Khoản 1: gõ "1tr2", xem trước "= 1.200.000 ₫", chia đều cho cả nhóm.
  await page.locator('#expense-amount').fill('1tr2')
  await expect(page.getByText(/= 1\.200\.000\s₫/)).toBeVisible()
  await page.locator('#expense-title').fill('Lẩu gà lá é')
  await shot(page, info, '06-khoan-chi-1tr2')
  await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
  await expect(expenseRow(page, 'Lẩu gà lá é')).toContainText(/1\.200\.000\s₫/)
  await expect(page.getByText('Hưng trả · chia đều')).toBeVisible()

  // Khoản 2: Linh trả 450k, chia riêng 200k, 150k, 100k. Thanh tiến độ báo còn thiếu rồi đã chia đủ.
  await page.getByRole('link', { name: 'Thêm khoản chi' }).click()
  await page.locator('#expense-amount').fill('450k')
  await page.locator('#expense-title').fill('Nướng BBQ')
  await page.getByRole('radio', { name: 'Linh', exact: true }).click()
  await page.getByRole('radio', { name: 'Số tiền riêng' }).click()
  await page.getByLabel('Số tiền của Linh').fill('200k')
  await page.getByLabel('Số tiền của Hưng').fill('150k')
  await expect(page.getByText(/Còn thiếu 100\.000\s₫/)).toBeVisible()
  await page.getByLabel('Số tiền của Mai').fill('100k')
  await expect(page.getByText('Đã chia đủ')).toBeVisible()
  await shot(page, info, '07-khoan-chi-chia-rieng')
  await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
  await expect(expenseRow(page, 'Nướng BBQ')).toContainText('Linh trả · chia riêng')

  // Khoản 3: Mai trả 90k, chia đều.
  await addExpenseViaUi(page, { title: 'Cà phê', amount: '90k', paidBy: 'Mai' })

  await expect(page.getByRole('tab', { name: /^Chi tiêu\s*3/ })).toBeVisible()
  const summary = summaryOf(page)
  await expect(summary).toContainText('Tổng chi · 3 khoản')
  await expect(summary).toContainText(/1\.740\.000\s₫/)
  await expect(summary).toContainText(/Bạn đã trả\s*1\.200\.000\s₫/)
  await expect(summary).toContainText(/Phần của bạn\s*580\.000\s₫/)
  await shot(page, info, '08-ba-khoan-chi')
})

test('sửa khoản chi, thoát khi chưa lưu thì hỏi lại', async ({ page }, info) => {
  await openGroupAs(page, token, ME)
  await expenseRow(page, 'Cà phê').click()
  await expect(page.getByRole('heading', { name: 'Sửa khoản chi' })).toBeVisible()
  await expect(page.locator('#expense-amount')).toHaveValue('90.000')
  await expect(page.locator('#expense-title')).toHaveValue('Cà phê')

  await page.locator('#expense-title').fill('Cà phê sáng')
  await page.locator('#expense-amount').fill('120k')

  // Đóng khi chưa lưu: hỏi. "Tiếp tục sửa" thì ở lại và giữ nguyên những gì đã gõ.
  await page.getByRole('button', { name: 'Đóng' }).click()
  const discard = page.getByRole('dialog', { name: 'Bỏ thay đổi?' })
  await expect(discard).toBeVisible()
  await shot(page, info, '09-bo-thay-doi')
  await discard.getByRole('button', { name: 'Tiếp tục sửa' }).click()
  await expect(discard).toBeHidden()
  await expect(page.locator('#expense-title')).toHaveValue('Cà phê sáng')

  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(expenseRow(page, 'Cà phê sáng')).toContainText(/120\.000\s₫/)
  await expect(summaryOf(page)).toContainText(/1\.770\.000\s₫/)
  await expect(summaryOf(page)).toContainText(/Phần của bạn\s*590\.000\s₫/)
  await shot(page, info, '10-da-sua')

  // Sửa dở rồi chọn "Bỏ thay đổi": về trang nhóm, khoản chi giữ nguyên.
  await expenseRow(page, 'Cà phê sáng').click()
  await page.locator('#expense-title').fill('Cà phê sáng muộn')
  await page.getByRole('button', { name: 'Đóng' }).click()
  await page.getByRole('dialog', { name: 'Bỏ thay đổi?' }).getByRole('button', { name: 'Bỏ thay đổi' }).click()
  await expect(page).toHaveURL(new RegExp(`/bill-split/g/${token}$`))
  await expect(expenseRow(page, 'Cà phê sáng')).toBeVisible()
  await expect(expenseRow(page, 'Cà phê sáng muộn')).toHaveCount(0)

  // Mở form rồi đóng ngay khi chưa sửa gì thì không hỏi.
  await expenseRow(page, 'Cà phê sáng').click()
  await page.getByRole('button', { name: 'Đóng' }).click()
  await expect(page).toHaveURL(new RegExp(`/bill-split/g/${token}$`))
})

test('xóa khoản chi rồi hoàn tác', async ({ page }, info) => {
  await openGroupAs(page, token, ME)
  await expenseRow(page, 'Cà phê sáng').click()
  await page.getByRole('button', { name: 'Xóa khoản chi' }).click()
  const confirm = page.getByRole('dialog', { name: 'Xóa khoản chi?' })
  await expect(confirm).toBeVisible()
  await shot(page, info, '11-xoa-khoan-chi')
  await confirm.getByRole('button', { name: 'Xóa khoản chi' }).click()

  await expect(page.getByText('Đã xóa khoản chi')).toBeVisible()
  await expect(expenseRow(page, 'Cà phê sáng')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /^Chi tiêu\s*2/ })).toBeVisible()
  await expect(summaryOf(page)).toContainText(/1\.650\.000\s₫/)
  await shot(page, info, '12-da-xoa-hoan-tac')

  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(expenseRow(page, 'Cà phê sáng')).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Chi tiêu\s*3/ })).toBeVisible()
  await expect(summaryOf(page)).toContainText(/1\.770\.000\s₫/)
})

test('đổi tên nhóm, đổi "mình là ai" và chia sẻ link', async ({ page, context, isMobile }, info) => {
  // Điện thoại: hộp chia sẻ của hệ điều hành (thay bằng bản ghi lại). Máy tính: chép link vào clipboard.
  if (isMobile) await stubNativeShare(page)
  else await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openGroupAs(page, token, ME)

  await chooseFromGroupMenu(page, 'Đổi tên nhóm')
  const rename = page.getByRole('dialog', { name: 'Đổi tên nhóm' })
  await expect(rename).toBeVisible()
  const nameField = rename.getByRole('textbox', { name: 'Tên nhóm' })
  await expect(nameField).toHaveValue(groupName)
  await nameField.fill('')
  await rename.getByRole('button', { name: 'Lưu' }).click()
  await expect(rename.getByText('Nhập tên nhóm.')).toBeVisible()
  await shot(page, info, '13-doi-ten-loi')
  groupName = 'Đà Lạt 4N3Đ'
  await nameField.fill(groupName)
  await rename.getByRole('button', { name: 'Lưu' }).click()
  await expect(rename).toBeHidden()
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

  // Đổi "mình là ai" từ menu rồi đổi lại.
  await chooseFromGroupMenu(page, 'Bạn là ai trong nhóm?')
  await pickWhoAmI(page, OTHER)
  await expect(page.getByText(`Bạn là ${OTHER}`)).toBeVisible()
  await chooseFromGroupMenu(page, 'Bạn là ai trong nhóm?')
  await pickWhoAmI(page, ME)
  await expect(page.getByText(`Bạn là ${ME}`)).toBeVisible()

  const link = new URL(`/bill-split/g/${token}`, page.url()).toString()
  await page.getByRole('button', { name: 'Chia sẻ nhóm' }).click()
  if (isMobile) {
    await expect.poll(() => readSharedLink(page)).toMatchObject({ url: link, title: groupName })
  } else {
    await expect(page.getByText('Đã chép link')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link)
  }
  await shot(page, info, '14-chia-se')
})

test('dán link nhóm ở trang chủ trên một máy mới', async ({ page }, info) => {
  await page.goto('/bill-split')
  const link = new URL(`/bill-split/g/${token}`, page.url()).toString()
  await expect(page.getByText('Chưa có nhóm nào')).toBeVisible()

  const paste = page.getByPlaceholder('Dán link nhóm')
  await paste.fill('xin chào, đây không phải link')
  await page.getByRole('button', { name: 'Mở nhóm' }).click()
  await expect(page.getByText('Link này không đúng hoặc nhóm đã bị xóa.')).toBeVisible()
  await shot(page, info, '15-dan-link-sai')

  // Link nằm giữa đoạn chat vẫn đọc được.
  await paste.fill(`Vào nhóm nè: ${link} nhớ nhập tên nha`)
  await page.getByRole('button', { name: 'Mở nhóm' }).click()
  await page.waitForURL(`**/bill-split/g/${token}`)

  // "Để sau": đóng hộp mà không lưu gì, trong lần chạy này không hỏi lại, tải lại trang thì hỏi tiếp.
  const whoAmI = page.getByRole('dialog', { name: 'Bạn là ai trong nhóm?' })
  await expect(whoAmI).toBeVisible()
  await page.getByRole('button', { name: 'Để sau' }).click()
  await expect(whoAmI).toBeHidden()
  await expect(page.getByText('3 người', { exact: true })).toBeVisible()
  await expect(expenseRow(page, 'Lẩu gà lá é')).toBeVisible()

  // Quay về trang Chia tiền: nhóm đã nằm trong danh sách của máy này.
  await page.getByRole('link', { name: 'Quay lại' }).click()
  const card = page.getByRole('link', { name: new RegExp(groupName) })
  await expect(card).toContainText('3 người · 3 khoản chi')
  await expect(card).toContainText(/1\.770\.000\s₫/)
  await shot(page, info, '16-trang-chu-co-nhom')
  await card.click()
  await expect(expenseRow(page, 'Lẩu gà lá é')).toBeVisible()
  await expect(whoAmI).toBeHidden()

  await page.reload()
  await expect(whoAmI).toBeVisible()
  await pickWhoAmI(page, OTHER)
})

test('link nhóm không tồn tại báo không tìm thấy nhóm', async ({ page }, info) => {
  const missing = 'AAAAAAAAAAAAAAAAAAAAAAAA'
  await page.goto(`/bill-split/g/${missing}`)
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xóa khỏi máy này' })).toHaveCount(0)
  await shot(page, info, '17-khong-tim-thay-nhom')

  // Form khoản chi của nhóm không tồn tại: header vẫn là "Thêm khoản chi", thân trang báo không tìm thấy.
  await page.goto(`/bill-split/g/${missing}/expense/new`)
  await expect(page.getByRole('heading', { name: 'Thêm khoản chi' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toBeVisible()

  // Dán link của nhóm không tồn tại ở trang chủ: báo lỗi ngay dưới ô, không chuyển trang.
  await page.goto('/bill-split')
  await page.getByPlaceholder('Dán link nhóm').fill(`https://callone.app/bill-split/g/${missing}`)
  await page.getByRole('button', { name: 'Mở nhóm' }).click()
  await expect(page.getByText('Link này không đúng hoặc nhóm đã bị xóa.')).toBeVisible()
  await expect(page).toHaveURL(/\/bill-split$/)

  // "Dán link khác": về trang Chia tiền và focus sẵn vào ô dán.
  await page.goto(`/bill-split/g/${missing}`)
  await page.getByRole('button', { name: 'Dán link khác' }).click()
  await expect(page).toHaveURL(/\/bill-split$/)
  await expect(page.getByPlaceholder('Dán link nhóm')).toBeFocused()
})

test('hai máy cùng sửa một khoản chi: máy lưu sau nhận thông báo xung đột và thấy bản mới nhất', async ({ page, browser }, info) => {
  const otherContext = await browser.newContext()
  const second = await otherContext.newPage()
  try {
    await openGroupAs(page, token, ME)
    await openGroupAs(second, token, OTHER)
    await expenseRow(page, 'Lẩu gà lá é').click()
    await expenseRow(second, 'Lẩu gà lá é').click()
    await expect(page.getByRole('heading', { name: 'Sửa khoản chi' })).toBeVisible()
    await expect(second.getByRole('heading', { name: 'Sửa khoản chi' })).toBeVisible()

    // Máy 1 lưu trước.
    await page.locator('#expense-title').fill('Lẩu nấm')
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(expenseRow(page, 'Lẩu nấm')).toBeVisible()

    // Máy 2 còn giữ bản cũ và lưu sau: báo người khác vừa sửa, đưa bản mới nhất vào form, không ghi đè.
    await second.locator('#expense-title').fill('Lẩu bò')
    await second.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(second.getByText('Người khác vừa sửa khoản chi này.')).toBeVisible()
    await expect(second.locator('#expense-title')).toHaveValue('Lẩu nấm')
    await expect(second.getByRole('heading', { name: 'Sửa khoản chi' })).toBeVisible()
    await shot(second, info, '18-xung-dot')

    // Bản trong form đã mới nhất nên lần lưu này được.
    await second.locator('#expense-title').fill('Lẩu bò')
    await second.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(expenseRow(second, 'Lẩu bò')).toBeVisible()
    await expect(second.getByText('Người khác vừa sửa khoản chi này.')).toHaveCount(0)

    // Máy 1 tải lại thấy bản của máy 2.
    await page.reload()
    await expect(expenseRow(page, 'Lẩu bò')).toBeVisible()
    await expect(expenseRow(page, 'Lẩu nấm')).toHaveCount(0)
  } finally {
    await otherContext.close()
  }
})

test('đổi link mà phản hồi bị mất: mở lại link cũ thì app tự chuyển sang link mới', async ({ page, browser }, info) => {
  await openGroupAs(page, token, ME)
  await openTab(page, 'members')

  // Server đổi link xong nhưng phản hồi không về tới máy này, cả hai lần tự gửi lại cũng vậy.
  await page.route('**/rest/v1/rpc/bs_rotate_token', async (route) => {
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Đổi link mới' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Đổi link', exact: true }).click()
  await expect(page.getByText('Mất kết nối khi đổi link')).toBeVisible({ timeout: 15_000 })
  await page.unroute('**/rest/v1/rpc/bs_rotate_token')

  // Máy chưa biết link mới, mà link cũ đã chết. Mở lại link cũ: app hỏi server rồi chuyển sang link mới, giữ nguyên tab.
  const oldToken = token
  await page.goto(`/bill-split/g/${oldToken}?tab=thanh-vien`)
  await expect.poll(() => tokenFromUrl(page)).not.toBe(oldToken)
  token = tokenFromUrl(page)
  await expect(page).toHaveURL(/\?tab=thanh-vien$/)
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toHaveCount(0)
  await shot(page, info, '19-doi-link-mat-phan-hoi')

  // Link cũ không còn dùng được trên máy khác (không có lần đổi link nào đang chờ).
  const stranger = await browser.newContext()
  try {
    const other = await stranger.newPage()
    await other.goto(`/bill-split/g/${oldToken}`)
    await expect(other.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toBeVisible()
  } finally {
    await stranger.close()
  }
})

test('nhóm bị xóa ở một máy: máy khác thấy "Không còn mở được" và xóa khỏi máy', async ({ page, browser }, info) => {
  const otherContext = await browser.newContext()
  const second = await otherContext.newPage()
  try {
    // Máy 2 mở nhóm nên nhóm được lưu vào danh sách gần đây của nó.
    await openGroupAs(second, token, OTHER)
    await openGroupAs(page, token, ME)

    // Máy 1 xóa nhóm: phải gõ lại đúng tên nhóm mới mở khóa nút.
    await openTab(page, 'members')
    await page.getByRole('button', { name: 'Xóa nhóm' }).click()
    const confirm = page.getByRole('dialog', { name: 'Xóa nhóm?' })
    await expect(confirm.getByRole('button', { name: 'Xóa nhóm' })).toBeDisabled()
    await confirm.getByLabel('Gõ tên nhóm để xác nhận').fill(groupName)
    await shot(page, info, '20-xoa-nhom')
    await confirm.getByRole('button', { name: 'Xóa nhóm' }).click()
    await expect(page).toHaveURL(/\/bill-split$/)
    await expect(page.getByText('Đã xóa nhóm')).toBeVisible()
    await expect(page.getByText('Chưa có nhóm nào')).toBeVisible()

    // Máy 2: nhóm không còn mở được, trang vẫn dùng bình thường và cho xóa khỏi máy này.
    await second.goto('/bill-split')
    await expect(second.getByText('Không còn mở được')).toBeVisible()
    await expect(second.getByText('Chưa có nhóm nào')).toBeVisible()
    await shot(second, info, '21-khong-con-mo-duoc')
    await second.getByRole('button', { name: `Xóa ${groupName} khỏi máy này` }).click()
    await expect(second.getByText('Không còn mở được')).toHaveCount(0)
    await expect(second.getByText('Chưa có nhóm nào')).toBeVisible()
    token = ''
  } finally {
    await otherContext.close()
  }
})
