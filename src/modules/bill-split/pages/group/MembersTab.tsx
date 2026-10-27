import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import { getBillSplitErrorMessage } from '@/modules/bill-split/api/errors'
import { MemberList } from '@/modules/bill-split/components/MemberList'
import { ShareLinkCard } from '@/modules/bill-split/components/ShareLinkCard'
import { BANKS } from '@/modules/bill-split/domain/banks'
import { useRotateToken } from '@/modules/bill-split/hooks/useMutations'
import { MemberDialog } from '@/modules/bill-split/pages/group/MemberDialog'
import type { GroupTabProps } from '@/modules/bill-split/pages/group/tabProps'
import { useMemberDialog } from '@/modules/bill-split/pages/group/useMemberDialog'
import { groupLink, groupTabPath } from '@/modules/bill-split/paths'
import { toAppError } from '@/shared/lib/errors'
import { Section } from '@/shared/ui/Section'
import { Button } from '@/shared/ui/button'

/**
 * Tab Thành viên: danh sách kèm tóm tắt tài khoản, thêm và sửa thành viên, dòng "Bạn đang dùng nhóm này với tên ...",
 * chia sẻ link (sao chép, đổi link mới) và xóa nhóm. Hộp xác nhận xóa nhóm và hộp "Bạn là ai" thuộc về trang nhóm.
 */
export function MembersTab({ token, group, meId, onChangeMe, onDeleteGroup }: GroupTabProps) {
  const navigate = useNavigate()
  const rotateToken = useRotateToken()
  const memberDialog = useMemberDialog()

  const shareUrl = groupLink(window.location.origin, token)

  /**
   * Đổi link: server trả token mới và link cũ chết ngay. Mutation đã chuyển cache, danh sách gần đây và "mình là ai"
   * sang token mới, nên chỉ cần mở trang theo token mới (thay vì thêm một mục vào lịch sử, vì link cũ không còn dùng được).
   */
  async function rotate() {
    try {
      const newToken = await rotateToken.mutateAsync({ token })
      void navigate(groupTabPath(newToken, 'members'), { replace: true })
      toast.success('Đã đổi link mới. Nhớ gửi lại cho mọi người.')
    } catch (error) {
      // Mất mạng giữa chừng thì chưa biết link đã đổi hay chưa. Lần bấm tiếp theo dùng lại đúng link mới đang chờ
      // nên mời bấm lại, không nói như thể link đã đổi.
      toast.error(
        toAppError(error).kind === 'network'
          ? 'Mất kết nối khi đổi link. Hãy bấm "Đổi link mới" lần nữa.'
          : getBillSplitErrorMessage(error),
      )
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title="Thành viên" count={group.members.length}>
        <MemberList
          members={group.members}
          banks={BANKS}
          meId={meId}
          onEdit={memberDialog.openFor}
          onAdd={() => memberDialog.openFor(null)}
          onChangeMe={onChangeMe}
          canAdd={group.members.length < BS_LIMITS.membersPerGroup}
        />
      </Section>

      <Section title="Chia sẻ nhóm">
        <ShareLinkCard
          url={shareUrl}
          groupName={group.name}
          onRotate={() => void rotate()}
          isRotating={rotateToken.isPending}
          onCopied={() => toast.success('Đã chép link')}
        />
      </Section>

      <Button
        variant="ghost"
        className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDeleteGroup}
      >
        Xóa nhóm
      </Button>

      <MemberDialog
        key={memberDialog.session}
        token={token}
        group={group}
        member={memberDialog.member}
        open={memberDialog.open}
        onOpenChange={memberDialog.onOpenChange}
      />
    </div>
  )
}
