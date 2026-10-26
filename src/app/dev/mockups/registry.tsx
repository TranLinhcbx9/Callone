import type { ReactElement } from 'react'
import { BillSplitHomeMockup } from '@/app/dev/mockups/BillSplitHomeMockup'
import { CreateGroupMockup } from '@/app/dev/mockups/CreateGroupMockup'
import { ExpenseFormMockup } from '@/app/dev/mockups/ExpenseFormMockup'
import { GroupLoadingMockup } from '@/app/dev/mockups/GroupLoadingMockup'
import { GroupNotFoundMockup } from '@/app/dev/mockups/GroupNotFoundMockup'
import { GroupPageDemo } from '@/app/dev/mockups/GroupPageDemo'
import { HomeMockup } from '@/app/dev/mockups/HomeMockup'
import { ShareLinkMockup } from '@/app/dev/mockups/ShareLinkMockup'

export interface MockupEntry {
  /** Đường dẫn: /dev/mockups/<slug>. Script chụp ảnh cũng dùng slug này. */
  slug: string
  title: string
  description: string
  element: ReactElement
}

/** Mọi màn hình mockup, theo thứ tự luồng dùng. */
export const MOCKUPS: MockupEntry[] = [
  { slug: 'home', title: 'Trang chủ', description: 'Launcher các module, vài module Sắp có.', element: <HomeMockup /> },
  {
    slug: 'bill-split-home',
    title: 'Chia tiền: nhóm của bạn',
    description: 'Danh sách nhóm, tạo nhóm mới, dán link nhóm.',
    element: <BillSplitHomeMockup />,
  },
  {
    slug: 'bill-split-home-empty',
    title: 'Chia tiền: chưa có nhóm',
    description: 'Trạng thái trống của trang Chia tiền.',
    element: <BillSplitHomeMockup empty />,
  },
  { slug: 'create-group', title: 'Tạo nhóm', description: 'Tên nhóm và thành viên dạng chip.', element: <CreateGroupMockup /> },
  {
    slug: 'who-am-i',
    title: 'Bạn là ai trong nhóm?',
    description: 'Hộp chọn tên khi mở nhóm lần đầu trên máy này.',
    element: <GroupPageDemo overlay="who" />,
  },
  {
    slug: 'group-expenses',
    title: 'Nhóm: Chi tiêu',
    description: 'Tổng chi, khoản chi gom theo ngày, nút thêm khoản chi.',
    element: <GroupPageDemo initialTab="expenses" />,
  },
  {
    slug: 'group-balances',
    title: 'Nhóm: Số dư',
    description: 'Số dư từng người, gợi ý chuyển khoản, lịch sử đã trả.',
    element: <GroupPageDemo initialTab="balances" />,
  },
  {
    slug: 'group-members',
    title: 'Nhóm: Thành viên',
    description: 'Thành viên và tài khoản ngân hàng, chia sẻ link, xóa nhóm.',
    element: <GroupPageDemo initialTab="members" />,
  },
  {
    slug: 'expense-form',
    title: 'Khoản chi: chia đều',
    description: 'Form toàn màn hình, gõ 1tr2 để thử.',
    element: <ExpenseFormMockup variant="equal" />,
  },
  {
    slug: 'expense-form-exact',
    title: 'Khoản chi: số tiền riêng',
    description: 'Chia riêng từng người, báo còn thiếu hoặc chia lố.',
    element: <ExpenseFormMockup variant="exact" />,
  },
  {
    slug: 'expense-form-edit',
    title: 'Khoản chi: sửa',
    description: 'Sửa khoản chi có sẵn, có nút xóa.',
    element: <ExpenseFormMockup variant="edit" />,
  },
  {
    slug: 'expense-form-errors',
    title: 'Khoản chi: lỗi nhập',
    description: 'Mọi lỗi hiện cùng lúc sau khi bấm Lưu.',
    element: <ExpenseFormMockup variant="errors" />,
  },
  {
    slug: 'vietqr',
    title: 'Mã VietQR',
    description: 'Hộp mã QR chuyển khoản với số tiền và nội dung điền sẵn.',
    element: <GroupPageDemo initialTab="balances" overlay="qr" />,
  },
  {
    slug: 'member-form',
    title: 'Sửa thành viên',
    description: 'Tên và tài khoản ngân hàng.',
    element: <GroupPageDemo initialTab="members" overlay="member" />,
  },
  {
    slug: 'share-link',
    title: 'Chia sẻ link nhóm',
    description: 'Link, nút Chia sẻ, sao chép, đổi link.',
    element: <ShareLinkMockup />,
  },
  {
    slug: 'delete-group',
    title: 'Xóa nhóm',
    description: 'Phải gõ lại tên nhóm để xác nhận.',
    element: <GroupPageDemo initialTab="members" overlay="delete" />,
  },
  {
    slug: 'group-not-found',
    title: 'Không tìm thấy nhóm',
    description: 'Trạng thái lỗi khi link sai hoặc nhóm đã xóa.',
    element: <GroupNotFoundMockup />,
  },
  {
    slug: 'group-loading',
    title: 'Đang tải nhóm',
    description: 'Khung xương khi chờ dữ liệu.',
    element: <GroupLoadingMockup />,
  },
]
