import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

interface VercelHeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

/**
 * Header áp cho mọi đường dẫn (mục source "/(.*)" trong vercel.json). vercel.json là nguồn duy nhất:
 * `vite preview` dùng đúng các header này nên e2e chạy dưới đúng CSP sẽ deploy.
 */
function readGlobalHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers?: VercelHeaderRule[]
  }
  const rule = config.headers?.find((item) => item.source === '/(.*)')
  if (!rule) throw new Error('vercel.json thiếu mục headers có source "/(.*)"')
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]))
}

/** Chỉ cho preview: thêm origin của Supabase đang dùng (ví dụ http://127.0.0.1:54321) vào connect-src. */
function allowSupabaseOrigin(csp: string, supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return csp
  let origin: string
  try {
    origin = new URL(supabaseUrl).origin
  } catch {
    return csp
  }
  return csp.replace(/connect-src[^;]*/, (directive) =>
    directive.split(' ').includes(origin) ? directive : `${directive} ${origin}`,
  )
}

function previewHeaders(supabaseUrl: string | undefined): Record<string, string> {
  const headers = readGlobalHeaders()
  const csp = headers['Content-Security-Policy']
  if (csp) headers['Content-Security-Policy'] = allowSupabaseOrigin(csp, supabaseUrl)
  return headers
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, 'VITE_')

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt': bản mới chỉ được áp khi người dùng bấm "Cập nhật" (xem src/app/pwa.ts).
        // Tự tải lại có thể làm mất khoản chi đang nhập dở.
        registerType: 'prompt',
        // Đăng ký service worker bằng virtual:pwa-register trong src/app/pwa.ts, không chèn registerSW.js.
        injectRegister: false,
        // Icon đã nằm trong globPatterns bên dưới, không cần plugin thêm lần nữa (tránh mục precache trùng).
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: 'Callone',
          short_name: 'Callone',
          description: 'Callone: super app cá nhân, chia tiền đi chơi và hơn thế nữa.',
          lang: 'vi',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f8f7f4',
          theme_color: '#f8f7f4',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'Chia tiền',
              short_name: 'Chia tiền',
              url: '/bill-split',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          // Khung app chạy offline: trang, mã, kiểu, font tự host, icon. Supabase là cross-origin và không có
          // runtimeCaching nên mọi lời gọi dữ liệu luôn đi thẳng ra mạng.
          globPatterns: ['**/*.{html,js,css,woff2,svg,png}'],
          navigateFallback: 'index.html',
          // Đường dẫn có đuôi file là file thật, không phải trang của app (khớp luật rewrite trong vercel.json).
          navigateFallbackDenylist: [/^[^?]*\/[^/?]*\.[^/?]+(\?.*)?$/],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    preview: {
      headers: previewHeaders(env.VITE_SUPABASE_URL),
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
  }
})
