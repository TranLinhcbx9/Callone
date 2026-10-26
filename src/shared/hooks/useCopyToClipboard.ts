import { useCallback, useEffect, useRef, useState } from 'react'

async function writeText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // rơi xuống cách dự phòng bên dưới
  }
  // Dự phòng cho trang không có quyền clipboard (http, WebView cũ)
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

/** Sao chép chữ vào clipboard. `copied` bật true trong `resetMs` mili giây sau khi chép xong để đổi nhãn nút. */
export function useCopyToClipboard(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      const ok = await writeText(text)
      if (ok) {
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), resetMs)
      }
      return ok
    },
    [resetMs],
  )

  return { copied, copy }
}
