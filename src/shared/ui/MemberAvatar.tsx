import type { CSSProperties } from 'react'
import { avatarHue, memberInitial } from '@/shared/ui/avatarUtils'
import { cn } from '@/shared/lib/utils'

const SIZES = {
  xs: 'size-5 text-[0.625rem]',
  sm: 'size-7 text-caption',
  md: 'size-9 text-small',
  lg: 'size-11 text-title',
  xl: 'size-14 text-headline',
} as const

export interface MemberAvatarProps {
  name: string
  /** Khóa để chọn màu. Mặc định dùng tên; nên truyền id thành viên để đổi tên không đổi màu. */
  colorKey?: string
  size?: keyof typeof SIZES
  /** Viền nền quanh avatar, dùng khi xếp chồng. */
  ring?: boolean
  className?: string
}

/** Avatar tròn chữ cái, màu pastel ổn định theo id. Chữ cái lấy từ từ cuối của tên. */
export function MemberAvatar({ name, colorKey, size = 'md', ring = false, className }: MemberAvatarProps) {
  const style = { '--avatar-hue': avatarHue(colorKey ?? name) } as CSSProperties
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'avatar-tone inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        ring && 'ring-2 ring-card',
        className,
      )}
    >
      {memberInitial(name)}
    </span>
  )
}
