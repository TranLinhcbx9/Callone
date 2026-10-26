import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * Thân trang: canh giữa theo cột chính (44rem), lề 16px (24px từ md).
 * Header dính (PageHeader) tự tràn hết bề ngang nên đặt NGOÀI PageBody, ngay phía trên.
 * padBottom: chừa chỗ cuối trang khi có FloatingAction hoặc BottomBar cố định, để không che dòng cuối.
 */
export function PageBody({
  className,
  padBottom,
  ...props
}: ComponentProps<'div'> & { padBottom?: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-(--app-column) px-4 py-5 md:px-6',
        padBottom ? 'pb-32' : 'pb-10',
        className,
      )}
      {...props}
    />
  )
}
