/**
 * Khu vực /dev, chỉ có khi chạy dev. Agent ui-design dựng ở đây:
 * /dev/ui để xem toàn bộ UI kit, và các trang mockup dữ liệu giả của từng màn hình.
 * Dùng <Routes> bên trong để tự quản lý đường dẫn con.
 */
export function DevApp() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-lg font-semibold">Khu vực dev</h1>
      <p className="mt-2 text-sm opacity-70">UI kit và mockup sẽ nằm ở đây.</p>
    </section>
  )
}
