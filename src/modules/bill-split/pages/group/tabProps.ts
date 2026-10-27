import type { Group } from '@/modules/bill-split/domain/types'

/** Props chung của các tab trong trang nhóm. GroupPage tải nhóm rồi truyền xuống, tab không tự tải. */
export interface GroupTabProps {
  token: string
  group: Group
  /** Id thành viên mà máy này chọn là "mình", null khi chưa chọn. */
  meId: string | null
  /** Mở hộp "Bạn là ai trong nhóm?" của trang. */
  onChangeMe: () => void
  /** Mở hộp xác nhận xóa nhóm của trang. */
  onDeleteGroup: () => void
}
