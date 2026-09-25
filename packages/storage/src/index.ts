import type { BlockRecord, PageSummary } from '@eotion/domain'

export type OperationStatus = 'pending' | 'synced' | 'failed'
export type OperationKind = 'page.upsert' | 'page.delete' | 'block.upsert' | 'block.delete'

/** A durable record of one local content mutation. Sequence is monotonic per clientId. */
export interface StorageOperation {
  id: string
  clientId: string
  sequence: number
  kind: OperationKind
  target: { type: 'page' | 'block'; id: string }
  payload: PageSummary | BlockRecord | null
  createdAt: string
  status: OperationStatus
}

/**
 * Local content store shared by browser, Electron renderer and mobile WebView.
 *
 * Each successful content mutation must commit its content change and exactly one
 * pending operation in the same durable transaction. Operation metadata is owned
 * by the adapter; status changes must not create content operations. The clientId
 * and next sequence survive store reopening. Reads return snapshots, not live data.
 */
export interface LocalStore {
  getPage(id: string): Promise<PageSummary | undefined>
  listPages(): Promise<PageSummary[]>
  upsertPage(page: PageSummary): Promise<void>
  /** Deletes the page and its blocks atomically, represented by one page.delete operation. */
  deletePage(id: string): Promise<void>

  getBlock(id: string): Promise<BlockRecord | undefined>
  listBlocksByPage(pageId: string): Promise<BlockRecord[]>
  upsertBlock(block: BlockRecord): Promise<void>
  deleteBlock(id: string): Promise<void>

  /** Returns pending and failed operations in increasing sequence order. */
  getPendingOperations(): Promise<StorageOperation[]>
  markOperationSynced(id: string): Promise<void>
  markOperationFailed(id: string): Promise<void>
}

/** P3's transport boundary. A future server sync layer can implement this later. */
export interface OperationTransport {
  send(operation: StorageOperation): Promise<void>
}

export interface ReconnectResult {
  synced: number
  failed: number
}

const inFlight = new WeakMap<LocalStore, Promise<ReconnectResult>>()

/**
 * Retries the persisted queue in order, without generating a new operation.
 * Stops at the first failure so later operations cannot overtake it. Concurrent
 * reconnects for the same store share one attempt.
 */
export function reconnectPending(store: LocalStore, transport: OperationTransport): Promise<ReconnectResult> {
  const active = inFlight.get(store)
  if (active) return active

  const attempt = (async (): Promise<ReconnectResult> => {
    const result: ReconnectResult = { synced: 0, failed: 0 }
    for (const operation of await store.getPendingOperations()) {
      try {
        await transport.send(operation)
      } catch {
        await store.markOperationFailed(operation.id)
        result.failed += 1
        break
      }
      await store.markOperationSynced(operation.id)
      result.synced += 1
    }
    return result
  })()

  inFlight.set(store, attempt)
  void attempt.then(
    () => inFlight.delete(store),
    () => inFlight.delete(store),
  )
  return attempt
}
