/**
 * Dữ liệu lưu trên máy của module Chia tiền (localStorage, tiền tố callone:bill-split:):
 * - Nhóm đã mở gần đây: [{ token, name, lastOpenedAt }], mới nhất trước, tối đa MAX_RECENT_GROUPS (200).
 *   Trên iOS PWA danh sách này là cách duy nhất để quay lại một nhóm, nên không bao giờ tự xóa nhóm cũ để lấy chỗ:
 *   đầy thì rememberGroup từ chối nhóm mới và báo 'full', người dùng tự quên bớt nhóm.
 * - "Mình là ai" trong từng nhóm: token thành memberId.
 * - Thông tin ngân hàng nhập lần gần nhất, ở dạng đã chuẩn hóa đúng như rpc.ts gửi lên server, để điền sẵn khi thêm người mới.
 * - Lần đổi link đang chờ server xác nhận: token cũ thành { newToken, startedAt }. Token mới được ghi xuống đây
 *   TRƯỚC khi gọi server, để mất phản hồi giữa chừng không làm mất link mới (xem beginRotation).
 *
 * Dữ liệu đọc ra từ localStorage được kiểm tra hình dạng, phần hỏng bị bỏ. Trạng thái giữ cả trong bộ nhớ,
 * nên khi trình duyệt chặn ghi (Safari riêng tư, hết dung lượng) app vẫn chạy trong phiên đó.
 * Store có subscribe và getter trả cùng một tham chiếu khi không đổi, dùng được với useSyncExternalStore.
 */
import { BS_LIMITS, TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import { normalizeBankAccount } from '@/modules/bill-split/domain/bankAccount'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { createModuleStorage, type ModuleStorage } from '@/shared/lib/storage'

export const MAX_RECENT_GROUPS = 200

export interface RecentGroup {
  token: string
  name: string
  /** Thời điểm mở gần nhất, mili giây kể từ epoch. */
  lastOpenedAt: number
}

/** Một lần đổi link đã bắt đầu nhưng server chưa xác nhận. */
export interface PendingRotation {
  /** Token mới đã chọn sẵn. Mọi lần gửi lại đều dùng đúng token này. */
  newToken: string
  /** Thời điểm bắt đầu, mili giây kể từ epoch. */
  startedAt: number
}

/**
 * Kết quả của rememberGroup: 'saved' đã lưu hoặc cập nhật, 'full' danh sách đã đủ MAX_RECENT_GROUPS nhóm khác
 * (không xóa nhóm nào để lấy chỗ), 'invalid' token sai định dạng.
 */
export type RememberResult = 'saved' | 'full' | 'invalid'

const KEYS = { recents: 'recent-groups', me: 'me', lastBank: 'last-bank', pending: 'pending-rotations' } as const
const STORAGE_PREFIX = 'callone:bill-split:'
const MAX_MEMBER_ID_LENGTH = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Danh sách nhóm gần đây từ dữ liệu thô: bỏ mục sai hình dạng và trùng token, mới nhất trước.
 * Không cắt bớt: dữ liệu hợp lệ nào cũng được giữ, để đọc lại không bao giờ làm rớt nhóm.
 */
export function readRecentGroups(raw: unknown): RecentGroup[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const groups: RecentGroup[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const { token, name, lastOpenedAt } = item
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) || seen.has(token)) continue
    if (typeof name !== 'string' || typeof lastOpenedAt !== 'number' || !Number.isFinite(lastOpenedAt)) continue
    seen.add(token)
    groups.push({ token, name: name.slice(0, BS_LIMITS.groupName), lastOpenedAt })
  }
  return groups.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

/** Bảng token thành memberId từ dữ liệu thô, bỏ mục sai hình dạng. */
export function readMeMap(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isRecord(raw)) return result
  for (const [token, memberId] of Object.entries(raw)) {
    if (!TOKEN_PATTERN.test(token)) continue
    if (typeof memberId !== 'string' || memberId === '' || memberId.length > MAX_MEMBER_ID_LENGTH) continue
    result[token] = memberId
  }
  return result
}

/** Thông tin ngân hàng từ dữ liệu thô, null nếu thiếu hoặc sai hình dạng. */
export function readBank(raw: unknown): BankAccount | null {
  if (!isRecord(raw)) return null
  const { bin, accountNumber, accountName } = raw
  if (typeof bin !== 'string' || !/^\d{6}$/.test(bin)) return null
  if (typeof accountNumber !== 'string' || !/^[0-9A-Za-z]{1,19}$/.test(accountNumber)) return null
  if (accountName !== null && accountName !== undefined && typeof accountName !== 'string') return null
  return { bin, accountNumber, accountName: accountName ? accountName.slice(0, BS_LIMITS.bankAccountName) : null }
}

