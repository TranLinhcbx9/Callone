import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { getBillSplitErrorMessage, isBillSplitError } from '@/modules/bill-split/api/errors'
import { DeleteGroupConfirm } from '@/modules/bill-split/components/DeleteGroupConfirm'
import { GroupLoadFailed, GroupLoading, GroupNotFound } from '@/modules/bill-split/components/GroupStates'
import { GroupSections, type GroupSectionId } from '@/modules/bill-split/components/GroupSections'
import type { Group } from '@/modules/bill-split/domain/types'
import { useDocumentTitle } from '@/modules/bill-split/hooks/useDocumentTitle'
import { useGroup } from '@/modules/bill-split/hooks/useGroup'
import { useGroupGone } from '@/modules/bill-split/hooks/useGroupGone'
import {
  useForgetGroup,
  useMe,
  useRecentGroups,
  useRecentGroupsFull,
  useRememberGroup,
} from '@/modules/bill-split/hooks/useLocalState'
import { useDeleteGroup } from '@/modules/bill-split/hooks/useMutations'
import { useRotationRecovery } from '@/modules/bill-split/hooks/useRotationRecovery'
import { useShareGroup } from '@/modules/bill-split/hooks/useShareGroup'
import { BalancesTab } from '@/modules/bill-split/pages/group/BalancesTab'
import { AddExpenseButton, ExpensesTab } from '@/modules/bill-split/pages/group/ExpensesTab'
import { RenameGroupDialog, WhoAmIDialog } from '@/modules/bill-split/pages/group/GroupDialogs'
import { MembersTab } from '@/modules/bill-split/pages/group/MembersTab'
import type { GroupTabProps } from '@/modules/bill-split/pages/group/tabProps'
import { MAX_RECENT_GROUPS } from '@/modules/bill-split/storage'
import { billSplitPaths, GROUP_TAB_PARAMS, groupTabPath, parseGroupTab } from '@/modules/bill-split/paths'
import { toAppError } from '@/shared/lib/errors'
import { Notice } from '@/shared/ui/Notice'

/**
 * Nhóm đã tự hỏi "Bạn là ai trong nhóm?" trong lần chạy app này. Nằm ngoài component để đi từ trang nhóm sang form
 * khoản chi rồi quay lại không bị hỏi lại, nhưng mở lại app (tải lại trang) thì hỏi tiếp nếu vẫn chưa chọn.
 */
const promptedTokens = new Set<string>()

type Overlay = 'none' | 'who' | 'rename' | 'delete'

/** Trang nhóm: tải nhóm rồi dựng khung ba tab. Lỗi và đang tải có màn hình riêng, nhóm đã xóa hay đổi link thì báo không tìm thấy. */
export function GroupPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = useGroup(token)
  const gone = useGroupGone(token)
  // Đã xóa nhóm xong và đang chuyển về trang Chia tiền. Xóa nhóm gỡ nhóm khỏi cache, trang tải lại thì server báo không
  // tìm thấy: cờ này giữ màn hình khung xương trung tính thay vì nháy "Không tìm thấy nhóm" trong lúc chờ chuyển trang.
  const [leaving, setLeaving] = useState(false)

  // Link báo không tìm thấy có thể là phía cũ của một lần đổi link mà phản hồi bị mất. Hook hỏi server trước khi kết luận;
  // nếu link mới còn sống thì chuyển sang đó (replace) và giữ nguyên ?tab=.
  const notFound = isBillSplitError(query.error, 'BS_GROUP_NOT_FOUND')
  const tab = parseGroupTab(searchParams.get('tab'))
  const recovery = useRotationRecovery(token, {
    notFound,
    onRecovered: (newToken) => void navigate(groupTabPath(newToken, tab), { replace: true }),
  })

  if (leaving) return <GroupLoading backHref={gone.homeHref} />

  if (notFound) {
    // Chỉ đọc 'checking' trong nhánh này: hook cũng báo 'checking' lúc kiểm tra lại ngầm.
    if (recovery.status === 'checking') return <GroupLoading backHref={gone.homeHref} />
    return (
      <GroupNotFound
        homeHref={gone.homeHref}
        onPasteOther={gone.onPasteOther}
        // Chưa kiểm tra được link mới thì nhóm có thể vẫn sống dưới link khác: đừng mời xóa khỏi máy.
        onForget={recovery.status === 'unreachable' ? undefined : gone.onForget}
        unreachable={recovery.status === 'unreachable'}
        onCheckAgain={recovery.retry}
      />
    )
  }
  if (!query.data) {
    if (query.isError && !query.isFetching) {
      const network = toAppError(query.error).kind === 'network'
      return (
        <GroupLoadFailed
          homeHref={gone.homeHref}
          onRetry={() => void query.refetch()}
          description={network ? undefined : getBillSplitErrorMessage(query.error)}
        />
      )
    }
    return <GroupLoading backHref={gone.homeHref} />
  }
  return <GroupView token={token} group={query.data} onLeaving={() => setLeaving(true)} />
}

