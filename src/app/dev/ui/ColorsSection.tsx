import { GallerySection } from '@/app/dev/ui/GallerySection'
import { cn } from '@/shared/lib/utils'

const SWATCHES: { name: string; className: string }[] = [
  { name: 'background · foreground', className: 'bg-background text-foreground' },
  { name: 'card · card-foreground', className: 'bg-card text-card-foreground' },
  { name: 'muted · muted-foreground', className: 'bg-muted text-muted-foreground' },
  { name: 'accent · accent-foreground', className: 'bg-accent text-accent-foreground' },
  { name: 'primary · primary-foreground', className: 'bg-primary text-primary-foreground' },
  { name: 'primary-soft · primary-soft-foreground', className: 'bg-primary-soft text-primary-soft-foreground' },
  { name: 'positive-soft · positive (được nhận lại)', className: 'bg-positive-soft text-positive' },
  { name: 'negative-soft · negative (còn nợ)', className: 'bg-negative-soft text-negative' },
  { name: 'warning-soft · warning (còn thiếu)', className: 'bg-warning-soft text-warning' },
  { name: 'destructive · destructive-foreground', className: 'bg-destructive text-destructive-foreground' },
]

const LINES: { name: string; className: string }[] = [
  { name: 'border', className: 'border-border' },
  { name: 'input', className: 'border-input' },
  { name: 'ring', className: 'border-ring' },
]

export function ColorsSection() {
  return (
    <GallerySection
      id="mau"
      title="Màu"
      description="Nền giấy ấm, một màu nhấn chàm. Sáng và tối theo hệ điều hành. Số dương xanh lá dịu, số âm nâu đỏ dịu."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SWATCHES.map((swatch) => (
          <div key={swatch.name} className={cn('flex min-h-20 flex-col justify-between rounded-xl border border-border p-3.5', swatch.className)}>
            <span className="text-small font-medium">{swatch.name}</span>
            <span className="text-body">Aa Đà Lạt 1.250.000 ₫</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {LINES.map((line) => (
          <div key={line.name} className="flex flex-col gap-1.5">
            <div className={cn('h-10 rounded-lg border-2 bg-card', line.className)} />
            <span className="text-caption text-muted-foreground">{line.name}</span>
          </div>
        ))}
      </div>
    </GallerySection>
  )
}
