import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Bản build dành riêng cho e2e: một lần `npm run build` khác (vào dist) không thể thay file khi test đang chạy.
const OUT_DIR = 'dist-e2e'

/**
 * E2E chạy trên bản build (mode e2e), không phải dev server, để thử đúng thứ sẽ deploy.
 * Dùng Edge có sẵn trên Windows (channel msedge), không cần tải trình duyệt.
 * Test cần Supabase local (npm run db:start) và .env.local; mode e2e đọc cả .env.e2e.local nếu có.
 * Preview áp các header trong vercel.json (CSP, Referrer-Policy...) nên test chạy dưới đúng chính sách sẽ deploy.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    // Service worker chặn Playwright mock hay chặn request (stale-chunk.spec dựa vào page.route). Chỉ pwa.spec bật lại.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run build -- --mode e2e --outDir ${OUT_DIR} && npx vite preview --mode e2e --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Không dùng lại server đang chạy, vì có thể đang phục vụ một bản build cũ.
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
})
