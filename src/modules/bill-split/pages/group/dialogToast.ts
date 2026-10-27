import { toast } from 'sonner'

/**
 * Toast lỗi của một hộp thoại đang mở. Toast mặc định của app nằm ở chân màn hình (trên thanh Lưu và nút nổi của
 * các trang), nhưng nút chính của ngăn kéo cũng nằm ở chân nên toast che mất nửa nút ngay lúc người dùng cần bấm lại.
 * Đặt riêng ở đầu màn hình, chỗ đó chỉ có trang nền đang bị làm mờ phía sau hộp thoại.
 */
export function toastDialogError(message: string, options: { duration?: number } = {}) {
  return toast.error(message, { position: 'top-center', ...options })
}
