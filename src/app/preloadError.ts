/**
 * Sau khi deploy bản mới, file chunk cũ trên hosting bị xóa. App đang mở sẽ lỗi khi lazy-load trang mới
 * ("Failed to fetch dynamically imported module"). Vite báo qua sự kiện 'vite:preloadError'.
 * Cách xử lý: tải lại trang một lần để lấy bản mới. Cờ trong sessionStorage chặn vòng lặp tải lại vô hạn
 * (ví dụ file thật sự thiếu): lần lỗi thứ hai trong cùng phiên để lỗi hiện ra cho RouteError xử lý.
 */
export const RELOAD_FLAG_KEY = 'callone:preload-error-reloaded'

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface PreloadErrorHandlerOptions {
  /** Nơi lưu cờ "đã tải lại trong phiên này". null nếu không dùng được, khi đó không tự tải lại (không chặn được vòng lặp). */
  storage: FlagStorage | null
  reload: () => void
}

export function createPreloadErrorHandler({ storage, reload }: PreloadErrorHandlerOptions): (event: Event) => void {
  return (event) => {
    if (!storage) return
    try {
      if (storage.getItem(RELOAD_FLAG_KEY) !== null) return
      storage.setItem(RELOAD_FLAG_KEY, String(Date.now()))
    } catch {
      return
    }
    // Chặn lỗi gốc để không nháy màn hình lỗi trong lúc trang đang tải lại.
    event.preventDefault()
    reload()
  }
}

function sessionStorageOrNull(): FlagStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Gắn xử lý cho sự kiện vite:preloadError. Trả về hàm gỡ. Gọi sớm, trước khi router bắt đầu tải trang. */
export function installPreloadErrorHandler(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = createPreloadErrorHandler({
    storage: sessionStorageOrNull(),
    reload: () => window.location.reload(),
  })
  window.addEventListener('vite:preloadError', handler)
  return () => window.removeEventListener('vite:preloadError', handler)
}
