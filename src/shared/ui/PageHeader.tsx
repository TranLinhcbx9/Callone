import type { ReactNode } from 'react'
import { ArrowLeftIcon, XIcon } from 'lucide-react'
import { useGoBack } from '@/shared/hooks/useGoBack'
import { useScrolled } from '@/shared/hooks/useScrolled'
import { cn } from '@/shared/lib/utils'
import { AppLink } from '@/shared/ui/AppLink'
import { Button } from '@/shared/ui/button'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /**
   * Trang cha của trang này, mở khi bấm nút quay lại. Mục liền trước trong lịch sử đúng là trang cha thì lùi lịch sử
   * (như bấm Back), không thì thay mục hiện tại bằng trang cha: nút quay lại không làm lịch sử dài thêm. Vẫn là liên kết thật
   * (mở tab mới, sao chép địa chỉ được).
   */
  backHref?: string
  /** Hoặc xử lý riêng khi bấm nút quay lại (bỏ qua nếu có backHref). */
  onBack?: () => void
  /** back: mũi tên. close: dấu X, dùng cho form toàn màn hình. */
  backIcon?: 'back' | 'close'
  backLabel?: string
  /** Nút ở bên phải: Button icon, DropdownMenu... */
  actions?: ReactNode
  /** Hiện trước tiêu đề khi không có nút quay lại (logo, avatar). */
  leading?: ReactNode
  /** Phần dính cùng header, ví dụ thanh tab. */
  children?: ReactNode
  className?: string
}

/**
 * Header dính đầu trang: nền mờ, viền mảnh hiện khi đã cuộn, chừa vùng an toàn của tai thỏ.
 * Mỗi trang tự dựng header của mình (app không có thanh trên chung).
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  onBack,
  backIcon = 'back',
  backLabel,
  actions,
  leading,
  children,
  className,
}: PageHeaderProps) {
  const scrolled = useScrolled()
  const goBack = useGoBack(backHref)
  const hasBack = Boolean(backHref || onBack)
  const label = backLabel ?? (backIcon === 'close' ? 'Đóng' : 'Quay lại')
  const BackIcon = backIcon === 'close' ? XIcon : ArrowLeftIcon

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b bg-background/85 pt-safe backdrop-blur-md transition-colors duration-200 supports-[backdrop-filter]:bg-background/75',
        scrolled ? 'border-border' : 'border-transparent',
        className,
      )}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-(--app-column) items-center gap-1 px-2">
        {hasBack ? (
          <Button variant="ghost" size="icon-lg" aria-label={label} asChild={Boolean(backHref)} onClick={backHref ? undefined : onBack}>
            {backHref ? (
              <AppLink
                href={backHref}
                aria-label={label}
                onClick={(event) => {
                  // Bấm kèm Ctrl, Cmd, Shift hay chuột giữa là mở tab mới, và địa chỉ ngoài app: để trình duyệt tự xử lý.
                  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  if (!backHref.startsWith('/')) return
                  event.preventDefault()
                  goBack()
                }}
              >
                <BackIcon />
              </AppLink>
            ) : (
              <BackIcon />
            )}
          </Button>
        ) : (
          leading && <span className="pl-2">{leading}</span>
        )}
        <div className={cn('min-w-0 flex-1 py-2', !hasBack && !leading && 'pl-2')}>
          <h1 className="truncate text-title leading-snug font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-small text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </div>
      {children && <div className="mx-auto w-full max-w-(--app-column)">{children}</div>}
    </header>
  )
}
