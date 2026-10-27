import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { getBillSplitErrorMessage, isBillSplitError } from '@/modules/bill-split/api/errors'
import { ExpenseFormView } from '@/modules/bill-split/components/ExpenseFormView'
import { ExpenseFormSkeleton, ExpenseNoMembers, ExpenseNotFound } from '@/modules/bill-split/components/ExpenseStates'
import { GroupLoadFailed, GroupNotFound, TitleSkeleton } from '@/modules/bill-split/components/GroupStates'
import {
  createExpenseDraft,
  draftFromExpense,
  draftsEqual,
  draftToInput,
  expenseMatchesInput,
  expenseToInput,
} from '@/modules/bill-split/domain/draft'
import { computeSplitPreview } from '@/modules/bill-split/domain/split'
import type { Expense, ExpenseDraft, Group } from '@/modules/bill-split/domain/types'
import type { ExpenseInput } from '@/modules/bill-split/domain/inputs'
import { useDocumentTitle } from '@/modules/bill-split/hooks/useDocumentTitle'
import { groupQueryOptions, useGroup } from '@/modules/bill-split/hooks/useGroup'
import { useGroupGone } from '@/modules/bill-split/hooks/useGroupGone'
import { useMe } from '@/modules/bill-split/hooks/useLocalState'
import { useDeleteExpense, useSaveExpense } from '@/modules/bill-split/hooks/useMutations'
import { useRotationRecovery } from '@/modules/bill-split/hooks/useRotationRecovery'
import { billSplitPaths, groupTabPath } from '@/modules/bill-split/paths'
import { todayIsoDate } from '@/shared/lib/date'
import { toAppError } from '@/shared/lib/errors'
import { newId } from '@/shared/lib/id'
import { Notice } from '@/shared/ui/Notice'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'

/** Toast "Hoàn tác" ở lại lâu hơn toast thường để kịp bấm bằng ngón cái. */
const UNDO_TOAST_MS = 8000

/**
 * Trang form khoản chi toàn màn hình, dùng chung cho thêm mới (không có expenseId) và sửa. Tiêu đề header biết ngay
 * từ đường dẫn nên giữ nguyên ở mọi trạng thái (đang tải, lỗi, không tìm thấy), chỉ phần thân đổi.
 */
export function ExpenseFormPage() {
  const { token = '', expenseId } = useParams<{ token: string; expenseId?: string }>()
  const navigate = useNavigate()
  const query = useGroup(token)
  const gone = useGroupGone(token)
  const title = expenseId ? 'Sửa khoản chi' : 'Thêm khoản chi'

  // Như trang nhóm: link báo không tìm thấy có thể là phía cũ của một lần đổi link mà phản hồi bị mất. Link mới còn sống
  // thì mở lại đúng form này dưới token mới.
  const notFound = isBillSplitError(query.error, 'BS_GROUP_NOT_FOUND')
  const recovery = useRotationRecovery(token, {
    notFound,
    onRecovered: (newToken) =>
      void navigate(expenseId ? billSplitPaths.expense(newToken, expenseId) : billSplitPaths.newExpense(newToken), {
        replace: true,
      }),
  })

  if (notFound) {
    if (recovery.status === 'checking') return <ExpenseFormLoading title={title} token={token} />
    return (
      <GroupNotFound
        title={title}
        backIcon="close"
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
      return (
        <GroupLoadFailed
          title={title}
          backIcon="close"
          homeHref={gone.homeHref}
          onRetry={() => void query.refetch()}
          description={toAppError(query.error).kind === 'network' ? undefined : getBillSplitErrorMessage(query.error)}
        />
      )
    }
    return <ExpenseFormLoading title={title} token={token} />
  }
  return <ExpenseFormScreen key={`${token}/${expenseId ?? 'new'}`} token={token} group={query.data} expenseId={expenseId} />
}

/** Header (tiêu đề đã biết từ đường dẫn) và khung xương của form, cho lúc chờ nhóm tải về. */
function ExpenseFormLoading({ title, token }: { title: string; token: string }) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={<TitleSkeleton className="mt-1 h-3.5 w-24" />}
        backHref={billSplitPaths.group(token)}
        backIcon="close"
      />
      <ExpenseFormSkeleton />
    </>
  )
}

