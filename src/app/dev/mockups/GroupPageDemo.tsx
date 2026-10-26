import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { BANKS, GROUP, ME_ID, MEMBERS, TRANSFERS, VIETQR_PAYLOAD } from '@/app/dev/fixtures'
import { AddExpenseButton, BalancesTab, ExpensesTab, MembersTab } from '@/app/dev/mockups/GroupTabs'
import { DeleteGroupConfirm } from '@/modules/bill-split/components/DeleteGroupConfirm'
import { GroupSections, type GroupSectionId } from '@/modules/bill-split/components/GroupSections'
import { MemberForm, type MemberFormValues } from '@/modules/bill-split/components/MemberForm'
import { searchBanks } from '@/modules/bill-split/domain/banks'
import { VietQrCard } from '@/modules/bill-split/components/VietQrCard'
import { WhoAmIPicker } from '@/modules/bill-split/components/WhoAmIPicker'
import type { Member } from '@/modules/bill-split/domain/types'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Button } from '@/shared/ui/button'

export type GroupOverlay = 'none' | 'who' | 'qr' | 'member' | 'bank' | 'delete'

function toValues(member: Member | null): MemberFormValues {
  return {
    name: member?.name ?? '',
    bankBin: member?.bank?.bin ?? null,
    accountNumber: member?.bank?.accountNumber ?? '',
    accountName: member?.bank?.accountName ?? '',
  }
}

/** Trang nhóm hoàn chỉnh dùng lại cho nhiều mockup. `overlay` mở sẵn một hộp thoại để chụp ảnh. */
export function GroupPageDemo({
  initialTab = 'expenses',
  overlay = 'none',
}: {
  initialTab?: GroupSectionId
  overlay?: GroupOverlay
}) {
  const [tab, setTab] = useState<GroupSectionId>(initialTab)
  const [whoOpen, setWhoOpen] = useState(overlay === 'who')
  const [qrOpen, setQrOpen] = useState(overlay === 'qr')
  const [memberOpen, setMemberOpen] = useState(overlay === 'member' || overlay === 'bank')
  const [deleteOpen, setDeleteOpen] = useState(overlay === 'delete')
  const [meId, setMeId] = useState<string | null>(overlay === 'who' ? null : ME_ID)
  const [editing, setEditing] = useState<Member | null>(overlay === 'member' || overlay === 'bank' ? (MEMBERS[0] ?? null) : null)
  const [values, setValues] = useState<MemberFormValues>(toValues(editing))

  function openMember(member: Member | null) {
    setEditing(member)
    setValues(toValues(member))
    setMemberOpen(true)
  }

  const transfer = TRANSFERS.find((item) => item.fromMemberId === ME_ID) ?? TRANSFERS[0]
  const receiver = MEMBERS.find((member) => member.id === transfer?.toMemberId)
  const bank = BANKS.find((item) => item.bin === receiver?.bank?.bin)

  return (
    <>
      <GroupSections
        header={{
          name: GROUP.name,
          members: MEMBERS,
          meId,
          backHref: '/dev/mockups/bill-split-home',
          onShare: () => setTab('members'),
          onRename: () => undefined,
          onChangeMe: () => setWhoOpen(true),
          onDelete: () => setDeleteOpen(true),
        }}
        value={tab}
        onValueChange={setTab}
        counts={{ expenses: GROUP.expenses.length, members: MEMBERS.length }}
        expenses={<ExpensesTab />}
        balances={<BalancesTab onShowQr={() => setQrOpen(true)} onEditMember={openMember} />}
        members={
          <MembersTab onEdit={openMember} onAdd={() => openMember(null)} onChangeMe={() => setWhoOpen(true)} onDelete={() => setDeleteOpen(true)} />
        }
        actions={{ expenses: <AddExpenseButton /> }}
      />

      <ResponsiveDialog
        open={whoOpen}
        onOpenChange={setWhoOpen}
        title="Bạn là ai trong nhóm?"
        description="Chọn tên của bạn để app hiện phần chi của riêng bạn."
      >
        <WhoAmIPicker
          members={MEMBERS}
          value={meId}
          onSelect={(id) => {
            setMeId(id)
            setWhoOpen(false)
          }}
          onSkip={() => setWhoOpen(false)}
        />
      </ResponsiveDialog>

      <ResponsiveDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        title="Mã QR chuyển khoản"
        description="Quét bằng app ngân hàng, mọi thông tin đã điền sẵn."
        size="sm"
        initialFocus="content"
        footer={
          <>
            <Button variant="outline" onClick={() => setQrOpen(false)}>
              Đóng
            </Button>
            <Button onClick={() => setQrOpen(false)}>
              <CheckIcon />
              Đã chuyển xong
            </Button>
          </>
        }
      >
        {transfer && receiver?.bank && (
          <VietQrCard
            payload={VIETQR_PAYLOAD}
            amount={150_000}
            recipientName={receiver.name}
            bankName={bank?.shortName ?? receiver.bank.bin}
            accountNumber={receiver.bank.accountNumber}
            accountName={receiver.bank.accountName}
            message="DH123456"
          />
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        title={editing ? 'Sửa thành viên' : 'Thêm thành viên'}
        description={editing ? 'Nhập tài khoản ngân hàng để bạn bè trả tiền cho người này bằng mã QR.' : undefined}
      >
        <MemberForm
          values={values}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          banks={BANKS}
          bankFilter={searchBanks}
          isNew={!editing}
          onSubmit={() => setMemberOpen(false)}
          onCancel={() => setMemberOpen(false)}
          onDelete={editing ? () => setMemberOpen(false) : undefined}
        />
      </ResponsiveDialog>

      <DeleteGroupConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        groupName={GROUP.name}
        onConfirm={() => setDeleteOpen(false)}
      />
    </>
  )
}

