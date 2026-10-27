import { AlertCircleIcon } from 'lucide-react'
import type { ExpenseDraft, Member, SplitPreview } from '@/modules/bill-split/domain/types'
import { moneyErrorMessage } from '@/modules/bill-split/components/messages'
import { formatVnd } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ListGroup } from '@/shared/ui/ListRow'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Notice } from '@/shared/ui/Notice'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'

interface SplitSectionProps {
  members: readonly Member[]
  draft: ExpenseDraft
  preview: SplitPreview
  onChange: (patch: Partial<ExpenseDraft>) => void
  showIssues: boolean
}

/** Enter trong ô số tiền của một người: sang ô của người kế tiếp, hết danh sách thì thu bàn phím. */
function focusNextAmount(memberId: string, members: readonly Member[]) {
  const index = members.findIndex((member) => member.id === memberId)
  const next = members[index + 1]
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label^="Số tiền của"]'))
  const current = inputs[index]
  if (next && inputs[index + 1]) inputs[index + 1]?.focus()
  else current?.blur()
}

/** Tiến độ chia riêng: đã chia bao nhiêu trên tổng, còn thiếu hay chia lố. */
function ExactSummary({ preview }: { preview: SplitPreview }) {
  if (!preview.amount.ok) {
    return <Notice tone="neutral">Nhập số tiền ở trên trước, rồi chia riêng cho từng người.</Notice>
  }
  const total = preview.amount.value
  const percent = Math.max(0, Math.min(100, Math.round((preview.assigned / total) * 100)))
  const balanced = preview.remaining === 0
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-small text-muted-foreground">Đã chia</span>
        <span className="tnum text-body font-medium">
          {formatVnd(preview.assigned)} <span className="text-muted-foreground">/ {formatVnd(total)}</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-soft', balanced ? 'bg-positive/70' : 'bg-warning/60')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className={cn('mt-2.5 text-small font-medium', balanced ? 'text-positive' : 'text-warning')}>
        {balanced
          ? 'Đã chia đủ'
          : preview.remaining > 0
            ? `Còn thiếu ${formatVnd(preview.remaining)}`
            : `Chia lố ${formatVnd(-preview.remaining)}`}
      </p>
    </div>
  )
}

/** Phần "Chia như thế nào?": chọn cách chia, rồi danh sách người tham gia hoặc ô số tiền riêng. */
export function ExpenseSplitSection({ members, draft, preview, onChange, showIssues }: SplitSectionProps) {
  const equal = draft.splitMode === 'equal'
  const chosen = new Set(draft.participantIds)
  const allChosen = members.length > 0 && members.every((member) => chosen.has(member.id))
  const shareOf = new Map(preview.shares.map((share) => [share.memberId, share.amount]))
  const noParticipants = showIssues && preview.issues.some((issue) => issue.kind === 'no_participants')

  function toggle(memberId: string) {
    const next = chosen.has(memberId)
      ? draft.participantIds.filter((id) => id !== memberId)
      : members.filter((m) => chosen.has(m.id) || m.id === memberId).map((m) => m.id)
    onChange({ participantIds: next })
  }

  return (
    <section id="expense-split" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Chia như thế nào?</h3>
      <SegmentedControl
        ariaLabel="Cách chia"
        value={draft.splitMode}
        onValueChange={(splitMode) => onChange({ splitMode })}
        options={[
          { value: 'equal', label: 'Chia đều' },
          { value: 'exact', label: 'Số tiền riêng' },
        ]}
      />

      {equal ? (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="tnum text-small text-muted-foreground">
              {draft.participantIds.length}/{members.length} người
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onChange({ participantIds: allChosen ? [] : members.map((member) => member.id) })}
            >
              {allChosen ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </Button>
          </div>
          <ListGroup className={cn(noParticipants && 'border-destructive/60')}>
            {members.map((member) => {
              const checked = chosen.has(member.id)
              const share = shareOf.get(member.id)
              return (
                <label
                  key={member.id}
                  role="listitem"
                  className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-accent/60 active:bg-accent"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(member.id)} aria-label={member.name} />
                  <MemberAvatar name={member.name} colorKey={member.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-body font-medium">{member.name}</span>
                  <span className={cn('tnum text-body', checked ? 'text-foreground' : 'text-muted-foreground/60')}>
                    {checked && share !== undefined ? formatVnd(share) : '—'}
                  </span>
                </label>
              )
            })}
          </ListGroup>
          {noParticipants && (
            <p role="alert" className="flex items-start gap-1.5 px-1 text-small text-destructive">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>Chọn ít nhất một người chia.</span>
            </p>
          )}
        </>
      ) : (
        <>
          <ListGroup>
            {members.map((member) => {
              const issue = preview.issues.find((i) => i.kind === 'exact_amount' && i.memberId === member.id)
              const error = issue && issue.kind === 'exact_amount' ? moneyErrorMessage(issue.error) : null
              return (
                <div key={member.id} role="listitem" className="flex min-h-14 items-start gap-3 px-4 py-2.5">
                  <span className="mt-1 flex min-w-0 flex-1 items-center gap-3">
                    <MemberAvatar name={member.name} colorKey={member.id} size="sm" />
                    <span className="truncate text-body font-medium">{member.name}</span>
                  </span>
                  <MoneyInput
                    size="md"
                    className="w-40 shrink-0"
                    aria-label={`Số tiền của ${member.name}`}
                    placeholder="0"
                    value={draft.exactAmountTexts[member.id] ?? ''}
                    onChange={(text) => onChange({ exactAmountTexts: { ...draft.exactAmountTexts, [member.id]: text } })}
                    error={error}
                    onEnter={() => focusNextAmount(member.id, members)}
                  />
                </div>
              )
            })}
          </ListGroup>
          <ExactSummary preview={preview} />
        </>
      )}
    </section>
  )
}
