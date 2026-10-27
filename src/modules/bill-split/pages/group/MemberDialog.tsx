import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MemberForm, type MemberFormValues } from '@/modules/bill-split/components/MemberForm'
import { BANKS, searchBanks } from '@/modules/bill-split/domain/banks'
import type { Group, Member } from '@/modules/bill-split/domain/types'
import { useDeleteMember, useSaveMember } from '@/modules/bill-split/hooks/useMutations'
import { useLastBank, useMe } from '@/modules/bill-split/hooks/useLocalState'
import {
  MEMBER_DELETE_BUTTON_ID,
  MEMBER_FIELD_IDS,
  MEMBER_FIELD_ORDER,
  describeMemberDeleteError,
  describeMemberSaveError,
  initialMemberValues,
  validateMemberValues,
  type MemberFormErrors,
  type MemberFormField,
} from '@/modules/bill-split/pages/group/memberForm'
import { toastDialogError } from '@/modules/bill-split/pages/group/dialogToast'
import { newId } from '@/shared/lib/id'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'

export interface MemberDialogProps {
  token: string
  group: Group
  /** Người đang sửa, null là thêm người mới. */
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Ô nào của form bị đụng tới thì xóa lỗi của ô đó, để lỗi biến mất ngay khi người dùng sửa. */
const FIELD_OF_VALUE: Readonly<Record<keyof MemberFormValues, MemberFormField>> = {
  name: 'name',
  bankBin: 'bank',
  accountNumber: 'accountNumber',
  accountName: 'accountName',
}

/** Đưa con trỏ vào ô lỗi đầu tiên, để người dùng bàn phím và trình đọc màn hình biết chỗ cần sửa. */
function focusFirstError(errors: MemberFormErrors): void {
  const field = MEMBER_FIELD_ORDER.find((name) => errors[name])
  if (field) document.getElementById(MEMBER_FIELD_IDS[field])?.focus()
}

/**
 * Hộp thêm hoặc sửa thành viên (tên, ngân hàng, số tài khoản, tên chủ tài khoản) và xóa thành viên có xác nhận.
 * Dùng chung cho tab Thành viên và lời nhắc "Nhập ngay" ở tab Số dư. Mỗi lần mở nên là một thể hiện mới
 * (đặt `key` theo `useMemberDialog().session`) để form luôn bắt đầu từ dữ liệu hiện tại của nhóm.
 */
export function MemberDialog({ token, group, member, open, onOpenChange }: MemberDialogProps) {
  const saveMember = useSaveMember()
  const deleteMember = useDeleteMember()
  const lastBank = useLastBank()
  const [meId, setMe] = useMe(token)

  // Id sinh một lần cho mỗi lần mở: bấm lưu lại sau khi rớt mạng không tạo ra hai người.
  const [newMemberId] = useState(newId)
  const [values, setValues] = useState<MemberFormValues>(() => initialMemberValues(member, lastBank))
  const [bankTouched, setBankTouched] = useState(false)
  const [errors, setErrors] = useState<MemberFormErrors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const isSaving = saveMember.isPending
  const isDeleting = deleteMember.isPending
  const busy = isSaving || isDeleting

  // Hộp xác nhận xóa không có nút kích hoạt theo kiểu Radix nên khi đóng, con trỏ rơi về body. Đóng mà hộp thành viên
  // còn mở (bấm Hủy, bấm ra ngoài, hoặc xóa lỗi) thì đưa con trỏ về nút "Xóa thành viên". Làm sau khi hộp đã đóng
  // (trong effect) vì lúc còn mở, hộp xác nhận giữ con trỏ trong nó.
  const restoreDeleteFocus = useRef(false)
  useEffect(() => {
    if (confirmingDelete || !restoreDeleteFocus.current) return
    restoreDeleteFocus.current = false
    document.getElementById(MEMBER_DELETE_BUTTON_ID)?.focus({ preventScroll: true })
  }, [confirmingDelete])

  function closeConfirm(restoreFocus: boolean) {
    restoreDeleteFocus.current = restoreFocus
    setConfirmingDelete(false)
  }

  function change(patch: Partial<MemberFormValues>) {
    setValues((current) => ({ ...current, ...patch }))
    if (patch.bankBin !== undefined) setBankTouched(true)
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch) as (keyof MemberFormValues)[]) delete next[FIELD_OF_VALUE[key]]
      return next
    })
  }

  async function submit() {
    if (busy) return
    const result = validateMemberValues(values, {
      others: group.members.filter((other) => other.id !== member?.id),
      bankTouched,
    })
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstError(result.errors)
      return
    }

    setErrors({})
    try {
      await saveMember.mutateAsync({
        token,
        member: { id: member?.id ?? newMemberId, name: result.name, bank: result.bank },
      })
      toast.success(member ? `Đã lưu thông tin của ${result.name}` : `Đã thêm ${result.name} vào nhóm`)
      onOpenChange(false)
    } catch (error) {
      const failure = describeMemberSaveError(error)
      if ('errors' in failure) {
        setErrors(failure.errors)
        focusFirstError(failure.errors)
      } else {
        toastDialogError(failure.message)
      }
    }
  }

  async function remove() {
    if (!member || isDeleting) return
    try {
      await deleteMember.mutateAsync({ token, memberId: member.id })
      // Người vừa xóa là "mình" thì bỏ lựa chọn, tránh giữ một id không còn trong nhóm.
      if (member.id === meId) setMe(null)
      closeConfirm(false)
      onOpenChange(false)
      toast.success(`Đã xóa ${member.name} khỏi nhóm`)
    } catch (error) {
      closeConfirm(true)
      toastDialogError(describeMemberDeleteError(error, member.name), { duration: 8000 })
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={member ? 'Sửa thành viên' : 'Thêm thành viên'}
      description={member ? 'Nhập tài khoản ngân hàng để bạn bè trả tiền cho người này bằng mã QR.' : undefined}
      dismissible={!busy}
    >
      <MemberForm
        values={values}
        onChange={change}
        banks={BANKS}
        bankFilter={searchBanks}
        errors={errors}
        isNew={!member}
        isSaving={isSaving}
        onSubmit={submit}
        onCancel={() => onOpenChange(false)}
        onDelete={member ? () => setConfirmingDelete(true) : undefined}
      />

      {/* Đặt trong nội dung của hộp này để trên điện thoại nó là ngăn kéo lồng, giống hộp chọn ngân hàng. */}
      {member && (
        <ResponsiveDialog
          open={confirmingDelete}
          onOpenChange={(next) => (next ? setConfirmingDelete(true) : closeConfirm(true))}
          title={`Xóa ${member.name}?`}
          description={`${member.name} sẽ bị xóa khỏi nhóm. Người đã có khoản chi hoặc lần trả nợ thì không xóa được.`}
          size="sm"
          dismissible={!isDeleting}
          footer={
            <>
              <Button variant="outline" onClick={() => closeConfirm(true)} disabled={isDeleting}>
                Hủy
              </Button>
              <Button variant="danger" onClick={remove} disabled={isDeleting}>
                {isDeleting && <Spinner />}
                Xóa
              </Button>
            </>
          }
        />
      )}
    </ResponsiveDialog>
  )
}
