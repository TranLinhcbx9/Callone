import type { ComponentType } from 'react'
import { AppLink } from '@/shared/ui/AppLink'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'

export interface ModuleTileProps {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  /** Đường dẫn vào module. Bỏ qua khi `soon`. */
  href: string
  /** Module chưa sẵn sàng: hiện mờ, nhãn "Sắp có", không bấm được. */
  soon?: boolean
}

/** Ô module trên trang chủ: icon trong ô nhạt, tên, một đoạn mô tả ngắn. */
export function ModuleTile({ title, description, icon: Icon, href, soon }: ModuleTileProps) {
  const body = (
    <>
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl',
          soon ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary-soft-foreground',
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="block">
        <span className="block text-body leading-snug font-semibold">{title}</span>
        <span className="mt-1 line-clamp-3 block text-small text-muted-foreground">{description}</span>
      </span>
      {soon && (
        <Badge variant="secondary" className="absolute top-3 right-3">
          Sắp có
        </Badge>
      )}
    </>
  )
  const base = 'relative flex min-h-36 w-full flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs'

  if (soon) {
    return (
      <div aria-disabled="true" className={cn(base, 'opacity-75')}>
        {body}
      </div>
    )
  }
  return (
    <AppLink
      href={href}
      className={cn(
        base,
        'transition-[box-shadow,transform,border-color] duration-200 ease-soft outline-none hover:-translate-y-px hover:border-input hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/30 active:translate-y-0 active:scale-[0.99]',
      )}
    >
      {body}
    </AppLink>
  )
}
