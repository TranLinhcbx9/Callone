import type { ReactNode } from 'react'

/** Khối của trang /dev/ui: tiêu đề, mô tả ngắn và nội dung. */
export function GallerySection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-4">
      <div>
        <h2 className="text-title font-semibold">{title}</h2>
        {description && <p className="mt-1 text-small text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
