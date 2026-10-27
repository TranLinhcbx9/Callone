// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type RegisterOptions = {
  onNeedRefresh?: () => void
  onNeedReload?: () => void
}

const captured: { options: RegisterOptions | null } = { options: null }

// virtual:pwa-register chỉ có khi build bằng plugin PWA, nên giả lập: ghi lại các hàm mà registerPwa đăng ký.
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: RegisterOptions) => {
    captured.options = options
    return () => Promise.resolve()
  },
}))

const { registerPwa } = await import('@/app/pwa')

/** Toast đang hiện, tìm theo id. Dùng Sonner thật để kiểm cả cách nó gộp hai toast cùng id. */
function updateToast() {
  return toast
    .getToasts()
    .find((item) => 'id' in item && item.id === 'pwa-update') as { title?: unknown; description?: unknown } | undefined
}

describe('registerPwa', () => {
  beforeEach(() => {
    captured.options = null
    toast.dismiss()
    registerPwa()
  })

  it('có bản mới: toast kèm câu giải thích trang sẽ tải lại khi cập nhật', () => {
    captured.options?.onNeedRefresh?.()
    expect(updateToast()).toMatchObject({ title: 'Đã có phiên bản mới', description: 'Trang sẽ tải lại khi cập nhật.' })
  })

  it('cập nhật ở cửa sổ khác: thay hẳn toast cũ, không giữ lại câu "Trang sẽ tải lại khi cập nhật."', () => {
    captured.options?.onNeedRefresh?.()
    captured.options?.onNeedReload?.()
    const merged = updateToast()
    expect(merged?.title).toBe('Callone vừa được cập nhật ở cửa sổ khác')
    // Cùng id thì Sonner gộp dữ liệu mới vào toast cũ: phải ghi đè description thì câu cũ mới mất.
    expect(merged?.description).toBeUndefined()
    expect(toast.getToasts().filter((item) => 'id' in item && item.id === 'pwa-update')).toHaveLength(1)
  })
})
