/// <reference types="vite/client" />

/** Injected by Vite `define` in vite.config.ts — ISO 8601 build timestamp. */
declare const __BUILD_TIME__: string

interface ImportMetaEnv {
  /** `'true'` only in the static demo build (`npm run build:demo`). */
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
