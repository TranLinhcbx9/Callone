/**
 * Sau khi deploy bản mới, file chunk cũ trên hosting bị xóa. App đang mở sẽ lỗi khi lazy-load trang mới
 * ("Failed to fetch dynamically imported module"). Vite báo qua sự kiện 'vite:preloadError'.
 * Cách xử lý: tải lại trang để lấy bản mới.
 *
 * Cờ trong sessionStorage ghi giờ của lần tải lại gần nhất và chặn vòng lặp tải lại vô hạn (ví dụ file thật sự thiếu):
 * lỗi thứ hai trong vòng RELOAD_WINDOW_MS (60 giây) sau lần tải lại thì để lỗi hiện ra cho RouteError xử lý.
 * Quá khoảng đó cờ coi như hết hạn và lỗi chunk lần sau lại được tự tải lại một lần. Nếu không, một PWA mở nhiều ngày
 * (sessionStorage sống lâu) chỉ tự khắc phục được đúng một lần rồi mãi mãi hiện lỗi sau mỗi lần deploy.
 * Mỗi lần tải lại ghi lại giờ mới; lỗi bị chặn thì không ghi, nên khoảng 60 giây tính từ lần tải lại chứ không phải từ lần lỗi.
 */
export const RELOAD_FLAG_KEY = 'callone:preload-error-reloaded'

/** Sau chừng này mili giây kể từ lần tải lại trước, lỗi chunk lại được tự tải lại. Trong khoảng đó thì chặn (chống vòng lặp). */
export const RELOAD_WINDOW_MS = 60_000

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface PreloadErrorHandlerOptions {
  /** Nơi lưu cờ "đã tải lại lúc nào". null nếu không dùng được, khi đó không tự tải lại (không chặn được vòng lặp). */
  storage: FlagStorage | null
  reload: () => void
  /** Đồng hồ, để test cố định thời gian. Mặc định Date.now. */
  now?: () => number
  /** Độ dài khoảng chặn, mili giây. Mặc định RELOAD_WINDOW_MS. */
  windowMs?: number
}

/**
 * Lần tải lại ghi trong cờ có còn trong khoảng chặn không. Cờ hỏng (không phải số) hoặc ở tương lai (đồng hồ máy bị chỉnh
 * lùi) thì không tin được nên coi là hết hạn: cho tải lại và ghi đè bằng giờ hiện tại, từ đó vòng lặp vẫn bị chặn.
 */
function reloadedRecently(flag: string | null, now: number, windowMs: number): boolean {
  if (flag === null || flag.trim() === '') return false
  const reloadedAt = Number(flag)
  if (!Number.isFinite(reloadedAt)) return false
  const age = now - reloadedAt
  return age >= 0 && age < windowMs
}

export function createPreloadErrorHandler({
  storage,
  reload,
  now = Date.now,
  windowMs = RELOAD_WINDOW_MS,
}: PreloadErrorHandlerOptions): (event: Event) => void {
  return (event) => {
    if (!storage) return
    const at = now()
    try {
      if (reloadedRecently(storage.getItem(RELOAD_FLAG_KEY), at, windowMs)) return
      storage.setItem(RELOAD_FLAG_KEY, String(at))
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
