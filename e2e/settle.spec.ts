import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { buildTransferPayload } from '@/modules/bill-split/domain/vietqr'
import { formatVnd } from '@/shared/lib/format'
import { addExpense, rpc, seedGroup, type SeededGroup } from './support/seed'

/**
 * Trả nợ và thành viên của một nhóm, chạy với Supabase local (cần .cache/db-ready, xem README).
 *
 * Cả file dùng chung MỘT nhóm dựng sẵn qua RPC (tạo nhóm bị giới hạn tốc độ: hợp đồng v1.1 cho 5 lần mỗi client và 100
 * lần toàn hệ thống trong 10 phút, còn seed.sql của database local nâng cả hai lên rất cao), và các test chạy nối
 * tiếp, bước sau dựa vào kết quả bước trước. Mỗi test mở trang mới (context mới) nên "mình là ai" được đặt sẵn vào
 * localStorage. Ảnh chụp từng bước nằm ở test-results/settle/.
 *
 * Số dư của nhóm dựng sẵn (Linh, Hưng, Mai, Tú; Hưng là "mình"):
 * - Lẩu gà lá é 1.200.000 ₫ Linh trả, chia đều bốn người: mỗi người 300.000 ₫.
 * - Cà phê 400.000 ₫ Hưng trả, chia đều Hưng và Mai: mỗi người 200.000 ₫.
 * Linh được nhận 900.000 ₫; Hưng nợ 100.000 ₫, Mai nợ 500.000 ₫, Tú nợ 300.000 ₫, cả ba chuyển cho Linh.
 */

const GROUP_NAME = 'Đà Lạt 3N2Đ'
const ME = 'Hưng'

/** Tài khoản sẽ nhập cho Linh qua giao diện. */
const LINH_BANK: BankAccount = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }

let group: SeededGroup

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  group = await seedGroup({
    name: GROUP_NAME,
    members: ['Linh', 'Hưng', 'Mai', 'Tú'],
    expenses: [
      { title: 'Lẩu gà lá é', amount: 1_200_000, paidBy: 'Linh' },
      { title: 'Cà phê', amount: 400_000, paidBy: 'Hưng', participants: ['Hưng', 'Mai'] },
    ],
  })
})

test.afterAll(async () => {
  // Xóa mềm nhóm cho gọn database. Lỗi ở đây không đáng làm hỏng kết quả test.
  await rpc('bs_delete_group', { p_token: group.token }).catch(() => undefined)
})

const TAB_NAMES = { 'so-du': /^Số dư/, 'thanh-vien': /^Thành viên/ } as const
type Tab = keyof typeof TAB_NAMES

/**
 * Mở một tab của nhóm, với "mình là ai" đặt sẵn là Hưng (và có thể kèm ngân hàng nhập lần gần nhất).
 * Chỉ ghi khi localStorage chưa có, để tải lại trang sau khi đổi link không đè mất dữ liệu app đã chuyển sang token mới.
 */
async function openGroup(page: Page, tab: Tab, options: { lastBank?: BankAccount } = {}) {
  await page.addInitScript(
    ({ token, memberId, lastBank }) => {
      if (localStorage.getItem('callone:bill-split:me') === null) {
        localStorage.setItem('callone:bill-split:me', JSON.stringify({ [token]: memberId }))
      }
      if (lastBank && localStorage.getItem('callone:bill-split:last-bank') === null) {
        localStorage.setItem('callone:bill-split:last-bank', JSON.stringify(lastBank))
      }
    },
    { token: group.token, memberId: group.memberIds[ME], lastBank: options.lastBank ?? null },
  )
  await page.goto(`/bill-split/g/${group.token}?tab=${tab}`)
  await expect(page.getByRole('tab', { name: TAB_NAMES[tab], selected: true })).toBeVisible()
}

/**
 * Chụp ảnh một bước, lưu ở test-results/settle/<project>-<tên>.png (không commit).
 * Chụp cả trang chỉ khi không có hộp thoại nào đang mở: ảnh cả trang tạm đổi kích thước khung nhìn và làm ngăn kéo
 * (vaul) trượt lệch khỏi màn hình, khiến bước sau không bấm được nút trong ngăn kéo.
 */
