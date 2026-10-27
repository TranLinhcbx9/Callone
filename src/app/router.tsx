import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLoading } from '@/app/layout/AppLoading'
import { ModuleGate } from '@/app/ModuleGate'
import { RouteError } from '@/app/pages/RouteError'
import { modules } from '@/app/registry'
import { installPreloadErrorHandler } from '@/app/preloadError'
import { RootLayout } from '@/app/RootLayout'

const moduleRoutes: RouteObject[] = modules.map((module) => ({
  path: module.basePath,
  element: <ModuleGate module={module} />,
  errorElement: <RouteError />,
  children: module.routes,
}))

// Trang /dev chỉ có khi chạy dev, bản build production không chứa.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/*', lazy: () => import('@/app/dev/DevApp').then((m) => ({ Component: m.DevApp })) }]
  : []

// Phải gắn trước khi router bắt đầu tải trang: sau deploy mới, chunk cũ không còn và Vite báo qua vite:preloadError.
installPreloadErrorHandler()

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Chờ tải trang đầu tiên (route lazy) thì hiện màn hình chờ thay vì cảnh báo thiếu HydrateFallback.
    HydrateFallback: AppLoading,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('@/app/pages/HomePage').then((m) => ({ Component: m.HomePage })) },
      ...moduleRoutes,
      ...devRoutes,
      { path: '*', lazy: () => import('@/app/pages/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })) },
    ],
  },
])
