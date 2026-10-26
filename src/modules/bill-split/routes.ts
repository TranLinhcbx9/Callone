import type { RouteObject } from 'react-router'

/**
 * Route con của module, đường dẫn tương đối so với /bill-split (xem paths.ts để dựng URL). Mọi trang lazy-load.
 * Các khoản 'g/:token/expense/new' và 'g/:token/expense/:expenseId' dùng chung một trang form, router ưu tiên
 * đoạn tĩnh 'new' hơn đoạn động.
 */
export const billSplitRoutes: RouteObject[] = [
  {
    index: true,
    lazy: () =>
      import('@/modules/bill-split/pages/BillSplitHomePage').then((m) => ({ Component: m.BillSplitHomePage })),
  },
  {
    path: 'new',
    lazy: () => import('@/modules/bill-split/pages/NewGroupPage').then((m) => ({ Component: m.NewGroupPage })),
  },
  {
    path: 'g/:token',
    lazy: () => import('@/modules/bill-split/pages/GroupPage').then((m) => ({ Component: m.GroupPage })),
  },
  {
    path: 'g/:token/expense/new',
    lazy: () => import('@/modules/bill-split/pages/ExpenseFormPage').then((m) => ({ Component: m.ExpenseFormPage })),
  },
  {
    path: 'g/:token/expense/:expenseId',
    lazy: () => import('@/modules/bill-split/pages/ExpenseFormPage').then((m) => ({ Component: m.ExpenseFormPage })),
  },
]
