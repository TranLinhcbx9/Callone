import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { isRetryableError } from '@/shared/lib/errors'

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Chỉ thử lại lỗi mạng. Mặc định thử 3 lần sẽ làm "không tìm thấy nhóm" hiện chậm vài giây.
        retry: (failureCount, error) => isRetryableError(error) && failureCount < 3,
      },
      mutations: { retry: false },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" closeButton />
    </QueryClientProvider>
  )
}
