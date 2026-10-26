/**
 * Khu vực /dev, chỉ có khi chạy dev:
 * /dev/ui       toàn bộ UI kit
 * /dev/fonts    so sánh 3 font ứng viên với câu tiếng Việt mẫu
 * /dev/mockups  mọi màn hình với dữ liệu giả, dùng để duyệt giao diện
 */
import { Link, Route, Routes } from 'react-router'
import { FontsPage } from '@/app/dev/FontsPage'
import { MOCKUPS } from '@/app/dev/mockups/registry'
import { UiGallery } from '@/app/dev/UiGallery'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

function DevLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:bg-accent/50"
    >
      <span className="block text-body font-semibold">{title}</span>
      <span className="mt-0.5 block text-small text-muted-foreground">{description}</span>
    </Link>
  )
}

function DevIndex() {
  return (
    <>
      <PageHeader title="Khu vực dev" subtitle="Chỉ có khi chạy npm run dev" backHref="/" />
      <PageBody className="flex flex-col gap-3">
        <DevLink to="/dev/ui" title="UI kit" description="Màu, chữ, nút, ô nhập, thành phần dùng chung." />
        <DevLink to="/dev/fonts" title="So sánh font" description="3 font ứng viên với câu tiếng Việt mẫu." />
        <DevLink to="/dev/mockups" title="Mockup màn hình" description="Mọi màn hình của module Chia tiền với dữ liệu giả." />
      </PageBody>
    </>
  )
}

function MockupIndex() {
  return (
    <>
      <PageHeader title="Mockup màn hình" subtitle={`${MOCKUPS.length} màn hình`} backHref="/dev" />
      <PageBody className="grid gap-3 sm:grid-cols-2">
        {MOCKUPS.map((mockup, index) => (
          <DevLink
            key={mockup.slug}
            to={`/dev/mockups/${mockup.slug}`}
            title={`${index + 1}. ${mockup.title}`}
            description={mockup.description}
          />
        ))}
      </PageBody>
    </>
  )
}

export function DevApp() {
  return (
    <Routes>
      <Route index element={<DevIndex />} />
      <Route path="ui" element={<UiGallery />} />
      <Route path="fonts" element={<FontsPage />} />
      <Route path="mockups" element={<MockupIndex />} />
      {MOCKUPS.map((mockup) => (
        <Route key={mockup.slug} path={`mockups/${mockup.slug}`} element={mockup.element} />
      ))}
    </Routes>
  )
}
