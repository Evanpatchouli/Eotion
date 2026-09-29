import type { BlockRecord, PageSummary } from '@eotion/domain'
import type { SyncOperation } from '@eotion/contracts'

export { createLocalId } from './id.ts'

export type OperationStatus = 'pending' | 'synced' | 'failed'
export type OperationKind = SyncOperation['kind']

export interface LocalPageRecord extends PageSummary {
  workspaceId: string
  parentPageId: string | null
  orderKey: string
}

export interface LocalBlockRecord extends BlockRecord {
  workspaceId: string
}

/** A durable record of one local content mutation. Sequence is monotonic per clientId. */
export type StorageOperation = SyncOperation & {
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
  /** Resets all local P3 content, operations, and client metadata without emitting an operation. */
  clearAllData(): Promise<void>
  getPage(id: string): Promise<LocalPageRecord | undefined>
  listPages(): Promise<LocalPageRecord[]>
  upsertPage(page: LocalPageRecord): Promise<void>
  /** Deletes the page and its blocks atomically, represented by one page.delete operation. */
  deletePage(workspaceId: string, id: string): Promise<void>

  getBlock(id: string): Promise<LocalBlockRecord | undefined>
  listBlocksByPage(pageId: string): Promise<LocalBlockRecord[]>
  upsertBlock(block: LocalBlockRecord): Promise<void>
  deleteBlock(workspaceId: string, id: string): Promise<void>

  /** Returns pending and failed operations in increasing sequence order. */
  getPendingOperations(): Promise<StorageOperation[]>
  markOperationSynced(id: string): Promise<void>
  markOperationFailed(id: string): Promise<void>
}

/** Sends one canonical operation; adapters retain the stable id for retries. */
export interface OperationTransport {
  send(operation: StorageOperation): Promise<void>
}

export interface ReconnectResult {
  synced: number
  failed: number
}

// Coalesces calls only for the same object in this JS realm; it is not a
// cross-instance, cross-tab, or cross-renderer lock.
const inFlight = new WeakMap<LocalStore, Promise<ReconnectResult>>()

/**
 * Retries the persisted queue in order, without generating a new operation.
 * Stops at the first failure so later operations cannot overtake it. Concurrent
 * reconnects for the same store object in this JS realm share one attempt.
 * Delivery is at least once: if send succeeds but the local status update
 * fails, the persisted operation is sent again with the same id. The future
 * transport/server must deduplicate by operation id.
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
