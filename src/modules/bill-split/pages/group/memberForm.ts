/**
 * Logic thuần của form thành viên: giá trị ban đầu, kiểm tra trước khi gửi, và đổi lỗi server sang lỗi theo ô.
 *
 * Câu chữ lỗi lấy từ `describeInvalid` (api/errors.ts), nên lỗi kiểm ngay trên máy và lỗi server trả về
 * luôn là cùng một câu, và luật kiểm tra ở đây bám theo hợp đồng API (bs_save_member).
 */
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import {
  describeInvalid,
  getBillSplitErrorMessage,
  getInvalidDetail,
  isBillSplitError,
} from '@/modules/bill-split/api/errors'
import type { MemberFormValues } from '@/modules/bill-split/components/MemberForm'
import { normalizeAccountName, normalizeAccountNumber } from '@/modules/bill-split/domain/text'
import type { BankAccount, Member } from '@/modules/bill-split/domain/types'

export type MemberFormField = 'name' | 'bank' | 'accountNumber' | 'accountName'

export type MemberFormErrors = Partial<Record<MemberFormField, string>>

export type MemberValidation =
  | { ok: true; name: string; bank: BankAccount | null }
  | { ok: false; errors: MemberFormErrors }

/** Số tài khoản như server kiểm: chữ và số, 1 tới 19 ký tự, sau khi đã bỏ hết khoảng trắng. */
const ACCOUNT_NUMBER = new RegExp(`^[0-9A-Za-z]{1,${BS_LIMITS.bankAccount}}$`)

/** Mã BIN do danh sách ngân hàng cấp nên luôn đủ 6 số; kiểm lại để không gửi rác lên server. */
const BANK_BIN = /^\d{6}$/

/** Ô của form theo thứ tự từ trên xuống, để đưa focus vào ô lỗi đầu tiên. */
export const MEMBER_FIELD_ORDER: readonly MemberFormField[] = ['name', 'bank', 'accountNumber', 'accountName']

/** Id của phần tử nhập trong MemberForm (chỗ bám cố định cho test E2E, xem ui-spec mục 11). */
export const MEMBER_FIELD_IDS: Readonly<Record<MemberFormField, string>> = {
  name: 'member-name',
  bank: 'member-bank',
  accountNumber: 'member-account',
  accountName: 'member-holder',
}

/** Id của nút "Xóa thành viên" trong MemberForm, để trả con trỏ về đó sau khi đóng hộp xác nhận. */
export const MEMBER_DELETE_BUTTON_ID = 'member-delete'

/**
 * Ký tự trắng theo hợp đồng API 1.1: ký tự trắng của JavaScript (\s, gồm NBSP và các khoảng trắng Unicode), thêm NEL
 * (U+0085) và ký tự rộng bằng không (U+200B tới U+200D, U+2060, U+FEFF). Khớp với cách server cắt và kiểm required,
 * nên một tên chỉ gồm những ký tự này bị báo trống ngay trên máy.
 */
const BLANK = '[\\s\\u0085\\u200B-\\u200D\\u2060\\uFEFF]'
const BLANK_RUN = new RegExp(`${BLANK}+`, 'g')
const BLANK_EDGES = new RegExp(`^${BLANK}+|${BLANK}+$`, 'g')

/** Tên sau khi chuẩn hóa Unicode về dạng dựng sẵn, cắt ký tự trắng hai đầu và gộp ký tự trắng liên tiếp ở giữa. */
export function cleanMemberName(text: string): string {
  return text.normalize('NFC').replace(BLANK_EDGES, '').replace(BLANK_RUN, ' ')
}

/** Server so tên không phân biệt hoa thường; bản này chỉ để báo trùng sớm, server vẫn là người quyết định. */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Số ký tự theo cách Postgres đếm (một emoji là một ký tự), không phải số đơn vị UTF-16 của JavaScript. */
function charCount(text: string): number {
  return [...text].length
}

/**
 * Giá trị ban đầu của form. Người đã có tài khoản thì điền đủ. Người chưa có (thêm mới, hoặc sửa người chưa nhập
 * tài khoản) thì chỉ điền sẵn ngân hàng nhập lần gần nhất, vì bạn bè hay dùng chung ngân hàng; số tài khoản và
 * tên chủ tài khoản để trống, không bao giờ chép từ người khác sang để tránh trả nhầm tiền.
 */
export function initialMemberValues(member: Member | null, lastBank: BankAccount | null): MemberFormValues {
  if (member?.bank) {
    return {
      name: member.name,
      bankBin: member.bank.bin,
      accountNumber: member.bank.accountNumber,
      accountName: member.bank.accountName ?? '',
    }
  }
  return { name: member?.name ?? '', bankBin: lastBank?.bin ?? null, accountNumber: '', accountName: '' }
}

