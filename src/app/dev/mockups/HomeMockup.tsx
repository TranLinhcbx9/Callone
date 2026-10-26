import { LauncherView } from '@/app/layout/LauncherView'
import { FAKE_MODULES } from '@/app/dev/mockups/fakeModules'

/** Trang chủ launcher: một module sẵn sàng và vài module "Sắp có". */
export function HomeMockup() {
  return <LauncherView modules={FAKE_MODULES} />
}
