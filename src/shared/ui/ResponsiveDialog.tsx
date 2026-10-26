import { createContext, useContext, type ReactNode } from 'react'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Drawer, DrawerContent, DrawerNested, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/shared/ui/drawer'

export interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Nội dung chính, tự cuộn khi dài. */
  children?: ReactNode
  /** Hàng nút ở chân, viết theo thứ tự [Hủy, Nút chính]. Điện thoại xếp dọc với nút chính ở trên, máy tính xếp ngang với nút chính bên phải. */
  footer?: ReactNode
  /** Ẩn tiêu đề trên màn hình nhưng vẫn cho trình đọc màn hình. */
  hideTitle?: boolean
  /** Bề rộng hộp thoại trên desktop. */
  size?: 'sm' | 'md' | 'lg'
  /** false: không đóng được khi bấm ra ngoài, nhấn Esc hay vuốt xuống (đang lưu). */
  dismissible?: boolean
  /** first: focus vào phần tử đầu tiên khi mở (hợp với form). content: focus vào khung hộp thoại, không hiện viền focus lên nút (hợp với hộp chỉ để xem như mã QR). */
  initialFocus?: 'first' | 'content'
  className?: string
  bodyClassName?: string
}

/** true bên trong ngăn kéo của ResponsiveDialog: hộp thoại lồng bên trong sẽ dùng ngăn kéo lồng của vaul. */
const InsideDrawerContext = createContext(false)

const DESKTOP_WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' } as const

/**
 * Điện thoại (dưới 768px): ngăn kéo từ dưới lên, vuốt xuống để đóng, chừa vùng an toàn.
 * Máy tính: hộp thoại giữa màn hình. Nơi gọi chỉ cần một bộ props.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  hideTitle,
  size = 'md',
  dismissible = true,
  initialFocus = 'first',
  className,
  bodyClassName,
}: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop()
  const insideDrawer = useContext(InsideDrawerContext)

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(next) => (dismissible || next) && onOpenChange(next)}>
        <DialogContent
          showCloseButton={dismissible}
          onInteractOutside={(event) => !dismissible && event.preventDefault()}
          onEscapeKeyDown={(event) => !dismissible && event.preventDefault()}
          onOpenAutoFocus={
            initialFocus === 'content'
              ? (event) => {
                  event.preventDefault()
                  ;(event.target as HTMLElement).focus()
                }
              : undefined
          }
          className={cn(DESKTOP_WIDTH[size], className)}
        >
          <DialogHeader className={cn(hideTitle && 'sr-only')}>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          {children && <div className={cn('min-h-0', bodyClassName)}>{children}</div>}
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    )
  }

  const Root = insideDrawer ? DrawerNested : Drawer
  return (
    <Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      <DrawerContent className={className}>
        <InsideDrawerContext.Provider value>
          <DrawerHeader className={cn(hideTitle && 'sr-only')}>
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
          </DrawerHeader>
          {children && <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-4', bodyClassName)}>{children}</div>}
          {footer && <DrawerFooter className="flex-col-reverse">{footer}</DrawerFooter>}
          {!footer && <div className="pb-safe" />}
        </InsideDrawerContext.Provider>
      </DrawerContent>
    </Root>
  )
}
