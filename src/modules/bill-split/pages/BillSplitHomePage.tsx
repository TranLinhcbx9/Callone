import { useQueryClient } from '@tanstack/react-query'
import { PlusIcon, WalletIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getBillSplitErrorMessage, isBillSplitError } from '@/modules/bill-split/api/errors'
import { GroupCardSkeleton, GroupList } from '@/modules/bill-split/components/GroupCard'
import { PasteLinkForm } from '@/modules/bill-split/components/PasteLinkForm'
import { UnavailableGroups } from '@/modules/bill-split/components/UnavailableGroups'
import { groupQueryOptions, useGroupSummaries } from '@/modules/bill-split/hooks/useGroup'
import { useDocumentTitle } from '@/modules/bill-split/hooks/useDocumentTitle'
import { useForgetGroup, useRecentGroups } from '@/modules/bill-split/hooks/useLocalState'
import { billSplitPaths, parseGroupLink } from '@/modules/bill-split/paths'
import { AppLink } from '@/shared/ui/AppLink'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Notice } from '@/shared/ui/Notice'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Section } from '@/shared/ui/Section'
import { FloatingAction } from '@/shared/ui/StickyBar'
import { Button } from '@/shared/ui/button'

/** Dùng cho cả link không đọc được lẫn link đúng dạng nhưng nhóm không còn, vì server cũng không cho biết là trường hợp nào. */
const INVALID_LINK_MESSAGE = 'Link này không đúng hoặc nhóm đã bị xóa.'

/** Số thẻ khung xương khi đang tải: bằng số nhóm đã lưu (tối đa 3) để danh sách ít nhảy nhất. */
const MAX_SKELETONS = 3

/**
 * Danh sách nhóm đã lưu trên máy không bị chặn số lượng. Nhiều hơn COLLAPSE_ABOVE nhóm thì chỉ hiện COLLAPSED_COUNT nhóm
 * mới nhất kèm nút "Xem thêm", để ô dán link bên dưới và nút tạo nhóm không bị đẩy xa khỏi tầm tay.
 */
const COLLAPSED_COUNT = 8
const COLLAPSE_ABOVE = 10

/**
 * Trang chủ module Chia tiền: các nhóm đã mở trên máy này (nguồn là localStorage, số liệu lấy từ server), tạo nhóm mới
 * và dán link nhóm bạn bè gửi. Nhóm đã lưu mà server không còn trả về (bị xóa, hoặc link đã đổi ở nơi khác) không làm hỏng
 * trang: nằm riêng ở khối "Không còn mở được", kèm nút xóa khỏi máy này.
 */
