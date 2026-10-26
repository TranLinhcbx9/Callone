import { Outlet } from 'react-router'
import type { AppModule } from '@/shared/types/module'

/**
 * Chặn vào module chưa sẵn sàng hoặc cần đăng nhập.
 * Bước 2 sẽ thêm kiểm tra đăng nhập và quyền module cho access 'private'.
 */
export function ModuleGate({ module }: { module: AppModule }) {
  if (module.status === 'soon') {
    return <GateMessage title={module.title} message="Module này sắp ra mắt." />
  }
  if (module.access === 'private') {
    return <GateMessage title={module.title} message="Cần đăng nhập để dùng module này." />
  }
  return <Outlet />
}

function GateMessage({ title, message }: { title: string; message: string }) {
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm opacity-70">{message}</p>
    </section>
  )
}
