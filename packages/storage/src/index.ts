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

export const MOBILE_STORAGE_CHANNEL = 'eotion.mobile.storage.v1' as const

type LocalStoreMethod = {
  [Method in keyof LocalStore]: LocalStore[Method] extends (...args: never[]) => unknown
    ? {
        method: Method
        args: Parameters<LocalStore[Method]>
        result: Awaited<ReturnType<LocalStore[Method]>>
      }
    : never
}[keyof LocalStore]

/** Typed RPC envelope sent from the shared Web UI to a native Mobile WebView host. */
export type MobileStorageRequest = LocalStoreMethod extends infer Entry
  ? Entry extends { method: infer Method; args: infer Args }
    ? {
        channel: typeof MOBILE_STORAGE_CHANNEL
        kind: 'request'
        id: string
        method: Method
        args: Args
      }
    : never
  : never

export type MobileStorageSuccessResponse<Method extends keyof LocalStore = keyof LocalStore> = {
  [Name in Method]: {
    channel: typeof MOBILE_STORAGE_CHANNEL
    kind: 'response'
    id: string
    method: Name
    ok: true
    result: Awaited<ReturnType<LocalStore[Name]>>
  }
}[Method]

export interface MobileStorageUnavailableResponse {
  channel: typeof MOBILE_STORAGE_CHANNEL
  kind: 'response'
  id: string
  method: keyof LocalStore
  ok: false
  error: {
    code: 'unavailable'
    message: string
  }
}

export type MobileStorageResponse =
  | MobileStorageSuccessResponse
  | MobileStorageUnavailableResponse

const MOBILE_STORAGE_METHODS: ReadonlySet<string> = new Set([
  'getPage',
  'listPages',
  'upsertPage',
  'deletePage',
  'getBlock',
  'listBlocksByPage',
  'upsertBlock',
  'deleteBlock',
  'getPendingOperations',
  'markOperationSynced',
  'markOperationFailed',
])

/** Runtime check for data crossing the WebView message boundary. */
export function isMobileStorageRequest(value: unknown): value is MobileStorageRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MobileStorageRequest>
  return candidate.channel === MOBILE_STORAGE_CHANNEL &&
    candidate.kind === 'request' &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= 128 &&
    typeof candidate.method === 'string' &&
    MOBILE_STORAGE_METHODS.has(candidate.method) &&
    Array.isArray(candidate.args)
}

/** P3's transport boundary. A future server sync layer can implement this later. */
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
