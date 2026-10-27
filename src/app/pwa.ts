import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

const UPDATE_TOAST_ID = 'pwa-update'

/** Quay lại app thì hỏi xem có bản mới không, nhưng không quá một lần mỗi 30 phút. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * Đăng ký service worker, chỉ gọi ở bản build. Bản mới được tải sẵn ở nền rồi chờ, app không tự tải lại vì có thể
 * đang nhập dở một khoản chi. Người dùng bấm "Cập nhật" trong toast thì bản mới mới được áp dụng và trang tải lại.
 *
 * Phối hợp với preloadError.ts: service worker cũ vẫn phục vụ chunk cũ từ precache cho tới khi bản mới được áp dụng,
 * nên tab mở lâu không gặp lỗi chunk sau khi deploy. preloadError.ts là lưới an toàn cho lúc chưa có service worker
 * (lần mở đầu tiên, trình duyệt không hỗ trợ, tải lại cứng).
 */
export function registerPwa(): void {
  // Tab này là tab đã bấm "Cập nhật". Tab khác của app chỉ được nhắc tải lại, không tự tải lại.
  let applyingUpdate = false
  let lastCheckAt = Date.now()

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      toast('Đã có phiên bản mới', {
        id: UPDATE_TOAST_ID,
        description: 'Trang sẽ tải lại khi cập nhật.',
        duration: Infinity,
        action: {
          label: 'Cập nhật',
          onClick: () => {
            applyingUpdate = true
            void updateServiceWorker()
          },
        },
      })
    },
    onNeedReload() {
      if (applyingUpdate) {
        window.location.reload()
        return
      }
      toast('Callone vừa được cập nhật ở cửa sổ khác', {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: { label: 'Tải lại', onClick: () => window.location.reload() },
      })
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) return
        lastCheckAt = now
        registration.update().catch(() => {
          // Không có mạng: lần quay lại sau sẽ thử lại.
          lastCheckAt = 0
        })
      })
    },
    onRegisterError(error) {
      console.warn('Không đăng ký được service worker', error)
    },
  })
}
