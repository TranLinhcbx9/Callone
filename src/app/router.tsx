import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/app/layout/AppShell'
import { ModuleGate } from '@/app/ModuleGate'
import { RouteError } from '@/app/pages/RouteError'
import { modules } from '@/app/registry'
import { installPreloadErrorHandler } from '@/app/preloadError'

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
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('@/app/pages/HomePage').then((m) => ({ Component: m.HomePage })) },
      ...moduleRoutes,
      ...devRoutes,
      { path: '*', lazy: () => import('@/app/pages/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })) },
    ],
  },
])
