import type { LocalStore } from '@eotion/storage'

import { IndexedDbLocalStore } from './indexedDbStore'

/** The sole runtime selection point for local persistence. */
export async function createLocalStore(): Promise<{ adapter: string; store: LocalStore }> {
  if (window.eotionDesktop?.storage) {
    return { adapter: 'Electron SQLite', store: window.eotionDesktop.storage }
  }
  return { adapter: 'IndexedDB', store: await IndexedDbLocalStore.open() }
}
