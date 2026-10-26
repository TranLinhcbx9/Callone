import { cn } from '@/shared/lib/utils'

/**
 * Logo Callone: chữ C mở bằng một nét tròn, và một chấm ở miệng chữ C (the one).
 * Khớp với public/favicon.svg. `tile` vẽ thêm nền bo góc màu nhấn; tắt đi thì chỉ còn nét, tô theo màu chữ hiện tại.
 */
export function BrandMark({ className, tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Callone"
      className={cn('size-8 shrink-0', className)}
      fill="none"
    >
      {tile && <rect width="64" height="64" rx="16" className="fill-primary" />}
      <path
        d="M43.15 21.96A15 15 0 1 0 43.15 42.04"
        strokeWidth="6.5"
        strokeLinecap="round"
        className={tile ? 'stroke-primary-foreground' : 'stroke-current'}
      />
      <circle cx="47" cy="32" r="3.6" className={tile ? 'fill-primary-foreground' : 'fill-current'} />
    </svg>
  )
}
