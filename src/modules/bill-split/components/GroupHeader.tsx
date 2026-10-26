import type { ReactNode } from 'react'
import { MoreHorizontalIcon, PencilIcon, ShareIcon, Trash2Icon, UserRoundIcon } from 'lucide-react'
import type { Member } from '@/modules/bill-split/domain/types'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

export interface GroupHeaderProps {
  name: string
  members: readonly Member[]
  /** Id thành viên là mình, để hiện "Bạn là Linh". */
  meId?: string | null
  backHref?: string
  onBack?: () => void
  /** Bấm nút chia sẻ ở góc: mở hộp chia sẻ link. */
  onShare?: () => void
  onRename?: () => void
  /** Mở lại hộp "Bạn là ai trong nhóm?". */
  onChangeMe?: () => void
  onDelete?: () => void
  /** Thanh tab dính cùng header. GroupSections tự truyền vào. */
  tabs?: ReactNode
}

/** Header của trang nhóm: tên nhóm, "4 người · Bạn là Linh", nút chia sẻ và menu ba chấm. */
export function GroupHeader({
  name,
  members,
  meId,
  backHref,
  onBack,
  onShare,
  onRename,
  onChangeMe,
  onDelete,
  tabs,
}: GroupHeaderProps) {
  const me = members.find((member) => member.id === meId)
  const subtitle = `${members.length} người${me ? ` · Bạn là ${me.name}` : ''}`
  const hasMenu = Boolean(onRename || onChangeMe || onDelete)

  return (
    <PageHeader
      title={name}
      subtitle={subtitle}
      backHref={backHref}
      onBack={onBack}
      actions={
        <>
          {onShare && (
            <Button variant="ghost" size="icon-lg" aria-label="Chia sẻ nhóm" onClick={onShare}>
              <ShareIcon />
            </Button>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Thêm tùy chọn">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {onRename && (
                  <DropdownMenuItem onSelect={onRename}>
                    <PencilIcon />
                    Đổi tên nhóm
                  </DropdownMenuItem>
                )}
                {onChangeMe && (
                  <DropdownMenuItem onSelect={onChangeMe}>
                    <UserRoundIcon />
                    Bạn là ai trong nhóm?
                  </DropdownMenuItem>
                )}
                {onDelete && (onRename || onChangeMe) && <DropdownMenuSeparator />}
                {onDelete && (
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2Icon />
                    Xóa nhóm
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    >
      {tabs}
    </PageHeader>
  )
}
