import { HomeIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { BrandMark } from '@/app/layout/BrandMark'
import { modules } from '@/app/registry'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'

const NAV_ITEM =
  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors duration-150 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 [&_svg]:size-[1.125rem] [&_svg]:shrink-0'

/** Thanh bên mảnh liệt kê module. Chỉ có từ màn hình lg (1024px) trở lên; điện thoại không có thanh điều hướng chung. */
function DesktopRail() {
  return (
    <aside
      aria-label="Điều hướng"
      className="fixed inset-y-0 left-0 z-40 hidden w-(--app-rail) flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex"
    >
      <NavLink to="/" className="flex items-center gap-2.5 rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
        <BrandMark className="size-8" />
        <span className="text-title font-semibold tracking-tight">Callone</span>
      </NavLink>
      <nav className="flex flex-col gap-0.5">
        <NavLink
          to="/"
          end
          className={({ isActive }) => cn(NAV_ITEM, isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')}
        >
          <HomeIcon />
          Trang chủ
        </NavLink>
        {modules.map((module) => {
          const Icon = module.icon
          if (module.status === 'soon') {
            return (
              <span key={module.id} aria-disabled="true" className={cn(NAV_ITEM, 'cursor-default opacity-60 hover:bg-transparent')}>
                <Icon />
                <span className="flex-1">{module.title}</span>
                <Badge variant="secondary">Sắp có</Badge>
              </span>
            )
          }
          return (
            <NavLink
              key={module.id}
              to={module.basePath}
              className={({ isActive }) => cn(NAV_ITEM, isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')}
            >
              <Icon />
              {module.title}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

/**
 * Khung app: thanh bên (desktop) và vùng nội dung. Mỗi trang tự dựng header của mình bằng PageHeader
 * và bọc thân trang bằng PageBody, nên điện thoại không có thanh trên hay thanh tab chung.
 * Biến --app-rail (0 trên điện thoại, 15rem từ lg) cho các thanh nổi biết cần chừa bao nhiêu bên trái.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Bỏ qua tới nội dung
      </a>
      <DesktopRail />
      <div className="lg:pl-(--app-rail)">
        <main id="main" className="min-h-dvh">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
