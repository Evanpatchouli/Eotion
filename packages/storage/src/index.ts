import type { BlockRecord, PageSummary } from '@eotion/domain'
import { validateBlockTree } from '@eotion/domain/block-tree'
import { isAllowedChildBlockType, validateBlockProps } from '@eotion/domain/block-types'
import type { SyncOperation } from '@eotion/contracts'

export { createLocalId } from './id.ts'

export type OperationStatus = 'pending' | 'synced' | 'failed'
export type OperationKind = SyncOperation['kind']

/** A locally removed file whose remote object may be deleted after its source op syncs. */
export interface FileCleanupTask {
  workspaceId: string
  fileId: string
  createdAt: string
  sourceOperationId?: string
  lastError?: string
}

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
  listPagesByWorkspace(workspaceId: string): Promise<LocalPageRecord[]>
  hasWorkspaceSnapshot(workspaceId: string): Promise<boolean>
  upsertPage(page: LocalPageRecord): Promise<void>
  /** Moves an existing page and records exactly one page.move operation. */
  movePage(workspaceId: string, id: string, parentPageId: string | null, orderKey: string): Promise<void>
  /** Deletes the page and its blocks atomically, represented by one page.delete operation. */
  deletePage(workspaceId: string, id: string): Promise<void>
  /** Atomically replaces one workspace with a verified server snapshot, without producing operations. */
  replaceWorkspaceSnapshot(workspaceId: string, pages: LocalPageRecord[], blocks: LocalBlockRecord[]): Promise<void>

  getBlock(id: string): Promise<LocalBlockRecord | undefined>
  /** Returns the page's blocks in stable orderKey/id order, including nested blocks. */
  listBlocksByPage(pageId: string): Promise<LocalBlockRecord[]>
  upsertBlock(block: LocalBlockRecord): Promise<void>
  /** Reparents and reorders one existing block, recording exactly one block.move operation. */
  moveBlock(workspaceId: string, id: string, parentBlockId: string | null, orderKey: string): Promise<void>
  deleteBlock(workspaceId: string, id: string): Promise<void>

  /** Returns pending and failed operations in increasing sequence order. */
  getPendingOperations(): Promise<StorageOperation[]>
  markOperationSynced(id: string): Promise<void>
  markOperationFailed(id: string): Promise<void>
  enqueueFileCleanup(workspaceId: string, fileId: string): Promise<void>
  listFileCleanups(): Promise<FileCleanupTask[]>
  listReadyFileCleanups(): Promise<FileCleanupTask[]>
  completeFileCleanup(workspaceId: string, fileId: string): Promise<void>
  failFileCleanup(workspaceId: string, fileId: string, error: string): Promise<void>
}

/** Reject malformed or partial workspace snapshots before any local content is replaced. */
export function validateWorkspaceSnapshot(workspaceId: string, pages: LocalPageRecord[], blocks: LocalBlockRecord[]): void {
  const pageById = new Map<string, LocalPageRecord>()
  for (const page of pages) {
    if (!page.id || page.workspaceId !== workspaceId || pageById.has(page.id)) throw new Error('Invalid workspace page snapshot')
    pageById.set(page.id, page)
  }
  for (const page of pages) {
    const visited = new Set<string>([page.id])
    let parentId = page.parentPageId
    while (parentId !== null) {
      if (visited.has(parentId)) throw new Error(`Page ${page.id} has a cyclic parent`)
      visited.add(parentId)
      const parent = pageById.get(parentId)
      if (!parent) throw new Error(`Parent page ${parentId} is missing from snapshot`)
      parentId = parent.parentPageId
    }
  }
  const blockById = new Map<string, LocalBlockRecord>()
  for (const block of blocks) {
    if (!block.id || block.workspaceId !== workspaceId || blockById.has(block.id) || !pageById.has(block.pageId)) {
      throw new Error('Invalid workspace block snapshot')
    }
    if (!validateBlockProps(block.type, block.props)) throw new Error('Invalid block attributes in workspace snapshot')
    blockById.set(block.id, block)
  }
  // Self-parent, missing parent, cross-page parent and cycles share one
  // implementation with the local stores and the server domain.
  validateBlockTree(blocks)
  for (const block of blocks) {
    const parent = block.parentBlockId ? blockById.get(block.parentBlockId) : undefined
    if (parent && !isAllowedChildBlockType(parent.type, block.type)) throw new Error('Parent block type does not support child blocks in workspace snapshot')
  }
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
const inFlight = new WeakMap<LocalStore, { key: string; promise: Promise<ReconnectResult> }>()

/**
 * Retries the persisted queue in order, without generating a new operation.
 * Stops at the first failure so later operations cannot overtake it. Concurrent
 * reconnects for the same store object in this JS realm share one attempt.
 * Delivery is at least once: if send succeeds but the local status update
 * fails, the persisted operation is sent again with the same id. The future
 * transport/server must deduplicate by operation id. When allowedWorkspaceIds
 * is provided, operations from other workspaces stay queued and do not block
 * this attempt. Different filters on the same store execute serially.
 */
export function reconnectPending(store: LocalStore, transport: OperationTransport, allowedWorkspaceIds?: ReadonlySet<string>): Promise<ReconnectResult> {
  const key = allowedWorkspaceIds ? JSON.stringify([...allowedWorkspaceIds].sort()) : '*'
  const active = inFlight.get(store)
  if (active) {
    if (active.key === key) return active.promise
    return active.promise.then(() => reconnectPending(store, transport, allowedWorkspaceIds))
  }

  const attempt = (async (): Promise<ReconnectResult> => {
    const result: ReconnectResult = { synced: 0, failed: 0 }
    for (const operation of await store.getPendingOperations()) {
      if (allowedWorkspaceIds && !allowedWorkspaceIds.has(operation.workspaceId)) continue
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

  inFlight.set(store, { key, promise: attempt })
  void attempt.then(
    () => inFlight.delete(store),
    () => inFlight.delete(store),
  )
  return attempt
}
