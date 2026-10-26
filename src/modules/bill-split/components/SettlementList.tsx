import { CheckIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react'
import type { Member, Settlement } from '@/modules/bill-split/domain/types'
import { formatIsoDate, relativeDayLabel, todayIsoDate } from '@/shared/lib/date'
import { ListGroup } from '@/shared/ui/ListRow'
import { MoneyText } from '@/shared/ui/MoneyText'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

export interface SettlementListProps {
  /** Mới nhất trước. */
  settlements: readonly Settlement[]
  members: readonly Member[]
  meId?: string | null
  today?: string
  /** Xóa một lần trả (nên có toast "Hoàn tác"). Không truyền thì ẩn menu. */
  onDelete?: (settlement: Settlement) => void
}

/** Lịch sử các lần đã trả: "Mai đã trả Linh", ngày, ghi chú và số tiền. */
export function SettlementList({ settlements, members, meId, today = todayIsoDate(), onDelete }: SettlementListProps) {
  const byId = new Map(members.map((member) => [member.id, member]))
  const label = (id: string, capital: boolean) =>
    id === meId ? (capital ? 'Bạn' : 'bạn') : (byId.get(id)?.name ?? '?')

  return (
    <ListGroup>
      {settlements.map((settlement) => {
        const when = relativeDayLabel(settlement.settledOn, today) ?? formatIsoDate(settlement.settledOn, 'short')
        return (
          <div key={settlement.id} role="listitem" className="flex min-h-14 items-center gap-3 py-2.5 pr-2 pl-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
              <CheckIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body leading-snug font-medium">
                {label(settlement.fromMemberId, true)} đã trả {label(settlement.toMemberId, false)}
              </p>
              <p className="mt-0.5 truncate text-small text-muted-foreground">
                {when}
                {settlement.note ? ` · ${settlement.note}` : ''}
              </p>
            </div>
            <MoneyText amount={settlement.amount} weight="semibold" />
            {onDelete ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Tùy chọn lần trả này" className="text-muted-foreground">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(settlement)}>
                    <Trash2Icon />
                    Xóa lần trả này
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="w-2" />
            )}
          </div>
        )
      })}
    </ListGroup>
  )
}
