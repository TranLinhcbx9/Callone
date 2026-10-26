import type { RouteObject } from 'react-router'

/** Route con của module, đường dẫn tương đối so với /bill-split. Mọi trang lazy-load. */
export const billSplitRoutes: RouteObject[] = [
  {
    index: true,
    lazy: () =>
      import('@/modules/bill-split/pages/BillSplitHomePage').then((m) => ({ Component: m.BillSplitHomePage })),
  },
]
