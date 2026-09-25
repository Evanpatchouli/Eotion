import type { LocalStore } from '@eotion/storage'

import { IndexedDbLocalStore } from './indexedDbStore'
import { MobileBridgeLocalStore } from './mobileBridgeStore'

/** The sole runtime selection point for local persistence. */
export async function createLocalStore(): Promise<{ adapter: string; store: LocalStore }> {
  if (window.eotionDesktop?.storage) {
    return { adapter: 'Electron SQLite', store: window.eotionDesktop.storage }
  }
  if (new URLSearchParams(window.location.search).get('eotionRuntime') === 'mobile-webview') {
    return { adapter: 'Mobile typed bridge (platform storage unavailable)', store: new MobileBridgeLocalStore() }
  }
  return { adapter: 'Web IndexedDB', store: await IndexedDbLocalStore.open() }
}
