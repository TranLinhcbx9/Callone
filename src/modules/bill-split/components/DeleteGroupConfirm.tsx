import { useState } from 'react'
import { sameName } from '@/modules/bill-split/domain/groupForm'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface DeleteGroupConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  onConfirm: () => void
  isDeleting?: boolean
}

/**
 * Xóa nhóm phải gõ lại đúng tên nhóm. So khớp bỏ qua hoa thường, khoảng trắng thừa và khác biệt NFC/NFD không nhìn thấy
 * (xem sameName), nhưng vẫn phải đúng dấu. Chữ đã gõ chỉ là trạng thái nội bộ của hộp thoại này.
 */
export function DeleteGroupConfirm({ open, onOpenChange, groupName, onConfirm, isDeleting }: DeleteGroupConfirmProps) {
  const [typed, setTyped] = useState('')
  const matches = sameName(typed, groupName)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTyped('')
      }}
      dismissible={!isDeleting}
      title="Xóa nhóm?"
      description={
        <>
          Nhóm <span className="font-semibold text-foreground">{groupName}</span> sẽ không mở được nữa trên mọi máy giữ
          link. Gõ lại tên nhóm để xác nhận.
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Hủy
          </Button>
          <Button variant="danger" disabled={!matches || isDeleting} onClick={onConfirm}>
            {isDeleting && <Spinner />}
            Xóa nhóm
          </Button>
        </>
      }
    >
      <Input
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={groupName}
        aria-label="Gõ tên nhóm để xác nhận"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </ResponsiveDialog>
  )
}
