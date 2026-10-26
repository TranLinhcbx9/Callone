import { LinkIcon } from 'lucide-react'
import { AppLink } from '@/shared/ui/AppLink'
import { ErrorState } from '@/shared/ui/EmptyState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Button } from '@/shared/ui/button'

/** Lỗi BS_GROUP_NOT_FOUND: link sai, đã đổi hoặc nhóm đã xóa. */
export function GroupNotFoundMockup() {
  return (
    <>
      <PageHeader title="Chia tiền" backHref="/dev/mockups/bill-split-home" />
      <ErrorState
        className="pt-16"
        icon={<LinkIcon />}
        title="Không tìm thấy nhóm"
        description="Link này không đúng, đã được đổi hoặc nhóm đã bị xóa. Hãy nhờ bạn bè gửi lại link mới."
        action={
          <Button variant="ghost" asChild>
            <AppLink href="/dev/mockups/bill-split-home">Về trang Chia tiền</AppLink>
          </Button>
        }
        onRetry={() => undefined}
        retryLabel="Dán link khác"
      />
    </>
  )
}
