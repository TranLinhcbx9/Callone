import { useParams } from 'react-router'

/** Trang tạm cho cả thêm khoản chi (không có expenseId) và sửa khoản chi. Sẽ thay bằng form toàn màn hình. */
export function ExpenseFormPage() {
  const { expenseId } = useParams<{ token: string; expenseId?: string }>()
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold">{expenseId ? 'Sửa khoản chi' : 'Thêm khoản chi'}</h1>
      <p className="mt-2 text-sm opacity-70">Đang xây dựng.</p>
    </section>
  )
}