export interface ValidateMemberOptions {
  /** Các thành viên khác trong nhóm (không gồm người đang sửa), để báo trùng tên. */
  others: readonly Pick<Member, 'name'>[]
  /**
   * Người dùng đã tự chọn ngân hàng trong form. Ngân hàng chỉ được điền sẵn mà chưa đụng tới, kèm số tài khoản
   * và tên chủ tài khoản đều trống, thì coi như người này không có tài khoản (không báo thiếu số tài khoản).
   * Đây cũng là cách xóa tài khoản của một người: xóa trống số tài khoản và tên chủ tài khoản.
   */
  bankTouched: boolean
}

/**
 * Kiểm tra form theo luật của bs_save_member: tên bắt buộc, tối đa 40 ký tự, không trùng người khác;
 * ngân hàng và số tài khoản đi cùng nhau; số tài khoản chỉ gồm chữ và số, tối đa 19 ký tự;
 * tên chủ tài khoản được chuẩn hóa thành chữ hoa không dấu và tối đa 50 ký tự.
 */
export function validateMemberValues(values: MemberFormValues, options: ValidateMemberOptions): MemberValidation {
  const errors: MemberFormErrors = {}

  const name = cleanMemberName(values.name)
  if (name === '') errors.name = describeInvalid({ field: 'name', reason: 'required' })
  else if (charCount(name) > BS_LIMITS.memberName) errors.name = `Tên tối đa ${BS_LIMITS.memberName} ký tự.`
  else if (options.others.some((other) => sameName(other.name, name))) {
    errors.name = describeInvalid({ field: 'name', reason: 'duplicate' })
  }

  const accountNumber = normalizeAccountNumber(values.accountNumber)
  const accountName = normalizeAccountName(values.accountName)
  const wantsBank = options.bankTouched || accountNumber !== '' || accountName !== ''

  let bank: BankAccount | null = null
  if (wantsBank) {
    if (values.bankBin === null) errors.bank = describeInvalid({ field: 'bank_bin', reason: 'required' })
    else if (!BANK_BIN.test(values.bankBin)) errors.bank = describeInvalid({ field: 'bank_bin', reason: 'format' })

    if (accountNumber === '') errors.accountNumber = describeInvalid({ field: 'bank_account', reason: 'required' })
    else if (!ACCOUNT_NUMBER.test(accountNumber)) {
      errors.accountNumber = describeInvalid({ field: 'bank_account', reason: 'format' })
    }

    if (charCount(accountName) > BS_LIMITS.bankAccountName) {
      errors.accountName = describeInvalid({ field: 'bank_account_name', reason: 'too_long' })
    }

    if (!errors.bank && !errors.accountNumber && !errors.accountName && values.bankBin !== null) {
      bank = { bin: values.bankBin, accountNumber, accountName: accountName === '' ? null : accountName }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, name, bank }
}

/** Tên tham số của server (bỏ p_) sang ô của form. */
const FORM_FIELD_BY_SERVER_FIELD: Readonly<Record<string, MemberFormField>> = {
  name: 'name',
  bank_bin: 'bank',
  bank_account: 'accountNumber',
  bank_account_name: 'accountName',
}

export type MemberSaveFailure = { errors: MemberFormErrors } | { message: string }

/**
 * Lỗi lưu thành viên: BS_INVALID chỉ vào một ô của form thì hiện dưới ô đó, mọi lỗi khác
 * (mạng, đủ 50 người, link đã đổi...) trả về một câu để hiện bằng toast.
 */
export function describeMemberSaveError(error: unknown): MemberSaveFailure {
  const detail = getInvalidDetail(error)
  const field = detail ? FORM_FIELD_BY_SERVER_FIELD[detail.field] : undefined
  if (detail && field) return { errors: { [field]: describeInvalid(detail) } }
  return { message: getBillSplitErrorMessage(error) }
}

/** Câu báo lỗi khi xóa thành viên. BS_MEMBER_IN_USE nói rõ vì sao không xóa được và cần làm gì tiếp. */
export function describeMemberDeleteError(error: unknown, memberName: string): string {
  if (isBillSplitError(error, 'BS_MEMBER_IN_USE')) {
    return `Không xóa được ${memberName} vì người này đã có khoản chi hoặc lần trả nợ. Muốn xóa, hãy xóa hoặc sửa các khoản đó trước.`
  }
  return getBillSplitErrorMessage(error)
}