async function shot(page: Page, info: TestInfo, name: string, options: { fullPage?: boolean } = {}) {
  await page.screenshot({ path: `test-results/settle/${info.project.name}-${name}.png`, fullPage: options.fullPage ?? false })
}

/** Thẻ gợi ý chuyển khoản, tìm theo câu "Mai chuyển cho Linh". */
function transfer(page: Page, sentence: string): Locator {
  return page.getByRole('listitem').filter({ hasText: sentence })
}

/** Dòng số dư của một người (chỉ dòng số dư có chữ "Phần chịu"). */
function balanceRow(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ hasText: 'Phần chịu' }).filter({ hasText: name })
}

/** Dòng trong lịch sử "Đã thanh toán", tìm theo câu "Mai đã trả Linh". */
function settlementRow(page: Page, sentence: string): Locator {
  return page.getByRole('listitem').filter({ hasText: sentence })
}

/**
 * Dòng của một thành viên ở tab Thành viên: một <div role="listitem"> bọc nút bấm được (mở hộp sửa thành viên), nên
 * dùng .getByRole('button') của dòng để bấm. Chỉ tìm trong các danh sách của trang (role="list"), vì mỗi toast
 * cũng là một listitem và có thể nhắc tên người đó ("Đã thêm Bin vào nhóm").
 */
function memberRow(page: Page, name: string): Locator {
  return page.locator('[role="list"] > [role="listitem"]').filter({ hasText: name })
}

const money = (amount: number) => formatVnd(amount)

test('số dư và gợi ý chuyển khoản', async ({ page }, info) => {
  await openGroup(page, 'so-du')

  // Số dư: người được nhận nhiều nhất lên đầu, "mình" có nhãn Bạn.
  await expect(balanceRow(page, 'Linh')).toContainText(`+${money(900_000)}`)
  await expect(balanceRow(page, 'Linh')).toContainText('được nhận lại')
  await expect(balanceRow(page, 'Hưng')).toContainText(`−${money(100_000)}`)
  await expect(balanceRow(page, 'Hưng')).toContainText('Bạn')
  await expect(balanceRow(page, 'Hưng')).toContainText('còn nợ')
  await expect(balanceRow(page, 'Mai')).toContainText(`−${money(500_000)}`)
  await expect(balanceRow(page, 'Tú')).toContainText(`−${money(300_000)}`)

  // Gợi ý: ba lần chuyển cho Linh, lần của mình gọi là "Bạn".
  await expect(page.getByRole('heading', { name: /^Gợi ý chuyển khoản\s*3$/ })).toBeVisible()
  await expect(transfer(page, 'Bạn chuyển cho Linh')).toContainText(money(100_000))
  await expect(transfer(page, 'Mai chuyển cho Linh')).toContainText(money(500_000))
  await expect(transfer(page, 'Tú chuyển cho Linh')).toContainText(money(300_000))

  // Linh chưa nhập tài khoản: nút "Mã QR" khóa và có lời nhắc "Nhập ngay" ở cả ba thẻ.
  await expect(page.getByRole('button', { name: 'Mã QR' })).toHaveCount(3)
  for (const button of await page.getByRole('button', { name: 'Mã QR' }).all()) await expect(button).toBeDisabled()
  await expect(page.getByText('Linh chưa nhập tài khoản ngân hàng.')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Nhập ngay' })).toHaveCount(3)

  // Chưa có ai trả nên chưa có khối "Đã thanh toán".
  await expect(page.getByRole('heading', { name: /^Đã thanh toán/ })).toHaveCount(0)
  await shot(page, info, '01-so-du', { fullPage: true })
})

test('nhập tài khoản cho người nhận từ lời nhắc "Nhập ngay"', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  await page.getByRole('button', { name: 'Nhập ngay' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Sửa thành viên' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#member-name')).toHaveValue('Linh')

  // Chọn ngân hàng bằng ô tìm không dấu ("vcb" ra Vietcombank).
  await dialog.locator('#member-bank').click()
  const picker = page.getByRole('dialog', { name: 'Chọn ngân hàng' })
  await expect(picker).toBeVisible()
  await picker.getByPlaceholder('Tìm ngân hàng').fill('vcb')
  await shot(page, info, '02-chon-ngan-hang')
  await picker.getByRole('option', { name: /^Vietcombank/ }).click()
  await expect(picker).toBeHidden()
  await expect(dialog.locator('#member-bank')).toContainText('Vietcombank')
  // Con trỏ trở về ô chọn ngân hàng thay vì rơi ra ngoài hộp.
  await expect(dialog.locator('#member-bank')).toBeFocused()

  // Chọn ngân hàng mà chưa nhập số tài khoản: báo lỗi dưới ô số tài khoản, con trỏ về ô đó.
  const save = dialog.getByRole('button', { name: 'Lưu', exact: true })
  await save.click()
  await expect(dialog.getByText('Nhập số tài khoản.')).toBeVisible()
  await expect(dialog.locator('#member-account')).toBeFocused()

  // Số tài khoản sai định dạng.
  await dialog.locator('#member-account').fill('12-34')
  await save.click()
  await expect(dialog.getByText('Số tài khoản chỉ gồm chữ và số, tối đa 19 ký tự.')).toBeVisible()

  // Nhập đúng: khoảng trắng trong số tài khoản bị bỏ, tên chủ tài khoản thành chữ hoa không dấu khi rời ô.
  const account = dialog.locator('#member-account')
  await account.fill('0123 4567 89')
  await account.blur()
  await expect(account).toHaveValue(LINH_BANK.accountNumber)
  const holder = dialog.locator('#member-holder')
  await holder.fill('Nguyễn Văn Linh')
  await holder.blur()
  await expect(holder).toHaveValue(LINH_BANK.accountName ?? '')
  await shot(page, info, '03-form-thanh-vien')

  await save.click()
  await expect(page.getByText('Đã lưu thông tin của Linh')).toBeVisible()
  await expect(dialog).toBeHidden()

  // Có tài khoản rồi: nút "Mã QR" mở khóa, lời nhắc biến mất.
  for (const button of await page.getByRole('button', { name: 'Mã QR' }).all()) await expect(button).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Nhập ngay' })).toHaveCount(0)
  await shot(page, info, '04-sau-khi-nhap-tai-khoan', { fullPage: true })
})

