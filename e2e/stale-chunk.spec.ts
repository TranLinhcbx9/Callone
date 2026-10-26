import { expect, test } from '@playwright/test'

// Sau khi deploy bản mới, chunk cũ không còn trên server. App tải lại trang đúng một lần để lấy bản mới,
// lần lỗi thứ hai trong cùng phiên thì hiện màn hình lỗi chứ không tải lại mãi.
test('chunk bị mất sau khi deploy: tải lại một lần, sau đó hiện lỗi', async ({ page }) => {
  let loads = 0
  page.on('load', () => loads++)
  await page.route('**/assets/NewGroupPage-*.js', (route) => route.fulfill({ status: 404, body: 'not found' }))

  await page.goto('/bill-split')
  await expect.poll(() => loads).toBe(1)

  await page.getByRole('link', { name: 'Tạo nhóm mới' }).click()
  await expect.poll(() => loads).toBe(2)
  await expect(page.getByRole('link', { name: 'Tạo nhóm mới' })).toBeVisible()

  await page.getByRole('link', { name: 'Tạo nhóm mới' }).click()
  await expect(page.getByRole('heading', { name: 'Có lỗi xảy ra' })).toBeVisible()
  expect(loads).toBe(2)
})
