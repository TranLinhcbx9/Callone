/**
 * Sinh logo và icon của app từ một nguồn duy nhất: public/favicon.svg và các icon PNG (PWA, iPhone).
 * Cần Edge có sẵn (Playwright, channel msedge) để vẽ SVG ra PNG, không tải thêm gì.
 * Chạy: node scripts/design/make-icons.mjs
 *
 * Logo: chữ C mở bằng một nét tròn, và một chấm ở miệng chữ C (the one). Nền chàm, cùng màu nhấn của app.
 * Màu lấy từ palette trong src/styles/globals.css (primary sáng oklch(0.47 0.12 268)).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url))
const TILE_TOP = '#4b64ae'
const TILE_BOTTOM = '#344a91'
const GLYPH = '#f9fafe'

/** rounded: nền bo góc trên nền trong suốt. false: nền tràn hết khung (maskable, iPhone tự bo góc). */
function markup({ size, rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="callone-tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TILE_TOP}"/>
      <stop offset="1" stop-color="${TILE_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64"${rounded ? ' rx="16"' : ''} fill="url(#callone-tile)"/>
  <path d="M43.15 21.96A15 15 0 1 0 43.15 42.04" stroke="${GLYPH}" stroke-width="6.5" stroke-linecap="round"/>
  <circle cx="47" cy="32" r="3.6" fill="${GLYPH}"/>
</svg>
`
}

mkdirSync(`${PUBLIC}icons`, { recursive: true })
writeFileSync(`${PUBLIC}favicon.svg`, markup({ size: 64, rounded: true }))

const targets = [
  { file: 'icons/icon-192.png', size: 192, rounded: true },
  { file: 'icons/icon-512.png', size: 512, rounded: true },
  { file: 'icons/icon-maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
]

const browser = await chromium.launch({ channel: 'msedge' })
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size }, deviceScaleFactor: 1 })
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup(target)}</body></html>`)
    await page.screenshot({ path: `${PUBLIC}${target.file}`, omitBackground: true, clip: { x: 0, y: 0, width: target.size, height: target.size } })
    await page.close()
    console.log(`ok  public/${target.file}`)
  }
} finally {
  await browser.close()
}
