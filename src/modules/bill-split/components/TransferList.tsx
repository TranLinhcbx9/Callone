import { CheckIcon, QrCodeIcon } from 'lucide-react'
import type { Member, Transfer } from '@/modules/bill-split/domain/types'
import { cn } from '@/shared/lib/utils'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyText } from '@/shared/ui/MoneyText'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'

export interface TransferListProps {
  /** Gợi ý chuyển khoản ít giao dịch nhất, do domain tính. */
  transfers: readonly Transfer[]
  members: readonly Member[]
  meId?: string | null
  /** Mở hộp mã QR. Nút bị khóa khi người nhận chưa có tài khoản ngân hàng. */
  onShowQr?: (transfer: Transfer) => void
  /** Ghi nhận đã trả. */
  onMarkPaid?: (transfer: Transfer) => void
  /** Mở form thành viên để người nhận nhập tài khoản. */
  onEditMember?: (member: Member) => void
  /** Giao dịch đang được lưu, dạng `${fromMemberId}:${toMemberId}`. */
  busyKey?: string | null
}

/** Gợi ý chuyển khoản: mỗi giao dịch là một thẻ có hai nút "Mã QR" và "Đã trả". Giao dịch của mình được tô nhẹ. */
export function TransferList({ transfers, members, meId, onShowQr, onMarkPaid, onEditMember, busyKey }: TransferListProps) {
  const byId = new Map(members.map((member) => [member.id, member]))

  return (
    <ul className="flex flex-col gap-2.5">
      {transfers.map((transfer) => {
        const key = `${transfer.fromMemberId}:${transfer.toMemberId}`
        const from = byId.get(transfer.fromMemberId)
        const to = byId.get(transfer.toMemberId)
        const iPay = transfer.fromMemberId === meId
        const iReceive = transfer.toMemberId === meId
        const fromLabel = iPay ? 'Bạn' : (from?.name ?? '?')
        const toLabel = iReceive ? 'bạn' : (to?.name ?? '?')
        const hasBank = Boolean(to?.bank)
        const busy = busyKey === key
        return (
          <li
            key={key}
            className={cn(
              'rounded-xl border p-4 shadow-xs',
              iPay ? 'border-primary/25 bg-primary-soft/40' : 'border-border bg-card',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex shrink-0 -space-x-2">
                <MemberAvatar name={from?.name ?? '?'} colorKey={transfer.fromMemberId} ring />
                <MemberAvatar name={to?.name ?? '?'} colorKey={transfer.toMemberId} ring />
              </span>
              <p className="min-w-0 flex-1 truncate text-body leading-snug font-medium">
                {fromLabel} chuyển cho {toLabel}
              </p>
              <MoneyText amount={transfer.amount} weight="semibold" />
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <Button
                variant={iPay && hasBank ? 'default' : 'outline'}
                disabled={!hasBank || busy}
                onClick={() => onShowQr?.(transfer)}
              >
                <QrCodeIcon />
                Mã QR
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => onMarkPaid?.(transfer)}>
                {busy ? <Spinner /> : <CheckIcon />}
                Đã trả
              </Button>
            </div>
            {!hasBank && to && (
              <p className="mt-2.5 text-small text-muted-foreground">
                {to.name} chưa nhập tài khoản ngân hàng.{' '}
                {onEditMember && (
                  <button
                    type="button"
                    onClick={() => onEditMember(to)}
                    className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    Nhập ngay
                  </button>
                )}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
