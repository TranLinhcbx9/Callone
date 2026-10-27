import { ClockIcon, LockIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import type { AppModule } from '@/shared/types/module'
import { AppLink } from '@/shared/ui/AppLink'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageBody } from '@/shared/ui/PageBody'
import { Button } from '@/shared/ui/button'

/**
 * Chặn vào module chưa sẵn sàng hoặc cần đăng nhập.
 * Bước 2 sẽ thêm kiểm tra đăng nhập và quyền module cho access 'private'.
 */
export function ModuleGate({ module }: { module: AppModule }) {
  if (module.status === 'soon') {
    return <GateMessage icon={<ClockIcon />} title={module.title} message="Module này sắp ra mắt." />
  }
  if (module.access === 'private') {
    return <GateMessage icon={<LockIcon />} title={module.title} message="Cần đăng nhập để dùng module này." />
  }
  return <Outlet />
}

function GateMessage({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <PageBody>
      <EmptyState
        className="pt-24"
        icon={icon}
        title={title}
        description={message}
        action={
          <Button variant="outline" asChild>
            <AppLink href="/">Về trang chủ</AppLink>
          </Button>
        }
      />
    </PageBody>
  )
}
