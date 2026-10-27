import { Button } from '@/shared/ui/button'
import { ListGroup, ListRow } from '@/shared/ui/ListRow'
import { Section } from '@/shared/ui/Section'

export interface UnavailableGroup {
  token: string
  name: string
}

export interface UnavailableGroupsProps {
  /** Nhóm đã lưu trên máy nhưng server không còn trả về: đã bị xóa hoặc link đã được đổi ở nơi khác. */
  groups: readonly UnavailableGroup[]
  onForget: (token: string) => void
}

/**
 * Các nhóm đã lưu trên máy mà không mở được nữa. Không làm hỏng trang: chỉ nằm ở một khối riêng,
 * kèm nút xóa khỏi máy này (không đụng tới dữ liệu trên server).
 */
export function UnavailableGroups({ groups, onForget }: UnavailableGroupsProps) {
  if (groups.length === 0) return null
  return (
    <Section
      title="Không còn mở được"
      count={groups.length}
      description="Nhóm đã bị xóa hoặc link đã được đổi. Bạn có thể xóa khỏi máy này."
    >
      <ListGroup>
        {groups.map((group) => (
          <ListRow
            key={group.token}
            leading={
              <span
                aria-hidden="true"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-title font-semibold text-muted-foreground select-none"
              >
                {(Array.from(group.name.normalize('NFC').trim())[0] ?? '?').toLocaleUpperCase('vi-VN')}
              </span>
            }
            title={group.name}
            subtitle="Không mở được nữa"
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Xóa ${group.name} khỏi máy này`}
                onClick={() => onForget(group.token)}
              >
                Xóa khỏi máy
              </Button>
            }
          />
        ))}
      </ListGroup>
    </Section>
  )
}
