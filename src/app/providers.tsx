import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { isRetryableError } from '@/shared/lib/errors'
import { Toaster } from '@/shared/ui/sonner'

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Mặc định 'online' thì mất mạng là TẠM DỪNG chứ không báo lỗi: nhóm chưa có trong cache hiện "Đang tải nhóm…"
        // mãi không có nút thử lại. 'always' cho truy vấn chạy và thất bại thật, giao diện lỗi và việc thử lại đã có sẵn.
        networkMode: 'always',
        // Chỉ thử lại lỗi mạng. Mặc định thử 3 lần sẽ làm "không tìm thấy nhóm" hiện chậm vài giây. Trình duyệt đã báo
        // offline thì thử lại cũng vô ích, báo lỗi ngay để người dùng bấm "Thử lại" khi có mạng.
        retry: (failureCount, error) => isRetryableError(error) && failureCount < 3 && navigator.onLine !== false,
      },
      // Cùng lý do cho việc ghi, và còn một lý do nữa: lệnh ghi bị tạm dừng sẽ tự chạy khi có mạng lại dù người dùng đã
      // đóng form ("Bỏ thay đổi"), thành một khoản chi ma, nhập lại thì bị lặp.
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/*
        Toast nằm dưới: ở trên nó che header và thanh tab của trang (toast "Cập nhật" của PWA còn không tự tắt), và nút
        "Hoàn tác" ở đầu màn hình khó với tới bằng ngón cái. Chừa chỗ cho thanh Lưu (72px) và nút nổi (64px) ở chân trang.
      */}
      <Toaster
        position="bottom-center"
        closeButton
        offset={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
        mobileOffset={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
      />
    </QueryClientProvider>
  )
}
