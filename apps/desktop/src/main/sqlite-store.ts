import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SyncOperation } from '@eotion/contracts'
import { createLocalId, validateWorkspaceSnapshot, type FileCleanupTask, type LocalBlockRecord, type LocalPageRecord, type LocalStore, type StorageOperation } from '@eotion/storage'

type OperationKind = SyncOperation['kind']

/** SQLite lives only in Electron's main process. Each content change and its op are one transaction. */
export class SqliteLocalStore implements LocalStore {
  private readonly database: DatabaseSync
  private clientId: string

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
        workspace_id TEXT,
        kind TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS operations_by_status_sequence ON operations(status, sequence);
      CREATE TABLE IF NOT EXISTS file_cleanups (
        workspace_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source_operation_id TEXT,
        last_error TEXT,
        PRIMARY KEY (workspace_id, file_id)
      );
    `)
    const operationColumns = this.database.prepare('PRAGMA table_info(operations)').all() as Array<{ name: string }>
    if (!operationColumns.some(({ name }) => name === 'workspace_id')) {
      this.database.exec('ALTER TABLE operations ADD COLUMN workspace_id TEXT')
    }
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

  async clearAllData(): Promise<void> {
    const clientId = createLocalId()
    this.transaction(() => {
      this.database.exec('DELETE FROM blocks; DELETE FROM pages; DELETE FROM operations; DELETE FROM file_cleanups; DELETE FROM metadata;')
      this.database.prepare("INSERT INTO metadata (key, value) VALUES ('client_id', ?)").run(clientId)
    })
    this.clientId = clientId
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

  private appendOperation(operation: Omit<SyncOperation, 'id' | 'clientId' | 'sequence' | 'createdAt'>): string {
    const next = this.database.prepare("SELECT value FROM metadata WHERE key = 'next_sequence'").get() as
      | { value: string }
      | undefined
    const sequence = next ? Number(next.value) : 1
    this.database.prepare(`
      INSERT INTO metadata (key, value) VALUES ('next_sequence', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(sequence + 1))
    const targetId = operation.payload.id
    const fullOperation = {
      ...operation,
      id: createLocalId(),
      clientId: this.clientId,
      sequence,
      createdAt: new Date().toISOString(),
    } as SyncOperation
    this.database.prepare(`
      INSERT INTO operations (id, client_id, sequence, workspace_id, kind, target_type, target_id, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      fullOperation.id, fullOperation.clientId, fullOperation.sequence, fullOperation.workspaceId,
      fullOperation.kind, fullOperation.kind.startsWith('page.') ? 'page' : 'block', targetId,
      JSON.stringify(fullOperation.payload), fullOperation.createdAt,
    )
    return fullOperation.id
  }

  private enqueueCleanup(workspaceId: string, fileId: string | undefined, sourceOperationId?: string): void {
    if (!fileId) return
    this.database.prepare(`
      INSERT OR IGNORE INTO file_cleanups (workspace_id, file_id, created_at, source_operation_id)
      VALUES (?, ?, ?, ?)
    `).run(workspaceId, fileId, new Date().toISOString(), sourceOperationId ?? null)
  }

  async getPage(id: string): Promise<LocalPageRecord | undefined> {
    const row = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(id) as
      | { document: string }
      | undefined
    return row ? JSON.parse(row.document) as LocalPageRecord : undefined
  }

  async listPages(): Promise<LocalPageRecord[]> {
    const rows = this.database.prepare('SELECT document FROM pages ORDER BY id').all() as { document: string }[]
    return rows.map((row) => JSON.parse(row.document) as LocalPageRecord)
  }

  async listPagesByWorkspace(workspaceId: string): Promise<LocalPageRecord[]> {
    return (await this.listPages()).filter((page) => page.workspaceId === workspaceId)
  }

  async hasWorkspaceSnapshot(workspaceId: string): Promise<boolean> {
    const marker = this.database.prepare('SELECT value FROM metadata WHERE key = ?').get(`snapshot:${workspaceId}`)
    return Boolean(marker) || (await this.listPagesByWorkspace(workspaceId)).length > 0
  }

  async upsertPage(page: LocalPageRecord): Promise<void> {
    this.transaction(() => {
      const existingRow = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(page.id) as { document: string } | undefined
      const existing = existingRow ? JSON.parse(existingRow.document) as LocalPageRecord : undefined
      if (existing && (existing.workspaceId !== page.workspaceId || existing.parentPageId !== page.parentPageId)) {
        throw new Error(`Page ${page.id} workspace and parent are immutable`)
      }
      if (page.parentPageId) {
        const parent = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(page.parentPageId) as { document: string } | undefined
        const parentPage = parent ? JSON.parse(parent.document) as LocalPageRecord : undefined
        if (!parentPage || parentPage.workspaceId !== page.workspaceId) throw new Error(`Parent page ${page.parentPageId} is unavailable in this workspace`)
      }
      this.database.prepare('INSERT INTO pages (id, document) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document')
        .run(page.id, JSON.stringify(page))
      this.database.prepare("INSERT INTO metadata (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run(`snapshot:${page.workspaceId}`)
      const { id, workspaceId, parentPageId, title, icon, orderKey } = page
      this.appendOperation({ kind: 'page.upsert', workspaceId, payload: { id, parentPageId, title, icon: icon ?? null, orderKey } })
    })
  }

  async movePage(workspaceId: string, id: string, parentPageId: string | null, orderKey: string): Promise<void> {
    this.transaction(() => {
      const row = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(id) as { document: string } | undefined
      const page = row ? JSON.parse(row.document) as LocalPageRecord : undefined
      if (!page || page.workspaceId !== workspaceId) throw new Error(`Page ${id} is unavailable in this workspace`)
      if (parentPageId === id) throw new Error(`Page ${id} cannot be its own parent`)
      let ancestorId = parentPageId
      const visited = new Set<string>()
      while (ancestorId !== null) {
        if (visited.has(ancestorId)) throw new Error('Existing page tree is cyclic')
        visited.add(ancestorId)
        const ancestorRow = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(ancestorId) as { document: string } | undefined
        const ancestor = ancestorRow ? JSON.parse(ancestorRow.document) as LocalPageRecord : undefined
        if (!ancestor || ancestor.workspaceId !== workspaceId) throw new Error(`Parent page ${ancestorId} is unavailable in this workspace`)
        if (ancestor.parentPageId === id) throw new Error(`Page ${id} cannot move under its descendant`)
        ancestorId = ancestor.parentPageId
      }
      this.database.prepare('UPDATE pages SET document = ? WHERE id = ?').run(JSON.stringify({ ...page, parentPageId, orderKey }), id)
      this.appendOperation({ kind: 'page.move', workspaceId, payload: { id, parentPageId, orderKey } })
    })
  }

  async replaceWorkspaceSnapshot(workspaceId: string, pages: LocalPageRecord[], blocks: LocalBlockRecord[]): Promise<void> {
    validateWorkspaceSnapshot(workspaceId, pages, blocks)
    this.transaction(() => {
      const unsynced = this.database.prepare("SELECT 1 FROM operations WHERE status IN ('pending', 'failed') AND workspace_id = ? LIMIT 1").get(workspaceId)
      if (unsynced) throw new Error(`Workspace ${workspaceId} has unsynced operations`)
      const existingPages = this.database.prepare('SELECT document FROM pages').all() as { document: string }[]
      const currentPages = existingPages.map(({ document }) => JSON.parse(document) as LocalPageRecord)
      const existingBlocks = this.database.prepare('SELECT document FROM blocks').all() as { document: string }[]
      const currentBlocks = existingBlocks.map(({ document }) => JSON.parse(document) as LocalBlockRecord)
      if (pages.some((page) => currentPages.some((existing) => existing.id === page.id && existing.workspaceId !== workspaceId)) ||
        blocks.some((block) => currentBlocks.some((existing) => existing.id === block.id && existing.workspaceId !== workspaceId))) {
        throw new Error('Snapshot ID belongs to another workspace')
      }
      const deleteBlock = this.database.prepare('DELETE FROM blocks WHERE id = ?')
      const deletePage = this.database.prepare('DELETE FROM pages WHERE id = ?')
      currentBlocks.filter((block) => block.workspaceId === workspaceId).forEach((block) => deleteBlock.run(block.id))
      currentPages.filter((page) => page.workspaceId === workspaceId).forEach((page) => deletePage.run(page.id))
      const insertPage = this.database.prepare('INSERT INTO pages (id, document) VALUES (?, ?)')
      pages.forEach((page) => insertPage.run(page.id, JSON.stringify(page)))
      const insertBlock = this.database.prepare('INSERT INTO blocks (id, page_id, order_key, document) VALUES (?, ?, ?, ?)')
      blocks.forEach((block) => insertBlock.run(block.id, block.pageId, block.orderKey, JSON.stringify(block)))
      this.database.prepare("INSERT INTO metadata (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run(`snapshot:${workspaceId}`)
    })
  }

  async deletePage(workspaceId: string, id: string): Promise<void> {
    this.transaction(() => {
      const row = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(id) as { document: string } | undefined
      const page = row ? JSON.parse(row.document) as LocalPageRecord : undefined
      if (page && page.workspaceId !== workspaceId) throw new Error(`Page ${id} belongs to a different workspace`)
      const pages = this.database.prepare('SELECT document FROM pages').all() as { document: string }[]
      if (pages.some(({ document }) => {
        const candidate = JSON.parse(document) as LocalPageRecord
        return candidate.workspaceId === workspaceId && candidate.parentPageId === id
      })) throw new Error(`Page ${id} has child pages`)
      const blocks = this.database.prepare('SELECT document FROM blocks WHERE page_id = ?').all(id) as { document: string }[]
      const operationId = this.appendOperation({ kind: 'page.delete', workspaceId, payload: { id } })
      for (const { document } of blocks) {
        const block = JSON.parse(document) as LocalBlockRecord
        if (block.workspaceId !== workspaceId) throw new Error(`Page ${id} contains blocks from a different workspace`)
        this.enqueueCleanup(workspaceId, getAttachmentFileId(block), operationId)
      }
      this.database.prepare('DELETE FROM pages WHERE id = ?').run(id)
    })
  }

  async getBlock(id: string): Promise<LocalBlockRecord | undefined> {
    const row = this.database.prepare('SELECT document FROM blocks WHERE id = ?').get(id) as
      | { document: string }
      | undefined
    return row ? JSON.parse(row.document) as LocalBlockRecord : undefined
  }

  async listBlocksByPage(pageId: string): Promise<LocalBlockRecord[]> {
    const rows = this.database.prepare('SELECT document FROM blocks WHERE page_id = ? ORDER BY order_key, id')
      .all(pageId) as { document: string }[]
    return rows.map((row) => JSON.parse(row.document) as LocalBlockRecord)
  }

  async upsertBlock(block: LocalBlockRecord): Promise<void> {
    this.transaction(() => {
      const pageRow = this.database.prepare('SELECT document FROM pages WHERE id = ?').get(block.pageId) as { document: string } | undefined
      const page = pageRow ? JSON.parse(pageRow.document) as LocalPageRecord : undefined
      if (!page) throw new Error(`Page ${block.pageId} does not exist`)
      if (page.workspaceId !== block.workspaceId) throw new Error(`Page ${block.pageId} belongs to a different workspace`)
      const existingRow = this.database.prepare('SELECT document FROM blocks WHERE id = ?').get(block.id) as { document: string } | undefined
      const existing = existingRow ? JSON.parse(existingRow.document) as LocalBlockRecord : undefined
      if (existing && (existing.workspaceId !== block.workspaceId || existing.pageId !== block.pageId || (existing.parentBlockId ?? null) !== (block.parentBlockId ?? null))) {
        throw new Error(`Block ${block.id} workspace, page, and parent are immutable`)
      }
      if (block.parentBlockId) {
        const parentRow = this.database.prepare('SELECT document FROM blocks WHERE id = ?').get(block.parentBlockId) as { document: string } | undefined
        const parent = parentRow ? JSON.parse(parentRow.document) as LocalBlockRecord : undefined
        if (!parent || parent.pageId !== block.pageId || parent.workspaceId !== block.workspaceId) throw new Error(`Parent block ${block.parentBlockId} is unavailable in this workspace page`)
      }
      this.database.prepare(`
        INSERT INTO blocks (id, page_id, order_key, document) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          page_id = excluded.page_id, order_key = excluded.order_key, document = excluded.document
      `).run(block.id, block.pageId, block.orderKey, JSON.stringify(block))
      const { id, workspaceId, pageId, parentBlockId, type, orderKey, props } = block
      const operationId = this.appendOperation({ kind: 'block.upsert', workspaceId, payload: { id, pageId, parentBlockId: parentBlockId ?? null, type, orderKey, props } })
      const oldFileId = existing ? getAttachmentFileId(existing) : undefined
      if (oldFileId && oldFileId !== getAttachmentFileId(block)) this.enqueueCleanup(workspaceId, oldFileId, operationId)
    })
  }

  async deleteBlock(workspaceId: string, id: string): Promise<void> {
    this.transaction(() => {
      const row = this.database.prepare('SELECT document FROM blocks WHERE id = ?').get(id) as { document: string } | undefined
      const block = row ? JSON.parse(row.document) as LocalBlockRecord : undefined
      if (block && block.workspaceId !== workspaceId) throw new Error(`Block ${id} belongs to a different workspace`)
      if (block) {
        const siblings = this.database.prepare('SELECT document FROM blocks WHERE page_id = ?').all(block.pageId) as { document: string }[]
        if (siblings.some(({ document }) => {
          const candidate = JSON.parse(document) as LocalBlockRecord
          return candidate.workspaceId === workspaceId && candidate.parentBlockId === id
        })) throw new Error(`Block ${id} has child blocks`)
      }
      const operationId = this.appendOperation({ kind: 'block.delete', workspaceId, payload: { id } })
      if (block) this.enqueueCleanup(workspaceId, getAttachmentFileId(block), operationId)
      this.database.prepare('DELETE FROM blocks WHERE id = ?').run(id)
    })
  }

  async getPendingOperations(): Promise<StorageOperation[]> {
    const rows = this.database.prepare(`
      SELECT id, client_id, sequence, workspace_id, kind, target_type, target_id, payload, created_at, status
      FROM operations WHERE status IN ('pending', 'failed') ORDER BY sequence
    `).all() as Array<{
      id: string; client_id: string; sequence: number; workspace_id: string | null; kind: OperationKind
      target_type: 'page' | 'block'; target_id: string; payload: string | null
      created_at: string; status: StorageOperation['status']
    }>
    return rows.map((row) => (row.workspace_id === null
      ? {
          id: row.id, clientId: row.client_id, sequence: row.sequence, kind: row.kind,
          target: { type: row.target_type, id: row.target_id },
          payload: row.payload === null ? null : JSON.parse(row.payload),
          createdAt: row.created_at, status: row.status,
        }
      : {
          id: row.id, clientId: row.client_id, sequence: row.sequence, workspaceId: row.workspace_id,
          kind: row.kind, payload: JSON.parse(row.payload!), createdAt: row.created_at, status: row.status,
        }) as unknown as StorageOperation)
  }

  async markOperationSynced(id: string): Promise<void> {
    this.database.prepare("UPDATE operations SET status = 'synced' WHERE id = ?").run(id)
  }

  async markOperationFailed(id: string): Promise<void> {
    this.database.prepare("UPDATE operations SET status = 'failed' WHERE id = ? AND status != 'synced'").run(id)
  }

  async enqueueFileCleanup(workspaceId: string, fileId: string): Promise<void> {
    this.enqueueCleanup(workspaceId, fileId)
  }

  async listFileCleanups(): Promise<FileCleanupTask[]> {
    const rows = this.database.prepare(`
      SELECT workspace_id, file_id, created_at, source_operation_id, last_error
      FROM file_cleanups ORDER BY created_at, workspace_id, file_id
    `).all() as Array<{ workspace_id: string; file_id: string; created_at: string; source_operation_id: string | null; last_error: string | null }>
    return rows.map((row) => ({
      workspaceId: row.workspace_id, fileId: row.file_id, createdAt: row.created_at,
      ...(row.source_operation_id ? { sourceOperationId: row.source_operation_id } : {}),
      ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    }))
  }

  async listReadyFileCleanups(): Promise<FileCleanupTask[]> {
    const rows = this.database.prepare(`
      SELECT workspace_id, file_id, created_at, source_operation_id, last_error
      FROM file_cleanups ORDER BY created_at, workspace_id, file_id
    `).all() as Array<{ workspace_id: string; file_id: string; created_at: string; source_operation_id: string | null; last_error: string | null }>
    const tasks = rows.map((row) => ({
      workspaceId: row.workspace_id, fileId: row.file_id, createdAt: row.created_at,
      ...(row.source_operation_id ? { sourceOperationId: row.source_operation_id } : {}),
      ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    }))
    const blocks = (this.database.prepare('SELECT document FROM blocks').all() as { document: string }[])
      .map(({ document }) => JSON.parse(document) as LocalBlockRecord)
    return tasks.filter((task) => {
      if (task.sourceOperationId) {
        const operation = this.database.prepare('SELECT status, workspace_id FROM operations WHERE id = ?').get(task.sourceOperationId) as { status: string; workspace_id: string | null } | undefined
        if (!operation || operation.status !== 'synced' || operation.workspace_id !== task.workspaceId) return false
      }
      return !blocks.some((block) => block.workspaceId === task.workspaceId && getAttachmentFileId(block) === task.fileId)
    })
  }

  async completeFileCleanup(workspaceId: string, fileId: string): Promise<void> {
    this.database.prepare('DELETE FROM file_cleanups WHERE workspace_id = ? AND file_id = ?').run(workspaceId, fileId)
  }

  async failFileCleanup(workspaceId: string, fileId: string, error: string): Promise<void> {
    this.database.prepare('UPDATE file_cleanups SET last_error = ? WHERE workspace_id = ? AND file_id = ?').run(error, workspaceId, fileId)
  }
}

function getAttachmentFileId(block: LocalBlockRecord): string | undefined {
  if (block.type !== 'image' && block.type !== 'file') return undefined
  const props = block.props as { node?: { attrs?: { fileId?: unknown } } }
  const fileId = props.node?.attrs?.fileId
  return typeof fileId === 'string' && fileId.length > 0 ? fileId : undefined
}