test('mã QR khớp với domain', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  await transfer(page, 'Bạn chuyển cho Linh').getByRole('button', { name: 'Mã QR' }).click()

  const dialog = page.getByRole('dialog', { name: 'Mã QR chuyển khoản' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Chuyển cho Linh')
  await expect(dialog).toContainText(money(100_000))

  // Chuỗi trong mã QR đúng bằng buildTransferPayload của domain cho cùng tài khoản, số tiền và nội dung
  // ("Chia tiền <tên nhóm>" được domain bỏ dấu và cắt còn 25 ký tự).
  const qr = dialog.getByTestId('vietqr-code')
  await expect(qr).toHaveCount(1)
  await expect(page.locator('[data-payload]')).toHaveCount(1)
  const expected = buildTransferPayload(LINH_BANK, 100_000, `Chia tiền ${GROUP_NAME}`)
  await expect(qr).toHaveAttribute('data-payload', expected)

  // Thông tin tài khoản hiện cạnh mã, đúng thứ nằm trong mã.
  await expect(dialog).toContainText('Vietcombank')
  await expect(dialog).toContainText(LINH_BANK.accountNumber)
  await expect(dialog).toContainText(LINH_BANK.accountName ?? '')
  await expect(dialog).toContainText('Chia tien Da Lat 3N2D')
  await shot(page, info, '05-ma-qr')

  // Đóng mà không ghi nhận gì: vẫn còn gợi ý đó, chưa có lần trả nào.
  await dialog.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(dialog).toBeHidden()
  await expect(transfer(page, 'Bạn chuyển cho Linh')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Đã thanh toán/ })).toHaveCount(0)
})

