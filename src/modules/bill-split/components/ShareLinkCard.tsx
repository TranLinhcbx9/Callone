import { useRef, useState } from 'react'
import { LinkIcon, RefreshCwIcon, ShareIcon } from 'lucide-react'
import { canShareNatively } from '@/modules/bill-split/hooks/useShareGroup'
import { CopyButton } from '@/shared/ui/CopyButton'
import { Spinner } from '@/shared/ui/Spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'

export interface ShareLinkCardProps {
  /** Link đầy đủ của nhóm, có chứa token bí mật. */
  url: string
  groupName: string
  /** Đổi sang link mới, link cũ hết hiệu lực. Không truyền thì ẩn dòng đổi link. */
  onRotate?: () => void
  isRotating?: boolean
  /**
   * Ép hiện hoặc ẩn nút Chia sẻ. Mặc định hiện khi trình duyệt có navigator.share và đang dùng cảm ứng (điện thoại,
   * máy tính bảng). Trên máy tính chỉ có "Sao chép link", dù Edge hay Safari trên máy tính cũng có navigator.share.
   */
  canShare?: boolean
  /** Gọi sau khi sao chép link thành công (nơi gọi hiện toast "Đã chép link"). */
  onCopied?: () => void
}

/** Thẻ chia sẻ nhóm: link, nút Chia sẻ (hộp chia sẻ của điện thoại), sao chép, và đổi link có xác nhận. */
export function ShareLinkCard({ url, groupName, onRotate, isRotating, canShare, onCopied }: ShareLinkCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const rotateButtonRef = useRef<HTMLButtonElement>(null)
  const nativeShare = canShare ?? canShareNatively()

  async function share() {
    try {
      await navigator.share({ title: groupName, text: `Vào nhóm chia tiền "${groupName}"`, url })
    } catch {
      // Người dùng đóng hộp chia sẻ: không cần báo gì.
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <LinkIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-body leading-snug font-semibold">Link chia sẻ</h3>
          <p className="mt-0.5 text-small text-muted-foreground">
            Ai có link này đều xem và sửa được nhóm. Chỉ gửi cho người trong hội.
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex h-10 items-center gap-1 rounded-lg border border-border bg-muted/60 pr-1 pl-3">
        <span className="tnum min-w-0 flex-1 truncate text-small text-muted-foreground" title={url}>
          {url}
        </span>
        <CopyButton iconOnly value={url} label="Sao chép link" variant="ghost" size="icon-sm" onCopied={onCopied} />
      </div>

      <div className="mt-3 flex gap-2">
        {nativeShare && (
          <Button className="flex-1" onClick={share}>
            <ShareIcon />
            Chia sẻ
          </Button>
        )}
        <CopyButton
          value={url}
          label="Sao chép link"
          size="default"
          variant={nativeShare ? 'outline' : 'default'}
          className="flex-1"
          onCopied={onCopied}
        />
      </div>

      {onRotate && (
        <>
          <div className="my-4 h-px bg-border" />
          <button
            ref={rotateButtonRef}
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isRotating}
            className="inline-flex items-center gap-2 text-small font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground disabled:opacity-50"
          >
            {isRotating ? <Spinner className="size-3.5" /> : <RefreshCwIcon className="size-3.5" />}
            Đổi link mới
          </button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            {/* Hộp xác nhận không có nút kích hoạt theo kiểu Radix, nên tự đưa con trỏ về nút "Đổi link mới" khi đóng. */}
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                rotateButtonRef.current?.focus({ preventScroll: true })
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Đổi link mới?</AlertDialogTitle>
                <AlertDialogDescription>
                  Link cũ sẽ không mở được nữa. Bạn cần gửi lại link mới cho mọi người trong nhóm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={onRotate}>Đổi link</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  )
}
