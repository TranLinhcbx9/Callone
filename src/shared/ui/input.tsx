import * as React from "react"
import { cn } from "cn"

/** Ô nhập một dòng. Trên điện thoại chữ 16px (text-base) để iOS Safari không tự phóng to trang, từ md trở lên 14px. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 md:text-sm dark:bg-input/30 dark:disabled:bg-input/50 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
