import type { MoneyParseError, SplitIssue } from '@/modules/bill-split/domain/types'
import { formatVnd } from '@/shared/lib/format'

/** Lời nhắc khi không đọc được số tiền người dùng gõ. */
export function moneyErrorMessage(error: MoneyParseError): string {
  switch (error) {
    case 'empty':
      return 'Nhập số tiền.'
    case 'invalid':
      return 'Chưa hiểu số tiền này. Thử 150k, 1tr2 hoặc 1.200.000.'
    case 'fraction':
      return 'Số tiền không có phần lẻ dưới 1 đồng.'
    case 'zero':
      return 'Số tiền phải lớn hơn 0.'
    case 'too_large':
      return 'Số tiền quá lớn, tối đa 999 tỷ.'
  }
}

/** Câu thông báo cho từng lỗi của form khoản chi. Dùng chung cho form và toast. */
export function splitIssueMessage(issue: SplitIssue): string {
  switch (issue.kind) {
    case 'title_required':
      return 'Nhập tiêu đề cho khoản chi.'
    case 'amount':
      return moneyErrorMessage(issue.error)
    case 'no_payer':
      return 'Chọn người trả.'
    case 'no_participants':
      return 'Chọn ít nhất một người chia.'
    case 'exact_amount':
      return moneyErrorMessage(issue.error)
    case 'sum_mismatch':
      return issue.remaining > 0
        ? `Còn thiếu ${formatVnd(issue.remaining)}`
        : `Chia lố ${formatVnd(-issue.remaining)}`
  }
}
