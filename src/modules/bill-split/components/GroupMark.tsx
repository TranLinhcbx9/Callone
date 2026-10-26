import type { CSSProperties } from 'react'
import { avatarHue } from '@/shared/ui/avatarUtils'
import { cn } from '@/shared/lib/utils'

const SIZES = { md: 'size-11 text-title', lg: 'size-14 text-headline' } as const

/** Ô vuông bo góc chứa chữ cái đầu của tên nhóm, màu ổn định theo id. Phân biệt với avatar tròn của người. */
export function GroupMark({
  name,
  id,
  size = 'md',
  className,
}: {
  name: string
  id: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const first = Array.from(name.normalize('NFC').trim())[0] ?? '?'
  return (
    <span
      aria-hidden="true"
      style={{ '--avatar-hue': avatarHue(id) } as CSSProperties}
      className={cn(
        'avatar-tone inline-flex shrink-0 items-center justify-center rounded-xl font-semibold select-none',
        SIZES[size],
        className,
      )}
    >
      {first.toLocaleUpperCase('vi-VN')}
    </span>
  )
}
