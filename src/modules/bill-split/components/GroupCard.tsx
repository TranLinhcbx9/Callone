import { ChevronRightIcon } from 'lucide-react'
import { GroupMark } from '@/modules/bill-split/components/GroupMark'
import type { GroupSummary } from '@/modules/bill-split/domain/types'
import { addDaysIso, formatIsoDate, relativeDayLabel, todayIsoDate } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { AppLink } from '@/shared/ui/AppLink'
import { MoneyText } from '@/shared/ui/MoneyText'
import { Skeleton } from '@/shared/ui/skeleton'

/** "Hôm nay", "Hôm qua", "3 ngày trước" hoặc "14/09", tính theo ngày giờ Việt Nam. */
function updatedLabel(updatedAt: string, today: string): string {
  const day = todayIsoDate(new Date(updatedAt))
  const relative = relativeDayLabel(day, today)
  if (relative) return relative
  for (let ago = 2; ago <= 6; ago++) {
    if (day === addDaysIso(today, -ago)) return `${ago} ngày trước`
  }
  return formatIsoDate(day, 'short')
}

export interface GroupCardProps {
  group: GroupSummary
  /** Đường dẫn mở nhóm. Có href thì thẻ là liên kết. */
  href?: string
  /** Hoặc xử lý khi bấm thẻ. */
  onClick?: () => void
  /** Ngày hôm nay YYYY-MM-DD, mặc định lấy từ đồng hồ. Truyền vào để ảnh chụp ổn định. */
  today?: string
}

const CARD =
  'flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left shadow-xs transition-[box-shadow,border-color,background-color] duration-150 outline-none hover:border-input hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-accent/50'

/** Thẻ một nhóm: ô chữ cái, tên, số người và số khoản chi, tổng chi và lần cập nhật cuối. */
export function GroupCard({ group, href, onClick, today = todayIsoDate() }: GroupCardProps) {
  const content = (
    <>
      <GroupMark name={group.name} id={group.id} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body leading-snug font-semibold">{group.name}</span>
        <span className="mt-0.5 block truncate text-small text-muted-foreground">
          {group.memberCount} người · {group.expenseCount} khoản<span className="max-[379px]:hidden"> chi</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <MoneyText amount={group.totalSpent} weight="semibold" />
        <span className="mt-0.5 text-small text-muted-foreground">{updatedLabel(group.updatedAt, today)}</span>
      </span>
      {/* Màn hình hẹp (360px) nhường chỗ cho dòng "N người · M khoản" khỏi bị cắt khi số tiền dài. */}
      <ChevronRightIcon className="-mr-1 size-4 shrink-0 text-muted-foreground/60 max-[379px]:hidden" aria-hidden="true" />
    </>
  )
  if (href) {
    return (
      <AppLink href={href} className={CARD}>
        {content}
      </AppLink>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cn(CARD, 'cursor-pointer')}>
      {content}
    </button>
  )
}

export interface GroupListProps {
  groups: readonly GroupSummary[]
  /** Trả về đường dẫn mở nhóm. */
  getHref?: (group: GroupSummary) => string
  onSelect?: (group: GroupSummary) => void
  today?: string
}

/** Danh sách thẻ nhóm, thưa thoáng. Sắp xếp do nơi gọi quyết định (thường mới cập nhật nhất lên đầu). */
export function GroupList({ groups, getHref, onSelect, today }: GroupListProps) {
  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map((group) => (
        <li key={group.id}>
          <GroupCard
            group={group}
            href={getHref?.(group)}
            onClick={onSelect ? () => onSelect(group) : undefined}
            today={today}
          />
        </li>
      ))}
    </ul>
  )
}

/** Khung xương của một thẻ nhóm, cùng chiều cao với GroupCard để danh sách không nhảy khi dữ liệu về. */
export function GroupCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-xs"
    >
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3.5 w-12" />
      </div>
    </div>
  )
}
