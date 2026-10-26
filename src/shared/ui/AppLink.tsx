import type { ComponentProps } from 'react'
import { Link } from 'react-router'

type AppLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  /** Đường dẫn trong app ("/bill-split") hoặc địa chỉ ngoài ("https://..."). */
  href: string
}

const EXTERNAL = /^(https?:|mailto:|tel:)/i

/** Liên kết dùng chung: đường dẫn trong app đi qua router (không tải lại trang), địa chỉ ngoài mở bình thường. */
export function AppLink({ href, ...props }: AppLinkProps) {
  if (EXTERNAL.test(href)) {
    const { replace: _replace, state: _state, preventScrollReset: _prevent, relative: _relative, ...anchor } = props
    return <a href={href} target="_blank" rel="noreferrer noopener" {...anchor} />
  }
  return <Link to={href} {...props} />
}
