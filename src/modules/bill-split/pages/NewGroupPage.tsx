import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  describeInvalid,
  getBillSplitErrorMessage,
  getInvalidDetail,
  isBillSplitError,
} from '@/modules/bill-split/api/errors'
import { newGroupToken } from '@/modules/bill-split/api/token'
import { CreateGroupForm } from '@/modules/bill-split/components/CreateGroupForm'
import type { CreateGroupInput } from '@/modules/bill-split/domain/inputs'
import { normalizeName, validateCreateGroup, type CreateGroupErrors } from '@/modules/bill-split/domain/groupForm'
import { useDocumentTitle } from '@/modules/bill-split/hooks/useDocumentTitle'
import { useCreateGroup } from '@/modules/bill-split/hooks/useMutations'
import { billSplitPaths } from '@/modules/bill-split/paths'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

/** Toast báo giới hạn tốc độ ở lại lâu hơn mặc định: người dùng cần đọc kịp rồi chờ. */
const RATE_LIMIT_TOAST_MS = 7000

/**
 * Tạo nhóm: tên nhóm và danh sách thành viên. Kiểm tra ở client trước (cùng luật với server), lỗi BS_INVALID của
 * server vẫn được đưa về đúng ô. Tạo xong thì nhóm được ghi nhớ trên máy và mở luôn trang nhóm.
 */
export function NewGroupPage() {
  useDocumentTitle('Tạo nhóm mới')
  const navigate = useNavigate()
  const createGroup = useCreateGroup()
  const [name, setName] = useState('')
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [errors, setErrors] = useState<CreateGroupErrors>({})
  // Token của lần bấm gần nhất. Cùng nội dung thì dùng lại để bấm lần nữa sau khi rớt mạng là gửi lại chứ không tạo nhóm
  // trùng (server trả đúng nhóm đã tạo). Nội dung đã đổi thì lấy token mới: nếu lần trước thật ra đã tạo xong, gửi lại
  // cùng token sẽ trả nhóm cũ và nội dung mới bị bỏ qua mà người dùng không hay.
  const attempt = useRef<{ signature: string; token: string } | null>(null)

  function tokenFor(input: CreateGroupInput): string {
    const signature = JSON.stringify([input.name, input.memberNames])
    if (attempt.current?.signature !== signature) attempt.current = { signature, token: newGroupToken() }
    return attempt.current.token
  }

  function showServerError(error: unknown) {
    const invalid = getInvalidDetail(error)
    if (invalid?.field === 'name') {
      setErrors({ name: describeInvalid(invalid) })
    } else if (invalid?.field === 'member_names' || isBillSplitError(error, 'BS_LIMIT')) {
      setErrors({ members: getBillSplitErrorMessage(error) })
    } else {
      // Server từ chối chính token (sai dạng, hoặc đã có người giữ): lần bấm sau phải dùng token khác, dùng lại sẽ lỗi mãi.
      if (invalid?.field === 'token') attempt.current = null
      toast.error(getBillSplitErrorMessage(error), {
        duration: isBillSplitError(error, 'BS_RATE_LIMITED') ? RATE_LIMIT_TOAST_MS : undefined,
      })
    }
  }

  function submit(names: string[]) {
    const input: CreateGroupInput = { name: normalizeName(name), memberNames: names.map(normalizeName) }
    const found = validateCreateGroup(input)
    if (found) {
      setErrors(found)
      document.getElementById(found.name ? 'group-name' : 'group-members')?.focus()
      return
    }
    setErrors({})
    createGroup.mutate(
      { ...input, token: tokenFor(input) },
      {
        // replace: bấm Quay lại từ trang nhóm vừa tạo thì về trang Chia tiền chứ không rơi lại vào form đã điền.
        onSuccess: ({ token }) => void navigate(billSplitPaths.group(token), { replace: true }),
        onError: showServerError,
      },
    )
  }

  return (
    <>
      <PageHeader title="Tạo nhóm mới" backHref={billSplitPaths.home()} backIcon="close" />
      <PageBody padBottom className="pt-6">
        <CreateGroupForm
          name={name}
          onNameChange={(value) => {
            setName(value)
            if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
          }}
          memberNames={memberNames}
          onMemberNamesChange={(values) => {
            setMemberNames(values)
            if (errors.members) setErrors((current) => ({ ...current, members: undefined }))
          }}
          onSubmit={submit}
          isSubmitting={createGroup.isPending}
          errors={errors}
          autoFocus
        />
      </PageBody>
    </>
  )
}
