/**
 * Gọi 12 hàm RPC bs_* của Supabase, mỗi hàm một function có kiểu.
 *
 * - Luôn gọi bằng POST (mặc định của supabase.rpc), không dùng { get: true } để token không nằm trong URL.
 * - Lỗi luôn ném AppError qua toAppError (BS_* cho lỗi nghiệp vụ, NETWORK cho rớt mạng).
 * - Tham số tùy chọn rỗng thì không gửi, để SQL dùng giá trị mặc định null.
 * - Mọi hàm ghi trả về Group mới nhất, hook dùng luôn để cập nhật cache, không cần gọi lại.
 * - Hợp đồng v1.1: bs_create_group nhận p_token và bs_rotate_token nhận p_new_token do client chọn, gửi lại cùng
 *   token thì server trả đúng kết quả cũ. Hai hàm này vì thế gửi lại được an toàn khi rớt mạng, miễn là người gọi
 *   giữ token và gửi lại y nguyên (xem hooks/mutationOptions.ts và hooks/rotation.ts).
 * Tham số được gán vào biến có kiểu Database['public']['Functions'][...]['Args'], nên khi agent supabase
 * sinh lại database.types.ts mà chữ ký hàm lệch, tsc báo lỗi ngay ở đây.
 */
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import {
  parseCreateGroupResult,
  parseGroupSummaries,
  parseRotateTokenResult,
  parseSnapshot,
  toGroup,
} from '@/modules/bill-split/api/mappers'
import { compareTimestamps } from '@/modules/bill-split/api/timestamp'
import { newGroupToken } from '@/modules/bill-split/api/token'
import { normalizeBankAccount } from '@/modules/bill-split/domain/bankAccount'
import type { CreateGroupInput, ExpenseInput, MemberInput, SettlementInput } from '@/modules/bill-split/domain/inputs'
import type { Group, GroupSummary } from '@/modules/bill-split/domain/types'
import { toAppError } from '@/shared/lib/errors'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.types'

type Functions = Database['public']['Functions']

interface RpcResponse {
  data: unknown
  error: unknown
  status: number
}

interface LooseRpcClient {
  rpc(fn: string, args: object): PromiseLike<RpcResponse>
}

/** Gọi một hàm RPC và trả về dữ liệu thô, hoặc ném AppError. */
async function call<Name extends keyof Functions>(name: Name, args: Functions[Name]['Args']): Promise<unknown> {
  let response: RpcResponse
  try {
    response = await (supabase as unknown as LooseRpcClient).rpc(name, args as object)
  } catch (error) {
    throw toAppError(error)
  }
  if (response.error) throw toAppError(response.error, response.status)
  return response.data
}

async function callForGroup<Name extends keyof Functions>(name: Name, args: Functions[Name]['Args']): Promise<Group> {
  return toGroup(parseSnapshot(await call(name, args)))
}

