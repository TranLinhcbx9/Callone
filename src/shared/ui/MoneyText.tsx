import { formatVnd } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const SIZES = {
  sm: 'text-small',
  md: 'text-body',
  lg: 'text-title',
  xl: 'text-headline',
  display: 'text-display',
} as const

export interface MoneyTextProps {
  /** Số tiền nguyên đồng. Số âm hiện dấu trừ thật (−), không dùng gạch ngang. */
  amount: number
  /** never: không hiện dấu cộng. always: hiện + cho số dương (hợp với số dư). Số âm luôn có dấu trừ. */
  sign?: 'never' | 'always'
  /**
   * neutral: màu chữ thường. muted: chữ phụ. auto: dương xanh lá dịu, âm nâu đỏ dịu, 0 chữ phụ.
   * positive, negative: ép màu.
   */
  tone?: 'neutral' | 'muted' | 'auto' | 'positive' | 'negative'
  size?: keyof typeof SIZES
  weight?: 'normal' | 'medium' | 'semibold'
  className?: string
}

const WEIGHTS = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' } as const

/** Số tiền dạng "1.250.000 ₫", số liền hàng để các dòng canh thẳng cột. */
export function MoneyText({
  amount,
  sign = 'never',
  tone = 'neutral',
  size = 'md',
  weight = 'medium',
  className,
}: MoneyTextProps) {
  const prefix = amount < 0 ? '−' : sign === 'always' && amount > 0 ? '+' : ''
  const resolved = tone === 'auto' ? (amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'muted') : tone
  return (
    <span
      className={cn(
        'tnum whitespace-nowrap',
        SIZES[size],
        WEIGHTS[weight],
        resolved === 'positive' && 'text-positive',
        resolved === 'negative' && 'text-negative',
        resolved === 'muted' && 'text-muted-foreground',
        className,
      )}
    >
      {prefix}
      {formatVnd(Math.abs(amount))}
    </span>
  )
}
