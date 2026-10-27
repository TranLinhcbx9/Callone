import { useMemo } from 'react'
import { CheckIcon } from 'lucide-react'
import { VietQrCard } from '@/modules/bill-split/components/VietQrCard'
import { bankDisplayName } from '@/modules/bill-split/domain/banks'
import type { Member, Transfer } from '@/modules/bill-split/domain/types'
import { MAX_QR_AMOUNT } from '@/modules/bill-split/domain/vietqr'
import { buildGroupTransferQr } from '@/modules/bill-split/pages/group/transferQr'
import { Notice } from '@/shared/ui/Notice'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'

export interface QrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  members: readonly Member[]
  /**
   * Lần chuyển đang hiện mã. Nơi gọi giữ nguyên giá trị này khi đóng hộp, để nội dung không biến mất giữa lúc hộp
   * trượt xuống. Mã chụp theo số tiền lúc mở: người đang quét không bị đổi mã dưới tay khi nhóm có thay đổi.
   */
  transfer: Transfer | null
  /** Đang ghi nhận "Đã chuyển xong": khóa các nút và không cho đóng hộp. */
  isSaving?: boolean
  /** Bấm "Đã chuyển xong". Nơi gọi tự đóng hộp khi ghi nhận thành công. */
  onMarkPaid: (transfer: Transfer) => void
}

/**
 * Hộp mã VietQR của một lần chuyển khoản: người nhận, số tiền, mã QR và thông tin tài khoản, footer [Đóng, Đã chuyển xong].
 * Chỉ có nội dung khi người nhận đã nhập tài khoản ngân hàng (nút "Mã QR" bị khóa nếu chưa).
 */
export function QrDialog({ open, onOpenChange, groupName, members, transfer, isSaving, onMarkPaid }: QrDialogProps) {
  const receiver = transfer ? members.find((member) => member.id === transfer.toMemberId) : undefined
  const bank = receiver?.bank ?? null
  const amount = transfer?.amount

  const qr = useMemo(
    () => (bank && amount !== undefined ? buildGroupTransferQr(bank, amount, groupName) : null),
    [bank, amount, groupName],
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mã QR chuyển khoản"
      description="Quét bằng app ngân hàng, mọi thông tin đã điền sẵn."
      size="sm"
      initialFocus="content"
      dismissible={!isSaving}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Đóng
          </Button>
          <Button onClick={() => transfer && onMarkPaid(transfer)} disabled={isSaving || !qr || !transfer}>
            {isSaving ? <Spinner /> : <CheckIcon />}
            Đã chuyển xong
          </Button>
        </>
      }
    >
      {transfer && receiver && bank && amount !== undefined ? (
        qr ? (
          <VietQrCard
            payload={qr.payload}
            amount={amount}
            recipientName={receiver.name}
            bankName={bankDisplayName(bank.bin)}
            accountNumber={bank.accountNumber}
            accountName={bank.accountName}
            message={qr.message}
          />
        ) : (
          <Notice tone="danger">
            {amount > MAX_QR_AMOUNT
              ? `Số tiền quá lớn để tạo mã QR. Hãy chuyển khoản trực tiếp cho ${receiver.name}.`
              : `Không tạo được mã QR cho khoản này. Kiểm tra lại tài khoản ngân hàng của ${receiver.name}.`}
          </Notice>
        )
      ) : null}
    </ResponsiveDialog>
  )
}
