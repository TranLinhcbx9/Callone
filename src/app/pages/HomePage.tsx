import { LauncherView } from '@/app/layout/LauncherView'
import { modules } from '@/app/registry'

/** Trang chủ dạng launcher: mỗi module một ô, nội dung do LauncherView dựng từ danh sách module của app. */
export function HomePage() {
  return <LauncherView modules={modules} />
}
