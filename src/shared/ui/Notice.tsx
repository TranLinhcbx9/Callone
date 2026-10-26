import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, OctagonAlertIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const noticeVariants = cva('flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-small leading-snug', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      info: 'bg-primary-soft text-primary-soft-foreground',
      positive: 'bg-positive-soft text-positive',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

const ICONS = {
  neutral: InfoIcon,
  info: InfoIcon,
  positive: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  danger: OctagonAlertIcon,
} as const

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  children: ReactNode
  /** Nút nhỏ ở cuối dòng. */
  action?: ReactNode
  /** false: ẩn icon. */
  icon?: boolean
  className?: string
}

/** Dải thông báo nhỏ, nền nhạt cùng tông với chữ. Dùng cho "Còn thiếu 50.000 ₫", lỗi biểu mẫu, ghi chú. */
export function Notice({ tone = 'neutral', children, action, icon = true, className }: NoticeProps) {
  const Icon = ICONS[tone ?? 'neutral']
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn(noticeVariants({ tone }), className)}>
      {icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
