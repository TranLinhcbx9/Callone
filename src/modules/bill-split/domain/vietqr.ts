/**
 * Mã VietQR để chuyển khoản: chuỗi EMVCo TLV (mỗi trường là 2 số mã, 2 số độ dài, rồi giá trị)
 * kết thúc bằng CRC-16/CCITT-FALSE. Dán chuỗi này vào react-qr-code là app ngân hàng quét được.
 */
import { BS_LIMITS } from '@/modules/bill-split/api/contract'
import { toTransferMessage } from '@/modules/bill-split/domain/text'
import type { BankAccount } from '@/modules/bill-split/domain/types'

const textEncoder = new TextEncoder()

/** CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit, không xor cuối. Trả 4 ký tự hex viết hoa. */
export function crc16Ccitt(text: string): string {
  let crc = 0xffff
  for (const byte of textEncoder.encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function field(id: string, value: string): string {
  if (value.length > 99) throw new RangeError(`Trường ${id} của VietQR dài quá 99 ký tự`)
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

export interface VietQrInput {
  /** Mã BIN 6 số của ngân hàng người nhận. */
  bin: string
  accountNumber: string
  /** Số tiền đồng. Bỏ trống thì người chuyển tự nhập số tiền. */
  amount?: number | null
  /** Nội dung chuyển khoản, chỉ ký tự ASCII in được. Nên đi qua toTransferMessage trước. */
  message?: string | null
}

/** Dựng chuỗi VietQR. Ném RangeError nếu đầu vào sai định dạng, vì mã sai thì app ngân hàng không quét được. */
export function buildVietQrPayload({ bin, accountNumber, amount, message }: VietQrInput): string {
  if (!/^\d{6}$/.test(bin)) throw new RangeError(`Mã BIN phải gồm 6 chữ số: ${bin}`)
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNumber)) throw new RangeError(`Số tài khoản không hợp lệ: ${accountNumber}`)

  const hasAmount = amount !== undefined && amount !== null
  if (hasAmount && !(Number.isSafeInteger(amount) && amount >= BS_LIMITS.minAmount && amount <= BS_LIMITS.maxAmount)) {
    throw new RangeError(`Số tiền phải là số nguyên từ ${BS_LIMITS.minAmount} tới ${BS_LIMITS.maxAmount}: ${amount}`)
  }
  const hasMessage = message !== undefined && message !== null && message !== ''
  if (hasMessage && !/^[\x20-\x7e]{1,95}$/.test(message)) {
    throw new RangeError('Nội dung chuyển khoản chỉ gồm ký tự ASCII, tối đa 95 ký tự')
  }

  const receiver = field('00', bin) + field('01', accountNumber)
  const merchantAccount = field('00', 'A000000727') + field('01', receiver) + field('02', 'QRIBFTTA')
  const body =
    field('00', '01') +
    field('01', hasAmount ? '12' : '11') +
    field('38', merchantAccount) +
    field('53', '704') +
    (hasAmount ? field('54', String(amount)) : '') +
    field('58', 'VN') +
    (hasMessage ? field('62', field('08', message)) : '') +
    '6304'
  return body + crc16Ccitt(body)
}

/**
 * Mã VietQR trả tiền cho một tài khoản ngân hàng, kèm nội dung chuyển khoản thực sự được mã hóa trong đó.
 * Nội dung được làm sạch (không dấu, chỉ chữ và số, tối đa 25 ký tự) nên truyền thẳng chữ tiếng Việt vào cũng được.
 * Hiện `message` cho người dùng thay vì chữ gốc, để thứ họ đọc đúng là thứ ngân hàng sẽ nhận.
 */
export function buildTransferQr(
  bank: BankAccount,
  amount: number,
  message?: string,
): { payload: string; message: string } {
  const cleaned = toTransferMessage(message ?? '')
  const payload = buildVietQrPayload({
    bin: bank.bin,
    accountNumber: bank.accountNumber,
    amount,
    message: cleaned === '' ? undefined : cleaned,
  })
  return { payload, message: cleaned }
}

/** Chỉ chuỗi VietQR của buildTransferQr. Test e2e so mã trên màn hình với hàm này. */
export function buildTransferPayload(bank: BankAccount, amount: number, message?: string): string {
  return buildTransferQr(bank, amount, message).payload
}