function GroupView({ token, group, onLeaving }: { token: string; group: Group; onLeaving: () => void }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [storedMe, setMe] = useMe(token)
  const forgetGroup = useForgetGroup()
  const deleteGroup = useDeleteGroup()
  const share = useShareGroup(token, group.name)
  // Id đã lưu mà thành viên đó không còn trong nhóm thì coi như chưa chọn, để không truyền id mồ côi xuống các tab.
  const meId = storedMe !== null && group.members.some((member) => member.id === storedMe) ? storedMe : null
  const tab = parseGroupTab(searchParams.get('tab'))
  const memberCount = group.members.length

  // Lần đầu mở nhóm trên máy này (chưa chọn "mình là ai", chưa hỏi trong lần chạy app này): mở sẵn hộp "Bạn là ai trong
  // nhóm?" ngay từ lần render đầu, không chờ effect nên hộp không nháy lên sau khi trang đã hiện.
  const [overlay, setOverlay] = useState<Overlay>(() =>
    meId === null && memberCount > 0 && !promptedTokens.has(token) ? 'who' : 'none',
  )

  useRememberGroup(token, group.name)
  useDocumentTitle(group.name)

  // Danh sách nhóm trên máy đã đầy và nhóm này không nằm trong đó: nó sẽ không hiện ở trang Chia tiền. Nói thẳng và cố định
  // (không chỉ một lần mỗi lần chạy app), vì mất link là mất nhóm trên máy này.
  const recents = useRecentGroups()
  const listFull = useRecentGroupsFull()
  const unsaved = listFull && !recents.some((saved) => saved.token === token)

  // Đánh dấu đã hỏi để lần quay lại trang này trong cùng lượt chạy (ví dụ từ form khoản chi) không hỏi nữa.
  useEffect(() => {
    if (overlay === 'who') promptedTokens.add(token)
  }, [overlay, token])

  function changeTab(next: GroupSectionId) {
    // replace để đổi tab không làm đầy lịch sử; tab mặc định thì bỏ hẳn ?tab= cho URL gọn.
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === 'expenses') params.delete('tab')
        else params.set('tab', GROUP_TAB_PARAMS[next])
        return params
      },
      { replace: true },
    )
  }

  /**
   * Dùng mutateAsync thay vì callback của mutate: xóa nhóm gỡ nhóm khỏi cache, trang đang quan sát nhóm đó nên có thể bị
   * dựng lại (khung xương rồi "không tìm thấy") và GroupView bị gỡ ra trước khi mutate kịp gọi callback. Lời hứa của
   * mutateAsync vẫn chạy tiếp được sau khi component đã gỡ.
   */
  async function confirmDelete() {
    try {
      await deleteGroup.mutateAsync({ token })
      onLeaving()
      void navigate(billSplitPaths.home(), { replace: true })
      toast.success('Đã xóa nhóm')
    } catch (error) {
      if (isBillSplitError(error, 'BS_GROUP_NOT_FOUND')) {
        // Nhóm đã bị xóa từ trước ở nơi khác: kết quả giống ý người dùng, chỉ cần dọn khỏi máy này.
        onLeaving()
        forgetGroup(token)
        void navigate(billSplitPaths.home(), { replace: true })
        toast.success('Nhóm này đã được xóa trước đó')
        return
      }
      toast.error(getBillSplitErrorMessage(error))
    }
  }

  const tabProps: GroupTabProps = {
    token,
    group,
    meId,
    onChangeMe: () => setOverlay('who'),
    onDeleteGroup: () => setOverlay('delete'),
  }

  return (
    <>
      <GroupSections
        header={{
          name: group.name,
          members: group.members,
          meId,
          backHref: billSplitPaths.home(),
          onShare: () => void share(),
          onRename: () => setOverlay('rename'),
          onChangeMe: () => setOverlay('who'),
          onDelete: () => setOverlay('delete'),
        }}
        value={tab}
        onValueChange={changeTab}
        counts={{ expenses: group.expenses.length, members: memberCount }}
        expenses={<ExpensesTab {...tabProps} />}
        balances={<BalancesTab {...tabProps} />}
        members={<MembersTab {...tabProps} />}
        notice={
          unsaved ? (
            <Notice tone="warning">
              Máy này đã lưu đủ {MAX_RECENT_GROUPS} nhóm nên nhóm này không hiện ở trang Chia tiền. Hãy chép link ở tab
              Thành viên để mở lại sau.
            </Notice>
          ) : undefined
        }
        // Nhóm chưa có khoản chi thì nút "Thêm khoản chi" đã nằm trong trạng thái trống, không cần thêm nút nổi.
        actions={{ expenses: group.expenses.length > 0 ? <AddExpenseButton token={token} floating /> : undefined }}
      />

      <WhoAmIDialog
        open={overlay === 'who'}
        onOpenChange={(open) => setOverlay(open ? 'who' : 'none')}
        members={group.members}
        value={meId}
        onSelect={(memberId) => {
          setMe(memberId)
          setOverlay('none')
        }}
      />
      <RenameGroupDialog
        open={overlay === 'rename'}
        onOpenChange={(open) => setOverlay(open ? 'rename' : 'none')}
        token={token}
        groupName={group.name}
      />
      <DeleteGroupConfirm
        open={overlay === 'delete'}
        onOpenChange={(open) => setOverlay(open ? 'delete' : 'none')}
        groupName={group.name}
        isDeleting={deleteGroup.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
