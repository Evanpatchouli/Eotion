export {}

import type { LocalStore } from '@eotion/storage'
import type { MobileStorageResponse } from '@eotion/storage'

declare global {
  interface Window {
    __eotionMobileStorageReceive?: (response: MobileStorageResponse) => void
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
