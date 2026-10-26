import { PlusIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { GROUP_SUMMARIES, TODAY } from '@/app/dev/fixtures'
import { GroupList } from '@/modules/bill-split/components/GroupCard'
import { PasteLinkForm } from '@/modules/bill-split/components/PasteLinkForm'
import { AppLink } from '@/shared/ui/AppLink'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Section } from '@/shared/ui/Section'
import { FloatingAction } from '@/shared/ui/StickyBar'
import { Button } from '@/shared/ui/button'

/** Trang chủ của module Chia tiền: các nhóm đã mở trên máy này, tạo nhóm mới, dán link nhóm. */
export function BillSplitHomeMockup({ empty = false }: { empty?: boolean }) {
  const [link, setLink] = useState('')
  const groups = empty ? [] : GROUP_SUMMARIES

  return (
    <>
      <PageHeader title="Chia tiền" subtitle="Chia tiền đi chơi với hội bạn" backHref="/dev/mockups/home" />
      <PageBody padBottom={!empty} className="flex flex-col gap-8">
        {groups.length > 0 ? (
          <Section title="Nhóm của bạn" count={groups.length}>
            <GroupList groups={groups} getHref={() => '/dev/mockups/group-expenses'} today={TODAY} />
          </Section>
        ) : (
          <EmptyState
            icon={<WalletIcon />}
            title="Chưa có nhóm nào"
            description="Tạo nhóm để chia tiền với hội bạn, hoặc dán link nhóm được chia sẻ."
            action={
              <Button size="lg" asChild>
                <AppLink href="/dev/mockups/create-group">
                  <PlusIcon />
                  Tạo nhóm mới
                </AppLink>
              </Button>
            }
          />
        )}
        <Section title="Mở nhóm có sẵn">
          <PasteLinkForm value={link} onChange={setLink} onSubmit={() => undefined} />
        </Section>
      </PageBody>
      {!empty && (
        <FloatingAction>
          <Button size="lg" className="rounded-full px-5 shadow-md" asChild>
            <AppLink href="/dev/mockups/create-group">
              <PlusIcon />
              Tạo nhóm mới
            </AppLink>
          </Button>
        </FloatingAction>
      )}
    </>
  )
}