/** Bản nháp ban đầu: trống cho khoản mới (người trả mặc định là mình), hoặc nạp khoản có sẵn. null nếu id không có trong nhóm. */
function resolveInitialDraft(group: Group, expenseId: string | undefined, meId: string | null): ExpenseDraft | null {
  if (expenseId === undefined) {
    return createExpenseDraft({ id: newId(), today: todayIsoDate(), members: group.members, paidBy: meId })
  }
  const expense = group.expenses.find((item) => item.id === expenseId)
  return expense ? draftFromExpense(expense) : null
}

function ExpenseFormScreen({ token, group, expenseId }: { token: string; group: Group; expenseId?: string }) {
  const [meId] = useMe(token)
  // Chốt đúng một lần lúc mở: sau khi xóa khoản chi (cache cập nhật trước lúc chuyển trang) hay khi người khác sửa
  // nhóm, form đang mở không được đổi hình hoặc nháy sang "không tìm thấy".
  const [initialDraft] = useState(() => resolveInitialDraft(group, expenseId, meId))
  const title = expenseId ? 'Sửa khoản chi' : 'Thêm khoản chi'

  if (!initialDraft) {
    return (
      <>
        <PageHeader title={title} subtitle={group.name} backHref={billSplitPaths.group(token)} backIcon="close" />
        <ExpenseNotFound groupHref={billSplitPaths.group(token)} />
      </>
    )
  }
  if (group.members.length === 0 && initialDraft.version === null) {
    return (
      <>
        <PageHeader title={title} subtitle={group.name} backHref={billSplitPaths.group(token)} backIcon="close" />
        <ExpenseNoMembers membersHref={groupTabPath(token, 'members')} />
      </>
    )
  }
  return <ExpenseEditor token={token} group={group} initialDraft={initialDraft} />
}

