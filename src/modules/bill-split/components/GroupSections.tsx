import type { ReactNode } from 'react'
import { GroupHeader, type GroupHeaderProps } from '@/modules/bill-split/components/GroupHeader'
import { PageBody } from '@/shared/ui/PageBody'
import { FloatingAction } from '@/shared/ui/StickyBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

export type GroupSectionId = 'expenses' | 'balances' | 'members'

export interface GroupSectionsProps {
  header: Omit<GroupHeaderProps, 'tabs'>
  value: GroupSectionId
  onValueChange: (value: GroupSectionId) => void
  /** Số nhỏ cạnh tên tab, ví dụ số khoản chi và số thành viên. */
  counts?: Partial<Record<GroupSectionId, number>>
  expenses: ReactNode
  balances: ReactNode
  members: ReactNode
  /** Nút nổi riêng cho từng tab, ví dụ "Thêm khoản chi" ở tab Chi tiêu. Không truyền thì tab đó không có nút nổi. */
  actions?: Partial<Record<GroupSectionId, ReactNode>>
  /** Dải thông báo chung cho cả ba tab, nằm ngay dưới thanh tab (ví dụ nhóm này chưa được lưu trên máy). */
  notice?: ReactNode
}

const TABS: { id: GroupSectionId; label: string }[] = [
  { id: 'expenses', label: 'Chi tiêu' },
  { id: 'balances', label: 'Số dư' },
  { id: 'members', label: 'Thành viên' },
]

/**
 * Khung trang nhóm: header dính kèm ba tab "Chi tiêu", "Số dư", "Thành viên", nội dung từng tab và nút nổi.
 * Nút nổi nằm trong tầm ngón cái; app không có thanh tab chung nên không bị hai thanh chồng nhau.
 */
export function GroupSections({
  header,
  value,
  onValueChange,
  counts,
  expenses,
  balances,
  members,
  actions,
  notice,
}: GroupSectionsProps) {
  const action = actions?.[value]
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as GroupSectionId)} className="gap-0">
      <GroupHeader
        {...header}
        tabs={
          <TabsList variant="line" aria-label="Các phần của nhóm" className="px-2">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
                {counts?.[tab.id] !== undefined && (
                  <span className="tnum text-caption font-normal text-muted-foreground">{counts[tab.id]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      />
      <PageBody padBottom={Boolean(action)} className="pt-5">
        {notice && <div className="mb-5">{notice}</div>}
        <TabsContent value="expenses">{expenses}</TabsContent>
        <TabsContent value="balances">{balances}</TabsContent>
        <TabsContent value="members">{members}</TabsContent>
      </PageBody>
      {action && <FloatingAction>{action}</FloatingAction>}
    </Tabs>
  )
}
