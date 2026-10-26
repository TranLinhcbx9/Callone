import { useState } from 'react'
import { CreateGroupForm } from '@/modules/bill-split/components/CreateGroupForm'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

/** Tạo nhóm: tên nhóm và danh sách tên thành viên. */
export function CreateGroupMockup({ prefilled = true }: { prefilled?: boolean }) {
  const [name, setName] = useState(prefilled ? 'Đà Lạt 3N2Đ' : '')
  const [members, setMembers] = useState<string[]>(prefilled ? ['Linh', 'Hưng', 'Mai', 'Tú'] : [])

  return (
    <>
      <PageHeader title="Tạo nhóm mới" backHref="/dev/mockups/bill-split-home" backIcon="close" />
      <PageBody padBottom className="pt-6">
        <CreateGroupForm
          name={name}
          onNameChange={setName}
          memberNames={members}
          onMemberNamesChange={setMembers}
          onSubmit={() => undefined}
        />
      </PageBody>
    </>
  )
}
