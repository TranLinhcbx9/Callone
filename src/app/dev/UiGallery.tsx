import { ColorsSection } from '@/app/dev/ui/ColorsSection'
import { ControlsSection } from '@/app/dev/ui/ControlsSection'
import { ListsSection } from '@/app/dev/ui/ListsSection'
import { OverlaysSection } from '@/app/dev/ui/OverlaysSection'
import { TypographySection } from '@/app/dev/ui/TypographySection'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

const LINKS = [
  ['mau', 'Màu'],
  ['chu', 'Chữ'],
  ['dieu-khien', 'Nút và ô nhập'],
  ['danh-sach', 'Danh sách'],
  ['lop-phu', 'Hộp thoại'],
] as const

/** Toàn bộ UI kit trên một trang, để duyệt nhanh màu, chữ và thành phần ở cả hai chế độ sáng tối. */
export function UiGallery() {
  return (
    <>
      <PageHeader title="UI kit" subtitle="Đổi chế độ sáng tối của hệ điều hành để xem cả hai" backHref="/dev">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Mục lục">
          {LINKS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-full px-3 py-1.5 text-small font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
      </PageHeader>
      <PageBody className="flex flex-col gap-12 pt-6">
        <ColorsSection />
        <TypographySection />
        <ControlsSection />
        <ListsSection />
        <OverlaysSection />
      </PageBody>
    </>
  )
}
