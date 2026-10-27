import { expect, test, type Page } from '@playwright/test'

// PWA: manifest, service worker, chạy offline và chính sách bảo mật (CSP...) của bản build.
// Playwright mặc định chặn service worker (xem playwright.config.ts) để không phá các test dựa vào page.route.
// Ở đây bật lại. Service worker không phụ thuộc cỡ màn hình nên chỉ chạy ở project desktop.
test.use({ serviceWorkers: 'allow' })
test.skip(({ isMobile }) => isMobile, 'Service worker không phụ thuộc cỡ màn hình, chỉ chạy ở desktop')

interface WebManifest {
  name: string
  short_name: string
  description: string
  lang: string
  start_url: string
  scope: string
  display: string
  background_color: string
  theme_color: string
  icons: { src: string; sizes: string; type: string; purpose?: string }[]
  shortcuts: { name: string; url: string }[]
}

/** Đọc kích thước từ header PNG, null nếu không phải PNG. */
function pngSize(data: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) return null
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

/** Chờ service worker cài xong và kích hoạt (lúc đó precache đã nạp đầy). */
async function waitForActiveServiceWorker(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          return registration?.active?.state ?? null
        }),
      { timeout: 30_000, message: 'service worker chưa kích hoạt' },
    )
    .toBe('activated')
}

/** Tải lại để trang được service worker điều khiển (lần mở đầu tiên chưa được điều khiển). */
async function reloadUnderServiceWorker(page: Page): Promise<void> {
  await waitForActiveServiceWorker(page)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null))
    .toMatch(/\/sw\.js$/)
}

/** Tách header CSP thành bảng tên chỉ thị -> các nguồn. */
function parseCsp(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name, sources)
  }
  return directives
}

test('manifest hợp lệ và các icon tải được đúng kích thước', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')

  const response = await request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('json')
  const manifest = (await response.json()) as WebManifest

  expect(manifest).toMatchObject({
    name: 'Callone',
    short_name: 'Callone',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f7f4',
    theme_color: '#f8f7f4',
  })
  expect(manifest.description).not.toBe('')
  expect(manifest.shortcuts).toEqual([expect.objectContaining({ name: 'Chia tiền', url: '/bill-split' })])

  // Phải có đủ 192, 512 và 512 maskable.
  const declared = manifest.icons.map((icon) => `${icon.sizes}${icon.purpose ? ` ${icon.purpose}` : ''}`).sort()
  expect(declared).toEqual(['192x192', '512x512', '512x512 maskable'])

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src)
    expect(iconResponse.ok(), `${icon.src} phải tải được`).toBe(true)
    expect(iconResponse.headers()['content-type']).toBe(icon.type)
    const size = pngSize(await iconResponse.body())
    expect(`${size?.width}x${size?.height}`, `${icon.src} phải đúng kích thước khai báo`).toBe(icon.sizes)
  }
})

test('service worker kích hoạt, điều khiển trang và precache đủ khung app, font, icon', async ({ page, request }) => {
  await page.goto('/')
  await reloadUnderServiceWorker(page)

  const precached = await page.evaluate(async () => {
    const names = await caches.keys()
    const name = names.find((candidate) => candidate.includes('precache'))
    if (!name) return null
    const cache = await caches.open(name)
    // Workbox gắn ?__WB_REVISION__ vào khóa cache, chỉ so phần đường dẫn.
    return (await cache.keys()).map((entry) => new URL(entry.url).pathname)
  })
  expect(precached, 'không thấy cache precache').not.toBeNull()
  expect(precached).toEqual(
    expect.arrayContaining([
      '/index.html',
      '/favicon.svg',
      '/apple-touch-icon.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
    ]),
  )

  // Mọi font woff2 mà CSS của app tham chiếu đều phải nằm trong precache.
  const cssHref = await page.locator('link[rel="stylesheet"]').first().getAttribute('href')
  expect(cssHref).not.toBeNull()
  const cssUrl = new URL(cssHref ?? '', page.url())
  const css = await (await request.get(cssUrl.href)).text()
  const fonts = [...css.matchAll(/url\(\s*["']?([^)"']+\.woff2)["']?\s*\)/g)].map((match) =>
    new URL(match[1] ?? '', cssUrl).pathname,
  )
  expect(fonts.length, 'CSS phải tham chiếu font woff2').toBeGreaterThan(0)
  for (const font of fonts) expect(precached, `${font} phải được precache`).toContain(font)

  // Dữ liệu (Supabase) không bao giờ đi qua cache của service worker: sw.js chỉ có precache và NavigationRoute,
  // không có chiến lược cache lúc chạy nào. Có runtimeCaching mới thì cân nhắc kỹ trước khi sửa dòng này.
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).not.toMatch(/NetworkFirst|CacheFirst|StaleWhileRevalidate|NetworkOnly|CacheOnly/)
  expect(sw).not.toContain('supabase')
})

test('khung app mở được khi mất mạng, trang lazy-load lấy từ precache', async ({ page, context }) => {
  await page.goto('/')
  await reloadUnderServiceWorker(page)

  await context.setOffline(true)

  const fromServiceWorker: boolean[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/')) fromServiceWorker.push(response.fromServiceWorker())
  })

  // Tải lại ở trang chủ: tài liệu và mã đều do service worker trả.
  const reloaded = await page.reload()
  expect(reloaded?.fromServiceWorker(), 'trang phải do service worker trả khi mất mạng').toBe(true)
  await expect(page.locator('a[href="/bill-split"]').first()).toBeVisible()

  // Vào thẳng một đường dẫn khác của app: service worker trả khung app, router dựng trang, chunk lazy lấy từ precache.
  await page.goto('/bill-split')
  await expect(page.getByRole('heading', { name: 'Chia tiền' })).toBeVisible()

  expect(fromServiceWorker.length, 'phải có tải file trong /assets').toBeGreaterThan(0)
  expect(fromServiceWorker.every(Boolean), 'mọi file trong /assets phải do service worker trả').toBe(true)
})

test('header bảo mật đúng và không có vi phạm CSP ở trang chủ và Chia tiền', async ({ page }) => {
  const problems: string[] = []
  await page.exposeFunction('reportCspViolation', (detail: string) => {
    problems.push(`securitypolicyviolation: ${detail}`)
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportCspViolation(detail: string): void }).reportCspViolation
      report(`${event.effectiveDirective} chặn ${event.blockedURI} (${event.sourceFile}:${event.lineNumber})`)
    })
  })
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(`console: ${message.text()}`)
  })

  for (const path of ['/', '/bill-split']) {
    const response = await page.goto(path)
    const headers = response?.headers() ?? {}

    expect(headers['referrer-policy'], 'link nhóm chứa token bí mật, không được lộ qua Referer').toBe('no-referrer')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['permissions-policy']).toContain('camera=()')

    const csp = parseCsp(headers['content-security-policy'] ?? '')
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('script-src'), 'script chỉ được từ chính app, không inline, không eval').toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])
    const connectSrc = csp.get('connect-src') ?? []
    expect(connectSrc).toContain("'self'")
    // Chỉ đúng project Supabase đang dùng, không mở cho mọi *.supabase.co.
    expect(connectSrc.some((source) => /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(source))).toBe(true)
    expect(connectSrc.some((source) => source.includes('*'))).toBe(false)

    // Service worker đăng ký và kích hoạt dưới đúng CSP này (worker-src 'self').
    await waitForActiveServiceWorker(page)
  }

  expect(problems).toEqual([])
})
