/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin used by the dev proxy; empty in dev (same-origin via proxy). */
  readonly VITE_BACKEND_ORIGIN?: string
  /** Axios baseURL. Defaults to '/api' (proxied to the backend in dev). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