export function BillSplitHomePage() {
  useDocumentTitle('Chia tiền')
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const recents = useRecentGroups()
  const forgetGroup = useForgetGroup()
  const tokens = useMemo(() => recents.map((group) => group.token), [recents])
  const summaries = useGroupSummaries(tokens)

  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Trang "Không tìm thấy nhóm" gửi người dùng về đây kèm cờ này để ô dán link được focus sẵn.
  const focusPaste = (location.state as { focusPaste?: boolean } | null)?.focusPaste === true

  // Thứ tự do server quyết định (cập nhật mới nhất lên đầu). Dữ liệu giữ lại từ lần trước có thể còn chứa nhóm vừa xóa khỏi máy.
  const available = useMemo(() => {
    const saved = new Set(tokens)
    return (summaries.data ?? []).filter((group) => saved.has(group.token))
  }, [summaries.data, tokens])

  // Chỉ kết luận "không còn mở được" khi server đã trả lời đúng cho tập token hiện tại. Trong lúc còn dùng dữ liệu cũ
  // (placeholder), một nhóm vừa được mở sẽ chưa có trong kết quả mà vẫn hoàn toàn bình thường.
  const answered = summaries.isSuccess && !summaries.isPlaceholderData
  const unavailable = useMemo(() => {
    if (!answered) return []
    const live = new Set(available.map((group) => group.token))
    return recents.filter((group) => !live.has(group.token))
  }, [answered, available, recents])

  const firstLoad = tokens.length > 0 && summaries.data === undefined
  const loading = firstLoad && !summaries.isError
  const failed = firstLoad && summaries.isError
  const hasGroups = available.length > 0
  const collapsible = available.length > COLLAPSE_ABOVE
  const visible = collapsible && !showAll ? available.slice(0, COLLAPSED_COUNT) : available
  // Nút nổi "Tạo nhóm mới" thay cho nút trong trạng thái trống. Cũng hiện khi danh sách đang tải hoặc lỗi: tạo nhóm không phụ thuộc vào đó.
  const showCreateButton = loading || failed || hasGroups

  async function openLink() {
    if (opening) return
    const token = parseGroupLink(link)
    if (!token) {
      setLinkError(INVALID_LINK_MESSAGE)
      return
    }
    setLinkError(null)
    setOpening(true)
    try {
      // Hỏi server trước khi chuyển trang để nhóm không tồn tại báo lỗi ngay dưới ô dán, và trang nhóm mở ra có sẵn dữ liệu.
      await queryClient.fetchQuery({ ...groupQueryOptions(token), staleTime: 0 })
      void navigate(billSplitPaths.group(token))
    } catch (error) {
      setLinkError(isBillSplitError(error, 'BS_GROUP_NOT_FOUND') ? INVALID_LINK_MESSAGE : getBillSplitErrorMessage(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <PageHeader title="Chia tiền" subtitle="Chia tiền đi chơi với hội bạn" backHref="/" />
      <PageBody padBottom={showCreateButton} className="flex flex-col gap-8">
        {loading ? (
          <Section title="Nhóm của bạn">
            <div className="flex flex-col gap-2.5" aria-busy="true">
              <span role="status" className="sr-only">
                Đang tải danh sách nhóm…
              </span>
              {Array.from({ length: Math.min(tokens.length, MAX_SKELETONS) }, (_, index) => (
                <GroupCardSkeleton key={index} />
              ))}
            </div>
          </Section>
        ) : failed ? (
          <Notice
            tone="warning"
            action={
              <Button size="sm" variant="outline" onClick={() => void summaries.refetch()}>
                Thử lại
              </Button>
            }
          >
            Không tải được danh sách nhóm. Kiểm tra kết nối mạng rồi thử lại.
          </Notice>
        ) : hasGroups ? (
          <Section title="Nhóm của bạn" count={available.length}>
            <GroupList groups={visible} getHref={(group) => billSplitPaths.group(group.token)} />
            {collapsible && (
              <Button variant="outline" className="w-full" onClick={() => setShowAll((current) => !current)}>
                {showAll ? 'Thu gọn' : `Xem thêm ${available.length - COLLAPSED_COUNT} nhóm`}
              </Button>
            )}
          </Section>
        ) : (
          <EmptyState
            icon={<WalletIcon />}
            title="Chưa có nhóm nào"
            description="Tạo nhóm để chia tiền với hội bạn, hoặc dán link nhóm được chia sẻ."
            action={
              <Button size="lg" asChild>
                <AppLink href={billSplitPaths.newGroup()}>
                  <PlusIcon />
                  Tạo nhóm mới
                </AppLink>
              </Button>
            }
          />
        )}

        <UnavailableGroups groups={unavailable} onForget={forgetGroup} />

        <Section title="Mở nhóm có sẵn">
          <PasteLinkForm
            value={link}
            onChange={(value) => {
              setLink(value)
              setLinkError(null)
            }}
            onSubmit={() => void openLink()}
            isSubmitting={opening}
            error={linkError}
            autoFocus={focusPaste}
          />
        </Section>
      </PageBody>

      {showCreateButton && (
        <FloatingAction>
          <Button size="lg" className="rounded-full px-5 shadow-md" asChild>
            <AppLink href={billSplitPaths.newGroup()}>
              <PlusIcon />
              Tạo nhóm mới
            </AppLink>
          </Button>
        </FloatingAction>
      )}
    </>
  )
}
