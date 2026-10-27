/**
 * Nhớ đường dẫn của từng mục trong lịch sử trình duyệt của tab, để nút quay lại trong app biết mục liền trước có phải trang
 * cha hay không. Trình duyệt không cho đọc địa chỉ của mục trước, mà React Router ghi chỉ số `idx` (0, 1, 2...) của mục
 * hiện tại vào history.state, nên map idx thành đường dẫn là đủ: mục trước của mục idx là idx - 1.
 *
 * Nút quay lại dựa vào đây để chọn giữa hai cách (xem useGoBack):
 * - Mục trước đúng là trang cha: lùi lịch sử như bấm Back. Đẩy thêm một mục "trang cha" lên sẽ làm Back của hệ thống nảy ngược
 *   vào trang con, và với app đã cài trên Android thì cử chỉ quay lại cứ đi tới đi lui giữa hai trang.
 * - Không biết hoặc không phải: thay mục hiện tại bằng trang cha (replace), lịch sử không dài thêm.
 *
 * Dữ liệu giữ trong sessionStorage (cùng vòng đời với lịch sử của tab), nên tải lại trang vẫn biết mục trước.
 */

const STORAGE_KEY = 'callone:history-trail'
const MAX_ENTRIES = 200

type Trail = Record<string, string>

export interface HistoryTrailOptions {
  /** Nơi lưu. null nếu không dùng được (bị chặn): khi đó không biết mục trước, nút quay lại luôn dùng replace. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** Chỉ số mục lịch sử hiện tại (history.state.idx của React Router), null nếu chưa có. */
  getIndex: () => number | null
}

/** Chỉ lấy phần đường dẫn: bỏ ?query và #hash, để "/bill-split?x=1" và "/bill-split" là cùng một trang. */
export function pathOf(url: string): string {
  return url.split(/[?#]/)[0] ?? url
}

function parseTrail(raw: string | null): Trail {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const trail: Trail = {}
    for (const [key, path] of Object.entries(value)) {
      if (/^\d+$/.test(key) && typeof path === 'string') trail[key] = path
    }
    return trail
  } catch {
    return {}
  }
}

export function createHistoryTrail({ storage, getIndex }: HistoryTrailOptions) {
  // Giữ cả trong bộ nhớ: storage chặn ghi thì trong lần chạy này vẫn nhớ được.
  let memory: Trail | null = null

  const load = (): Trail => {
    if (memory) return memory
    let raw: string | null = null
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    memory = parseTrail(raw)
    return memory
  }

  const save = (trail: Trail) => {
    memory = trail
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(trail))
    } catch {
      // Bỏ qua: hết dung lượng hoặc bị chặn, bộ nhớ vẫn giữ.
    }
  }

  /** Đường dẫn của mục liền trước mục hiện tại, hoặc null nếu là mục đầu hoặc chưa từng ghi lại. */
  const previousPath = (): string | null => {
    const index = getIndex()
    if (index === null || index < 1) return null
    return load()[String(index - 1)] ?? null
  }

  return {
    /** Ghi đường dẫn của mục lịch sử hiện tại. Gọi mỗi khi chuyển trang xong (kể cả replace, sẽ ghi đè). */
    record(path: string): void {
      const index = getIndex()
      if (index === null) return
      const trail = { ...load(), [String(index)]: pathOf(path) }
      const keys = Object.keys(trail)
      if (keys.length > MAX_ENTRIES) {
        // Bỏ các mục có chỉ số nhỏ nhất: càng cũ càng ít khi cần quay về.
        for (const key of keys.sort((a, b) => Number(a) - Number(b)).slice(0, keys.length - MAX_ENTRIES)) delete trail[key]
      }
      save(trail)
    },

    previousPath,

    /** Mục liền trước có đúng là trang `path` không (so phần đường dẫn, bỏ ?query và #hash). */
    previousIs(path: string): boolean {
      return previousPath() === pathOf(path)
    },
  }
}

function browserStorage(): HistoryTrailOptions['storage'] {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function browserIndex(): number | null {
  if (typeof window === 'undefined') return null
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : null
}

/** Dấu vết lịch sử của tab hiện tại. router.tsx ghi vào, useGoBack đọc ra. */
export const historyTrail = createHistoryTrail({
  storage: typeof window === 'undefined' ? null : browserStorage(),
  getIndex: browserIndex,
})
