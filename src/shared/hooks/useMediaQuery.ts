import { useSyncExternalStore } from 'react'

/** Theo dõi một media query. Lần render đầu trên server (không có) trả false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Từ md (768px) trở lên: dùng hộp thoại giữa màn hình; nhỏ hơn: ngăn kéo từ dưới lên. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
