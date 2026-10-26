import { BrandMark } from '@/app/layout/BrandMark'
import { Spinner } from '@/shared/ui/Spinner'

/**
 * Màn hình chờ toàn trang: logo và vòng xoay ở giữa. Dùng làm `HydrateFallback` của router
 * hoặc fallback khi một trang lazy-load đang tải chunk.
 */
export function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
      <BrandMark className="size-12" />
      <span className="flex items-center gap-2 text-small">
        <Spinner />
        Đang tải…
      </span>
    </div>
  )
}
