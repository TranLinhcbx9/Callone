import { useState } from 'react'
import { HUNG, LINH, MAI, ME_ID, MEMBERS, TODAY, TU } from '@/app/dev/fixtures'
import { ExpenseFormView } from '@/modules/bill-split/components/ExpenseFormView'
import { computeSplitPreview } from '@/modules/bill-split/domain/split'
import type { ExpenseDraft } from '@/modules/bill-split/domain/types'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

export type ExpenseFormVariant = 'equal' | 'exact' | 'edit' | 'errors'

const ALL = MEMBERS.map((member) => member.id)

const DRAFTS: Record<ExpenseFormVariant, ExpenseDraft> = {
  equal: {
    id: 'draft-new',
    version: null,
    title: 'Lẩu gà lá é',
    amountText: '1tr2',
    paidBy: ME_ID,
    spentOn: TODAY,
    splitMode: 'equal',
    participantIds: ALL,
    exactAmountTexts: {},
    note: '',
  },
  exact: {
    id: 'draft-new',
    version: null,
    title: 'Nướng ngoài trời',
    amountText: '1tr2',
    paidBy: LINH,
    spentOn: TODAY,
    splitMode: 'exact',
    participantIds: ALL,
    exactAmountTexts: { [LINH]: '350k', [HUNG]: '300k', [MAI]: '250k', [TU]: '250k' },
    note: '',
  },
  edit: {
    id: 'e6',
    version: 1,
    title: 'Khách sạn 2 đêm',
    amountText: '3.200.000',
    paidBy: LINH,
    spentOn: '2026-10-23',
    splitMode: 'exact',
    participantIds: ALL,
    exactAmountTexts: { [LINH]: '800k', [HUNG]: '900k', [MAI]: '700k', [TU]: '800k' },
    note: 'Phòng của Hưng có thêm giường phụ.',
  },
  errors: {
    id: 'draft-new',
    version: null,
    title: '',
    amountText: '1tr2x',
    paidBy: null,
    spentOn: TODAY,
    splitMode: 'equal',
    participantIds: [],
    exactAmountTexts: {},
    note: '',
  },
}

/** Form khoản chi toàn màn hình, gõ thật được: đọc số tiền và chia bằng domain thật (computeSplitPreview). */
export function ExpenseFormMockup({ variant = 'equal' }: { variant?: ExpenseFormVariant }) {
  const [draft, setDraft] = useState<ExpenseDraft>(DRAFTS[variant])
  const [showIssues, setShowIssues] = useState(variant === 'errors')
  const preview = computeSplitPreview(draft, MEMBERS)
  const editing = draft.version !== null

  return (
    <>
      <PageHeader
        title={editing ? 'Sửa khoản chi' : 'Thêm khoản chi'}
        subtitle="Đà Lạt 3N2Đ"
        backHref="/dev/mockups/group-expenses"
        backIcon="close"
      />
      <PageBody padBottom className="pt-6">
        <ExpenseFormView
          members={MEMBERS}
          draft={draft}
          preview={preview}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={() => setShowIssues(preview.issues.length > 0)}
          onDelete={editing ? () => undefined : undefined}
          showIssues={showIssues}
          today={TODAY}
        />
      </PageBody>
    </>
  )
}