test('"Đã chuyển xong" trong hộp mã QR ghi nhận lần trả và cập nhật số dư', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  await transfer(page, 'Bạn chuyển cho Linh').getByRole('button', { name: 'Mã QR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mã QR chuyển khoản' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Đã chuyển xong' }).click()
  await expect(page.getByText(`Đã ghi nhận Hưng trả Linh ${money(100_000)}`)).toBeVisible()
  await expect(dialog).toBeHidden()

  // Hưng huề, Linh còn được nhận 800.000 ₫, gợi ý còn hai lần chuyển.
  await expect(balanceRow(page, 'Hưng')).toContainText('Đã cân bằng')
  await expect(balanceRow(page, 'Linh')).toContainText(`+${money(800_000)}`)
  await expect(page.getByRole('heading', { name: /^Gợi ý chuyển khoản\s*2$/ })).toBeVisible()
  await expect(transfer(page, 'Bạn chuyển cho Linh')).toHaveCount(0)

  const paid = settlementRow(page, 'Bạn đã trả Linh')
  await expect(paid).toContainText(money(100_000))
  await expect(paid).toContainText('Hôm nay')
  await shot(page, info, '06-sau-khi-chuyen-xong', { fullPage: true })
})

test('"Đã trả" ghi nhận lần trả không cần mã QR', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  await transfer(page, 'Mai chuyển cho Linh').getByRole('button', { name: 'Đã trả' }).click()

  await expect(page.getByText(`Đã ghi nhận Mai trả Linh ${money(500_000)}`)).toBeVisible()
  await expect(balanceRow(page, 'Mai')).toContainText('Đã cân bằng')
  await expect(page.getByRole('heading', { name: /^Gợi ý chuyển khoản\s*1$/ })).toBeVisible()
  await expect(settlementRow(page, 'Mai đã trả Linh')).toContainText(money(500_000))
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
  await shot(page, info, '07-da-tra', { fullPage: true })
})

test('xóa lần trả rồi hoàn tác', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  const row = settlementRow(page, 'Mai đã trả Linh')
  await row.getByRole('button', { name: 'Tùy chọn lần trả này' }).click()
  await page.getByRole('menuitem', { name: 'Xóa lần trả này' }).click()

  // Lần trả biến mất, Mai lại còn nợ và gợi ý quay về hai lần chuyển.
  await expect(page.getByText('Đã xóa lần trả')).toBeVisible()
  await expect(row).toHaveCount(0)
  await expect(balanceRow(page, 'Mai')).toContainText(`−${money(500_000)}`)
  await expect(page.getByRole('heading', { name: /^Gợi ý chuyển khoản\s*2$/ })).toBeVisible()
  await shot(page, info, '08-da-xoa-lan-tra', { fullPage: true })

  // Hoàn tác lưu lại đúng lần trả đó.
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByText('Đã khôi phục lần trả')).toBeVisible()
  await expect(settlementRow(page, 'Mai đã trả Linh')).toContainText(money(500_000))
  await expect(balanceRow(page, 'Mai')).toContainText('Đã cân bằng')
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
})

test('"Đã trả" có nút "Hoàn tác", và khi mọi người huề thì không còn gợi ý', async ({ page }, info) => {
  await openGroup(page, 'so-du')
  await transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Đã trả' }).click()
  const paidToast = page.locator('[data-sonner-toast]').filter({ hasText: `Đã ghi nhận Tú trả Linh ${money(300_000)}` })
  await expect(paidToast).toBeVisible()

  // Mọi người huề: dải xanh "không ai nợ ai", không còn khối gợi ý chuyển khoản.
  await expect(page.getByText('Mọi người đã cân bằng, không ai nợ ai.')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Gợi ý chuyển khoản/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*3$/ })).toBeVisible()
  await shot(page, info, '09-moi-nguoi-da-hue', { fullPage: true })

  // "Hoàn tác" xóa đúng lần trả vừa ghi nhận.
  await paidToast.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByText('Đã hủy lần trả vừa ghi nhận')).toBeVisible()
  await expect(page.getByText('Mọi người đã cân bằng, không ai nợ ai.')).toHaveCount(0)
  await expect(transfer(page, 'Tú chuyển cho Linh')).toContainText(money(300_000))
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
})

