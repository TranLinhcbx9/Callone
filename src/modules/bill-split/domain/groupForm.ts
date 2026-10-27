/**
 * Kiểm tra form tạo nhóm và đổi tên nhóm ở client, cùng luật với bs_create_group và bs_update_group
 * (docs/contracts/bill-split-api.md mục 7) để người dùng thấy lỗi ngay mà không tốn một lượt gọi mạng.
 * Server vẫn là nơi kiểm cuối cùng: lỗi BS_INVALID của nó được đưa về đúng ô nhờ getInvalidDetail.
 */
import { BS_LIMITS } from '@/modules/bill-split/api/contract'

export interface CreateGroupErrors {
  name?: string
  members?: string
}

/** Chữ sau khi chuẩn hóa NFC, gộp khoảng trắng liên tiếp và cắt hai đầu. NFC để "Hưng" gõ từ máy nào cũng cùng một dạng. */
export function normalizeName(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Khóa so sánh tên không phân biệt hoa thường, giống ràng buộc unique (group_id, lower(name)) ở database. */
function nameKey(text: string): string {
  return normalizeName(text).toLocaleLowerCase('vi-VN')
}

/** Độ dài theo ký tự (code point), giống char_length của Postgres, khác .length ở các ký tự ngoài BMP như emoji. */
function charLength(text: string): number {
  return Array.from(text).length
}

/** Lỗi của tên nhóm, hoặc null nếu hợp lệ. */
export function validateGroupName(name: string): string | null {
  const trimmed = normalizeName(name)
  if (trimmed === '') return 'Nhập tên nhóm.'
  if (charLength(trimmed) > BS_LIMITS.groupName) return `Tên nhóm tối đa ${BS_LIMITS.groupName} ký tự.`
  return null
}

/** Lỗi của danh sách tên thành viên: rỗng, quá nhiều, tên rỗng hoặc quá dài, hai tên trùng nhau. */
export function validateMemberNames(names: readonly string[]): string | null {
  if (names.length === 0) return 'Thêm ít nhất một thành viên.'
  if (names.length > BS_LIMITS.membersPerGroup) return `Nhóm tối đa ${BS_LIMITS.membersPerGroup} người.`
  const seen = new Set<string>()
  for (const raw of names) {
    const name = normalizeName(raw)
    if (name === '') return 'Tên thành viên không được để trống.'
    if (charLength(name) > BS_LIMITS.memberName) return `Tên thành viên tối đa ${BS_LIMITS.memberName} ký tự.`
    const key = nameKey(name)
    if (seen.has(key)) return `Có hai thành viên cùng tên "${name}".`
    seen.add(key)
  }
  return null
}

/** Mọi lỗi của form tạo nhóm, hoặc null nếu gửi được. */
export function validateCreateGroup(input: { name: string; memberNames: readonly string[] }): CreateGroupErrors | null {
  const name = validateGroupName(input.name)
  const members = validateMemberNames(input.memberNames)
  if (!name && !members) return null
  return { ...(name ? { name } : {}), ...(members ? { members } : {}) }
}

/**
 * Thêm các tên đang gõ dở trong ô thành viên (tách bằng dấu phẩy) vào danh sách, cùng cách làm của ChipInput:
 * bỏ tên rỗng và tên trùng (không phân biệt hoa thường), dừng khi đủ số người, cắt tên quá dài.
 * Trả về đúng mảng `existing` (cùng tham chiếu) nếu không thêm được tên nào.
 */
export function mergeMemberNames(
  existing: string[],
  pendingText: string,
  maxItems: number = BS_LIMITS.membersPerGroup,
  maxLength: number = BS_LIMITS.memberName,
): string[] {
  const next = [...existing]
  for (const part of pendingText.split(',')) {
    const name = normalizeName(part)
    if (name === '' || next.length >= maxItems) continue
    if (next.some((item) => nameKey(item) === nameKey(name))) continue
    next.push(Array.from(name).slice(0, maxLength).join(''))
  }
  return next.length === existing.length ? existing : next
}
