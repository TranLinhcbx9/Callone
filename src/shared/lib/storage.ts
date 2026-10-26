export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultBackend(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export interface ModuleStorage {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  remove(key: string): void
}

/**
 * localStorage có tiền tố theo module, không bao giờ ném lỗi (Safari private, bị chặn, hết dung lượng).
 * Dữ liệu đọc ra chưa được kiểm tra kiểu, module tự kiểm tra trước khi dùng.
 */
export function createModuleStorage(
  moduleId: string,
  backend: KeyValueStore | null = defaultBackend(),
): ModuleStorage {
  const prefix = `callone:${moduleId}:`
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = backend?.getItem(prefix + key)
        return raw == null ? fallback : (JSON.parse(raw) as T)
      } catch {
        return fallback
      }
    },
    set<T>(key: string, value: T): void {
      try {
        backend?.setItem(prefix + key, JSON.stringify(value))
      } catch {
        // Bỏ qua: trình duyệt chặn hoặc hết dung lượng, app vẫn chạy được.
      }
    },
    remove(key: string): void {
      try {
        backend?.removeItem(prefix + key)
      } catch {
        // Bỏ qua như trên.
      }
    },
  }
}
