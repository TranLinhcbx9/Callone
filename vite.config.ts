import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.int.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        // Chạy với Supabase local: npm run test:int
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.{ts,tsx}'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
    ],
  },
})
