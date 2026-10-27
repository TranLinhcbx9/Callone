import { AppLink } from '@/shared/ui/AppLink'
import { Button } from '@/shared/ui/button'
import { ListGroup } from '@/shared/ui/ListRow'
import { Section } from '@/shared/ui/Section'

export interface UnavailableGroup {
  token: string
  name: string
  /**
   * dead: server không còn trả về (đã bị xóa, hoặc người khác đã đổi link) và không có lần đổi link nào đang chờ.
   * unreachable: có lần đổi link đang chờ mà chưa hỏi được server vì mất mạng, nhóm có thể vẫn còn dưới link mới.
   */
  state: 'dead' | 'unreachable'
}

export interface UnavailableGroupsProps {
  groups: readonly UnavailableGroup[]
  /** Đường dẫn mở nhóm. Trang nhóm tự khôi phục sau khi đổi link, và báo rõ lý do nếu nhóm thật sự không còn. */
  getHref: (group: UnavailableGroup) => string
  /** Xóa nhóm khỏi máy này. Chỉ có nút này ở nhóm "dead": nhóm đang chờ đổi link thì xóa là mất luôn link mới. */
  onForget: (token: string) => void
  /** Hỏi lại các nhóm chưa kiểm tra được. */
  onRetry?: () => void
}

function UnavailableRow({ group, href, onForget }: { group: UnavailableGroup; href: string; onForget: (token: string) => void }) {
  const initial = (Array.from(group.name.normalize('NFC').trim())[0] ?? '?').toLocaleUpperCase('vi-VN')
  return (
    <div role="listitem" className="flex min-h-14 items-center gap-1 pr-2">
      <AppLink
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-title font-semibold text-muted-foreground select-none"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body leading-snug font-medium">{group.name}</span>
          <span className="mt-0.5 block truncate text-small text-muted-foreground">
            {group.state === 'dead' ? 'Không mở được nữa' : 'Chưa kiểm tra được link mới'}
          </span>
        </span>
      </AppLink>
      {group.state === 'dead' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Xóa ${group.name} khỏi máy này`}
          onClick={() => onForget(group.token)}
        >
          Xóa khỏi máy
        </Button>
      )}
    </div>
  )
}

/**
 * Các nhóm đã lưu trên máy mà không mở được nữa, không làm hỏng trang: nằm ở khối riêng, mỗi dòng mở được sang trang nhóm.
 * - "Không còn mở được": kèm nút xóa khỏi máy này (không đụng tới dữ liệu trên server).
 * - "Chưa kiểm tra được": nhóm có lần đổi link đang chờ mà chưa hỏi được server vì mất mạng. Không có nút xóa, vì xóa khỏi
 *   máy cũng xóa luôn token mới đang chờ, và nhóm có thể vẫn còn dưới link mới. Có nút "Thử lại".
 */
export function UnavailableGroups({ groups, getHref, onForget, onRetry }: UnavailableGroupsProps) {
  const dead = groups.filter((group) => group.state === 'dead')
  const unreachable = groups.filter((group) => group.state === 'unreachable')
  return (
    <>
      {dead.length > 0 && (
        <Section
          title="Không còn mở được"
          count={dead.length}
          description="Nhóm đã bị xóa hoặc link đã được đổi. Bạn có thể xóa khỏi máy này."
        >
          <ListGroup>
            {dead.map((group) => (
              <UnavailableRow key={group.token} group={group} href={getHref(group)} onForget={onForget} />
            ))}
          </ListGroup>
        </Section>
      )}
      {unreachable.length > 0 && (
        <Section
          title="Chưa kiểm tra được"
          count={unreachable.length}
          description="Link nhóm có thể vừa được đổi, mà app chưa kiểm tra được vì mất kết nối."
          action={
            onRetry && (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Thử lại
              </Button>
            )
          }
        >
          <ListGroup>
            {unreachable.map((group) => (
              <UnavailableRow key={group.token} group={group} href={getHref(group)} onForget={onForget} />
            ))}
          </ListGroup>
        </Section>
      )}
    </>
  )
}
