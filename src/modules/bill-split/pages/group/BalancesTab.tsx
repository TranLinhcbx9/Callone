import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getBillSplitErrorMessage } from '@/modules/bill-split/api/errors'
import { BalanceList } from '@/modules/bill-split/components/BalanceList'
import { SettlementList } from '@/modules/bill-split/components/SettlementList'
import { TransferList } from '@/modules/bill-split/components/TransferList'
import { computeBalances } from '@/modules/bill-split/domain/balances'
import { settlementToInput } from '@/modules/bill-split/domain/draft'
import { suggestTransfers } from '@/modules/bill-split/domain/settle'
import type { Settlement, Transfer } from '@/modules/bill-split/domain/types'
import { useDeleteSettlement, useSaveSettlement } from '@/modules/bill-split/hooks/useMutations'
import { toastDialogError } from '@/modules/bill-split/pages/group/dialogToast'
import { MemberDialog } from '@/modules/bill-split/pages/group/MemberDialog'
import { QrDialog } from '@/modules/bill-split/pages/group/QrDialog'
import {
  isDefiniteRejection,
  settlementIds,
  settlementKey,
} from '@/modules/bill-split/pages/group/settlementIds'
import type { GroupTabProps } from '@/modules/bill-split/pages/group/tabProps'
import { useMemberDialog } from '@/modules/bill-split/pages/group/useMemberDialog'
import { todayIsoDate } from '@/shared/lib/date'
import { formatVnd } from '@/shared/lib/format'
import { Section } from '@/shared/ui/Section'

/** Khóa của một lần chuyển trong TransferList (busyKey). */
function transferKey(transfer: Transfer): string {
  return `${transfer.fromMemberId}:${transfer.toMemberId}`
}

/** Toast có nút "Hoàn tác" ở lại lâu hơn toast thường để kịp bấm bằng ngón cái. */
const UNDO_TOAST_MS = 8000

/**
 * Tab Số dư: số dư từng người, gợi ý chuyển khoản ít lần nhất (mã QR, "Đã trả") và lịch sử các lần đã trả.
 * Số dư và gợi ý tính lại từ `group` mỗi khi nhóm đổi; các lần ghi cập nhật cache nên `group` tự làm mới.
 */
