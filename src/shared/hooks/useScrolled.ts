import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/** true khi trang đã cuộn xuống quá `threshold` px. Dùng để hiện viền mảnh dưới header dính. */
export function useScrolled(threshold = 4): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.scrollY > threshold,
    () => false,
  )
}