/** Bảng token cũ thành lần đổi link đang chờ từ dữ liệu thô, bỏ mục sai hình dạng hoặc có token mới trùng token cũ. */
export function readPendingRotations(raw: unknown): Record<string, PendingRotation> {
  const result: Record<string, PendingRotation> = {}
  if (!isRecord(raw)) return result
  for (const [oldToken, entry] of Object.entries(raw)) {
    if (!TOKEN_PATTERN.test(oldToken) || !isRecord(entry)) continue
    const { newToken, startedAt } = entry
    if (typeof newToken !== 'string' || !TOKEN_PATTERN.test(newToken) || newToken === oldToken) continue
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) continue
    result[oldToken] = { newToken, startedAt }
  }
  return result
}

export interface BillSplitStoreOptions {
  storage?: ModuleStorage
  /** Đồng hồ, để test cố định thời gian. */
  now?: () => number
  /** Nơi nghe sự kiện 'storage' từ tab khác. Mặc định là window nếu có. */
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
}

export interface BillSplitStore {
  getRecentGroups(): readonly RecentGroup[]
  /** Danh sách đã đủ MAX_RECENT_GROUPS nhóm, nên nhóm mới chưa lưu được. Kiểm trước khi tạo nhóm để báo người dùng. */
  isRecentGroupsFull(): boolean
  /**
   * Ghi nhớ nhóm vừa mở, đưa lên đầu danh sách. Nhóm đã có thì chỉ cập nhật tên và giờ. Không bao giờ xóa nhóm khác
   * để lấy chỗ: đủ MAX_RECENT_GROUPS nhóm thì nhóm mới bị từ chối ('full'), token sai định dạng là 'invalid'.
   */
  rememberGroup(token: string, name: string): RememberResult
  /** Quên nhóm: bỏ khỏi danh sách gần đây, quên "mình là ai" và lần đổi link đang chờ của nhóm đó. */
  forgetGroup(token: string): void
  /**
   * Sau khi đổi link xong: chuyển danh sách gần đây và "mình là ai" từ token cũ sang token mới, và xóa lần đổi link
   * đang chờ của token cũ, tất cả trong một lần ghi.
   */
  replaceToken(oldToken: string, newToken: string): void
  getMe(token: string): string | null
  setMe(token: string, memberId: string | null): void
  getLastBank(): BankAccount | null
  /** Nhớ ngân hàng vừa nhập, ở dạng đã chuẩn hóa như lúc gửi lên server. Dữ liệu sai thì xóa ngân hàng đã nhớ. */
  setLastBank(bank: BankAccount | null): void
  /** Lần đổi link đang chờ server xác nhận cho token này, hoặc null. Cùng một tham chiếu cho tới khi đổi. */
  getPendingRotation(oldToken: string): PendingRotation | null
  /**
   * Ghi xuống máy, ĐỒNG BỘ, ý định đổi link của token cũ TRƯỚC khi gọi server, rồi trả về lần đang chờ.
   * Đã có lần đang chờ (trong bộ nhớ, hoặc tab khác vừa ghi) thì trả luôn lần đó và bỏ qua candidateNewToken:
   * không bao giờ có hai token mới cùng chờ cho một token cũ, mọi lần gửi lại dùng cùng một token.
   * Ném RangeError nếu một trong hai token sai định dạng hoặc trùng nhau (lỗi lập trình).
   */
  beginRotation(oldToken: string, candidateNewToken: string): PendingRotation
  /** Bỏ lần đổi link đang chờ, khi server đã trả lời dứt khoát là nó không thể thành công. Không có thì không làm gì. */
  clearPendingRotation(oldToken: string): void
  subscribe(listener: () => void): () => void
}

interface State {
  recents: readonly RecentGroup[]
  me: Readonly<Record<string, string>>
  lastBank: BankAccount | null
  pending: Readonly<Record<string, PendingRotation>>
}

type StateKey = keyof typeof KEYS

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))
}

/** Giá trị của đúng khóa đó, không đi lên prototype: token như "constructor" trên URL không được trả về hàm của Object. */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