export function BalancesTab({ token, group, meId }: GroupTabProps) {
  const saveSettlement = useSaveSettlement()
  const deleteSettlement = useDeleteSettlement()
  const memberDialog = useMemberDialog()

  const balances = useMemo(() => computeBalances(group), [group])
  const transfers = useMemo(() => suggestTransfers(balances, group.members), [balances, group.members])

  const [qrOpen, setQrOpen] = useState(false)
  // Giữ nguyên khi đóng hộp QR để nội dung không biến mất giữa lúc hộp trượt xuống.
  const [qrTransfer, setQrTransfer] = useState<Transfer | null>(null)
  // Bản sao của hai state trên cho các hàm async: chúng chạy xong sau khi người dùng có thể đã đóng hay mở hộp khác.
  const qrShown = useRef<{ open: boolean; transfer: Transfer | null }>({ open: false, transfer: null })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Khóa đồng bộ chống bấm đúp: state chỉ đổi ở lần render sau nên hai cú chạm liên tiếp có thể cùng lọt qua.
  // (Các lần ghi của một nhóm đã được hook xếp hàng lần lượt, khóa này chỉ để mỗi lần bấm chỉ tạo một lần ghi.)
  const working = useRef(false)

  const nameOf = (memberId: string) => group.members.find((member) => member.id === memberId)?.name ?? '?'

  function showQr(transfer: Transfer) {
    qrShown.current = { open: true, transfer }
    setQrTransfer(transfer)
    setQrOpen(true)
  }

  function changeQrOpen(open: boolean) {
    qrShown.current = { ...qrShown.current, open }
    setQrOpen(open)
  }

  /** Bỏ lần trả vừa ghi nhận (nút "Hoàn tác" của toast): xóa đúng lần trả đó theo id. */
  async function undoMarkPaid(settlementId: string) {
    try {
      await deleteSettlement.mutateAsync({ token, settlementId })
      toast.success('Đã hủy lần trả vừa ghi nhận')
    } catch (error) {
      toast.error(getBillSplitErrorMessage(error))
    }
  }

  /**
   * Ghi nhận một lần chuyển đã trả. Trả true khi thành công, để hộp QR biết có nên đóng.
   * Id của lần ghi giữ nguyên giữa các lần bấm cho tới khi biết chắc kết quả (xem settlementIds.ts): phản hồi bị mất
   * rồi bấm lại chỉ ghi đè chính lần trả đó, không ghi trùng làm số dư đảo chiều.
   */
  async function markPaid(transfer: Transfer): Promise<boolean> {
    if (working.current) return false
    working.current = true
    const key = settlementKey(token, transfer)
    const id = settlementIds.claim(key)
    setBusyKey(transferKey(transfer))
    try {
      await saveSettlement.mutateAsync({
        token,
        settlement: {
          id,
          fromMemberId: transfer.fromMemberId,
          toMemberId: transfer.toMemberId,
          amount: transfer.amount,
          settledOn: todayIsoDate(),
          note: null,
        },
      })
      settlementIds.settle(key)
      toast.success(
        `Đã ghi nhận ${nameOf(transfer.fromMemberId)} trả ${nameOf(transfer.toMemberId)} ${formatVnd(transfer.amount)}`,
        { duration: UNDO_TOAST_MS, action: { label: 'Hoàn tác', onClick: () => void undoMarkPaid(id) } },
      )
      return true
    } catch (error) {
      if (isDefiniteRejection(error)) settlementIds.settle(key)
      const message = getBillSplitErrorMessage(error)
      // Hộp QR còn mở thì lỗi hiện ở đầu màn hình để không che nút "Đã chuyển xong" ở chân hộp.
      if (qrShown.current.open) toastDialogError(message)
      else toast.error(message)
      return false
    } finally {
      working.current = false
      setBusyKey(null)
    }
  }

  async function confirmQr(transfer: Transfer) {
    if (!(await markPaid(transfer))) return
    // Chỉ đóng nếu hộp vẫn đang hiện đúng lần chuyển này: lúc chờ, người dùng có thể đã đóng hộp hay mở mã khác.
    const { open, transfer: shown } = qrShown.current
    if (open && shown && transferKey(shown) === transferKey(transfer)) changeQrOpen(false)
  }

  /** Lưu lại đúng id cũ nên bấm "Hoàn tác" hai lần cũng chỉ có một lần trả. */
  async function undoDelete(settlement: Settlement) {
    try {
      await saveSettlement.mutateAsync({ token, settlement: settlementToInput(settlement) })
      toast.success('Đã khôi phục lần trả')
    } catch (error) {
      toast.error(getBillSplitErrorMessage(error))
    }
  }

  async function removeSettlement(settlement: Settlement) {
    if (working.current) return
    working.current = true
    setDeletingId(settlement.id)
    try {
      const { deleted } = await deleteSettlement.mutateAsync({ token, settlementId: settlement.id })
      toast.success('Đã xóa lần trả', {
        duration: UNDO_TOAST_MS,
        action: deleted ? { label: 'Hoàn tác', onClick: () => void undoDelete(deleted) } : undefined,
      })
    } catch (error) {
      toast.error(getBillSplitErrorMessage(error))
    } finally {
      working.current = false
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title="Số dư" description="Số dương là được nhận lại, số âm là còn nợ.">
        <BalanceList members={group.members} balances={balances} meId={meId} />
      </Section>

      {transfers.length > 0 && (
        <Section
          title="Gợi ý chuyển khoản"
          count={transfers.length}
          description="Ít lần chuyển nhất để mọi người huề nhau."
        >
          <TransferList
            transfers={transfers}
            members={group.members}
            meId={meId}
            busyKey={busyKey}
            onShowQr={showQr}
            onMarkPaid={(transfer) => void markPaid(transfer)}
            onEditMember={memberDialog.openFor}
          />
        </Section>
      )}

      {group.settlements.length > 0 && (
        <Section title="Đã thanh toán" count={group.settlements.length}>
          <SettlementList
            settlements={group.settlements}
            members={group.members}
            meId={meId}
            busyId={deletingId}
            onDelete={(settlement) => void removeSettlement(settlement)}
          />
        </Section>
      )}

      <QrDialog
        open={qrOpen}
        onOpenChange={changeQrOpen}
        groupName={group.name}
        members={group.members}
        transfer={qrTransfer}
        isSaving={busyKey !== null}
        onMarkPaid={(transfer) => void confirmQr(transfer)}
      />
      <MemberDialog
        key={memberDialog.session}
        token={token}
        group={group}
        member={memberDialog.member}
        open={memberDialog.open}
        onOpenChange={memberDialog.onOpenChange}
      />
    </div>
  )
}
