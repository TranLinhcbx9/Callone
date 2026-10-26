import { billSplitModule } from '@/modules/bill-split'
import type { AppModule } from '@/shared/types/module'

/** Danh sách module của app. Thêm module mới = thêm 1 dòng ở đây. */
export const modules: readonly AppModule[] = [billSplitModule]