test('mất phản hồi giữa chừng rồi bấm lại: không ghi trùng lần trả', async ({ page }, info) => {
  await openGroup(page, 'so-du')

  // Server nhận và ghi xong lần trả, nhưng phản hồi không về tới trình duyệt: mọi lần gửi (kể cả hai lần tự thử lại
  // khi rớt mạng) đều bị cắt sau khi server đã nhận.
  let reachedServer = 0
  await page.route('**/rest/v1/rpc/bs_save_settlement', async (route) => {
    await route.fetch()
    reachedServer++
    await route.abort('connectionreset')
  })
  await transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Mã QR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mã QR chuyển khoản' })
  await dialog.getByRole('button', { name: 'Đã chuyển xong' }).click()
  await expect(page.getByText('Không có kết nối mạng. Kiểm tra mạng rồi thử lại.').first()).toBeVisible()
  expect(reachedServer).toBeGreaterThanOrEqual(1)
  // Hộp vẫn mở và nút bấm lại được.
  await expect(dialog.getByRole('button', { name: 'Đã chuyển xong' })).toBeEnabled()

  // Mạng ổn lại, bấm lại: gửi đúng id cũ nên chỉ ghi đè chính lần trả đó.
  await page.unroute('**/rest/v1/rpc/bs_save_settlement')
  await dialog.getByRole('button', { name: 'Đã chuyển xong' }).click()
  await expect(dialog).toBeHidden()
  const paidToast = page.locator('[data-sonner-toast]').filter({ hasText: `Đã ghi nhận Tú trả Linh ${money(300_000)}` })
  await expect(paidToast).toBeVisible()

  // Nếu ghi trùng, Tú sẽ dư 300.000 ₫ và Linh âm 300.000 ₫, và có bốn lần trả thay vì ba.
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*3$/ })).toBeVisible()
  await expect(balanceRow(page, 'Tú')).toContainText('Đã cân bằng')
  await expect(balanceRow(page, 'Linh')).toContainText('Đã cân bằng')
  await shot(page, info, '10-khong-ghi-trung', { fullPage: true })

  // Trả nhóm về như cũ cho các test sau: hoàn tác chỉ xóa được một lần trả, nên cũng chứng tỏ không có lần trả thứ hai.
  await paidToast.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByText('Đã hủy lần trả vừa ghi nhận')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
  await expect(transfer(page, 'Tú chuyển cho Linh')).toBeVisible()
})

test('mất mạng: không kẹt giao diện, hộp mã QR luôn đóng được, nút trở lại kèm thông báo rõ ràng', async ({ page, context }, info) => {
  // Mỗi lần thử ngoại tuyến mất khoảng 2 giây (tự thử lại hai lần) và ba lần chờ toast cũ tự tắt, gần 20 giây tổng cộng.
  test.setTimeout(60_000)
  await openGroup(page, 'so-du')
  const offline = page.getByText('Không có kết nối mạng. Kiểm tra mạng rồi thử lại.')
  const tuPaid = transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Đã trả' })
  await expect(tuPaid).toBeVisible()

  /**
   * Chờ toast lỗi cũ tự tắt, để lần báo lỗi sau chắc chắn là của lần thử sau. Không bấm nút đóng của toast được vì hộp
   * thoại (modal) đang mở chặn mọi thao tác ra ngoài nó, và đếm toast cũng không được vì chúng tự mất sau vài giây.
   */
  const clearToasts = () => expect(offline).toHaveCount(0, { timeout: 12_000 })
  await context.setOffline(true)

  // "Đã trả" ngoài danh sách: báo lỗi, nút bấm lại được, không ghi gì.
  await tuPaid.click()
  await expect(offline.first()).toBeVisible()
  await expect(tuPaid).toBeEnabled()
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
  await clearToasts()

  // "Đã chuyển xong" trong hộp mã QR: lỗi hiện ra, hộp vẫn mở và nút bấm lại được.
  await transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Mã QR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mã QR chuyển khoản' })
  const done = dialog.getByRole('button', { name: 'Đã chuyển xong' })
  await expect(dialog).toBeVisible()
  await done.click()
  await expect(offline.first()).toBeVisible()
  await expect(done).toBeEnabled()
  await expect(dialog).toBeVisible()
  await shot(page, info, '11-mat-mang-trong-hop-qr')
  await clearToasts()

  // Đang chờ vẫn đóng được: bấm "Đã chuyển xong", nút quay vòng (đang chờ), đóng ngay mà không đợi lần ghi kết thúc.
  await done.click()
  await expect(done).toBeDisabled()
  const close = dialog.getByRole('button', { name: 'Đóng' }).last()
  await expect(close).toBeEnabled()
  await close.click()
  await expect(dialog).toBeHidden()
  // Lỗi vẫn được báo (bằng toast) sau khi hộp đã đóng.
  await expect(offline.first()).toBeVisible()
  await expect(tuPaid).toBeEnabled()
  await clearToasts()

  // Có mạng lại thì ghi được bình thường.
  await context.setOffline(false)
  await tuPaid.click()
  const paidToast = page.locator('[data-sonner-toast]').filter({ hasText: `Đã ghi nhận Tú trả Linh ${money(300_000)}` })
  await expect(paidToast).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*3$/ })).toBeVisible()
  await paidToast.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.getByRole('heading', { name: /^Đã thanh toán\s*2$/ })).toBeVisible()
})