export function createBillSplitStore(options: BillSplitStoreOptions = {}): BillSplitStore {
  const storage = options.storage ?? createModuleStorage('bill-split')
  const now = options.now ?? Date.now
  const eventTarget =
    options.eventTarget === undefined ? (typeof window === 'undefined' ? null : window) : options.eventTarget

  let state: State | null = null
  const listeners = new Set<() => void>()

  const current = (): State => {
    state ??= {
      recents: readRecentGroups(storage.get<unknown>(KEYS.recents, null)),
      me: readMeMap(storage.get<unknown>(KEYS.me, null)),
      lastBank: readBank(storage.get<unknown>(KEYS.lastBank, null)),
      pending: readPendingRotations(storage.get<unknown>(KEYS.pending, null)),
    }
    return state
  }

  /** Cập nhật bộ nhớ, ghi các phần đã đổi xuống storage, rồi báo cho người đang nghe. */
  const commit = (next: State, changed: readonly StateKey[]) => {
    state = next
    if (changed.includes('recents')) storage.set(KEYS.recents, next.recents)
    if (changed.includes('me')) storage.set(KEYS.me, next.me)
    if (changed.includes('lastBank')) {
      if (next.lastBank) storage.set(KEYS.lastBank, next.lastBank)
      else storage.remove(KEYS.lastBank)
    }
    if (changed.includes('pending')) {
      if (Object.keys(next.pending).length > 0) storage.set(KEYS.pending, next.pending)
      else storage.remove(KEYS.pending)
    }
    listeners.forEach((listener) => listener())
  }

  /** Tab khác ghi vào localStorage thì bỏ bộ nhớ đệm, lần đọc sau sẽ nạp lại. */
  const onStorageEvent = (event: Event) => {
    const key = (event as StorageEvent).key
    if (typeof key === 'string' && !key.startsWith(STORAGE_PREFIX)) return
    state = null
    listeners.forEach((listener) => listener())
  }

  return {
    getRecentGroups: () => current().recents,

    isRecentGroupsFull: () => current().recents.length >= MAX_RECENT_GROUPS,

    rememberGroup(token, name) {
      if (!TOKEN_PATTERN.test(token)) return 'invalid'
      const snapshot = current()
      const known = snapshot.recents.some((group) => group.token === token)
      if (!known && snapshot.recents.length >= MAX_RECENT_GROUPS) return 'full'
      const entry: RecentGroup = { token, name: name.trim().slice(0, BS_LIMITS.groupName), lastOpenedAt: now() }
      const recents = [entry, ...snapshot.recents.filter((group) => group.token !== token)]
      commit({ ...snapshot, recents }, ['recents'])
      return 'saved'
    },

    forgetGroup(token) {
      const snapshot = current()
      const hadPending = Object.hasOwn(snapshot.pending, token)
      commit(
        {
          ...snapshot,
          recents: snapshot.recents.filter((group) => group.token !== token),
          me: without(snapshot.me, token),
          pending: hadPending ? without(snapshot.pending, token) : snapshot.pending,
        },
        hadPending ? ['recents', 'me', 'pending'] : ['recents', 'me'],
      )
    },

    replaceToken(oldToken, newToken) {
      if (!TOKEN_PATTERN.test(newToken) || oldToken === newToken) return
      const snapshot = current()
      const old = snapshot.recents.find((group) => group.token === oldToken)
      const recents = old
        ? [
            { ...old, token: newToken, lastOpenedAt: now() },
            ...snapshot.recents.filter((group) => group.token !== oldToken && group.token !== newToken),
          ]
        : snapshot.recents
      const memberId = own(snapshot.me, oldToken)
      const me = memberId === undefined ? snapshot.me : { ...without(snapshot.me, oldToken), [newToken]: memberId }
      const hadPending = Object.hasOwn(snapshot.pending, oldToken)
      commit(
        { ...snapshot, recents, me, pending: hadPending ? without(snapshot.pending, oldToken) : snapshot.pending },
        hadPending ? ['recents', 'me', 'pending'] : ['recents', 'me'],
      )
    },

    getMe: (token) => own(current().me, token) ?? null,

    setMe(token, memberId) {
      if (!TOKEN_PATTERN.test(token)) return
      const snapshot = current()
      const rest = without(snapshot.me, token)
      const me = memberId ? { ...rest, [token]: memberId.slice(0, MAX_MEMBER_ID_LENGTH) } : rest
      commit({ ...snapshot, me }, ['me'])
    },

    getLastBank: () => current().lastBank,

    setLastBank(bank) {
      commit({ ...current(), lastBank: bank ? readBank(normalizeBankAccount(bank)) : null }, ['lastBank'])
    },

    getPendingRotation: (oldToken) => own(current().pending, oldToken) ?? null,

    beginRotation(oldToken, candidateNewToken) {
      if (!TOKEN_PATTERN.test(oldToken) || !TOKEN_PATTERN.test(candidateNewToken) || oldToken === candidateNewToken) {
        throw new RangeError('Token đổi link phải gồm 24 ký tự base64url và khác token cũ')
      }
      const snapshot = current()
      const inMemory = own(snapshot.pending, oldToken)
      if (inMemory) return inMemory
      // Tab khác có thể vừa ghi lần đổi link đang chờ cho cùng token mà tab này chưa nhận được sự kiện storage: đọc lại
      // từ máy trước khi chọn token mới, để hai tab không chọn hai token khác nhau.
      const stored = readPendingRotations(storage.get<unknown>(KEYS.pending, null))[oldToken]
      const entry = stored ?? { newToken: candidateNewToken, startedAt: now() }
      commit({ ...snapshot, pending: { ...snapshot.pending, [oldToken]: entry } }, stored ? [] : ['pending'])
      return entry
    },

    clearPendingRotation(oldToken) {
      const snapshot = current()
      if (!Object.hasOwn(snapshot.pending, oldToken)) return
      commit({ ...snapshot, pending: without(snapshot.pending, oldToken) }, ['pending'])
    },

    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) eventTarget?.addEventListener('storage', onStorageEvent)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) eventTarget?.removeEventListener('storage', onStorageEvent)
      }
    },
  }
}

/** Store dùng chung của app. */
export const billSplitStore: BillSplitStore = createBillSplitStore()
