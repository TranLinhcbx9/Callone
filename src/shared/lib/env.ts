/**
 * Biến môi trường của app. Vite chỉ đưa ra client các biến có tiền tố VITE_.
 * Đọc lười để trang không cần Supabase (ví dụ /dev) vẫn chạy khi chưa có .env.local.
 */
const raw = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
} as const

type EnvName = keyof typeof raw

function read(name: EnvName): string {
  const value = raw[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu biến môi trường ${name}. Sao chép .env.example thành .env.local rồi điền giá trị.`)
  }
  return value.trim()
}

export const env = {
  get supabaseUrl(): string {
    return read('VITE_SUPABASE_URL')
  },
  get supabasePublishableKey(): string {
    return read('VITE_SUPABASE_PUBLISHABLE_KEY')
  },
}
