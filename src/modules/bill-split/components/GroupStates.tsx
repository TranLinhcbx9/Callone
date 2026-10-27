import { LinkIcon, WifiOffIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { AppLink } from '@/shared/ui/AppLink'
import { ErrorState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/** Ô chữ nhật xám thay cho chữ trong tiêu đề khi chưa có dữ liệu. Cao bằng một dòng chữ để header không nhảy. */
export function TitleSkeleton({ className }: { className: string }) {
  return <span className={cn('inline-block animate-pulse rounded-md bg-muted align-middle', className)} />
}

/**
 * Đang tải nhóm: khung xương đúng hình trang thật (header, ba tab, thẻ tổng chi, danh sách) nên trang không nhảy
 * khi dữ liệu về.
 */
export function GroupLoading({ backHref }: { backHref: string }) {
  return (
    <>
      <PageHeader
        title={<TitleSkeleton className="h-5 w-40" />}
        subtitle={<TitleSkeleton className="mt-1 h-3.5 w-24" />}
        backHref={backHref}
      >
        <div aria-hidden="true" className="flex h-11 items-center gap-8 border-b border-border px-6">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6 pt-5" aria-busy="true">
        <span role="status" className="sr-only">
          Đang tải nhóm…
        </span>
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-4 w-28" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  )
}

export interface GroupNotFoundProps {
  /** Trang Chia tiền, nơi dán link khác. */
  homeHref: string
  /** Bấm "Dán link khác". */
  onPasteOther: () => void
  /** Chỉ truyền khi nhóm này đang lưu trên máy: hiện thêm nút xóa khỏi máy này. */
  onForget?: () => void
  /** Tiêu đề header, mặc định "Chia tiền". Form khoản chi truyền tiêu đề của chính nó để header không nhảy. */
  title?: string
  backIcon?: 'back' | 'close'
  /**
   * Link này có thể là phía cũ của một lần đổi link mà phản hồi bị mất, nhưng app chưa kiểm tra được vì mất mạng.
   * Khi đó chưa thể kết luận "không tìm thấy": nút chính là "Thử lại" (onCheckAgain), "Dán link khác" thành nút phụ.
   */
  unreachable?: boolean
  onCheckAgain?: () => void
}

/** Lỗi BS_GROUP_NOT_FOUND: link sai, đã được đổi hoặc nhóm đã bị xóa. */
export function GroupNotFound({
  homeHref,
  onPasteOther,
  onForget,
  title = 'Chia tiền',
  backIcon,
  unreachable = false,
  onCheckAgain,
}: GroupNotFoundProps) {
  const pending = unreachable && onCheckAgain !== undefined
  return (
    <>
      <PageHeader title={title} backHref={homeHref} backIcon={backIcon} />
      <ErrorState
        className="pt-16"
        icon={pending ? <WifiOffIcon /> : <LinkIcon />}
        title={pending ? 'Chưa mở được nhóm' : 'Không tìm thấy nhóm'}
        description={
          pending
            ? 'Link này có thể vừa được đổi, mà app chưa kiểm tra được vì mất kết nối. Kiểm tra mạng rồi thử lại.'
            : 'Link này không đúng, đã được đổi hoặc nhóm đã bị xóa. Hãy nhờ bạn bè gửi lại link mới.'
        }
        onRetry={pending ? onCheckAgain : onPasteOther}
        retryLabel={pending ? 'Thử lại' : 'Dán link khác'}
        action={
          <>
            {pending && (
              <Button variant="ghost" onClick={onPasteOther}>
                Dán link khác
              </Button>
            )}
            <Button variant="ghost" asChild>
              <AppLink href={homeHref}>Về trang Chia tiền</AppLink>
            </Button>
            {onForget && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onForget}
              >
                Xóa khỏi máy này
              </Button>
            )}
          </>
        }
      />
    </>
  )
}

export interface GroupLoadFailedProps {
  homeHref: string
  onRetry: () => void
  /** Câu mô tả theo loại lỗi, mặc định là lời nhắc kiểm tra mạng. */
  description?: string
  title?: string
  backIcon?: 'back' | 'close'
}

/** Không tải được nhóm vì lỗi mạng hoặc lỗi lạ (khác với "không tìm thấy"): cho thử lại. */
export function GroupLoadFailed({
  homeHref,
  onRetry,
  description = 'Kiểm tra kết nối mạng rồi thử lại.',
  title = 'Chia tiền',
  backIcon,
}: GroupLoadFailedProps) {
  return (
    <>
      <PageHeader title={title} backHref={homeHref} backIcon={backIcon} />
      <ErrorState
        className="pt-16"
        icon={<WifiOffIcon />}
        title="Không tải được nhóm"
        description={description}
        onRetry={onRetry}
        action={
          <Button variant="ghost" asChild>
            <AppLink href={homeHref}>Về trang Chia tiền</AppLink>
          </Button>
        }
      />
    </>
  )
}