function ExpenseEditor({ token, group, initialDraft }: { token: string; group: Group; initialDraft: ExpenseDraft }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const saveExpense = useSaveExpense()
  const deleteExpense = useDeleteExpense()

  const editing = initialDraft.version !== null
  useDocumentTitle(`${editing ? 'Sửa khoản chi' : 'Thêm khoản chi'} · ${group.name}`)
  const [draft, setDraft] = useState(initialDraft)
  // Mốc để biết form đã bị sửa chưa. Đổi theo bản mới nhất khi tải lại sau xung đột.
  const [baseline, setBaseline] = useState(initialDraft)
  const [showIssues, setShowIssues] = useState(false)
  const [issueTick, setIssueTick] = useState(0)
  const [conflict, setConflict] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Đã lưu xong và đang rời trang: khóa form cho tới lúc trang đóng. Khoản mới đã nằm trên server với id của bản nháp này,
  // lưu thêm lần nữa với cùng id thì server coi là gửi lại và bỏ qua nội dung mới, người dùng tưởng đã lưu mà mất dữ liệu.
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => computeSplitPreview(draft, group.members), [draft, group.members])
  const dirty = !draftsEqual(draft, baseline)

  // Hỏi xác nhận khi rời trang lúc form có thay đổi chưa lưu, kể cả bấm Quay lại của trình duyệt. `leaving` bật khi chính
  // mình chủ động rời đi sau khi lưu hoặc xóa xong, lúc đó không hỏi. Dùng ref vì phải có hiệu lực ngay trong cùng lượt
  // xử lý với lệnh navigate, state thì chỉ đổi ở lần render sau.
  const leaving = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  )

  // Sau khi bấm Lưu mà form còn lỗi: cuộn tới và focus ô lỗi đầu tiên (ô có aria-invalid hoặc dòng báo lỗi).
  useEffect(() => {
    if (issueTick === 0) return
    const target =
      document.querySelector<HTMLElement>('#expense-form [aria-invalid="true"], #expense-form [role="alert"]') ??
      document.getElementById('expense-split')
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (target.matches('input, textarea, button')) target.focus({ preventScroll: true })
  }, [issueTick])

  /** Quay về nơi đã mở form (thường là trang nhóm). Mở thẳng bằng đường dẫn thì không có gì để quay lại nên thay bằng trang nhóm. */
  function navigateBack() {
    if (location.key !== 'default') void navigate(-1)
    else void navigate(billSplitPaths.group(token), { replace: true })
  }

  function leave() {
    leaving.current = true
    navigateBack()
  }

  /** Lưu xong: báo, khóa form rồi rời trang. */
  function finishSaved() {
    setSaved(true)
    toast.success('Đã lưu khoản chi')
    leave()
  }

  /**
   * Server báo xung đột phiên bản: tải bản mới nhất. Nếu nó đã đúng thứ vừa định lưu thì lần lưu trước đã thành công mà
   * mất phản hồi (rớt mạng), không phải người khác sửa: coi như đã lưu. Còn không thì người khác vừa sửa khoản chi này:
   * đưa bản mới nhất vào form và nói rõ cho người dùng, không tự ghi đè.
   */
  async function reloadAfterConflict(attempted: ExpenseInput) {
    try {
      const latest = await queryClient.fetchQuery({ ...groupQueryOptions(token), staleTime: 0 })
      const expense = latest.expenses.find((item) => item.id === draft.id)
      if (!expense) {
        toast.error('Khoản chi này không còn nữa. Có thể người khác vừa xóa.')
        leave()
        return
      }
      if (expenseMatchesInput(expense, attempted)) {
        finishSaved()
        return
      }
      const fresh = draftFromExpense(expense)
      setDraft(fresh)
      setBaseline(fresh)
      setShowIssues(false)
      setConflict(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(getBillSplitErrorMessage(error))
    }
  }

  function submit() {
    const result = draftToInput(draft, group.members)
    if (!result.ok) {
      setShowIssues(true)
      setIssueTick((tick) => tick + 1)
      return
    }
    setConflict(false)
    const attempted = result.input
    saveExpense.mutate(
      { token, expense: attempted },
      {
        onSuccess: finishSaved,
        onError: (error) => {
          if (isBillSplitError(error, 'BS_CONFLICT')) void reloadAfterConflict(attempted)
          else toast.error(getBillSplitErrorMessage(error))
        },
      },
    )
  }

  /** Lưu lại đúng khoản chi vừa xóa (cùng id, không kèm version). Gọi từ toast nên phải chạy được cả khi trang đã đóng. */
  async function restore(deleted: Expense) {
    try {
      await saveExpense.mutateAsync({ token, expense: expenseToInput(deleted, null) })
      toast.success('Đã khôi phục khoản chi')
    } catch (error) {
      toast.error(getBillSplitErrorMessage(error))
    }
  }

  function remove() {
    deleteExpense.mutate(
      { token, expenseId: draft.id },
      {
        onSuccess: ({ deleted }) => {
          setConfirmDelete(false)
          leave()
          toast.success('Đã xóa khoản chi', {
            duration: UNDO_TOAST_MS,
            action: deleted ? { label: 'Hoàn tác', onClick: () => void restore(deleted) } : undefined,
          })
        },
        onError: (error) => {
          setConfirmDelete(false)
          toast.error(getBillSplitErrorMessage(error))
        },
      },
    )
  }

  const saving = saveExpense.isPending || deleteExpense.isPending || saved

  return (
    <>
      <PageHeader
        title={editing ? 'Sửa khoản chi' : 'Thêm khoản chi'}
        subtitle={group.name}
        backIcon="close"
        onBack={navigateBack}
      />
      <PageBody padBottom className="pt-6">
        {conflict && (
          <Notice tone="danger" className="mb-6">
            Người khác vừa sửa khoản chi này. Form đã cập nhật theo bản mới nhất, kiểm tra lại rồi bấm Lưu thay đổi.
          </Notice>
        )}
        <ExpenseFormView
          members={group.members}
          draft={draft}
          preview={preview}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={submit}
          onDelete={editing ? () => setConfirmDelete(true) : undefined}
          isSaving={saving}
          showIssues={showIssues}
        />
      </PageBody>

      <ResponsiveDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xóa khoản chi?"
        description={
          <>
            Khoản chi <span className="font-semibold text-foreground">{draft.title.trim() || 'này'}</span> sẽ bị xóa khỏi
            nhóm. Bạn có thể hoàn tác ngay sau khi xóa.
          </>
        }
        size="sm"
        dismissible={!deleteExpense.isPending}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleteExpense.isPending}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleteExpense.isPending}>
              {deleteExpense.isPending && <Spinner />}
              Xóa khoản chi
            </Button>
          </>
        }
      />

      <ResponsiveDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Bỏ thay đổi?"
        description="Khoản chi chưa được lưu. Thoát bây giờ sẽ mất những gì bạn vừa nhập."
        size="sm"
        footer={
          <>
            <Button variant="destructive" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
              Bỏ thay đổi
            </Button>
            <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>Tiếp tục sửa</Button>
          </>
        }
      />
    </>
  )
}
