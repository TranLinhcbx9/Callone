import { SHARE_URL } from '@/app/dev/fixtures'
import { ShareLinkCard } from '@/modules/bill-split/components/ShareLinkCard'
import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'

/** Thẻ chia sẻ link nhóm (dạng điện thoại có nút Chia sẻ). */
export function ShareLinkMockup() {
  return (
    <>
      <PageHeader title="Chia sẻ nhóm" subtitle="Đà Lạt 3N2Đ" backHref="/dev/mockups/group-members" />
      <PageBody className="pt-6">
        <ShareLinkCard url={SHARE_URL} groupName="Đà Lạt 3N2Đ" onRotate={() => undefined} canShare />
      </PageBody>
    </>
  )
}
