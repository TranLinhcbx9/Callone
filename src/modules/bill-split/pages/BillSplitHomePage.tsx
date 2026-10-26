import { Link } from 'react-router'
import { billSplitPaths } from '@/modules/bill-split/paths'

/** Trang tạm. Sẽ thay bằng danh sách nhóm đã mở, tạo nhóm và dán link nhóm sau khi duyệt giao diện. */
export function BillSplitHomePage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold">Chia tiền</h1>
      <p className="mt-2 text-sm opacity-70">Đang xây dựng.</p>
      <Link to={billSplitPaths.newGroup()} className="mt-4 inline-block text-sm underline">
        Tạo nhóm mới
      </Link>
    </section>
  )
}
