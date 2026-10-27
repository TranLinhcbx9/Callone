import { PlusIcon } from 'lucide-react'
import { useMemo } from 'react'
import { ExpenseList } from '@/modules/bill-split/components/ExpenseList'
import { SpendingSummary } from '@/modules/bill-split/components/SpendingSummary'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import type { GroupTabProps } from '@/modules/bill-split/pages/group/tabProps'
import { billSplitPaths } from '@/modules/bill-split/paths'
import { AppLink } from '@/shared/ui/AppLink'
import { Button } from '@/shared/ui/button'

/** Nút "Thêm khoản chi" mở form toàn màn hình. `floating`: dạng nút nổi bo tròn ở góc dưới, không thì nút thường. */
export function AddExpenseButton({ token, floating }: { token: string; floating?: boolean }) {
  return (
    <Button size="lg" className={floating ? 'rounded-full px-5 shadow-md' : undefined} asChild>
      <AppLink href={billSplitPaths.newExpense(token)}>
        <PlusIcon />
        Thêm khoản chi
      </AppLink>
    </Button>
  )
}

/**
 * Tab Chi tiêu: thẻ tổng chi (kèm phần của mình khi đã biết mình là ai) rồi các khoản chi gom theo ngày.
 * Bấm một dòng để sửa. Nút nổi "Thêm khoản chi" do GroupPage đặt qua GroupSections, chỉ khi đã có khoản chi;
 * nhóm chưa có khoản nào thì nút nằm ngay trong trạng thái trống.
 */
export function ExpensesTab({ token, group, meId }: GroupTabProps) {
  const mine = useMemo(
    () => (meId ? computeBalances(group).find((balance) => balance.memberId === meId) : undefined),
    [group, meId],
  )
  const total = useMemo(() => group.expenses.reduce((sum, expense) => sum + expense.amount, 0), [group.expenses])

  return (
    <div className="flex flex-col gap-6">
      {group.expenses.length > 0 && (
        <SpendingSummary
          total={total}
          expenseCount={group.expenses.length}
          myPaid={mine?.paid}
          myShare={mine?.share}
        />
      )}
      <ExpenseList
        expenses={group.expenses}
        members={group.members}
        meId={meId}
        getHref={(expense) => billSplitPaths.expense(token, expense.id)}
        emptyAction={<AddExpenseButton token={token} />}
      />
    </div>
  )
}
