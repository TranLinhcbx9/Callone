import { Link, Outlet } from 'react-router'

/** Khung tạm. Agent ui-design sẽ thiết kế lại: header gọn, không có thanh tab chung toàn app. */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <header className="border-b px-4 py-3">
        <Link to="/" className="font-semibold">
          Callone
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
