import { InboxIcon } from 'lucide-react'
import { GROUP_SUMMARIES, TODAY } from '@/app/dev/fixtures'
import { GallerySection, Specimen } from '@/app/dev/ui/GallerySection'
import { GroupCard } from '@/modules/bill-split/components/GroupCard'
import { EmptyState, ErrorState } from '@/shared/ui/EmptyState'
import { ListGroup, ListRow } from '@/shared/ui/ListRow'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyText } from '@/shared/ui/MoneyText'
import { Notice } from '@/shared/ui/Notice'
import { Section } from '@/shared/ui/Section'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Button } from '@/shared/ui/button'

export function ListsSection() {
  return (
    <GallerySection
      id="danh-sach"
      title="Danh sách, thẻ, thông báo"
      description="ListGroup gom các ListRow trong một thẻ viền mảnh; thẻ rời cho các mục quan trọng như nhóm."
    >
      <Section title="Section với số lượng" count={3} action={<Button variant="ghost" size="xs">Xem tất cả</Button>}>
        <ListGroup>
          <ListRow
            leading={<MemberAvatar name="Hưng" colorKey="h" />}
            title="Lẩu gà lá é"
            subtitle="Hưng trả · chia đều"
            trailing={<MoneyText amount={1200000} weight="semibold" />}
            trailingSub="Phần bạn 300.000 ₫"
            onClick={() => undefined}
          />
          <ListRow leading={<MemberAvatar name="Mai" colorKey="m" />} title="Dòng có mũi tên" subtitle="Chạm để vào trang con" chevron onClick={() => undefined} />
          <ListRow leading={<MemberAvatar name="Tú" colorKey="t" />} title="Dòng đã chọn" subtitle="selected" selected />
        </ListGroup>
      </Section>
      <Specimen label="GroupCard">
        <GroupCard group={GROUP_SUMMARIES[0]!} today={TODAY} onClick={() => undefined} />
      </Specimen>
      <Specimen label="Notice: neutral, info, positive, warning, danger">
        <div className="flex flex-col gap-2">
          <Notice>Ghi chú trung tính cho người dùng.</Notice>
          <Notice tone="info">Bạn đang dùng nhóm này với tên Hưng.</Notice>
          <Notice tone="positive">Đã chia đủ.</Notice>
          <Notice tone="warning" action={<Button size="xs" variant="outline">Chia phần còn lại</Button>}>
            Còn thiếu 50.000 ₫
          </Notice>
          <Notice tone="danger">Người khác vừa sửa khoản chi này. Tải lại rồi thử lại.</Notice>
        </div>
      </Specimen>
      <Specimen label="Tabs: default (dải phân đoạn) và line (gạch chân)">
        <div className="flex flex-col gap-4">
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">Tuần này</TabsTrigger>
              <TabsTrigger value="b">Tháng này</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="a">
            <TabsList variant="line">
              <TabsTrigger value="a">Chi tiêu</TabsTrigger>
              <TabsTrigger value="b">Số dư</TabsTrigger>
              <TabsTrigger value="c">Thành viên</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Specimen>
      <div className="grid gap-4 sm:grid-cols-2">
        <Specimen label="EmptyState">
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              compact
              icon={<InboxIcon />}
              title="Chưa có khoản chi nào"
              description="Thêm khoản chi đầu tiên để bắt đầu chia tiền."
              action={<Button>Thêm khoản chi</Button>}
            />
          </div>
        </Specimen>
        <Specimen label="ErrorState">
          <div className="rounded-xl border border-border bg-card">
            <ErrorState title="Không tải được nhóm" description="Kiểm tra kết nối mạng rồi thử lại." onRetry={() => undefined} />
          </div>
        </Specimen>
      </div>
      <Specimen label="Skeleton">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      </Specimen>
    </GallerySection>
  )
}
