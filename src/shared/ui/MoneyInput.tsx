import { useId, useRef } from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface MoneyInputProps {
  /** Chữ người dùng gõ, giữ nguyên (ví dụ "1tr2"). Việc đọc ra số do nơi gọi làm. */
  value: string
  onChange: (text: string) => void
  /** Dòng xem trước dưới ô, ví dụ "= 1.200.000 ₫". */
  preview?: string | null
  /** Thông báo lỗi, thay cho dòng xem trước. */
  error?: string | null
  /** Gợi ý khi ô còn trống, ví dụ "Gõ 150k, 1tr2 hoặc 1.200.000". */
  hint?: string
  id?: string
  placeholder?: string
  /** lg: ô lớn cho số tiền chính của khoản chi. md: ô gọn cho từng người. */
  size?: 'md' | 'lg'
  /** Nút gõ nhanh nối thêm vào cuối chữ. Chỉ hiện ở size lg. Truyền [] để ẩn. */
  quickSuffixes?: readonly string[]
  autoFocus?: boolean
  disabled?: boolean
  'aria-label'?: string
  onBlur?: () => void
  /** Bấm Enter (hoặc phím Tiếp trên điện thoại). Có truyền thì chặn việc gửi form để nơi gọi chuyển sang ô kế. */
  onEnter?: () => void
  /** Nhãn phím Enter trên bàn phím điện thoại. */
  enterKeyHint?: 'next' | 'done' | 'go'
  className?: string
}

const DEFAULT_SUFFIXES = ['k', 'tr', '000'] as const

/**
 * Ô nhập tiền kiểu Việt Nam. Bàn phím là bàn phím chữ (không phải bàn phím số) để gõ được "150k", "1tr2";
 * các nút k, tr, 000 giúp gõ nhanh trên điện thoại. Component chỉ hiển thị, không tự đọc số.
 */
export function MoneyInput({
  value,
  onChange,
  preview,
  error,
  hint,
  id,
  placeholder = '0',
  size = 'md',
  quickSuffixes = DEFAULT_SUFFIXES,
  autoFocus,
  disabled,
  'aria-label': ariaLabel,
  onBlur,
  onEnter,
  enterKeyHint = 'next',
  className,
}: MoneyInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-message`
  const inputRef = useRef<HTMLInputElement>(null)
  const large = size === 'lg'
  const message = error ?? preview ?? (value.trim() === '' ? hint : null)
  const showChips = large && quickSuffixes.length > 0

  function append(suffix: string) {
    onChange(value + suffix)
    inputRef.current?.focus()
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onEnter) {
              event.preventDefault()
              onEnter()
            }
          }}
          inputMode="text"
          enterKeyHint={enterKeyHint}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'tnum w-full min-w-0 rounded-xl border border-input bg-card shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:bg-input/30',
            large
              ? 'h-16 pr-12 pl-4 text-[1.75rem] leading-none font-semibold tracking-tight'
              : 'h-10 rounded-lg pr-8 pl-3 text-right text-base font-medium md:text-sm',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
            large ? 'right-4 text-title' : 'right-3 text-small',
          )}
        >
          ₫
        </span>
      </div>

      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn(
            'mt-2 flex items-start gap-1.5 text-small',
            error ? 'text-destructive' : 'tnum text-muted-foreground',
            !large && 'mt-1 text-caption',
          )}
        >
          {error && <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />}
          <span>{message}</span>
        </p>
      )}

      {showChips && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-caption text-muted-foreground">Gõ nhanh</span>
          {quickSuffixes.map((suffix) => (
            <button
              key={suffix}
              type="button"
              disabled={disabled || value.trim() === ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => append(suffix)}
              className="tnum h-8 min-w-11 rounded-full border border-border bg-card px-3 text-small font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none active:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {suffix}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