/** Chuỗi sau khi cắt khoảng trắng hai đầu, hoặc undefined nếu rỗng, để không gửi tham số rỗng. */
function optionalText(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Tạo nhóm với token do client chọn: input.token, hoặc token mới sinh ở đây nếu bỏ trống (luôn gửi p_token).
 * Gửi lại đúng token đó thì server trả nhóm đã tạo thay vì tạo thêm (và không tính vào giới hạn tốc độ), nên thử lại
 * sau khi rớt mạng là an toàn. Mỗi lần gọi không có input.token là một token mới, nên người muốn thử lại phải giữ
 * token và truyền vào. Token đã thuộc một nhóm đã xóa thì BS_INVALID token/id_taken: phải chọn token khác.
 */
export async function createGroup(input: CreateGroupInput): Promise<{ token: string; group: Group }> {
  const args: Functions['bs_create_group']['Args'] = {
    p_name: input.name.trim(),
    p_member_names: input.memberNames.map((name) => name.trim()),
    p_token: input.token ? input.token : newGroupToken(),
  }
  return parseCreateGroupResult(await call('bs_create_group', args))
}

export async function getGroup(token: string): Promise<Group> {
  return callForGroup('bs_get_group', { p_token: token })
}

/** Mới cập nhật trước. Mốc không đọc được thì giữ nguyên thứ tự (sort ổn định). */
function byUpdatedAtDesc(a: GroupSummary, b: GroupSummary): number {
  return compareTimestamps(b.updatedAt, a.updatedAt) ?? 0
}

/**
 * Tóm tắt các nhóm đã lưu trên máy. Token sai hoặc nhóm đã xóa bị server bỏ qua. Server nhận tối đa 50 token mỗi lần,
 * nên danh sách dài hơn được chia thành các lô 50 gọi song song rồi gộp lại, nhóm cập nhật mới nhất trước.
 * Người gọi truyền bao nhiêu token cũng được. Một lô lỗi thì cả lượt lỗi, để không ai tưởng nhầm các nhóm
 * của lô đó đã bị xóa.
 */
export async function getGroupSummaries(tokens: readonly string[]): Promise<GroupSummary[]> {
  const unique = [...new Set(tokens)]
  const batches: string[][] = []
  for (let start = 0; start < unique.length; start += BS_LIMITS.tokensPerLookup) {
    batches.push(unique.slice(start, start + BS_LIMITS.tokensPerLookup))
  }
  const results = await Promise.all(
    batches.map(async (batch) => {
      const args: Functions['bs_get_groups']['Args'] = { p_tokens: batch }
      return parseGroupSummaries(await call('bs_get_groups', args))
    }),
  )
  const [first] = results
  if (results.length === 1 && first) return first
  return results.flat().sort(byUpdatedAtDesc)
}

export async function updateGroup(token: string, name: string): Promise<Group> {
  return callForGroup('bs_update_group', { p_token: token, p_name: name.trim() })
}

/**
 * Đổi link: trả token mới, token cũ hết hiệu lực ngay. Nên truyền newToken do client chọn và ghi nhớ trước khi gọi
 * (hợp đồng v1.1): gửi lại đúng cặp (token, newToken) là an toàn, vì nếu lần trước đã đổi xong mà mất phản hồi thì
 * server nhận ra token mới đã có và trả luôn nó (BS_GROUP_NOT_FOUND chỉ khi cả hai cùng không còn). Không truyền
 * newToken thì server tự sinh, và mất phản hồi là mất link mới.
 */
export async function rotateToken(token: string, newToken?: string): Promise<string> {
  const args: Functions['bs_rotate_token']['Args'] = { p_token: token, ...(newToken ? { p_new_token: newToken } : {}) }
  return parseRotateTokenResult(await call('bs_rotate_token', args))
}

export async function deleteGroup(token: string): Promise<void> {
  await call('bs_delete_group', { p_token: token })
}

/** Tạo thành viên mới (id chưa có) hoặc ghi đè (id đã có). bank null nghĩa là xóa thông tin ngân hàng. */
export async function saveMember(token: string, member: MemberInput): Promise<Group> {
  // Cùng hàm chuẩn hóa mà storage dùng để nhớ ngân hàng gần nhất, nên thứ gửi lên và thứ nhớ lại luôn giống nhau.
  const bank = member.bank ? normalizeBankAccount(member.bank) : null
  const args: Functions['bs_save_member']['Args'] = {
    p_token: token,
    p_member_id: member.id,
    p_name: member.name.trim(),
    ...(bank ? { p_bank_bin: bank.bin, p_bank_account: bank.accountNumber } : {}),
    ...(bank?.accountName ? { p_bank_account_name: bank.accountName } : {}),
  }
  return callForGroup('bs_save_member', args)
}

export async function deleteMember(token: string, memberId: string): Promise<Group> {
  return callForGroup('bs_delete_member', { p_token: token, p_member_id: memberId })
}

/**
 * Tạo mới khi expectedVersion là null (id đã có trong nhóm thì server coi là gửi lại, không ghi gì),
 * sửa khi có expectedVersion (lệch version thì BS_CONFLICT).
 */
export async function saveExpense(token: string, expense: ExpenseInput): Promise<Group> {
  const note = optionalText(expense.note)
  const args: Functions['bs_save_expense']['Args'] = {
    p_token: token,
    p_expense_id: expense.id,
    p_title: expense.title.trim(),
    p_amount: expense.amount,
    p_paid_by: expense.paidBy,
    p_spent_on: expense.spentOn,
    p_split_mode: expense.splitMode,
    p_shares: expense.shares.map((share) => ({ member_id: share.memberId, amount: share.amount })),
    ...(expense.expectedVersion !== null ? { p_expected_version: expense.expectedVersion } : {}),
    ...(note ? { p_note: note } : {}),
  }
  return callForGroup('bs_save_expense', args)
}

export async function deleteExpense(token: string, expenseId: string): Promise<Group> {
  return callForGroup('bs_delete_expense', { p_token: token, p_expense_id: expenseId })
}

export async function saveSettlement(token: string, settlement: SettlementInput): Promise<Group> {
  const note = optionalText(settlement.note)
  const args: Functions['bs_save_settlement']['Args'] = {
    p_token: token,
    p_settlement_id: settlement.id,
    p_from_member: settlement.fromMemberId,
    p_to_member: settlement.toMemberId,
    p_amount: settlement.amount,
    p_settled_on: settlement.settledOn,
    ...(note ? { p_note: note } : {}),
  }
  return callForGroup('bs_save_settlement', args)
}

export async function deleteSettlement(token: string, settlementId: string): Promise<Group> {
  return callForGroup('bs_delete_settlement', { p_token: token, p_settlement_id: settlementId })
}
