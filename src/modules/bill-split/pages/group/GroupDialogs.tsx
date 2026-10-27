import { useState } from 'react'
import { toast } from 'sonner'
import { describeInvalid, getBillSplitErrorMessage, getInvalidDetail } from '@/modules/bill-split/api/errors'
import { WhoAmIPicker } from '@/modules/bill-split/components/WhoAmIPicker'
import { normalizeName, validateGroupName } from '@/modules/bill-split/domain/groupForm'
import type { Member } from '@/modules/bill-split/domain/types'
import { useUpdateGroup } from '@/modules/bill-split/hooks/useMutations'
import { Field } from '@/shared/ui/Field'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface WhoAmIDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: readonly Member[]
  /** Người đang được chọn, null khi chưa chọn. */
  value: string | null
  onSelect: (memberId: string) => void
}

/**
 * Hộp "Bạn là ai trong nhóm?". Chọn xong đóng ngay. "Để sau" chỉ có khi chưa chọn ai: đóng hộp mà không lưu gì,
 * lần sau mở nhóm vẫn hỏi lại. Khi đổi người đã chọn thì đóng bằng nút Đóng, vuốt xuống hoặc Esc.
 */
export function WhoAmIDialog({ open, onOpenChange, members, value, onSelect }: WhoAmIDialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bạn là ai trong nhóm?"
      description="Chọn tên của bạn để app hiện phần chi của riêng bạn."
      size="sm"
    >
      <WhoAmIPicker
        members={members}
        value={value}
        onSelect={onSelect}
        onSkip={value === null ? () => onOpenChange(false) : undefined}
      />
    </ResponsiveDialog>
  )
}

function RenameForm({
  initialName,
  error,
  onChange,
  onSubmit,
}: {
  initialName: string
  error: string | null
  onChange: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  return (
    <form
      id="rename-group-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(name)
      }}
    >
      <Field label="Tên nhóm" htmlFor="rename-group-name" error={error}>
        <Input
          id="rename-group-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            onChange()
          }}
          onFocus={(event) => event.currentTarget.select()}
          maxLength={80}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
        />
      </Field>
    </form>
  )
}

export interface RenameGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  groupName: string
}

/** Hộp đổi tên nhóm. Tên trống hoặc quá dài báo ngay ở ô, lỗi BS_INVALID của server cũng hiện ở ô tên. */
export function RenameGroupDialog({ open, onOpenChange, token, groupName }: RenameGroupDialogProps) {
  const updateGroup = useUpdateGroup()
  const [error, setError] = useState<string | null>(null)

  function changeOpen(next: boolean) {
    if (!next) setError(null)
    onOpenChange(next)
  }

  function submit(rawName: string) {
    const problem = validateGroupName(rawName)
    if (problem) {
      setError(problem)
      return
    }
    const name = normalizeName(rawName)
    if (name === groupName) {
      changeOpen(false)
      return
    }
    updateGroup.mutate(
      { token, name },
      {
        onSuccess: () => {
          changeOpen(false)
          toast.success('Đã đổi tên nhóm')
        },
        onError: (failure) => {
          const invalid = getInvalidDetail(failure)
          if (invalid?.field === 'name') setError(describeInvalid(invalid))
          else toast.error(getBillSplitErrorMessage(failure))
        },
      },
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title="Đổi tên nhóm"
      size="sm"
      dismissible={!updateGroup.isPending}
      footer={
        <>
          <Button variant="outline" onClick={() => changeOpen(false)} disabled={updateGroup.isPending}>
            Hủy
          </Button>
          <Button type="submit" form="rename-group-form" disabled={updateGroup.isPending}>
            {updateGroup.isPending && <Spinner />}
            Lưu
          </Button>
        </>
      }
    >
      <RenameForm initialName={groupName} error={error} onChange={() => setError(null)} onSubmit={submit} />
    </ResponsiveDialog>
  )
}