test('nút "Chia sẻ" của hệ điều hành chỉ hiện trên điện thoại, máy tính chỉ có "Sao chép link"', async ({ page, isMobile }) => {
  await openGroup(page, 'thanh-vien')
  await expect(page.getByRole('button', { name: 'Sao chép link' }).first()).toBeVisible()
  const share = page.getByRole('button', { name: 'Chia sẻ', exact: true })
  if (isMobile) await expect(share).toBeVisible()
  else await expect(share).toHaveCount(0)
})

test('thêm và xóa thành viên', async ({ page }, info) => {
  // Ngân hàng nhập lần gần nhất được điền sẵn cho người mới, số tài khoản thì không.
  await openGroup(page, 'thanh-vien', { lastBank: LINH_BANK })

  await expect(page.getByText('Bạn đang dùng nhóm này với tên Hưng.')).toBeVisible()
  await expect(memberRow(page, 'Linh')).toContainText('Vietcombank · ••••6789')
  await expect(memberRow(page, 'Mai')).toContainText('Chưa nhập tài khoản')
  // Mỗi dòng là một listitem bọc một nút, nên trình đọc màn hình đọc đó là nút và getByRole('button') tìm được.
  await expect(page.getByRole('button', { name: /^Linh.*Vietcombank/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Thành viên\s*4$/ })).toBeVisible()
  await shot(page, info, '12-thanh-vien', { fullPage: true })

  await page.getByRole('button', { name: 'Thêm thành viên' }).click()
  const dialog = page.getByRole('dialog', { name: 'Thêm thành viên' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#member-bank')).toContainText('Vietcombank')
  await expect(dialog.locator('#member-account')).toHaveValue('')
  await expect(dialog.locator('#member-holder')).toHaveValue('')
  // Thêm người mới không có nút xóa.
  await expect(dialog.getByRole('button', { name: 'Xóa thành viên' })).toHaveCount(0)

  // Tên trống, rồi tên trùng (không phân biệt hoa thường), đều báo ngay dưới ô.
  const submit = dialog.getByRole('button', { name: 'Thêm thành viên' })
  await submit.click()
  await expect(dialog.getByText('Nhập tên.')).toBeVisible()
  await dialog.locator('#member-name').fill('mai')
  await submit.click()
  await expect(dialog.getByText('Đã có người tên này trong nhóm.')).toBeVisible()

  // Thêm "Bin" không kèm tài khoản: ngân hàng chỉ được điền sẵn nên bị bỏ qua, không báo thiếu số tài khoản.
  await dialog.locator('#member-name').fill('Bin')
  await shot(page, info, '13-them-thanh-vien')
  await submit.click()
  await expect(page.getByText('Đã thêm Bin vào nhóm')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(memberRow(page, 'Bin')).toContainText('Chưa nhập tài khoản')
  await expect(page.getByRole('heading', { name: /^Thành viên\s*5$/ })).toBeVisible()

  // Xóa "Bin" (chưa có khoản chi nào) sau khi xác nhận.
  await memberRow(page, 'Bin').getByRole('button').click()
  const edit = page.getByRole('dialog', { name: 'Sửa thành viên' })
  await expect(edit).toBeVisible()
  await edit.getByRole('button', { name: 'Xóa thành viên' }).click()
  const confirm = page.getByRole('dialog', { name: 'Xóa Bin?' })
  await expect(confirm).toBeVisible()
  await shot(page, info, '14-xac-nhan-xoa-thanh-vien')
  await confirm.getByRole('button', { name: 'Xóa', exact: true }).click()

  await expect(page.getByText('Đã xóa Bin khỏi nhóm')).toBeVisible()
  await expect(memberRow(page, 'Bin')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^Thành viên\s*4$/ })).toBeVisible()
})

test('không xóa được thành viên đã có khoản chi', async ({ page }, info) => {
  await openGroup(page, 'thanh-vien')
  await memberRow(page, 'Tú').getByRole('button').click()
  const edit = page.getByRole('dialog', { name: 'Sửa thành viên' })
  await edit.getByRole('button', { name: 'Xóa thành viên' }).click()
  await page.getByRole('dialog', { name: 'Xóa Tú?' }).getByRole('button', { name: 'Xóa', exact: true }).click()

  await expect(page.getByText('Không xóa được Tú vì người này đã có khoản chi hoặc lần trả nợ.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Xóa Tú?' })).toBeHidden()
  // Hộp thành viên vẫn mở và con trỏ về nút "Xóa thành viên" (không rơi ra ngoài hộp).
  await expect(edit.getByRole('button', { name: 'Xóa thành viên' })).toBeFocused()
  await shot(page, info, '15-khong-xoa-duoc')

  // Tú vẫn còn trong nhóm.
  await edit.getByRole('button', { name: 'Hủy' }).click()
  await expect(edit).toBeHidden()
  await expect(memberRow(page, 'Tú')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Thành viên\s*4$/ })).toBeVisible()
})

