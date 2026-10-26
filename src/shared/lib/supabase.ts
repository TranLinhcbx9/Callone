import { createClient } from '@supabase/supabase-js'
import { env } from '@/shared/lib/env'
import type { Database } from '@/shared/types/database.types'

/**
 * Client Supabase duy nhất của app. Dùng publishable key, an toàn khi lộ ra trình duyệt.
 * Module chỉ gọi các hàm RPC công khai của mình, không đọc ghi bảng trực tiếp.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey)

export type AppSupabaseClient = typeof supabase
