import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * E2E chạy trên bản build (mode e2e), không phải dev server, để thử đúng thứ sẽ deploy.
 * Dùng Edge có sẵn trên Windows (channel msedge), không cần tải trình duyệt.
 * Test cần Supabase local (npm run db:start) và .env.local; mode e2e đọc cả .env.e2e.local nếu có.
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
  },
  webServer: {
    command: `npm run build -- --mode e2e && npx vite preview --port ${PORT} --strictPort`,
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
