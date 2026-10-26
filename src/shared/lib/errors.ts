/**
 * Chuẩn hóa mọi lỗi (Supabase, mạng, lỗi lạ) về một kiểu AppError.
 *
 * Quy ước phía database: hàm RPC raise lỗi với SQLSTATE 'PTxyz' và message là mã lỗi của app.
 * PostgREST trả HTTP status xyz và body { code: 'PTxyz', message: 'BS_...', details: '<json>' }.
 * Mỗi module tự có bảng dịch mã lỗi sang tiếng Việt, dùng kèm getErrorMessage().
 */
export type AppErrorKind = 'app' | 'network' | 'outdated' | 'unknown'

export interface AppErrorInit {
  kind: AppErrorKind
  code: string
  status?: number | null
  detail?: unknown
  message?: string
  cause?: unknown
}

export class AppError extends Error {
  readonly kind: AppErrorKind
  /** Mã lỗi của app (ví dụ BS_GROUP_NOT_FOUND), hoặc NETWORK, OUTDATED, UNKNOWN. */
  readonly code: string
  readonly status: number | null
  /** Chi tiết đã parse từ JSON nếu có, ví dụ { field: 'name', reason: 'duplicate' }. */
  readonly detail: unknown

  constructor(init: AppErrorInit) {
    super(init.message ?? init.code, { cause: init.cause })
    this.name = 'AppError'
    this.kind = init.kind
    this.code = init.code
    this.status = init.status ?? null
    this.detail = init.detail ?? null
  }
}

const APP_STATUS_CODE = /^PT(\d{3})$/
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i
const OUTDATED_CODES = new Set(['PGRST202', 'PGRST203'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDetail(details: unknown): unknown {
  if (typeof details !== 'string' || details.trim() === '') return null
  try {
    return JSON.parse(details) as unknown
  } catch {
    return details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** @param status HTTP status nếu có. supabase-js trả trong response.status, bằng 0 khi lỗi mạng. */
export function toAppError(error: unknown, status?: number | null): AppError {
  if (error instanceof AppError) return error

  if (isRecord(error)) {
    const code = typeof error.code === 'string' ? error.code : ''
    const message = typeof error.message === 'string' ? error.message : ''

    const appStatus = APP_STATUS_CODE.exec(code)
    if (appStatus) {
      return new AppError({
        kind: 'app',
        code: message,
        status: Number(appStatus[1]),
        detail: parseDetail(error.details),
        cause: error,
      })
    }
    if (OUTDATED_CODES.has(code)) {
      return new AppError({ kind: 'outdated', code: 'OUTDATED', status: status ?? null, cause: error })
    }
    if (status === 0 || NETWORK_MESSAGE.test(message)) {
      return new AppError({ kind: 'network', code: 'NETWORK', status: status ?? null, cause: error })
    }
    return new AppError({
      kind: 'unknown',
      code: 'UNKNOWN',
      status: status ?? null,
      message: message || undefined,
      cause: error,
    })
  }

  return new AppError({ kind: 'unknown', code: 'UNKNOWN', status: status ?? null, cause: error })
}

/** Chỉ thử lại khi lỗi mạng. Lỗi nghiệp vụ như 404, 409, 422 thử lại cũng vô ích. */
export function isRetryableError(error: unknown): boolean {
  return toAppError(error).kind === 'network'
}

export const COMMON_ERROR_MESSAGES = {
  NETWORK: 'Không có kết nối mạng. Kiểm tra mạng rồi thử lại.',
  OUTDATED: 'Ứng dụng vừa được cập nhật. Tải lại trang để tiếp tục.',
  UNKNOWN: 'Có lỗi xảy ra. Thử lại sau ít phút.',
} as const

/** Lấy câu thông báo tiếng Việt: ưu tiên bảng dịch của module, rồi tới thông báo chung. */
export function getErrorMessage(error: unknown, messages: Readonly<Record<string, string>> = {}): string {
  const appError = toAppError(error)
  const own = messages[appError.code]
  if (own) return own
  if (appError.kind === 'network') return COMMON_ERROR_MESSAGES.NETWORK
  if (appError.kind === 'outdated') return COMMON_ERROR_MESSAGES.OUTDATED
  return COMMON_ERROR_MESSAGES.UNKNOWN
}
