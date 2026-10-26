/**
 * Query key của React Query, mọi key bắt đầu bằng ['bill-split'] để xóa cả module chỉ với một lệnh.
 * Token nằm trong key chỉ ở bộ nhớ, không ghi ra đâu.
 */
export const billSplitKeys = {
  all: ['bill-split'] as const,
  /** Mọi query của các nhóm. */
  groups: () => ['bill-split', 'group'] as const,
  group: (token: string) => ['bill-split', 'group', token] as const,
  /** Mọi query tóm tắt nhóm, dùng để làm mới hàng loạt sau khi ghi. */
  summaries: () => ['bill-split', 'summaries'] as const,
  /** Key theo tập token, sắp xếp để cùng một tập luôn ra cùng một key dù thứ tự "gần đây" thay đổi. */
  summariesFor: (tokens: readonly string[]) => ['bill-split', 'summaries', [...tokens].sort()] as const,
} as const
