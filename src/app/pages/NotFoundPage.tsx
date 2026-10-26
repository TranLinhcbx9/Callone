import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Không tìm thấy trang</h1>
      <p className="mt-2 text-sm opacity-70">Đường dẫn này không tồn tại.</p>
      <Link to="/" className="mt-6 inline-block underline">
        Về trang chủ
      </Link>
    </section>
  )
}
