import { MoneyText } from '@/shared/ui/MoneyText'

export interface SpendingSummaryProps {
  /** Tổng chi của cả nhóm. */
  total: number
  expenseCount: number
  /** Tổng mình đã trả. Bỏ trống khi chưa biết mình là ai. */
  myPaid?: number | null
  /** Tổng phần mình phải chịu. */
  myShare?: number | null
}

/** Thẻ tổng quan ở đầu tab Chi tiêu: tổng chi của nhóm và, nếu biết mình là ai, phần của mình. */
export function SpendingSummary({ total, expenseCount, myPaid, myShare }: SpendingSummaryProps) {
  const showMine = myPaid != null && myShare != null
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <p className="text-small text-muted-foreground">
        Tổng chi · <span className="tnum">{expenseCount}</span> khoản
      </p>
      <p className="mt-1">
        <MoneyText amount={total} size="display" weight="semibold" className="tracking-tight" />
      </p>
      {showMine && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3.5">
          <div>
            <dt className="text-small text-muted-foreground">Bạn đã trả</dt>
            <dd className="mt-0.5">
              <MoneyText amount={myPaid} size="md" weight="semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">Phần của bạn</dt>
            <dd className="mt-0.5">
              <MoneyText amount={myShare} size="md" weight="semibold" />
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}
