import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

export interface ChipInputProps {
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  /** Số chip tối đa. Đủ rồi thì ô nhập bị khóa. */
  maxItems?: number
  /** Độ dài tối đa của mỗi chip. */
  maxLength?: number
  id?: string
  invalid?: boolean
  /** Thứ hiện trước chữ trong mỗi chip, ví dụ <MemberAvatar size="xs" name={value} />. */
  renderLeading?: (value: string) => ReactNode
  /** Nhãn nút xóa cho trình đọc màn hình, mặc định "Xóa {giá trị}". */
  removeLabel?: (value: string) => string
  disabled?: boolean
  className?: string
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('vi-VN') === b.toLocaleLowerCase('vi-VN')

/**
 * Nhập danh sách tên bằng chip. Enter, dấu phẩy hoặc nút + để thêm; Backspace khi ô trống để xóa chip cuối.
 * Tự bỏ tên rỗng và tên trùng (không phân biệt hoa thường).
 */
export function ChipInput({
  values,
  onValuesChange,
  placeholder = 'Nhập tên rồi bấm Enter',
  maxItems,
  maxLength = 40,
  id,
  invalid,
  renderLeading,
  removeLabel = (value) => `Xóa ${value}`,
  disabled,
  className,
}: ChipInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const full = maxItems !== undefined && values.length >= maxItems

  function commit(raw: string) {
    const parts = raw
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const part of parts) {
      if (maxItems !== undefined && next.length >= maxItems) break
      if (next.some((existing) => sameName(existing, part))) continue
      next.push(part.slice(0, maxLength))
    }
    onValuesChange(next)
    setText('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(text)
    } else if (event.key === 'Backspace' && text === '' && values.length > 0) {
      onValuesChange(values.slice(0, -1))
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pr-1 pl-1.5 text-body shadow-xs"
            >
              {renderLeading?.(value)}
              <span className={cn('truncate', !renderLeading && 'pl-1.5')}>{value}</span>
              <button
                type="button"
                aria-label={removeLabel(value)}
                disabled={disabled}
                onClick={() => onValuesChange(values.filter((item) => item !== value))}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
          disabled={disabled || full}
          placeholder={full ? 'Đã đủ số người tối đa' : placeholder}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={maxLength * 3}
          aria-invalid={invalid ? true : undefined}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 md:text-sm dark:bg-input/30"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Thêm"
          disabled={disabled || full || text.trim() === ''}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            commit(text)
            inputRef.current?.focus()
          }}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}
