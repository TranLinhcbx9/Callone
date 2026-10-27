import { useCallback } from 'react'
import { toast } from 'sonner'
import { groupLink } from '@/modules/bill-split/paths'
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard'

/**
 * Dùng hộp chia sẻ của hệ điều hành khi có và đang dùng cảm ứng (điện thoại, máy tính bảng). Trên máy tính, hộp chia
 * sẻ của Windows hay macOS chọn ứng dụng rất vụng so với việc dán link vào Zalo hay Messenger, nên chép link luôn.
 */
export function canShareNatively(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** Người dùng đóng hộp chia sẻ mà không chọn gì: không phải lỗi, không cần báo. */
function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Chia sẻ link của nhóm: hộp chia sẻ của hệ điều hành nếu có, không thì chép link vào clipboard và báo bằng toast.
 * Trả về hàm async để gắn vào nút chia sẻ ở header.
 */
export function useShareGroup(token: string, groupName: string): () => Promise<void> {
  const { copy } = useCopyToClipboard()

  return useCallback(async () => {
    const url = groupLink(window.location.origin, token)
    if (canShareNatively()) {
      try {
        await navigator.share({ title: groupName, text: `Link nhóm ${groupName} trên Callone`, url })
        return
      } catch (error) {
        if (isCancelled(error)) return
        // Hộp chia sẻ lỗi (WebView cũ, bị chặn): rơi xuống cách chép link.
      }
    }
    if (await copy(url)) toast.success('Đã chép link')
    else toast.error('Không chép được link. Mở tab Thành viên để chép thủ công.')
  }, [copy, token, groupName])
}
