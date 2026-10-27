import type { ComponentProps, ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { AppLink } from '@/shared/ui/AppLink'

/** Khung nhóm các dòng: thẻ bo góc, viền mảnh, các dòng ngăn bằng đường kẻ mảnh. */
export function ListGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="list"
      className={cn('divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs', className)}
      {...props}
    />
  )
}

export interface ListRowProps {
  /** Avatar hoặc icon bên trái. */
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Bên phải, dòng trên: thường là số tiền. */
  trailing?: ReactNode
  /** Bên phải, dòng dưới: chú thích nhỏ. */
  trailingSub?: ReactNode
  /** Có href thì dòng là liên kết. */
  href?: string
  /** Có onClick thì dòng là nút. */
  onClick?: () => void
  /** Mũi tên ở cuối, báo dòng bấm được để vào trang con. */
  chevron?: boolean
  /** Cho tiêu đề xuống tối đa 2 dòng thay vì cắt bằng dấu ba chấm. */
  wrapTitle?: boolean
  selected?: boolean
  disabled?: boolean
  className?: string
}

const ROW =
  'flex w-full min-h-14 items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-150'
const INTERACTIVE =
  'hover:bg-accent/60 active:bg-accent focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40'

/**
 * Một dòng trong ListGroup: leading, tiêu đề + phụ đề, rồi phần bên phải. Tự chọn thẻ a, button hoặc div.
 * Dòng bấm được là một `<div role="listitem">` bọc liên kết hoặc nút: role listitem không đè lên thẻ a hay button,
 * nên trình đọc màn hình vẫn đọc đó là liên kết hoặc nút, và getByRole('link') hay getByRole('button') tìm thấy dòng.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  href,
  onClick,
  chevron,
  wrapTitle,
  selected,
  disabled,
  className,
}: ListRowProps) {
  const interactive = Boolean(href || onClick) && !disabled
  const classes = cn(ROW, interactive && INTERACTIVE, selected && 'bg-primary-soft/60', disabled && 'opacity-60', className)

  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-body leading-snug font-medium', wrapTitle ? 'line-clamp-2' : 'truncate')}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-small text-muted-foreground">{subtitle}</span>}
      </span>
      {(trailing || trailingSub) && (
        <span className="flex shrink-0 flex-col items-end text-right">
          {trailing && <span className="text-body leading-snug">{trailing}</span>}
          {trailingSub && <span className="mt-0.5 text-small text-muted-foreground">{trailingSub}</span>}
        </span>
      )}
      {chevron && <ChevronRightIcon className="-mr-1 size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
    </>
  )

  if (href && !disabled) {
    return (
      <div role="listitem">
        <AppLink href={href} className={classes}>
          {content}
        </AppLink>
      </div>
    )
  }
  if (onClick && !disabled) {
    return (
      <div role="listitem">
        <button type="button" onClick={onClick} className={classes}>
          {content}
        </button>
      </div>
    )
  }
  return (
    <div role="listitem" className={classes}>
      {content}
    </div>
  )
}
