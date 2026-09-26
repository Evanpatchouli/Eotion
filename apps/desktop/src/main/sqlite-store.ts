import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BlockRecord, PageSummary } from '@eotion/domain'
import { createLocalId, type LocalStore, type StorageOperation } from '@eotion/storage'

type OperationKind = StorageOperation['kind']

/** SQLite lives only in Electron's main process. Each content change and its op are one transaction. */
export class SqliteLocalStore implements LocalStore {
  private readonly database: DatabaseSync
  private readonly clientId: string

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.database = new DatabaseSync(path)
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA journal_mode = WAL')
    this.database.exec('PRAGMA synchronous = FULL')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        order_key TEXT NOT NULL,
        document TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blocks_by_page ON blocks(page_id, order_key, id);
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        sequence INTEGER NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS operations_by_status_sequence ON operations(status, sequence);
    `)
    const existing = this.database.prepare("SELECT value FROM metadata WHERE key = 'client_id'").get() as
      | { value: string }
      | undefined
    if (existing) {
      this.clientId = existing.value
    } else {
      const id = createLocalId()
      this.database.prepare("INSERT INTO metadata (key, value) VALUES ('client_id', ?)").run(id)
      this.clientId = id
    }
  }

  close(): void {
    this.database.close()
  }

  private transaction(action: () => void): void {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      action()
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private appendOperation(kind: OperationKind, id: string, payload: PageSummary | BlockRecord | null): void {
    const next = this.database.prepare("SELECT value FROM metadata WHERE key = 'next_sequence'").get() as
      | { value: string }
      | undefined
    const sequence = next ? Number(next.value) : 1
    this.database.prepare(`
      INSERT INTO metadata (key, value) VALUES ('next_sequence', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(sequence + 1))
    this.database.prepare(`
      INSERT INTO operations (id, client_id, sequence, kind, target_type, target_id, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      createLocalId(),
      this.clientId,
      sequence,
      kind,
      kind.startsWith('page.') ? 'page' : 'block',
      id,
      payload === null ? null : JSON.stringify(payload),
      new Date().toISOString(),
    )
  }

  async getPage(id: string): Promise<PageSummary | undefined> {
    const row = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(id) as
      | { document: string }
      | undefined
    return row ? JSON.parse(row.document) as PageSummary : undefined
  }

  async listPages(): Promise<PageSummary[]> {
    const rows = this.database.prepare('SELECT document FROM pages ORDER BY id').all() as { document: string }[]
    return rows.map((row) => JSON.parse(row.document) as PageSummary)
  }

  async upsertPage(page: PageSummary): Promise<void> {
    this.transaction(() => {
      this.database.prepare('INSERT INTO pages (id, document) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document')
        .run(page.id, JSON.stringify(page))
      this.appendOperation('page.upsert', page.id, page)
    })
  }

  async deletePage(id: string): Promise<void> {
    this.transaction(() => {
      this.database.prepare('DELETE FROM pages WHERE id = ?').run(id)
      this.appendOperation('page.delete', id, null)
    })
  }

  async getBlock(id: string): Promise<BlockRecord | undefined> {
    const row = this.database.prepare('SELECT document FROM blocks WHERE id = ?').get(id) as
      | { document: string }
      | undefined
    return row ? JSON.parse(row.document) as BlockRecord : undefined
  }

  async listBlocksByPage(pageId: string): Promise<BlockRecord[]> {
    const rows = this.database.prepare('SELECT document FROM blocks WHERE page_id = ? ORDER BY order_key, id')
      .all(pageId) as { document: string }[]
    return rows.map((row) => JSON.parse(row.document) as BlockRecord)
  }

  async upsertBlock(block: BlockRecord): Promise<void> {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO blocks (id, page_id, order_key, document) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          page_id = excluded.page_id, order_key = excluded.order_key, document = excluded.document
      `).run(block.id, block.pageId, block.orderKey, JSON.stringify(block))
      this.appendOperation('block.upsert', block.id, block)
    })
  }

  async deleteBlock(id: string): Promise<void> {
    this.transaction(() => {
      this.database.prepare('DELETE FROM blocks WHERE id = ?').run(id)
      this.appendOperation('block.delete', id, null)
    })
  }

  async getPendingOperations(): Promise<StorageOperation[]> {
    const rows = this.database.prepare(`
      SELECT id, client_id, sequence, kind, target_type, target_id, payload, created_at, status
      FROM operations WHERE status IN ('pending', 'failed') ORDER BY sequence
    `).all() as Array<{
      id: string; client_id: string; sequence: number; kind: OperationKind
      target_type: 'page' | 'block'; target_id: string; payload: string | null
      created_at: string; status: StorageOperation['status']
    }>
    return rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      sequence: row.sequence,
      kind: row.kind,
      target: { type: row.target_type, id: row.target_id },
      payload: row.payload === null ? null : JSON.parse(row.payload) as PageSummary | BlockRecord,
      createdAt: row.created_at,
      status: row.status,
    }))
  }

  async markOperationSynced(id: string): Promise<void> {
    this.database.prepare("UPDATE operations SET status = 'synced' WHERE id = ?").run(id)
  }

  async markOperationFailed(id: string): Promise<void> {
    this.database.prepare("UPDATE operations SET status = 'failed' WHERE id = ? AND status != 'synced'").run(id)
  }
}
