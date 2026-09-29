import type { SyncOperation } from '@eotion/contracts'
import { createLocalId, type LocalBlockRecord, type LocalPageRecord, type LocalStore, type StorageOperation } from '@eotion/storage'

const DB_VERSION = 1
const encoder = new TextEncoder()

function sqliteBinaryCompare(left: string, right: string): number {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const leftByte = a[index]!
    const rightByte = b[index]!
    if (leftByte !== rightByte) return leftByte - rightByte
  }
  return a.length - b.length
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error)
  })
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

async function openDatabase(name: string): Promise<IDBDatabase> {
  const opening = indexedDB.open(name, DB_VERSION)
  opening.onupgradeneeded = () => {
    const db = opening.result
    db.createObjectStore('pages', { keyPath: 'id' })
    const blocks = db.createObjectStore('blocks', { keyPath: 'id' })
    blocks.createIndex('pageId', 'pageId')
    db.createObjectStore('operations', { keyPath: 'id' })
    db.createObjectStore('meta')
  }
  return request(opening)
}

export class IndexedDbLocalStore implements LocalStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name = 'eotion-local-p3'): Promise<IndexedDbLocalStore> {
    const db = await openDatabase(name)
    const store = new IndexedDbLocalStore(db)
    await store.ensureIdentity()
    return store
  }

  close(): void {
    this.db.close()
  }

  async clearAllData(): Promise<void> {
    const tx = this.db.transaction(['pages', 'blocks', 'operations', 'meta'], 'readwrite')
    const done = completed(tx)
    tx.objectStore('pages').clear()
    tx.objectStore('blocks').clear()
    tx.objectStore('operations').clear()
    const meta = tx.objectStore('meta')
    meta.clear()
    meta.put(createLocalId(), 'clientId')
    meta.put(0, 'sequence')
    await done
  }

  private async ensureIdentity(): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite')
    const done = completed(tx)
    const meta = tx.objectStore('meta')
    if (!await request<string | undefined>(meta.get('clientId'))) {
      meta.put(createLocalId(), 'clientId')
      meta.put(0, 'sequence')
    }
    await done
  }

  private async read<T>(storeName: string, key: string): Promise<T | undefined> {
    const tx = this.db.transaction(storeName, 'readonly')
    const done = completed(tx)
    const value = await request<T | undefined>(tx.objectStore(storeName).get(key))
    await done
    return value
  }

  private async all<T>(storeName: string): Promise<T[]> {
    const tx = this.db.transaction(storeName, 'readonly')
    const done = completed(tx)
    const values = await request<T[]>(tx.objectStore(storeName).getAll())
    await done
    return values
  }

  getPage(id: string): Promise<LocalPageRecord | undefined> {
    return this.read('pages', id)
  }

  listPages(): Promise<LocalPageRecord[]> {
    return this.all('pages')
  }

  getBlock(id: string): Promise<LocalBlockRecord | undefined> {
    return this.read('blocks', id)
  }

  async listBlocksByPage(pageId: string): Promise<LocalBlockRecord[]> {
    const tx = this.db.transaction('blocks', 'readonly')
    const done = completed(tx)
    const blocks = await request<LocalBlockRecord[]>(tx.objectStore('blocks').index('pageId').getAll(pageId))
    await done
    return blocks.sort((a, b) => sqliteBinaryCompare(a.orderKey, b.orderKey) || sqliteBinaryCompare(a.id, b.id))
  }

  private async mutate(
    workspaceId: string,
    kind: SyncOperation['kind'],
    payload: SyncOperation['payload'],
    change: (tx: IDBTransaction) => Promise<void> | void,
  ): Promise<void> {
    const tx = this.db.transaction(['pages', 'blocks', 'operations', 'meta'], 'readwrite')
    const done = completed(tx)
    try {
      const meta = tx.objectStore('meta')
      const clientId = await request<string>(meta.get('clientId'))
      const sequence = (await request<number>(meta.get('sequence'))) + 1
      await change(tx)
      const operation = {
        id: createLocalId(), clientId, sequence, workspaceId, kind, payload,
        createdAt: new Date().toISOString(), status: 'pending',
      } as StorageOperation
      tx.objectStore('operations').put(operation)
      meta.put(sequence, 'sequence')
      await done
    } catch (error) {
      try { tx.abort() } catch { /* transaction already completed */ }
      await done.catch(() => undefined)
      throw error
    }
  }

  upsertPage(page: LocalPageRecord): Promise<void> {
    const { id, parentPageId, title, icon, orderKey } = page
    return this.mutate(page.workspaceId, 'page.upsert', {
      id, parentPageId, title, icon: icon ?? null, orderKey,
    }, async (tx) => {
      const pages = tx.objectStore('pages')
      const existing = await request<LocalPageRecord | undefined>(pages.get(id))
      if (existing && (existing.workspaceId !== page.workspaceId || existing.parentPageId !== parentPageId)) {
        throw new Error(`Page ${id} workspace and parent are immutable`)
      }
      if (parentPageId) {
        const parent = await request<LocalPageRecord | undefined>(pages.get(parentPageId))
        if (!parent || parent.workspaceId !== page.workspaceId) throw new Error(`Parent page ${parentPageId} is unavailable in this workspace`)
      }
      pages.put(page)
    })
  }

  deletePage(workspaceId: string, id: string): Promise<void> {
    return this.mutate(workspaceId, 'page.delete', { id }, async (tx) => {
      const pages = tx.objectStore('pages')
      const page = await request<LocalPageRecord | undefined>(pages.get(id))
      if (page && page.workspaceId !== workspaceId) throw new Error(`Page ${id} belongs to a different workspace`)
      const allPages = await request<LocalPageRecord[]>(pages.getAll())
      if (allPages.some((candidate) => candidate.workspaceId === workspaceId && candidate.parentPageId === id)) {
        throw new Error(`Page ${id} has child pages`)
      }
      tx.objectStore('pages').delete(id)
      const blocks = tx.objectStore('blocks')
      const pageBlocks = await request<LocalBlockRecord[]>(blocks.index('pageId').getAll(id))
      if (pageBlocks.some((block) => block.workspaceId !== workspaceId)) throw new Error(`Page ${id} contains blocks from a different workspace`)
      pageBlocks.forEach((block) => blocks.delete(block.id))
    })
  }

  upsertBlock(block: LocalBlockRecord): Promise<void> {
    const { id, pageId, parentBlockId, type, orderKey, props } = block
    return this.mutate(block.workspaceId, 'block.upsert', {
      id, pageId, parentBlockId: parentBlockId ?? null, type, orderKey, props,
    }, async (tx) => {
      const page = await request<LocalPageRecord | undefined>(tx.objectStore('pages').get(pageId))
      if (!page) {
        throw new Error(`Page ${block.pageId} does not exist`)
      }
      if (page.workspaceId !== block.workspaceId) throw new Error(`Page ${pageId} belongs to a different workspace`)
      const blocks = tx.objectStore('blocks')
      const existing = await request<LocalBlockRecord | undefined>(blocks.get(id))
      if (existing && (existing.workspaceId !== block.workspaceId || existing.pageId !== pageId || (existing.parentBlockId ?? null) !== (parentBlockId ?? null))) {
        throw new Error(`Block ${id} workspace, page, and parent are immutable`)
      }
      if (parentBlockId) {
        const parent = await request<LocalBlockRecord | undefined>(blocks.get(parentBlockId))
        if (!parent || parent.pageId !== pageId || parent.workspaceId !== block.workspaceId) throw new Error(`Parent block ${parentBlockId} is unavailable in this workspace page`)
      }
      blocks.put(block)
    })
  }

  deleteBlock(workspaceId: string, id: string): Promise<void> {
    return this.mutate(workspaceId, 'block.delete', { id }, async (tx) => {
      const blocks = tx.objectStore('blocks')
      const block = await request<LocalBlockRecord | undefined>(blocks.get(id))
      if (block && block.workspaceId !== workspaceId) throw new Error(`Block ${id} belongs to a different workspace`)
      if (block) {
        const siblings = await request<LocalBlockRecord[]>(blocks.index('pageId').getAll(block.pageId))
        if (siblings.some((candidate) => candidate.workspaceId === workspaceId && candidate.parentBlockId === id)) {
          throw new Error(`Block ${id} has child blocks`)
        }
      }
      tx.objectStore('blocks').delete(id)
    })
  }

  async getPendingOperations(): Promise<StorageOperation[]> {
    const operations = await this.all<StorageOperation>('operations')
    // Older P3 records intentionally remain readable; the strict network schema
    // rejects them because workspace/snapshot fields cannot be inferred safely.
    return operations.filter((op) => op.status !== 'synced').sort((a, b) => a.sequence - b.sequence) as StorageOperation[]
  }

  private async setStatus(id: string, status: StorageOperation['status']): Promise<void> {
    const tx = this.db.transaction('operations', 'readwrite')
    const done = completed(tx)
    const operations = tx.objectStore('operations')
    const operation = await request<StorageOperation | undefined>(operations.get(id))
    if (!operation) {
      tx.abort()
      await done.catch(() => undefined)
      throw new Error(`Operation ${id} does not exist`)
    }
    if (status !== 'failed' || operation.status !== 'synced') {
      operations.put({ ...operation, status })
    }
    await done
  }

  markOperationSynced(id: string): Promise<void> {
    return this.setStatus(id, 'synced')
  }

  markOperationFailed(id: string): Promise<void> {
    return this.setStatus(id, 'failed')
  }
}
