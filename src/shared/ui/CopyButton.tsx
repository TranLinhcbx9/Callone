import type { ComponentProps } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard'
import { Button } from '@/shared/ui/button'

export interface CopyButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'value'> {
  /** Chữ sẽ được chép. */
  value: string
  label?: string
  copiedLabel?: string
  /** Chỉ hiện icon (nhớ có aria-label). */
  iconOnly?: boolean
  onCopied?: () => void
}

/** Nút sao chép: bấm xong đổi nhãn thành "Đã chép" khoảng hai giây. */
export function CopyButton({
  value,
  label = 'Sao chép',
  copiedLabel = 'Đã chép',
  iconOnly,
  onCopied,
  variant = 'outline',
  size = 'sm',
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      onClick={async () => {
        if (await copy(value)) onCopied?.()
      }}
      {...props}
    >
      {copied ? <CheckIcon className="text-positive" /> : <CopyIcon />}
      {!iconOnly && (copied ? copiedLabel : label)}
    </Button>
  )
}
