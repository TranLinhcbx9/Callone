import { Loader2Icon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/** Vòng xoay đang tải. Kế thừa màu chữ hiện tại, mặc định 16px. */
export function Spinner({ className, label = 'Đang tải' }: { className?: string; label?: string }) {
  return <Loader2Icon role="status" aria-label={label} className={cn('size-4 animate-spin', className)} />
}
