import type { FormEvent } from 'react'
import { Spinner } from '@/shared/ui/Spinner'
import { ChipInput } from '@/shared/ui/ChipInput'
import { Field } from '@/shared/ui/Field'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { BottomBar } from '@/shared/ui/StickyBar'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface CreateGroupFormProps {
  name: string
  onNameChange: (name: string) => void
  memberNames: string[]
  onMemberNamesChange: (names: string[]) => void
  onSubmit: () => void
  isSubmitting?: boolean
  errors?: { name?: string; members?: string }
  /** Số người tối đa trong một nhóm. */
  maxMembers?: number
}

/**
 * Form tạo nhóm: tên nhóm và danh sách tên thành viên dạng chip.
 * Nút Tạo nhóm nằm trong BottomBar cố định ở chân màn hình (trong tầm ngón cái), nên trang bọc form bằng <PageBody padBottom>.
 */
export function CreateGroupForm({
  name,
  onNameChange,
  memberNames,
  onMemberNamesChange,
  onSubmit,
  isSubmitting,
  errors,
  maxMembers = 50,
}: CreateGroupFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field label="Tên nhóm" htmlFor="group-name" error={errors?.name}>
        <Input
          id="group-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Ví dụ: Đà Lạt 3N2Đ"
          maxLength={80}
          autoComplete="off"
          enterKeyHint="next"
          onKeyDown={(event) => {
            // Enter chuyển sang ô thành viên thay vì gửi form khi chưa nhập người nào.
            if (event.key === 'Enter') {
              event.preventDefault()
              document.getElementById('group-members')?.focus()
            }
          }}
          aria-invalid={errors?.name ? true : undefined}
        />
      </Field>

      <Field
        label={
          <>
            Thành viên
            {memberNames.length > 0 && <span className="tnum ml-1.5 font-normal text-muted-foreground">{memberNames.length}</span>}
          </>
        }
        htmlFor="group-members"
        hint="Gõ tên rồi bấm Enter. Nhớ thêm cả bạn. Có thể thêm hoặc bớt sau."
        error={errors?.members}
      >
        <ChipInput
          id="group-members"
          values={memberNames}
          onValuesChange={onMemberNamesChange}
          maxItems={maxMembers}
          placeholder="Tên một người"
          invalid={Boolean(errors?.members)}
          renderLeading={(value) => <MemberAvatar name={value} size="sm" />}
        />
      </Field>

      <BottomBar>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Spinner />}
          {isSubmitting ? 'Đang tạo nhóm…' : 'Tạo nhóm'}
        </Button>
      </BottomBar>
    </form>
  )
}
