import type { BlockRecord, PageSummary } from '@eotion/domain'
import { createLocalId, type LocalStore, type StorageOperation } from '@eotion/storage'

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

  getPage(id: string): Promise<PageSummary | undefined> {
    return this.read('pages', id)
  }

  listPages(): Promise<PageSummary[]> {
    return this.all('pages')
  }

  getBlock(id: string): Promise<BlockRecord | undefined> {
    return this.read('blocks', id)
  }

  async listBlocksByPage(pageId: string): Promise<BlockRecord[]> {
    const tx = this.db.transaction('blocks', 'readonly')
    const done = completed(tx)
    const blocks = await request<BlockRecord[]>(tx.objectStore('blocks').index('pageId').getAll(pageId))
    await done
    return blocks.sort((a, b) => sqliteBinaryCompare(a.orderKey, b.orderKey) || sqliteBinaryCompare(a.id, b.id))
  }

  private async mutate(
    kind: StorageOperation['kind'],
    target: StorageOperation['target'],
    payload: StorageOperation['payload'],
    change: (tx: IDBTransaction) => Promise<void> | void,
  ): Promise<void> {
    const tx = this.db.transaction(['pages', 'blocks', 'operations', 'meta'], 'readwrite')
    const done = completed(tx)
    try {
      const meta = tx.objectStore('meta')
      const clientId = await request<string>(meta.get('clientId'))
      const sequence = (await request<number>(meta.get('sequence'))) + 1
      await change(tx)
      const operation: StorageOperation = {
        id: createLocalId(), clientId, sequence, kind, target, payload,
        createdAt: new Date().toISOString(), status: 'pending',
      }
      tx.objectStore('operations').put(operation)
      meta.put(sequence, 'sequence')
      await done
    } catch (error) {
      try { tx.abort() } catch { /* transaction already completed */ }
      await done.catch(() => undefined)
      throw error
    }
  }

  upsertPage(page: PageSummary): Promise<void> {
    return this.mutate('page.upsert', { type: 'page', id: page.id }, page, (tx) => {
      tx.objectStore('pages').put(page)
    })
  }

  deletePage(id: string): Promise<void> {
    return this.mutate('page.delete', { type: 'page', id }, null, async (tx) => {
      tx.objectStore('pages').delete(id)
      const blocks = tx.objectStore('blocks')
      const ids = await request<IDBValidKey[]>(blocks.index('pageId').getAllKeys(id))
      ids.forEach((blockId) => blocks.delete(blockId))
    })
  }

  upsertBlock(block: BlockRecord): Promise<void> {
    return this.mutate('block.upsert', { type: 'block', id: block.id }, block, async (tx) => {
      if (!await request<PageSummary | undefined>(tx.objectStore('pages').get(block.pageId))) {
        throw new Error(`Page ${block.pageId} does not exist`)
      }
      tx.objectStore('blocks').put(block)
    })
  }

  deleteBlock(id: string): Promise<void> {
    return this.mutate('block.delete', { type: 'block', id }, null, (tx) => {
      tx.objectStore('blocks').delete(id)
    })
  }

  async getPendingOperations(): Promise<StorageOperation[]> {
    const operations = await this.all<StorageOperation>('operations')
    return operations.filter((op) => op.status !== 'synced').sort((a, b) => a.sequence - b.sequence)
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
