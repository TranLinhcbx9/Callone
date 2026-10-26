import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * Thanh nút cố định ở chân màn hình, dùng cho nút chính của form toàn màn hình ("Lưu khoản chi", "Tạo nhóm").
 * Nền mờ, viền mảnh phía trên, chừa vùng an toàn của thanh home iPhone, canh theo cột nội dung.
 * Trang cần PageBody với padBottom để nội dung không bị che.
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-safe backdrop-blur-md supports-[backdrop-filter]:bg-background/80 lg:left-(--app-rail)',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-(--app-column) items-center gap-2 px-4 py-3 md:px-6">{children}</div>
    </div>
  )
}

/**
 * Nút nổi ở góc dưới bên phải cột nội dung, trong tầm ngón cái ("Thêm khoản chi").
 * Canh theo cột chính nên trên desktop không trôi ra mép màn hình. Trang cần PageBody với padBottom.
 */
export function FloatingAction({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-safe lg:left-(--app-rail)">
      <div className="mx-auto flex w-full max-w-(--app-column) justify-end px-4 pb-4 md:px-6">
        <div className={cn('pointer-events-auto', className)}>{children}</div>
      </div>
    </div>
  )
}
