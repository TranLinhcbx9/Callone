/**
 * Chụp ảnh các mockup trong /dev bằng Edge có sẵn (không tải trình duyệt).
 * Cần dev server đang chạy: npx vite --port 5180 --strictPort
 *
 * Chạy:  npm run design:shots                 chụp tất cả
 *        npm run design:shots -- group        chỉ chụp ảnh có chữ "group" trong tên file
 *        SHOTS_BASE=http://localhost:5180 đổi địa chỉ dev server
 * Ảnh lưu ở docs/design/screenshots/.
 */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:5180'
const OUT = fileURLToPath(new URL('../../docs/design/screenshots/', import.meta.url))
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

/**
 * Mỗi mục: tên file (không đuôi), đường dẫn, kích thước, chế độ sáng/tối.
 * full: chụp cả trang dài thay vì chỉ phần nhìn thấy.
 * click: chuỗi CSS hoặc chữ trên nút cần bấm trước khi chụp (mở hộp thoại).
 */
const LIGHT = { schemes: ['light'] }
const screens = [
  ['01-home', '/dev/mockups/home', { desktop: true }],
  ['02-bill-split-home', '/dev/mockups/bill-split-home', { ...LIGHT }],
  ['03-bill-split-home-empty', '/dev/mockups/bill-split-home-empty', { ...LIGHT }],
  ['04-create-group', '/dev/mockups/create-group', { ...LIGHT }],
  ['05-who-am-i', '/dev/mockups/who-am-i', {}],
  ['06-group-expenses', '/dev/mockups/group-expenses', { full: true, desktop: true }],
  ['07-group-balances', '/dev/mockups/group-balances', { full: true }],
  ['08-group-members', '/dev/mockups/group-members', { full: true, ...LIGHT }],
  ['09-expense-form-equal', '/dev/mockups/expense-form', { full: true }],
  ['10-expense-form-exact', '/dev/mockups/expense-form-exact', { full: true }],
  ['11-expense-form-errors', '/dev/mockups/expense-form-errors', { full: true, ...LIGHT }],
  ['12-vietqr', '/dev/mockups/vietqr', { desktop: true }],
  ['13-member-form', '/dev/mockups/member-form', { ...LIGHT }],
  ['14-bank-picker', '/dev/mockups/member-form', { ...LIGHT, click: '#member-bank' }],
  ['15-share-link', '/dev/mockups/share-link', { ...LIGHT }],
  ['16-delete-group', '/dev/mockups/delete-group', { ...LIGHT }],
  ['17-group-not-found', '/dev/mockups/group-not-found', { ...LIGHT }],
  ['18-group-loading', '/dev/mockups/group-loading', { ...LIGHT }],
]

/** Ảnh so sánh font: cả trang, khổ máy tính và điện thoại. */
globalThis.__extraShots = [
  { file: '19-fonts-desktop-light', path: '/dev/fonts', scheme: 'light', size: DESKTOP, full: true, wait: 900 },
  { file: '20-ui-kit-desktop-light', path: '/dev/ui', scheme: 'light', size: DESKTOP, full: true },
]

const shots = []
for (const [name, path, options = {}] of screens) {
  for (const scheme of options.schemes ?? ['light', 'dark']) {
    shots.push({ file: `${name}-mobile-${scheme}`, path, scheme, size: MOBILE, ...options })
  }
  if (options.desktop) {
    for (const scheme of options.desktopSchemes ?? ['light']) {
      shots.push({ file: `${name}-desktop-${scheme}`, path, scheme, size: DESKTOP, ...options, full: false })
    }
  }
}
for (const extra of globalThis.__extraShots ?? []) shots.push(extra)

mkdirSync(OUT, { recursive: true })
const selected = shots.filter((shot) => filters.length === 0 || filters.some((f) => shot.file.includes(f)))
if (selected.length === 0) {
  console.log('Không có ảnh nào khớp bộ lọc:', filters.join(', '))
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--hide-scrollbars'] })
let failed = 0
try {
  for (const shot of selected) {
    const mobile = shot.size.width < 600
    const context = await browser.newContext({
      viewport: shot.size,
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: shot.scheme,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    try {
      await page.goto(BASE + shot.path, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      if (shot.click) {
        const target = shot.click.startsWith('text=') ? page.getByText(shot.click.slice(5), { exact: true }).first() : page.locator(shot.click).first()
        await target.click()
      }
      if (shot.prepare) await shot.prepare(page)
      await page.waitForTimeout(shot.wait ?? 350)
      if (shot.full) {
        // Kéo cao khung nhìn bằng cả trang để thanh cố định ở chân (nút nổi, thanh Lưu) nằm đúng cuối ảnh.
        const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
        await page.setViewportSize({ width: shot.size.width, height: Math.max(height, shot.size.height) })
        await page.waitForTimeout(250)
      }
      await page.screenshot({ path: `${OUT}${shot.file}.png` })
      console.log(`ok  ${shot.file}.png${errors.length ? `  (lỗi console: ${errors[0].slice(0, 120)})` : ''}`)
    } catch (error) {
      failed++
      console.log(`LỖI ${shot.file}: ${String(error).split('\n')[0]}`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
if (filters.length === 0 && !failed) {
  const { updateGallery } = await import('./gallery.mjs')
  updateGallery()
}
process.exit(failed ? 1 : 0)
