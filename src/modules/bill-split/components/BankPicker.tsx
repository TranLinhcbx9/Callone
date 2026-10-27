import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDownIcon } from 'lucide-react'
import { bankDisplayName } from '@/modules/bill-split/domain/banks'
import type { Bank } from '@/modules/bill-split/domain/types'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/utils'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/shared/ui/command'

/** Bỏ dấu và viết thường để gõ "vietcombank", "ngoai thuong" hay "970436" đều ra. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

function defaultFilter(banks: readonly Bank[], query: string): Bank[] {
  const needle = fold(query.trim())
  if (!needle) return [...banks]
  return banks.filter((bank) => fold(`${bank.shortName} ${bank.code} ${bank.name} ${bank.bin}`).includes(needle))
}

export interface BankPickerProps {
  banks: readonly Bank[]
  /** Mã BIN của ngân hàng đang chọn. */
  value: string | null
  onChange: (bank: Bank) => void
  /** Hàm lọc riêng (ví dụ lọc không dấu của domain). Mặc định lọc theo tên, mã, BIN, bỏ dấu. */
  filter?: (banks: readonly Bank[], query: string) => Bank[]
  placeholder?: string
  id?: string
  invalid?: boolean
  disabled?: boolean
  /** Mở sẵn danh sách (dùng cho mockup). */
  defaultOpen?: boolean
}

/**
 * Ô chọn ngân hàng có tìm kiếm. Bấm mở ngăn kéo (điện thoại) hoặc hộp thoại (máy tính) chứa danh sách.
 * `value` là mã BIN; nếu mã đó không có trong `banks` thì ô vẫn hiện "Ngân hàng <mã>" thay vì như chưa chọn.
 */
export function BankPicker({
  banks,
  value,
  onChange,
  filter = defaultFilter,
  placeholder = 'Chọn ngân hàng',
  id,
  invalid,
  disabled,
  defaultOpen = false,
}: BankPickerProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const isDesktop = useIsDesktop()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const selected = banks.find((bank) => bank.bin === value)
  const visible = useMemo(() => filter(banks, query), [filter, banks, query])

  // Hộp danh sách không có nút kích hoạt theo kiểu Radix, nên khi đóng con trỏ rơi về body. Đưa con trỏ về ô chọn
  // để người dùng bàn phím và trình đọc màn hình không bị mất chỗ.
  useEffect(() => {
    if (open) {
      wasOpen.current = true
    } else if (wasOpen.current) {
      wasOpen.current = false
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-invalid={invalid ? true : undefined}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-base shadow-xs transition-[border-color,box-shadow] duration-150 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
          !selected && !value && 'text-muted-foreground',
        )}
      >
        {selected ? (
          <>
            <span className="min-w-0 flex-1 truncate">{selected.shortName}</span>
            <span className="text-small text-muted-foreground">{selected.code}</span>
          </>
        ) : value ? (
          // Mã BIN hợp lệ nhưng chưa có trong danh sách (server nhận mọi mã 6 số): hiện đúng thứ đang được lưu.
          <span className="min-w-0 flex-1 truncate">{bankDisplayName(value, banks)}</span>
        ) : (
          <span className="flex-1">{placeholder}</span>
        )}
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground/70" />
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
        title="Chọn ngân hàng"
        size="sm"
        bodyClassName="px-0 pb-0"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Tìm ngân hàng" autoFocus={isDesktop} />
          <CommandList className="max-h-[min(22rem,52dvh)] px-1.5 pb-3">
            <CommandEmpty>Không thấy ngân hàng nào khớp.</CommandEmpty>
            {visible.map((bank) => (
              <CommandItem
                key={bank.bin}
                value={bank.bin}
                data-checked={bank.bin === value}
                onSelect={() => {
                  onChange(bank)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body leading-snug font-medium">{bank.shortName}</span>
                  <span className="block truncate text-small text-muted-foreground">{bank.name}</span>
                </span>
                <span className="text-caption text-muted-foreground">{bank.code}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </ResponsiveDialog>
    </>
  )
}
