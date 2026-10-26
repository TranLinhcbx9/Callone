import { CheckIcon } from 'lucide-react'
import type { Member } from '@/modules/bill-split/domain/types'
import { cn } from '@/shared/lib/utils'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { Button } from '@/shared/ui/button'

export interface WhoAmIPickerProps {
  members: readonly Member[]
  /** Người đang được chọn (khi đổi lại). */
  value?: string | null
  onSelect: (memberId: string) => void
  /** Bấm "Để sau" khi chưa muốn chọn. Không truyền thì ẩn nút. */
  onSkip?: () => void
}

/**
 * Nội dung hộp thoại "Bạn là ai trong nhóm?". Đặt trong ResponsiveDialog với tiêu đề "Bạn là ai trong nhóm?"
 * và mô tả "Chọn tên của bạn để app hiện phần chi của riêng bạn."
 */
export function WhoAmIPicker({ members, value, onSelect, onSkip }: WhoAmIPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Bạn là ai trong nhóm?" className="flex flex-col gap-2">
        {members.map((member) => {
          const selected = member.id === value
          return (
            <button
              key={member.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(member.id)}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-[background-color,border-color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                selected ? 'border-primary/50 bg-primary-soft' : 'border-border bg-card hover:bg-accent/60 active:bg-accent',
              )}
            >
              <MemberAvatar name={member.name} colorKey={member.id} />
              <span className="min-w-0 flex-1 truncate text-body font-medium">{member.name}</span>
              {selected && <CheckIcon className="size-4 text-primary" />}
            </button>
          )
        })}
      </div>
      {onSkip && (
        <Button type="button" variant="ghost" className="mt-1 text-muted-foreground" onClick={onSkip}>
          Để sau
        </Button>
      )}
    </div>
  )
}
