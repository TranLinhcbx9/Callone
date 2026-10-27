import QRCode from 'react-qr-code'
import { formatVnd } from '@/shared/lib/format'
import { CopyButton } from '@/shared/ui/CopyButton'
import { MoneyText } from '@/shared/ui/MoneyText'

export interface VietQrCardProps {
  /** Chuỗi VietQR (chuẩn EMVCo, có CRC) đã tính ở domain. Được vẽ thành mã QR và gắn vào phần tử qua data-payload. */
  payload: string
  amount: number
  /** Tên người nhận trong nhóm, ví dụ "Linh". */
  recipientName: string
  bankName: string
  accountNumber: string
  /** Tên chủ tài khoản viết hoa không dấu, có thể trống. */
  accountName?: string | null
  /** Nội dung chuyển khoản không dấu. */
  message: string
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5 pr-1.5 pl-4 [@media(max-height:46rem)]:min-h-10">
      <dt className="w-28 shrink-0 text-small text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-body leading-snug font-medium break-words">{value}</dd>
      {copy !== undefined ? (
        <CopyButton iconOnly value={copy} label={`Sao chép ${label.toLowerCase()}`} variant="ghost" size="icon-sm" />
      ) : (
        <span className="size-9 shrink-0" aria-hidden="true" />
      )}
    </div>
  )
}

/**
 * Mã VietQR để chuyển khoản trả nợ: người nhận, số tiền, mã QR (luôn nền trắng để app ngân hàng quét được cả ở
 * chế độ tối) và thông tin tài khoản có nút sao chép. Đặt trong ResponsiveDialog, nút "Đã chuyển xong" đặt ở footer
 * của hộp thoại để luôn thấy được khi nội dung dài. Màn hình thấp (dưới 46rem, ví dụ laptop nhỏ) thì mã QR và các dòng
 * thu gọn lại một chút để cả hộp vừa trong màn hình mà không phải cuộn.
 * Mã QR là một thẻ svg có thuộc tính data-payload (và data-testid="vietqr-code") để test E2E đọc lại chuỗi.
 */
export function VietQrCard({ payload, amount, recipientName, bankName, accountNumber, accountName, message }: VietQrCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 [@media(max-height:46rem)]:gap-3">
      <div className="text-center">
        <p className="text-small text-muted-foreground">Chuyển cho {recipientName}</p>
        <p className="mt-0.5">
          <MoneyText amount={amount} size="display" weight="semibold" className="tracking-tight" />
        </p>
      </div>

      <div className="w-52 rounded-2xl border border-border bg-white p-3.5 shadow-sm [@media(max-height:46rem)]:w-40 [@media(max-height:46rem)]:p-3">
        <QRCode
          value={payload}
          level="M"
          bgColor="#ffffff"
          fgColor="#16130f"
          title={`Mã QR chuyển ${formatVnd(amount)} cho ${recipientName}`}
          style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
          viewBox="0 0 256 256"
          data-testid="vietqr-code"
          data-payload={payload}
        />
      </div>

      <dl className="w-full divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        <Row label="Ngân hàng" value={bankName} />
        <Row label="Số tài khoản" value={accountNumber} copy={accountNumber} />
        {accountName && <Row label="Chủ tài khoản" value={accountName} />}
        <Row label="Nội dung" value={message} copy={message} />
      </dl>
    </div>
  )
}
