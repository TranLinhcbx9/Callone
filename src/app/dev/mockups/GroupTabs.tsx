import { PlusIcon } from 'lucide-react'
import {
  BALANCES,
  BANKS,
  EXPENSES,
  ME_ID,
  MEMBERS,
  SETTLEMENTS,
  SHARE_URL,
  TODAY,
  TOTAL_SPENT,
  TRANSFERS,
} from '@/app/dev/fixtures'
import { BalanceList } from '@/modules/bill-split/components/BalanceList'
import { ExpenseList } from '@/modules/bill-split/components/ExpenseList'
import { MemberList } from '@/modules/bill-split/components/MemberList'
import { SettlementList } from '@/modules/bill-split/components/SettlementList'
import { ShareLinkCard } from '@/modules/bill-split/components/ShareLinkCard'
import { SpendingSummary } from '@/modules/bill-split/components/SpendingSummary'
import { TransferList } from '@/modules/bill-split/components/TransferList'
import type { Member, Transfer } from '@/modules/bill-split/domain/types'
import { AppLink } from '@/shared/ui/AppLink'
import { Section } from '@/shared/ui/Section'
import { Button } from '@/shared/ui/button'

const mine = BALANCES.find((balance) => balance.memberId === ME_ID)

export function ExpensesTab() {
  return (
    <div className="flex flex-col gap-6">
      <SpendingSummary total={TOTAL_SPENT} expenseCount={EXPENSES.length} myPaid={mine?.paid} myShare={mine?.share} />
      <ExpenseList
        expenses={EXPENSES}
        members={MEMBERS}
        meId={ME_ID}
        today={TODAY}
        getHref={(expense) => (expense.splitMode === 'exact' ? '/dev/mockups/expense-form-exact' : '/dev/mockups/expense-form')}
      />
    </div>
  )
}

export function BalancesTab({ onShowQr, onEditMember }: { onShowQr: (t: Transfer) => void; onEditMember: (m: Member) => void }) {
  return (
    <div className="flex flex-col gap-8">
      <Section title="Số dư" description="Số dương là được nhận lại, số âm là còn nợ.">
        <BalanceList members={MEMBERS} balances={BALANCES} meId={ME_ID} />
      </Section>
      <Section title="Gợi ý chuyển khoản" count={TRANSFERS.length} description="Ít lần chuyển nhất để mọi người huề nhau.">
        <TransferList
          transfers={TRANSFERS}
          members={MEMBERS}
          meId={ME_ID}
          onShowQr={onShowQr}
          onMarkPaid={() => undefined}
          onEditMember={onEditMember}
        />
      </Section>
      <Section title="Đã thanh toán" count={SETTLEMENTS.length}>
        <SettlementList settlements={SETTLEMENTS} members={MEMBERS} meId={ME_ID} today={TODAY} onDelete={() => undefined} />
      </Section>
    </div>
  )
}

export function MembersTab({
  onEdit,
  onAdd,
  onChangeMe,
  onDelete,
}: {
  onEdit: (m: Member) => void
  onAdd: () => void
  onChangeMe: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <Section title="Thành viên" count={MEMBERS.length}>
        <MemberList members={MEMBERS} banks={BANKS} meId={ME_ID} onEdit={onEdit} onAdd={onAdd} onChangeMe={onChangeMe} />
      </Section>
      <Section title="Chia sẻ nhóm">
        <ShareLinkCard url={SHARE_URL} groupName="Đà Lạt 3N2Đ" onRotate={() => undefined} canShare />
      </Section>
      <Button variant="ghost" className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
        Xóa nhóm
      </Button>
    </div>
  )
}

export function AddExpenseButton() {
  return (
    <Button size="lg" className="rounded-full px-5 shadow-md" asChild>
      <AppLink href="/dev/mockups/expense-form">
        <PlusIcon />
        Thêm khoản chi
      </AppLink>
    </Button>
  )
}
