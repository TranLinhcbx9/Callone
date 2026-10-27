import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { registerPwa } from '@/app/pwa'
import '@/styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Không tìm thấy phần tử #root trong index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker chỉ có ở bản build. Dev server không đăng ký để cache không chồng lên HMR.
if (import.meta.env.PROD) registerPwa()
