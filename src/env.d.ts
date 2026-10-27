/// <reference types="vite-plugin-pwa/vanillajs" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  }
}

export {}