test('ngân hàng có mã BIN ngoài danh sách vẫn hiện đúng ở danh sách, form và mã QR', async ({ page }, info) => {
  // Server nhận mọi mã BIN 6 số, kể cả mã app chưa biết tên. Đổi tài khoản của Linh sang một mã như vậy qua RPC.
  const unknown: BankAccount = { bin: '999999', accountNumber: '0123456789', accountName: 'NGUYEN VAN LINH' }
  await rpc('bs_save_member', {
    p_token: group.token,
    p_member_id: group.memberIds.Linh,
    p_name: 'Linh',
    p_bank_bin: unknown.bin,
    p_bank_account: unknown.accountNumber,
    p_bank_account_name: unknown.accountName,
  })

  await openGroup(page, 'thanh-vien')
  await expect(memberRow(page, 'Linh')).toContainText('Ngân hàng 999999 · ••••6789')

  // Form sửa hiện đúng mã đang lưu thay vì như chưa chọn ngân hàng, và lưu lại không làm mất nó.
  await memberRow(page, 'Linh').getByRole('button').click()
  const edit = page.getByRole('dialog', { name: 'Sửa thành viên' })
  await expect(edit.locator('#member-bank')).toContainText('Ngân hàng 999999')
  await shot(page, info, '16-ngan-hang-ngoai-danh-sach')
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByText('Đã lưu thông tin của Linh')).toBeVisible()
  await expect(memberRow(page, 'Linh')).toContainText('Ngân hàng 999999 · ••••6789')

  // Mã QR vẫn dựng được với mã BIN đó.
  await page.goto(`/bill-split/g/${group.token}?tab=so-du`)
  await transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Mã QR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mã QR chuyển khoản' })
  await expect(dialog).toContainText('Ngân hàng 999999')
  await expect(dialog.getByTestId('vietqr-code')).toHaveAttribute(
    'data-payload',
    buildTransferPayload(unknown, 300_000, `Chia tiền ${GROUP_NAME}`),
  )
})

