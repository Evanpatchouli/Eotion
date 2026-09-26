import type { BlockRecord, PageSummary } from '@eotion/domain'
import {
  MOBILE_STORAGE_CHANNEL,
  createLocalId,
  type MobileStorageRequest,
  type MobileStorageResponse,
} from '@eotion/storage'
import type { LocalStore, StorageOperation } from '@eotion/storage'

type Pending = { resolve(value: unknown): void; reject(reason: Error): void; timer: number }

/** WebView-side LocalStore proxy. The Lynx shell currently responds unavailable. */
export class MobileBridgeLocalStore implements LocalStore {
  private readonly pending = new Map<string, Pending>()

  constructor() {
    window.__eotionMobileStorageReceive = (response: MobileStorageResponse) => {
      if (response?.channel !== MOBILE_STORAGE_CHANNEL || response.kind !== 'response') return
      const request = this.pending.get(response.id)
      if (!request) return
      window.clearTimeout(request.timer)
      this.pending.delete(response.id)
      if (response.ok) request.resolve(response.result)
      else request.reject(new Error(`${response.error.code}: ${response.error.message}`))
    }
  }

  private call<K extends keyof LocalStore>(method: K, ...args: Parameters<LocalStore[K]>): Promise<Awaited<ReturnType<LocalStore[K]>>> {
    const id = createLocalId()
    const message = { channel: MOBILE_STORAGE_CHANNEL, kind: 'request', id, method, args } as MobileStorageRequest
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Mobile storage bridge timed out; manual verification required'))
      }, 5000)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      window.postMessage(JSON.stringify(message), window.location.origin)
    })
  }

  getPage(id: string): Promise<PageSummary | undefined> { return this.call('getPage', id) }
  listPages(): Promise<PageSummary[]> { return this.call('listPages') }
  upsertPage(page: PageSummary): Promise<void> { return this.call('upsertPage', page) }
  deletePage(id: string): Promise<void> { return this.call('deletePage', id) }
  getBlock(id: string): Promise<BlockRecord | undefined> { return this.call('getBlock', id) }
  listBlocksByPage(pageId: string): Promise<BlockRecord[]> { return this.call('listBlocksByPage', pageId) }
  upsertBlock(block: BlockRecord): Promise<void> { return this.call('upsertBlock', block) }
  deleteBlock(id: string): Promise<void> { return this.call('deleteBlock', id) }
  getPendingOperations(): Promise<StorageOperation[]> { return this.call('getPendingOperations') }
  markOperationSynced(id: string): Promise<void> { return this.call('markOperationSynced', id) }
  markOperationFailed(id: string): Promise<void> { return this.call('markOperationFailed', id) }
}
