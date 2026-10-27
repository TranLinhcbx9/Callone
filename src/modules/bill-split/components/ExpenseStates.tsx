import { ReceiptIcon, UsersIcon } from 'lucide-react'
import { AppLink } from '@/shared/ui/AppLink'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/** Một ô nhập có nhãn trong khung xương: nhãn rồi ô cao `height`. */
function FieldSkeleton({ height = 'h-10' }: { height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-20" />
      <Skeleton className={`${height} w-full rounded-lg`} />
    </div>
  )
}

/**
 * Đang tải nhóm để dựng form khoản chi: khung xương cùng thứ tự các ô với form thật (số tiền, tiêu đề, ai trả, ngày,
 * cách chia, ghi chú) để trang không nhảy khi dữ liệu về. Header do trang dựng, vì tiêu đề đã biết từ đường dẫn.
 */
export function ExpenseFormSkeleton() {
  return (
    <PageBody padBottom className="pt-6" aria-busy="true">
      <span role="status" className="sr-only">
        Đang tải…
      </span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="mt-1 h-4 w-28" />
          <Skeleton className="mt-1 h-8 w-56 rounded-full" />
        </div>
        <FieldSkeleton />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
        </div>
        <FieldSkeleton />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    </PageBody>
  )
}

/** Mở form sửa một khoản chi mà id không có trong nhóm (đã bị xóa, hoặc đường dẫn sai). */
export function ExpenseNotFound({ groupHref }: { groupHref: string }) {
  return (
    <PageBody>
      <EmptyState
        className="pt-12"
        icon={<ReceiptIcon />}
        title="Không tìm thấy khoản chi"
        description="Khoản chi này không còn nữa. Có thể người khác vừa xóa."
        action={
          <Button asChild>
            <AppLink href={groupHref} replace>
              Về nhóm
            </AppLink>
          </Button>
        }
      />
    </PageBody>
  )
}

/**
 * Nhóm không còn thành viên nào (đã xóa hết người chưa có khoản chi): form không có ai để chọn làm người trả hay người chia,
 * nên dẫn sang tab Thành viên thay vì để người dùng kẹt ở một form không lưu được.
 */
export function ExpenseNoMembers({ membersHref }: { membersHref: string }) {
  return (
    <PageBody>
      <EmptyState
        className="pt-12"
        icon={<UsersIcon />}
        title="Nhóm chưa có thành viên"
        description="Thêm thành viên trước khi ghi khoản chi."
        action={
          <Button asChild>
            <AppLink href={membersHref} replace>
              Thêm thành viên
            </AppLink>
          </Button>
        }
      />
    </PageBody>
  )
}