test('số tiền vượt mức tối đa của mã QR: khóa "Mã QR" và nói rõ lý do', async ({ page }, info) => {
  // Ba khoản chi sát mức tối đa của server do Linh trả, chia đều Linh và Hưng: Hưng nợ Linh hơn 999.999.999.999 ₫,
  // là số tiền mà mã VietQR không mang được.
  for (const title of ['Mua nhà 1', 'Mua nhà 2', 'Mua nhà 3']) {
    await addExpense(group, { title, amount: 999_999_999_999, paidBy: 'Linh', participants: ['Linh', 'Hưng'] })
  }
  await openGroup(page, 'so-du')

  const card = transfer(page, 'Bạn chuyển cho Linh')
  await expect(card).toContainText(money(1_499_999_999_997))
  await expect(card).toContainText('Số tiền quá lớn để tạo mã QR. Hãy chuyển khoản trực tiếp cho Linh.')
  await expect(card.getByRole('button', { name: 'Mã QR' })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Đã trả' })).toBeEnabled()
  // Lần chuyển nhỏ hơn vẫn có mã QR bình thường.
  await expect(transfer(page, 'Tú chuyển cho Linh').getByRole('button', { name: 'Mã QR' })).toBeEnabled()
  await shot(page, info, '17-so-tien-qua-lon', { fullPage: true })
})

test('đổi link mới: link cũ không còn mở được, link mới dùng được', async ({ page }, info) => {
  const oldToken = group.token
  await openGroup(page, 'thanh-vien')
  await expect(page.getByText(`/bill-split/g/${oldToken}`).first()).toBeVisible()

  const rotate = page.getByRole('button', { name: 'Đổi link mới' })
  await rotate.click()
  const confirm = page.getByRole('alertdialog', { name: 'Đổi link mới?' })
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('Link cũ sẽ không mở được nữa.')

  // Hủy thì không đổi gì và con trỏ về nút "Đổi link mới".
  await confirm.getByRole('button', { name: 'Hủy' }).click()
  await expect(confirm).toBeHidden()
  await expect(rotate).toBeFocused()
  expect(new URL(page.url()).pathname).toBe(`/bill-split/g/${oldToken}`)

  await rotate.click()
  await expect(confirm).toBeVisible()
  await shot(page, info, '18-xac-nhan-doi-link')
  await confirm.getByRole('button', { name: 'Đổi link' }).click()

  // Mở lại trang theo token mới (thay vì thêm vào lịch sử), vẫn ở tab Thành viên, kèm thông báo nhắc gửi lại link.
  await expect(page.getByText('Đã đổi link mới. Nhớ gửi lại cho mọi người.')).toBeVisible()
  await page.waitForURL((url) => url.pathname !== `/bill-split/g/${oldToken}`)
  const newToken = new URL(page.url()).pathname.split('/').pop() ?? ''
  expect(newToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
  expect(newToken).not.toBe(oldToken)
  expect(new URL(page.url()).searchParams.get('tab')).toBe('thanh-vien')
  group = { ...group, token: newToken }

  // Trang vẫn hiện nhóm (không nháy "không tìm thấy"), link chia sẻ là link mới, "mình là ai" và nhóm gần đây
  // đã chuyển sang token mới.
  await expect(page.getByText('Bạn đang dùng nhóm này với tên Hưng.')).toBeVisible()
  await expect(page.getByText(`/bill-split/g/${newToken}`).first()).toBeVisible()
  const stored = await page.evaluate(() => ({
    me: JSON.parse(localStorage.getItem('callone:bill-split:me') ?? '{}') as Record<string, string>,
    recents: JSON.parse(localStorage.getItem('callone:bill-split:recent-groups') ?? '[]') as { token: string }[],
  }))
  expect(stored.me[newToken]).toBe(group.memberIds[ME])
  expect(stored.me[oldToken]).toBeUndefined()
  const recentTokens = stored.recents.map((item) => item.token)
  expect(recentTokens).toContain(newToken)
  expect(recentTokens).not.toContain(oldToken)
  await shot(page, info, '19-link-moi', { fullPage: true })

  // Máy của một người bạn (localStorage trống): link cũ hết hiệu lực, link mới mở được.
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/bill-split/g/${oldToken}`)
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toBeVisible()
  await shot(page, info, '20-link-cu', { fullPage: true })
  await page.goto(`/bill-split/g/${newToken}`)
  await expect(page.getByText(GROUP_NAME).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhóm' })).toHaveCount(0)
})
