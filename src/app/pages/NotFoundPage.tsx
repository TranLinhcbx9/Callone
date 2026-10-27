import { AppLink } from '@/shared/ui/AppLink'
import { ErrorState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { Button } from '@/shared/ui/button'

/** Đường dẫn không khớp trang nào. */
export function NotFoundPage() {
  return (
    <PageBody>
      <ErrorState
        className="pt-24"
        title="Không tìm thấy trang"
        description="Đường dẫn này không tồn tại."
        action={
          <Button asChild>
            <AppLink href="/">Về trang chủ</AppLink>
          </Button>
        }
      />
    </PageBody>
  )
}
