import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router'

/**
 * public: ai cũng dùng được, không cần đăng nhập.
 * private: phải đăng nhập và được cấp quyền module này. Đăng nhập làm ở bước 2,
 * hiện router chỉ hiện màn hình "cần đăng nhập" cho module private.
 */
export type ModuleAccess = 'public' | 'private'

/** ready: dùng được. soon: hiện trên Home dạng "sắp có", chưa vào được. */
export type ModuleStatus = 'ready' | 'soon'

/**
 * Hợp đồng của một module trong super app. Thêm module mới:
 * tạo src/modules/<id>/index.ts export một AppModule, rồi thêm 1 dòng vào src/app/registry.ts.
 */
export interface AppModule {
  /** kebab-case, duy nhất. Dùng làm tiền tố cho query key và key localStorage. */
  id: string
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  /** Đường dẫn gốc của module, ví dụ '/bill-split'. */
  basePath: `/${string}`
  access: ModuleAccess
  status: ModuleStatus
  /**
   * Route con với đường dẫn tương đối so với basePath.
   * Mọi trang phải lazy-load để module nằm ở chunk riêng, không làm nặng Home.
   */
  routes: RouteObject[]
  /** Widget nhỏ hiện trên Home, lazy-load. Tùy chọn. */
  loadHomeWidget?: () => Promise<{ default: ComponentType }>
}
