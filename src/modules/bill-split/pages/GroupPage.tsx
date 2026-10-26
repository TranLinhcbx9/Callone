import { useParams } from 'react-router'
import { getBillSplitErrorMessage } from '@/modules/bill-split/api/errors'
import { useGroup } from '@/modules/bill-split/hooks/useGroup'

/**
 * Trang tạm: chỉ tải nhóm bằng useGroup và hiện tên, số lượng, để thử nối dữ liệu.
 * Sẽ thay bằng ba phần Chi tiêu, Số dư, Thành viên sau khi duyệt giao diện.
 */
export function GroupPage() {
  const { token } = useParams<{ token: string }>()
  const { data: group, error, isPending } = useGroup(token)

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      {isPending ? <p className="text-sm opacity-70">Đang tải nhóm...</p> : null}
      {error ? <p className="text-sm">{getBillSplitErrorMessage(error)}</p> : null}
      {group ? (
        <>
          <h1 className="text-xl font-semibold">{group.name}</h1>
          <p className="mt-2 text-sm opacity-70">
            {group.members.length} thành viên, {group.expenses.length} khoản chi, {group.settlements.length} lần trả nợ.
          </p>
        </>
      ) : null}
    </section>
  )
}
