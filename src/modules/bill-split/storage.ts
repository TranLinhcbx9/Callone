/**
 * Dữ liệu lưu trên máy của module Chia tiền (localStorage, tiền tố callone:bill-split:):
 * - Nhóm đã mở gần đây: [{ token, name, lastOpenedAt }], tối đa 30, mới nhất trước.
 * - "Mình là ai" trong từng nhóm: token thành memberId.
 * - Thông tin ngân hàng nhập lần gần nhất, để điền sẵn khi thêm người mới.
 *
 * Dữ liệu đọc ra từ localStorage được kiểm tra hình dạng, phần hỏng bị bỏ. Trạng thái giữ cả trong bộ nhớ,
 * nên khi trình duyệt chặn ghi (Safari riêng tư, hết dung lượng) app vẫn chạy trong phiên đó.
 * Store có subscribe và getter trả cùng một tham chiếu khi không đổi, dùng được với useSyncExternalStore.
 */
import { BS_LIMITS, TOKEN_PATTERN } from '@/modules/bill-split/api/contract'
import type { BankAccount } from '@/modules/bill-split/domain/types'
import { createModuleStorage, type ModuleStorage } from '@/shared/lib/storage'

export const MAX_RECENT_GROUPS = 30

export interface RecentGroup {
  token: string
  name: string
  /** Thời điểm mở gần nhất, mili giây kể từ epoch. */
  lastOpenedAt: number
}

const KEYS = { recents: 'recent-groups', me: 'me', lastBank: 'last-bank' } as const
const STORAGE_PREFIX = 'callone:bill-split:'
const MAX_MEMBER_ID_LENGTH = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Danh sách nhóm gần đây từ dữ liệu thô: bỏ mục sai hình dạng và trùng token, mới nhất trước, tối đa 30. */
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
  return groups.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, MAX_RECENT_GROUPS)
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

export interface BillSplitStoreOptions {
  storage?: ModuleStorage
  /** Đồng hồ, để test cố định thời gian. */
  now?: () => number
  /** Nơi nghe sự kiện 'storage' từ tab khác. Mặc định là window nếu có. */
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
}

export interface BillSplitStore {
  getRecentGroups(): readonly RecentGroup[]
  /** Ghi nhớ nhóm vừa mở, đưa lên đầu danh sách. Token sai định dạng bị bỏ qua. */
  rememberGroup(token: string, name: string): void
  /** Quên nhóm: bỏ khỏi danh sách gần đây và quên luôn "mình là ai" của nhóm đó. */
  forgetGroup(token: string): void
  /** Sau khi đổi link: chuyển danh sách gần đây và "mình là ai" từ token cũ sang token mới. */
  replaceToken(oldToken: string, newToken: string): void
  getMe(token: string): string | null
  setMe(token: string, memberId: string | null): void
  getLastBank(): BankAccount | null
  setLastBank(bank: BankAccount | null): void
  subscribe(listener: () => void): () => void
}

interface State {
  recents: readonly RecentGroup[]
  me: Readonly<Record<string, string>>
  lastBank: BankAccount | null
}

type StateKey = keyof typeof KEYS

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))
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

    rememberGroup(token, name) {
      if (!TOKEN_PATTERN.test(token)) return
      const { recents, me, lastBank } = current()
      const entry: RecentGroup = { token, name: name.trim().slice(0, BS_LIMITS.groupName), lastOpenedAt: now() }
      const next = [entry, ...recents.filter((group) => group.token !== token)].slice(0, MAX_RECENT_GROUPS)
      // Nhóm rớt khỏi danh sách (quá 30) thì quên luôn "mình là ai" của nhóm đó.
      const kept = new Set(next.map((group) => group.token))
      const nextMe = Object.fromEntries(Object.entries(me).filter(([key]) => kept.has(key)))
      const meChanged = Object.keys(nextMe).length !== Object.keys(me).length
      commit({ recents: next, me: nextMe, lastBank }, meChanged ? ['recents', 'me'] : ['recents'])
    },

    forgetGroup(token) {
      const { recents, me, lastBank } = current()
      const nextRecents = recents.filter((group) => group.token !== token)
      commit({ recents: nextRecents, me: without(me, token), lastBank }, ['recents', 'me'])
    },

    replaceToken(oldToken, newToken) {
      if (!TOKEN_PATTERN.test(newToken) || oldToken === newToken) return
      const { recents, me, lastBank } = current()
      const old = recents.find((group) => group.token === oldToken)
      const nextRecents = old
        ? [
            { ...old, token: newToken, lastOpenedAt: now() },
            ...recents.filter((group) => group.token !== oldToken && group.token !== newToken),
          ]
        : recents
      const memberId = me[oldToken]
      const nextMe = memberId === undefined ? me : { ...without(me, oldToken), [newToken]: memberId }
      commit({ recents: nextRecents, me: nextMe, lastBank }, ['recents', 'me'])
    },

    getMe: (token) => current().me[token] ?? null,

    setMe(token, memberId) {
      if (!TOKEN_PATTERN.test(token)) return
      const { recents, me, lastBank } = current()
      const rest = without(me, token)
      const nextMe = memberId ? { ...rest, [token]: memberId.slice(0, MAX_MEMBER_ID_LENGTH) } : rest
      commit({ recents, me: nextMe, lastBank }, ['me'])
    },

    getLastBank: () => current().lastBank,

    setLastBank(bank) {
      const { recents, me } = current()
      commit({ recents, me, lastBank: readBank(bank) }, ['lastBank'])
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
