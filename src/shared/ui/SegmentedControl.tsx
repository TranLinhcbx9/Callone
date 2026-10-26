import type { ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Icon đứng trước nhãn. */
  icon?: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Nhãn cho trình đọc màn hình, ví dụ "Cách chia". */
  ariaLabel: string
  className?: string
}

/** Dải chọn một trong vài lựa chọn ngắn ("Chia đều", "Số tiền riêng"). Luôn có đúng một lựa chọn được chọn. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      className={cn('grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-[3px]', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs dark:data-[state=on]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0"
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
