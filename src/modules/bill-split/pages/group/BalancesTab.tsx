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
import type { GroupTabProps } from '@/modules/bill-split/pages/group/tabProps'
import { useMemberDialog } from '@/modules/bill-split/pages/group/useMemberDialog'
import { todayIsoDate } from '@/shared/lib/date'
import { formatVnd } from '@/shared/lib/format'
import { newId } from '@/shared/lib/id'
import { Section } from '@/shared/ui/Section'

/** Khóa của một lần chuyển trong TransferList (busyKey). */
function transferKey(transfer: Transfer): string {
  return `${transfer.fromMemberId}:${transfer.toMemberId}`
}

/** Toast "Hoàn tác" ở lại lâu hơn toast thường để kịp bấm bằng ngón cái. */
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
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Khóa đồng bộ chống bấm đúp: state chỉ đổi ở lần render sau nên hai cú chạm liên tiếp có thể cùng lọt qua.
  // (Các lần ghi của một nhóm đã được hook xếp hàng lần lượt, khóa này chỉ để mỗi lần bấm chỉ tạo một lần ghi.)
  const working = useRef(false)

  const nameOf = (memberId: string) => group.members.find((member) => member.id === memberId)?.name ?? '?'

  /**
   * Ghi nhận một lần chuyển đã trả. Trả true khi thành công, để hộp QR biết có nên đóng.
   * `fromDialog`: bấm từ hộp QR, nên lỗi hiện ở đầu màn hình để không che nút "Đã chuyển xong" ở chân hộp.
   */
  async function markPaid(transfer: Transfer, fromDialog = false): Promise<boolean> {
    if (working.current) return false
    working.current = true
    setBusyKey(transferKey(transfer))
    try {
      await saveSettlement.mutateAsync({
        token,
        settlement: {
          id: newId(),
          fromMemberId: transfer.fromMemberId,
          toMemberId: transfer.toMemberId,
          amount: transfer.amount,
          settledOn: todayIsoDate(),
          note: null,
        },
      })
      toast.success(
        `Đã ghi nhận ${nameOf(transfer.fromMemberId)} trả ${nameOf(transfer.toMemberId)} ${formatVnd(transfer.amount)}`,
      )
      return true
    } catch (error) {
      const message = getBillSplitErrorMessage(error)
      if (fromDialog) toastDialogError(message)
      else toast.error(message)
      return false
    } finally {
      working.current = false
      setBusyKey(null)
    }
  }

  async function confirmQr(transfer: Transfer) {
    if (await markPaid(transfer, true)) setQrOpen(false)
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

  function showQr(transfer: Transfer) {
    setQrTransfer(transfer)
    setQrOpen(true)
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
        onOpenChange={setQrOpen}
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
