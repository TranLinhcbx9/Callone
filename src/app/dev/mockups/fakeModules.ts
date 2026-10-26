import { BookOpenIcon, LanguagesIcon, MapPinIcon, WalletIcon } from 'lucide-react'
import type { AppModule } from '@/shared/types/module'

/** Danh sách module giả cho mockup Home: một module sẵn sàng và vài module "Sắp có". */
export const FAKE_MODULES: AppModule[] = [
  {
    id: 'bill-split',
    title: 'Chia tiền',
    description: 'Chia tiền đi chơi với hội bạn, xem ai nợ ai, trả bằng mã VietQR.',
    icon: WalletIcon,
    basePath: '/dev/mockups/bill-split-home',
    access: 'public',
    status: 'ready',
    routes: [],
  },
  {
    id: 'journal',
    title: 'Nhật ký',
    description: 'Viết lại một ngày của mình, chỉ mình bạn đọc được.',
    icon: BookOpenIcon,
    basePath: '/journal',
    access: 'private',
    status: 'soon',
    routes: [],
  },
  {
    id: 'english',
    title: 'Học tiếng Anh',
    description: 'Từ vựng và câu hay gặp, ôn mỗi ngày vài phút.',
    icon: LanguagesIcon,
    basePath: '/english',
    access: 'private',
    status: 'soon',
    routes: [],
  },
  {
    id: 'places',
    title: 'Địa điểm',
    description: 'Quán ngon và chỗ hay đã đi, ghim lại để quay lại.',
    icon: MapPinIcon,
    basePath: '/places',
    access: 'private',
    status: 'soon',
    routes: [],
  },
]
