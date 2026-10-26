import { GallerySection } from '@/app/dev/ui/GallerySection'

const SCALE = [
  { cls: 'text-display font-semibold', name: 'text-display', size: '30/36', use: 'Tổng chi, số tiền lớn' },
  { cls: 'text-headline font-semibold', name: 'text-headline', size: '22/28', use: 'Tiêu đề trang chủ' },
  { cls: 'text-title font-semibold', name: 'text-title', size: '17/24', use: 'Tiêu đề header, hộp thoại' },
  { cls: 'text-body', name: 'text-body', size: '15/22', use: 'Thân bài, tên trong danh sách' },
  { cls: 'text-small text-muted-foreground', name: 'text-small', size: '13/20', use: 'Dòng phụ, nhãn, ghi chú' },
  { cls: 'text-caption text-muted-foreground', name: 'text-caption', size: '12/17', use: 'Nhãn nhỏ, số lượng' },
] as const

export function TypographySection() {
  return (
    <GallerySection
      id="chu"
      title="Chữ"
      description="Plus Jakarta Sans, tự host. Thân bài 15px; ô nhập trên điện thoại 16px để iPhone không tự phóng to."
    >
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {SCALE.map((row) => (
          <div key={row.name} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <p className={row.cls}>Chia tiền Đà Lạt 3N2Đ</p>
            <p className="shrink-0 text-caption text-muted-foreground">
              {row.name} · {row.size}px · {row.use}
            </p>
          </div>
        ))}
        <div className="px-4 py-3.5">
          <p className="tnum text-title font-semibold">1.234.567 ₫ · 0123456789 · −150.000 ₫</p>
          <p className="mt-1 text-caption text-muted-foreground">Số liền hàng (tnum) để các dòng tiền canh thẳng cột</p>
        </div>
      </div>
    </GallerySection>
  )
}
