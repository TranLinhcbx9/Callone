import { PlusIcon } from 'lucide-react'
import { bankDisplayName } from '@/modules/bill-split/domain/banks'
import type { Bank, Member } from '@/modules/bill-split/domain/types'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ListGroup, ListRow } from '@/shared/ui/ListRow'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

export interface MemberListProps {
  members: readonly Member[]
  /** Danh sách ngân hàng để hiện tên ngân hàng thay vì mã BIN. */
  banks?: readonly Bank[]
  meId?: string | null
  /** Bấm một người để sửa tên và tài khoản. */
  onEdit?: (member: Member) => void
  onAdd?: () => void
  /** Hiện dòng "Bạn đang dùng nhóm này với tên ..." kèm nút Đổi. */
  onChangeMe?: () => void
  /** false: ẩn nút thêm (đã đủ 50 người). */
  canAdd?: boolean
}

function bankSummary(member: Member, banks?: readonly Bank[]): string {
  if (!member.bank) return 'Chưa nhập tài khoản'
  const tail = member.bank.accountNumber.slice(-4)
  return `${bankDisplayName(member.bank.bin, banks)} · ••••${tail}`
}

/** Danh sách thành viên với tóm tắt tài khoản ngân hàng (nếu có), nút thêm người và dòng "Bạn là ...". */
export function MemberList({ members, banks, meId, onEdit, onAdd, onChangeMe, canAdd = true }: MemberListProps) {
  const me = members.find((member) => member.id === meId)
  return (
    <div className="flex flex-col gap-3">
      {me && onChangeMe && (
        <div className="flex items-center gap-3 rounded-xl bg-primary-soft/60 py-2.5 pr-2 pl-4">
          <p className="min-w-0 flex-1 text-small text-primary-soft-foreground">
            Bạn đang dùng nhóm này với tên <span className="font-semibold">{me.name}</span>.
          </p>
          <Button variant="ghost" size="sm" onClick={onChangeMe} className="text-primary-soft-foreground">
            Đổi
          </Button>
        </div>
      )}
      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-xs">
          <EmptyState compact title="Chưa có thành viên nào" description="Thêm người đầu tiên để bắt đầu chia tiền." />
        </div>
      ) : (
        <ListGroup>
          {members.map((member) => (
            <ListRow
              key={member.id}
              leading={<MemberAvatar name={member.name} colorKey={member.id} />}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{member.name}</span>
                  {member.id === meId && <Badge variant="soft">Bạn</Badge>}
                </span>
              }
              subtitle={bankSummary(member, banks)}
              chevron={Boolean(onEdit)}
              onClick={onEdit ? () => onEdit(member) : undefined}
            />
          ))}
        </ListGroup>
      )}
      {onAdd && canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-input text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <PlusIcon className="size-4" />
          Thêm thành viên
        </button>
      )}
    </div>
  )
}
