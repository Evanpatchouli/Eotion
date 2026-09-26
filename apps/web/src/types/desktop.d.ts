export {}

import type { LocalStore } from '@eotion/storage'

declare global {
  interface Window {
    eotionDesktop?: {
      storage: LocalStore
      platform: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
    }
  }
}
