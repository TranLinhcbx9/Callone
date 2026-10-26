import { expect, test } from '@playwright/test'

// Khung điều hướng của module Chia tiền. Chưa cần database: các trang tạm chưa gọi API.
const TOKEN = 'dalat-demo-token-2026-ok'

test.describe('route của module Chia tiền', () => {
  test('trang chủ module và trang tạo nhóm', async ({ page }) => {
    await page.goto('/bill-split')
    await expect(page.getByRole('heading', { name: 'Chia tiền' })).toBeVisible()

    await page.getByRole('link', { name: 'Tạo nhóm mới' }).click()
    await expect(page).toHaveURL(/\/bill-split\/new$/)
    await expect(page.getByRole('heading', { name: 'Tạo nhóm' })).toBeVisible()
  })

  test('thêm và sửa khoản chi dùng chung một trang, "new" được ưu tiên hơn id', async ({ page }) => {
    await page.goto(`/bill-split/g/${TOKEN}/expense/new`)
    await expect(page.getByRole('heading', { name: 'Thêm khoản chi' })).toBeVisible()

    await page.goto(`/bill-split/g/${TOKEN}/expense/abc-123`)
    await expect(page.getByRole('heading', { name: 'Sửa khoản chi' })).toBeVisible()
  })

  test('token sai định dạng báo không tìm thấy nhóm mà không cần gọi mạng', async ({ page }) => {
    await page.goto('/bill-split/g/sai-dinh-dang')
    await expect(page.getByText('Không tìm thấy nhóm')).toBeVisible()
  })

  test('đường dẫn lạ trong module hiện trang không tìm thấy', async ({ page }) => {
    await page.goto('/bill-split/khong-co-trang-nay')
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible()
  })
})
