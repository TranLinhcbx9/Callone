import { useEffect, useRef } from 'react'
import { ScrollRestoration, useLocation } from 'react-router'
import { AppShell } from '@/app/layout/AppShell'

/**
 * Sau khi đổi trang, đưa focus về vùng nội dung để người dùng bàn phím và trình đọc màn hình không bị bỏ lại ở
 * liên kết cũ. Bỏ qua lần render đầu, và khi trang mới đã tự focus một ô (ví dụ ô số tiền của form khoản chi).
 * Chỉ theo dõi pathname: đổi tab hay đổi tham số tìm kiếm trong cùng một trang không kéo focus đi.
 */
function useMoveFocusOnNavigate() {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const main = document.getElementById('main')
    if (!main) return
    const active = document.activeElement
    if (active && active !== document.body && main.contains(active)) return
    main.setAttribute('tabindex', '-1')
    main.style.outline = 'none'
    main.focus({ preventScroll: true })
  }, [pathname])
}

/**
 * Gốc của mọi route: khung app, cộng với việc cuộn về đầu khi sang trang mới và nhớ vị trí cuộn khi bấm Quay lại
 * (không có ScrollRestoration thì form khoản chi mở ra giữa chừng nếu danh sách bên dưới đang cuộn xuống).
 */
export function RootLayout() {
  useMoveFocusOnNavigate()
  return (
    <>
      <AppShell />
      <ScrollRestoration />
    </>
  )
}
