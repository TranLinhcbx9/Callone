import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

/** Lỗi khi render hoặc tải trang. Mỗi module có error boundary riêng nên lỗi không lan ra cả app. */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Có lỗi xảy ra.'

  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Có lỗi xảy ra</h1>
      <p className="mt-2 text-sm opacity-70">{message}</p>
      <div className="mt-6 flex justify-center gap-4">
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
        <Link to="/" className="underline">
          Về trang chủ
        </Link>
      </div>
    </section>
  )
}
