import { BrandMark } from '@/app/layout/BrandMark'
import { ModuleTile } from '@/app/layout/ModuleTile'
import { PageBody } from '@/shared/ui/PageBody'
import type { AppModule } from '@/shared/types/module'

/**
 * Trang chủ dạng launcher: mỗi module một ô. HomePage chỉ cần truyền danh sách module từ registry.
 * Trên điện thoại có dòng thương hiệu ở đầu; từ lg thương hiệu nằm ở thanh bên nên dòng này ẩn.
 */
export function LauncherView({ modules }: { modules: readonly AppModule[] }) {
  return (
    <>
      <div className="pt-safe lg:hidden">
        <div className="mx-auto flex w-full max-w-(--app-column) items-center gap-2.5 px-5 pt-5">
          <BrandMark className="size-9" />
          <span className="text-title font-semibold tracking-tight">Callone</span>
        </div>
      </div>
      <PageBody className="pt-7 lg:pt-16">
        <div className="mb-7">
          <h1 className="text-headline font-semibold">Xin chào</h1>
          <p className="mt-1 text-body text-muted-foreground">Chọn một ứng dụng để bắt đầu.</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {modules.map((module) => (
            <li key={module.id} className="flex">
              <ModuleTile
                title={module.title}
                description={module.description}
                icon={module.icon}
                href={module.basePath}
                soon={module.status === 'soon'}
              />
            </li>
          ))}
        </ul>
      </PageBody>
    </>
  )
}
