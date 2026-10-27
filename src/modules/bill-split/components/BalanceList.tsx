import { CheckCircle2Icon } from 'lucide-react'
import type { Member, MemberBalance } from '@/modules/bill-split/domain/types'
import { formatVnd } from '@/shared/lib/format'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ListGroup } from '@/shared/ui/ListRow'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyText } from '@/shared/ui/MoneyText'
import { Badge } from '@/shared/ui/badge'
import { Notice } from '@/shared/ui/Notice'

export interface BalanceListProps {
  members: readonly Member[]
  balances: readonly MemberBalance[]
  meId?: string | null
}

/**
 * Số dư từng người, người được nhận nhiều nhất lên đầu.
 * Dương (xanh lá dịu) là được nhận lại, âm (nâu đỏ dịu) là còn nợ, 0 là đã cân bằng.
 */
export function BalanceList({ members, balances, meId }: BalanceListProps) {
  const byId = new Map(members.map((member) => [member.id, member]))
  const rows = [...balances].sort((a, b) => b.net - a.net)
  const settled = rows.every((row) => row.net === 0)

  // Nhóm không còn ai (xóa hết thành viên) thì không có gì để tính, chỉ nhắc thêm người.
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-xs">
        <EmptyState
          compact
          title="Chưa có thành viên nào"
          description="Thêm người ở tab Thành viên để bắt đầu tính số dư."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {settled && (
        <Notice tone="positive" icon={false}>
          <span className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4 shrink-0" />
            Mọi người đã cân bằng, không ai nợ ai.
          </span>
        </Notice>
      )}
      <ListGroup>
        {rows.map((row) => {
          const member = byId.get(row.memberId)
          const name = member?.name ?? '?'
          return (
            <div key={row.memberId} role="listitem" className="flex items-center gap-3 px-4 py-3.5">
              <MemberAvatar name={name} colorKey={row.memberId} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-body leading-snug font-medium">{name}</span>
                  {row.memberId === meId && <Badge variant="soft">Bạn</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-small text-muted-foreground">
                  <span className="tnum">Đã trả {formatVnd(row.paid)}</span>
                  <span className="tnum">Phần chịu {formatVnd(row.share)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end text-right">
                {row.net === 0 ? (
                  <span className="text-small text-muted-foreground">Đã cân bằng</span>
                ) : (
                  <>
                    <MoneyText amount={row.net} sign="always" tone="auto" weight="semibold" />
                    <span className="mt-0.5 text-caption text-muted-foreground">
                      {row.net > 0 ? 'được nhận lại' : 'còn nợ'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </ListGroup>
    </div>
  )
}
