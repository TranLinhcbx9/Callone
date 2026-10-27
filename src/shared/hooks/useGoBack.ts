import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { historyTrail } from '@/shared/lib/historyTrail'

/**
 * Hàm cho nút "quay lại" của một trang con về trang cha `parentHref`, không làm lịch sử dài thêm:
 * - Mục liền trước trong lịch sử đúng là trang cha: lùi lại một bước, như bấm Back.
 * - Không phải (mở thẳng bằng link, tải lại trang sau khi đã mất dấu, đi từ nơi khác tới): thay mục hiện tại bằng trang cha.
 * Bấm vào một liên kết "về trang cha" bình thường thì đẩy thêm một mục, Back của hệ thống lại nảy vào trang con và cử chỉ
 * quay lại trên app Android đã cài đi tới đi lui giữa hai trang. Dấu vết lịch sử do router.tsx ghi, xem historyTrail.
 */
export function useGoBack(parentHref: string | undefined): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    if (!parentHref) return
    if (historyTrail.previousIs(parentHref)) void navigate(-1)
    else void navigate(parentHref, { replace: true })
  }, [navigate, parentHref])
}
