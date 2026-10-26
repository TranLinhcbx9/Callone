import type { ReactNode } from 'react'
import { ReceiptIcon } from 'lucide-react'
import type { Expense, Member } from '@/modules/bill-split/domain/types'
import { formatIsoDate, relativeDayLabel, todayIsoDate } from '@/shared/lib/date'
import { formatVnd } from '@/shared/lib/format'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ListGroup, ListRow } from '@/shared/ui/ListRow'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyText } from '@/shared/ui/MoneyText'

/** "Hôm nay" + "26/10", hoặc "Thứ Bảy" + "24/10" (thêm năm nếu khác năm nay). */
function dayHeading(iso: string, today: string): { primary: string; secondary: string } {
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  const secondary = sameYear ? formatIsoDate(iso, 'short') : formatIsoDate(iso, 'medium')
  const relative = relativeDayLabel(iso, today)
  if (relative) return { primary: relative, secondary }
  const weekday = formatIsoDate(iso, 'long').split(',')[0] ?? secondary
  return { primary: weekday, secondary }
}

function splitText(expense: Expense, memberCount: number): string {
  if (expense.splitMode === 'exact') return 'chia riêng'
  const people = expense.shares.length
  return people >= memberCount ? 'chia đều' : `chia đều ${people}/${memberCount}`
}

export interface ExpenseListProps {
  /** Đã sắp mới nhất trước (đúng thứ tự server trả về). */
  expenses: readonly Expense[]
  members: readonly Member[]
  /** Có meId thì mỗi dòng hiện phần của mình. */
  meId?: string | null
  /** Ngày hôm nay YYYY-MM-DD, mặc định lấy từ đồng hồ. */
  today?: string
  getHref?: (expense: Expense) => string
  onSelect?: (expense: Expense) => void
  /** Nút trong trạng thái trống, ví dụ "Thêm khoản chi". */
  emptyAction?: ReactNode
}

/** Danh sách khoản chi gom theo ngày: người trả, tiêu đề, cách chia, số tiền và phần của mình. */
export function ExpenseList({ expenses, members, meId, today = todayIsoDate(), getHref, onSelect, emptyAction }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptIcon />}
        title="Chưa có khoản chi nào"
        description="Thêm khoản chi đầu tiên để bắt đầu chia tiền."
        action={emptyAction}
      />
    )
  }

  const byId = new Map(members.map((member) => [member.id, member]))
  const days: { date: string; items: Expense[] }[] = []
  for (const expense of expenses) {
    const last = days[days.length - 1]
    if (last && last.date === expense.spentOn) last.items.push(expense)
    else days.push({ date: expense.spentOn, items: [expense] })
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        const heading = dayHeading(day.date, today)
        const total = day.items.reduce((sum, item) => sum + item.amount, 0)
        return (
          <section key={day.date} aria-label={`${heading.primary} ${heading.secondary}`} className="flex flex-col gap-2">
            <h3 className="flex items-baseline justify-between gap-3 px-1 text-small">
              <span className="font-medium text-foreground">
                {heading.primary} <span className="tnum font-normal text-muted-foreground">· {heading.secondary}</span>
              </span>
              <span className="tnum text-muted-foreground">{formatVnd(total)}</span>
            </h3>
            <ListGroup>
              {day.items.map((expense) => {
                const payer = byId.get(expense.paidBy)
                const mine = meId ? expense.shares.find((share) => share.memberId === meId)?.amount : undefined
                return (
                  <ListRow
                    key={expense.id}
                    leading={<MemberAvatar name={payer?.name ?? '?'} colorKey={expense.paidBy} />}
                    title={expense.title}
                    wrapTitle
                    subtitle={`${payer?.name ?? 'Ai đó'} trả · ${splitText(expense, members.length)}`}
                    trailing={<MoneyText amount={expense.amount} weight="semibold" />}
                    trailingSub={
                      meId ? (mine !== undefined ? `Phần bạn ${formatVnd(mine)}` : 'Bạn không tham gia') : undefined
                    }
                    href={getHref?.(expense)}
                    onClick={onSelect ? () => onSelect(expense) : undefined}
                  />
                )
              })}
            </ListGroup>
          </section>
        )
      })}
    </div>
  )
}
