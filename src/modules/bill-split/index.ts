import { Wallet } from 'lucide-react'
import { billSplitRoutes } from '@/modules/bill-split/routes'
import type { AppModule } from '@/shared/types/module'

/**
 * Cửa chính của module Chia tiền. app/ chỉ được import file này.
 * Không import trang trực tiếp ở đây, để toàn bộ module nằm ở chunk riêng.
 */
export const billSplitModule: AppModule = {
  id: 'bill-split',
  title: 'Chia tiền',
  description: 'Chia tiền đi chơi với hội bạn, xem ai nợ ai, trả bằng mã VietQR.',
  icon: Wallet,
  basePath: '/bill-split',
  access: 'public',
  status: 'ready',
  routes: billSplitRoutes,
}
