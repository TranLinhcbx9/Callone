import { useState, type FormEvent } from 'react'
import { Trash2Icon } from 'lucide-react'
import { ExpenseSplitSection } from '@/modules/bill-split/components/ExpenseSplitSection'
import { moneyErrorMessage } from '@/modules/bill-split/components/messages'
import { isValidBillDate } from '@/modules/bill-split/domain/draft'
import type { ExpenseDraft, Member, SplitPreview } from '@/modules/bill-split/domain/types'
import { relativeDayLabel, todayIsoDate } from '@/shared/lib/date'
import { formatVnd } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Field } from '@/shared/ui/Field'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Spinner } from '@/shared/ui/Spinner'
import { BottomBar } from '@/shared/ui/StickyBar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

export interface ExpenseFormViewProps {
  members: readonly Member[]
  /** Trạng thái form, giữ nguyên chữ người dùng gõ. */
  draft: ExpenseDraft
  /** Kết quả tính từ draft: phần chia, còn thiếu, các lỗi. */
  preview: SplitPreview
  /** Gộp một phần vào draft, ví dụ onChange({ title: 'Lẩu' }). */
  onChange: (patch: Partial<ExpenseDraft>) => void
  onSubmit: () => void
  /** Chỉ truyền khi sửa khoản chi có sẵn. */
  onDelete?: () => void
  isSaving?: boolean
  /** Hiện lỗi của mọi trường. Bật sau khi người dùng bấm Lưu mà form chưa hợp lệ. */
  showIssues?: boolean
  /** Ngày hôm nay YYYY-MM-DD, mặc định lấy từ đồng hồ. */
  today?: string
}

/**
 * Form khoản chi toàn màn hình: số tiền (lớn, ở trên cùng), tiêu đề, ai trả, ngày, cách chia, ghi chú.
 * Nút Lưu nằm trong BottomBar cố định ở chân màn hình, nên trang bọc bằng <PageBody padBottom>.
 * Header (PageHeader với nút đóng) do trang dựng.
 */
export function ExpenseFormView({
  members,
  draft,
  preview,
  onChange,
  onSubmit,
  onDelete,
  isSaving,
  showIssues = false,
  today = todayIsoDate(),
}: ExpenseFormViewProps) {
  const [amountTouched, setAmountTouched] = useState(false)
  const editing = draft.version !== null
  const has = (kind: string) => preview.issues.some((issue) => issue.kind === kind)

  const amount = preview.amount
  const amountError =
    !amount.ok && (showIssues || (amountTouched && amount.error !== 'empty')) ? moneyErrorMessage(amount.error) : null
  const amountPreview = amount.ok && draft.amountText.trim() !== '' ? `= ${formatVnd(amount.value)}` : null
  const dayLabel = relativeDayLabel(draft.spentOn, today)
  // Ô ngày không có lỗi trong SplitIssue, nên tự kiểm: bộ chọn ngày của máy cho gõ năm ngoài khoảng database nhận (2000 đến 2100).
  const dateError = isValidBillDate(draft.spentOn) ? undefined : 'Ngày chi phải nằm trong khoảng năm 2000 tới 2100.'

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form id="expense-form" onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label="Số tiền" htmlFor="expense-amount">
        <MoneyInput
          id="expense-amount"
          size="lg"
          value={draft.amountText}
          onChange={(amountText) => onChange({ amountText })}
          onBlur={() => setAmountTouched(true)}
          preview={amountPreview}
          error={amountError}
          hint="Gõ 150k, 1tr2 hoặc 1.200.000"
          autoFocus={!editing}
          onEnter={() => document.getElementById('expense-title')?.focus()}
        />
      </Field>

      <Field
        label="Tiêu đề"
        htmlFor="expense-title"
        error={showIssues && has('title_required') ? 'Nhập tiêu đề cho khoản chi.' : undefined}
      >
        <Input
          id="expense-title"
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Ví dụ: Lẩu gà lá é"
          maxLength={80}
          autoComplete="off"
          enterKeyHint="done"
          onKeyDown={(event) => {
            // Enter chỉ thu bàn phím, không gửi form: lưu bằng nút ở chân màn hình.
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          aria-invalid={showIssues && has('title_required') ? true : undefined}
        />
      </Field>

      <Field label="Ai trả?" error={showIssues && has('no_payer') ? 'Chọn người trả.' : undefined}>
        <div role="radiogroup" aria-label="Ai trả?" className="flex flex-wrap gap-2">
          {members.map((member) => {
            const selected = draft.paidBy === member.id
            return (
              <button
                key={member.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ paidBy: member.id })}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border pr-4 pl-1.5 text-body transition-[background-color,border-color,color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                  selected
                    ? 'border-primary/50 bg-primary-soft font-medium text-primary-soft-foreground'
                    : 'border-border bg-card hover:bg-accent/60',
                )}
              >
                <MemberAvatar name={member.name} colorKey={member.id} size="sm" />
                {member.name}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Ngày" htmlFor="expense-date" error={dateError}>
        <div className="flex items-center gap-3">
          <Input
            id="expense-date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={draft.spentOn}
            onChange={(event) => event.target.value && onChange({ spentOn: event.target.value })}
            aria-invalid={dateError ? true : undefined}
            className="min-w-0 flex-1"
          />
          {dayLabel && <Badge variant="soft">{dayLabel}</Badge>}
        </div>
      </Field>

      <ExpenseSplitSection members={members} draft={draft} preview={preview} onChange={onChange} showIssues={showIssues} />

      <Field label="Ghi chú" htmlFor="expense-note" optional>
        <Textarea
          id="expense-note"
          value={draft.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="Ví dụ: Quán gần chợ đêm"
          maxLength={500}
          rows={2}
        />
      </Field>

      <BottomBar>
        {onDelete && (
          <Button type="button" variant="destructive" size="icon-lg" aria-label="Xóa khoản chi" disabled={isSaving} onClick={onDelete}>
            <Trash2Icon />
          </Button>
        )}
        <Button type="submit" size="lg" disabled={isSaving} className="flex-1">
          {isSaving && <Spinner />}
          {isSaving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu khoản chi'}
        </Button>
      </BottomBar>
    </form>
  )
}
