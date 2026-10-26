import type { ReactNode } from 'react'
import { SearchXIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

export interface EmptyStateProps {
  /** Phần tử icon lucide, ví dụ <WalletIcon />. */
  icon?: ReactNode
  title: string
  description?: ReactNode
  /** Nút chính (một nút). */
  action?: ReactNode
  /** Nút phụ, đặt dưới nút chính. */
  secondaryAction?: ReactNode
  /** Gọn hơn, dùng trong một thẻ hay một tab. */
  compact?: boolean
  className?: string
}

/** Trạng thái trống: icon trong vòng tròn nhạt, tiêu đề, một dòng mô tả và tối đa hai nút. */
export function EmptyState({ icon, title, description, action, secondaryAction, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-1 px-4 py-8' : 'gap-1.5 px-6 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-2 flex items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6',
            compact ? 'size-11' : 'size-14',
          )}
        >
          {icon}
        </div>
      )}
      <h2 className="text-body font-semibold">{title}</h2>
      {description && <p className="max-w-xs text-small text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  description?: ReactNode
  icon?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Nút khác, ví dụ "Về trang chủ". */
  action?: ReactNode
  className?: string
}

/** Trạng thái lỗi: giọng nhẹ nhàng, nói rõ chuyện gì xảy ra và làm gì tiếp. */
export function ErrorState({
  title = 'Có lỗi xảy ra',
  description,
  icon = <SearchXIcon />,
  onRetry,
  retryLabel = 'Thử lại',
  action,
  className,
}: ErrorStateProps) {
  return (
    <EmptyState
      className={className}
      icon={icon}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
      secondaryAction={action}
    />
  )
}
