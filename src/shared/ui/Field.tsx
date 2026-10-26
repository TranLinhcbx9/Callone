import type { ReactNode } from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Label } from '@/shared/ui/label'

export interface FieldProps {
  label?: ReactNode
  /** id của ô nhập bên trong, để bấm nhãn là focus vào ô. */
  htmlFor?: string
  /** Ghi chú nhỏ dưới ô. */
  hint?: ReactNode
  /** Lỗi, thay cho ghi chú. */
  error?: ReactNode
  /** Hiện "Không bắt buộc" cạnh nhãn. */
  optional?: boolean
  children: ReactNode
  className?: string
}

/** Nhãn + ô nhập + ghi chú hoặc lỗi. Khoảng cách và cỡ chữ thống nhất cho mọi form. */
export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <Label htmlFor={htmlFor} className="gap-1.5">
          <span>{label}</span>
          {optional && <span className="text-caption font-normal text-muted-foreground">Không bắt buộc</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-small text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        hint && <p className="text-small text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
