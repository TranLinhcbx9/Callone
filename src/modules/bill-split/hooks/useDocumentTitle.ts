import { useEffect } from 'react'

/**
 * Đặt tiêu đề tab trình duyệt theo trang đang mở ("Đà Lạt 3N2Đ · Callone"), trả lại tiêu đề cũ khi rời trang.
 * Có tiêu đề riêng thì danh sách tab, lịch sử trình duyệt và trình đọc màn hình phân biệt được các trang của app.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · Callone`
    return () => {
      document.title = previous
    }
  }, [title])
}
