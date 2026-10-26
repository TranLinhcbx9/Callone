import type { FormEvent } from 'react'
import { ClipboardPasteIcon, LinkIcon } from 'lucide-react'
import { AlertCircleIcon } from 'lucide-react'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface PasteLinkFormProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
  /** Ví dụ "Link này không đúng hoặc nhóm đã bị xóa." */
  error?: string | null
}

/** Ô dán link nhóm. Nút Dán đọc clipboard nếu trình duyệt cho phép. Dành cho nhóm bạn bè gửi qua Zalo, Messenger. */
export function PasteLinkForm({ value, onChange, onSubmit, isSubmitting, error }: PasteLinkFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) onChange(text.trim())
    } catch {
      // Trình duyệt không cho đọc clipboard: người dùng tự dán vào ô.
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 shadow-xs" noValidate>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LinkIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-body leading-snug font-semibold">Đã có link nhóm?</h3>
          <p className="mt-0.5 text-small text-muted-foreground">Dán link bạn bè gửi để mở nhóm trên máy này.</p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Dán link nhóm"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Link nhóm"
            aria-invalid={error ? true : undefined}
            className="pr-11"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dán từ clipboard"
            onClick={paste}
            className="absolute top-0.5 right-0.5 text-muted-foreground"
          >
            <ClipboardPasteIcon />
          </Button>
        </div>
        <Button type="submit" disabled={isSubmitting || value.trim() === ''}>
          {isSubmitting && <Spinner />}
          Mở nhóm
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-small text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </form>
  )
}
