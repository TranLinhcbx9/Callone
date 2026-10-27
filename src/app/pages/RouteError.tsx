import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ErrorState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { Button } from '@/shared/ui/button'

/** Lỗi khi render hoặc tải trang. Mỗi module có error boundary riêng nên lỗi không lan ra cả app. */
export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null

  return (
    <PageBody>
      <ErrorState
        className="pt-24"
        title="Có lỗi xảy ra"
        description={
          <>
            Thử tải lại trang. Nếu vẫn lỗi, mở lại app sau ít phút.
            {detail && <span className="mt-2 block text-caption break-words text-muted-foreground/80">{detail}</span>}
          </>
        }
        onRetry={() => window.location.reload()}
        retryLabel="Tải lại trang"
        action={
          // Thẻ <a> thường chứ không phải Link của router: lỗi có thể đến từ chính router, về trang chủ phải tải mới hoàn toàn.
          <Button variant="ghost" asChild>
            <a href="/">Về trang chủ</a>
          </Button>
        }
      />
    </PageBody>
  )
}
