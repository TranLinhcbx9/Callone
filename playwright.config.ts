import { defineConfig, devices } from '@playwright/test'

/**
 * Cấu hình tạm. Agent frontend hoàn thiện: build --mode e2e rồi chạy preview làm web server.
 * Dùng Edge có sẵn trên Windows (channel msedge), không cần tải trình duyệt.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
})
