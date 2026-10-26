import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export interface SectionProps {
  title: ReactNode
  /** Số lượng, hiện nhỏ cạnh tiêu đề. */
  count?: number
  description?: ReactNode
  /** Nút hoặc liên kết nhỏ ở bên phải tiêu đề. */
  action?: ReactNode
  children?: ReactNode
  className?: string
}

/** Một khối của trang: tiêu đề nhỏ màu phụ (không viết hoa), tùy chọn số lượng và hành động, rồi nội dung. */
export function Section({ title, count, description, action, children, className }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="flex items-baseline gap-1.5 text-small font-medium text-muted-foreground">
            <span>{title}</span>
            {count !== undefined && <span className="tnum text-caption text-muted-foreground/80">{count}</span>}
          </h2>
          {description && <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
