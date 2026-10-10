import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import type { ClientSession, Connection } from 'mongoose'
import type { PageRecord } from '../types'

import { PagePatch, PageRepository } from '../repositories/page.repository'
import { BlockRepository } from '../repositories/block.repository'
import { DatabaseRecordRepository, DatabaseRepository } from '../repositories/database.repository'
import { WorkspacePermissionService } from './workspace-permission.service'
import { supportsTransactions } from './mongo-transactions'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }

@Injectable()
export class PageService {
  constructor(private readonly pages: PageRepository, private readonly permissions: WorkspacePermissionService, private readonly blocks: BlockRepository, private readonly records: DatabaseRecordRepository, private readonly databases: DatabaseRepository, @InjectConnection() private readonly connection: Connection) {}

  async create(userId: string, workspaceId: string, input: PageCreate, session?: ClientSession): Promise<PageRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (input.parentPageId === input.id) throw new BadRequestException('A page cannot be its own parent')
    if (!session && !(await supportsTransactions(this.connection))) {
      if (input.parentPageId !== null && !(await this.pages.findInWorkspace(workspaceId, input.parentPageId))) {
        throw new BadRequestException('Parent page must belong to the same workspace')
      }
      return this.pages.create(workspaceId, input)
    }
    if (!session && input.parentPageId !== null) {
      const ownSession = await this.connection.startSession()
      try {
        let created: PageRecord | undefined
        await ownSession.withTransaction(async () => { created = await this.createInSession(workspaceId, input, ownSession) })
        return created!
      } finally {
        await ownSession.endSession()
      }
    }
    return this.createInSession(workspaceId, input, session)
  }

  async find(userId: string, workspaceId: string, id: string, session?: ClientSession) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.pages.findInWorkspace(workspaceId, id, session)
  }

  async list(userId: string, workspaceId: string, session?: ClientSession) {
    await this.permissions.assertCanRead(userId, workspaceId)
    const [pages, recordPageIds] = await Promise.all([this.pages.listByWorkspace(workspaceId, session), this.records.listPageIdsInWorkspace(workspaceId, session)])
    const legacyRecordPages = new Set(recordPageIds)
    return pages.map(page => page.role === 'database-record' || !legacyRecordPages.has(page.id) ? page : { ...page, role: 'database-record' as const })
  }

  async listNavigation(userId: string, workspaceId: string, session?: ClientSession) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.pages.listNavigationByWorkspace(workspaceId, session)
  }

  async listWindow(userId: string, workspaceId: string, input: { cursor?: string; limit: number; query?: string }, session?: ClientSession): Promise<{ items: PageRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new BadRequestException('Limit must be an integer between 1 and 100')
    if (input.cursor !== undefined && (input.cursor.length === 0 || input.cursor.length > 128)) throw new BadRequestException('Cursor must contain 1 to 128 characters')
    const query = input.query?.trim()
    if (input.query !== undefined && (!query || query.length > 200)) throw new BadRequestException('Query must contain 1 to 200 non-whitespace characters')

    await this.permissions.assertCanRead(userId, workspaceId)
    const rows = await this.pages.listWindow(workspaceId, { cursor: input.cursor, limit: input.limit, ...(query === undefined ? {} : { query }) }, session)
    const hasMore = rows.length > input.limit
    const items = hasMore ? rows.slice(0, input.limit) : rows
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null }
  }

  async findAccessible(userId: string, pageId: string, session?: ClientSession): Promise<PageRecord> {
    const page = await this.pages.findById(pageId, session)
    if (!page) throw new NotFoundException('Page not found')
    try {
      await this.permissions.assertCanRead(userId, page.workspaceId)
    } catch (error) {
      if (error instanceof NotFoundException) throw new NotFoundException('Page not found')
      throw error
    }
    return page
  }

  async update(userId: string, workspaceId: string, id: string, patch: PagePatch, session?: ClientSession): Promise<PageRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentPageId' in patch) throw new BadRequestException('Moving a page is not supported here; use the move endpoint')
    if (patch.title !== undefined) {
      return this.updateTitleWithDatabaseFence(workspaceId, id, session, (activeSession, expectedUpdatedAt) => this.pages.updateInWorkspace(workspaceId, id, patch, activeSession, expectedUpdatedAt))
    }
    return this.pages.updateInWorkspace(workspaceId, id, patch, session)
  }

  async updateDocumentVersion(userId: string, workspaceId: string, pageId: string, expectedUpdatedAt: string, title?: string, session?: ClientSession): Promise<PageRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const update = (activeSession?: ClientSession) => this.pages.compareAndUpdate(workspaceId, pageId, expectedUpdatedAt, title === undefined ? {} : { title }, activeSession)
    const updated = title === undefined ? await update(session) : await this.updateTitleWithDatabaseFence(workspaceId, pageId, session, update)
    if (!updated) throw new ConflictException('Page has changed since it was read. Read the page again before updating.')
    return updated
  }

  /**
   * Reparents a page and places it at the end of its new sibling list.
   *
   * The new parent must live in the same workspace, cannot be the page itself and
   * cannot be one of its descendants; these invariants are enforced here rather
   * than in the HTTP layer or the UI.
   */
  async move(userId: string, workspaceId: string, id: string, input: { parentPageId: string | null; orderKey: string }, session?: ClientSession): Promise<PageRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (session || !(await supportsTransactions(this.connection))) return this.moveInWorkspace(workspaceId, id, input, session)
    const ownSession = await this.connection.startSession()
    try {
      let moved: PageRecord | null = null
      await ownSession.withTransaction(async () => { moved = await this.moveInWorkspace(workspaceId, id, input, ownSession) })
      return moved
    } finally {
      await ownSession.endSession()
    }
  }

  async upsertSnapshot(userId: string, workspaceId: string, input: { id: string; parentPageId: string | null; title: string; icon: string | null; orderKey: string }, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.pages.findInWorkspace(workspaceId, input.id, session)
    if (existing) {
      if (existing.parentPageId !== input.parentPageId) throw new BadRequestException('Move the page through the move endpoint to change its parent')
      await this.updateTitleWithDatabaseFence(workspaceId, input.id, session, activeSession => this.pages.updateSnapshot(workspaceId, input.id, input, activeSession!))
      return
    }
    await this.create(userId, workspaceId, { ...input, ...(input.icon === null ? { icon: undefined } : { icon: input.icon }) }, session)
  }

  /** Deletes a leaf page together with its blocks. A page with child pages is rejected. */
  async delete(userId: string, workspaceId: string, id: string, session?: ClientSession): Promise<boolean> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (session || !(await supportsTransactions(this.connection))) return this.deleteLeaf(workspaceId, id, session)
    const ownSession = await this.connection.startSession()
    try {
      let deleted = false
      await ownSession.withTransaction(async () => { deleted = await this.deleteLeaf(workspaceId, id, ownSession) })
      return deleted
    } finally {
      await ownSession.endSession()
    }
  }

  private async moveInWorkspace(workspaceId: string, id: string, input: { parentPageId: string | null; orderKey: string }, session?: ClientSession): Promise<PageRecord | null> {
    const page = await this.pages.findInWorkspace(workspaceId, id, session)
    if (!page) return null
    if (input.parentPageId === id) throw new BadRequestException('A page cannot be its own parent')
    if (input.parentPageId !== null) {
      if (!(await this.pages.findInWorkspace(workspaceId, input.parentPageId, session))) {
        throw new BadRequestException('Parent page must belong to the same workspace')
      }
      await this.assertNotDescendant(workspaceId, id, input.parentPageId, session)
      if (session && !(await this.pages.touchStructure(workspaceId, input.parentPageId, session))) {
        throw new BadRequestException('Parent page must belong to the same workspace')
      }
    }
    return this.pages.moveInWorkspace(workspaceId, id, input, session)
  }

  /** Walks up from the candidate parent; meeting the moved page proves it is a descendant. */
  private async assertNotDescendant(workspaceId: string, id: string, candidateParentId: string, session?: ClientSession): Promise<void> {
    const visited = new Set<string>()
    let cursor: string | null = candidateParentId
    while (cursor !== null) {
      if (cursor === id) throw new BadRequestException('A page cannot be moved under its own descendant')
      if (visited.has(cursor)) return
      visited.add(cursor)
      cursor = (await this.pages.findInWorkspace(workspaceId, cursor, session))?.parentPageId ?? null
    }
  }

  private async deleteLeaf(workspaceId: string, id: string, session?: ClientSession): Promise<boolean> {
    if (await this.pages.hasChildren(workspaceId, id, session)) throw new BadRequestException('Delete child pages first')
    if (session && !(await this.pages.touchStructure(workspaceId, id, session))) return false
    if (await this.records.referencesPage(workspaceId, id, session)) throw new BadRequestException('Delete the database record before its linked page')
    await this.blocks.deleteByPage(workspaceId, id, session)
    return this.pages.deleteInWorkspace(workspaceId, id, session)
  }

  private async createInSession(workspaceId: string, input: PageCreate, session?: ClientSession): Promise<PageRecord> {
    if (input.parentPageId !== null) {
      if (!session || !(await this.pages.touchStructure(workspaceId, input.parentPageId, session))) {
        throw new BadRequestException('Parent page must belong to the same workspace')
      }
    }
    return this.pages.create(workspaceId, input, session)
  }

  /**
   * Page.title is the Database title sort key. When a Record Page title changes,
   * advance its Database version in the same transaction so existing table
   * cursors fail closed instead of continuing against a reordered result set.
   */
  private async updateTitleWithDatabaseFence<T extends PageRecord | null>(
    workspaceId: string,
    pageId: string,
    session: ClientSession | undefined,
    update: (session?: ClientSession, expectedUpdatedAt?: string) => Promise<T>,
  ): Promise<T> {
    const apply = async (activeSession?: ClientSession): Promise<T> => {
      const before = await this.pages.findInWorkspace(workspaceId, pageId, activeSession)
      const linkedRecords = await this.records.findForPage(workspaceId, pageId, activeSession)
      if (linkedRecords.length > 1) throw new ConflictException('Page is linked to multiple Database records')

      const updated = await update(activeSession)
      if (!updated || !before || before.title === updated.title || linkedRecords.length === 0) return updated

      const database = await this.databases.findInWorkspace(workspaceId, linkedRecords[0]!.databaseId, activeSession)
      if (!database) throw new ConflictException('Record Database is missing; Page title update was rolled back')
      if (!await this.databases.compareAndBump(workspaceId, database.id, database.version, activeSession!)) {
        throw new ConflictException('Database version is stale; Page title update was rolled back')
      }
      return updated
    }

    if (session) return apply(session)

    // Keep ordinary Page renames on their existing non-transactional path.
    // Read the Page before its Record link, then condition the unlinked update
    // on updatedAt: creating a Record touches that Page in its transaction, so
    // a concurrent link either becomes visible or makes this CAS fail.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.pages.findInWorkspace(workspaceId, pageId)
      const linkedRecords = await this.records.findForPage(workspaceId, pageId)
      if (linkedRecords.length > 1) throw new ConflictException('Page is linked to multiple Database records')
      if (linkedRecords.length > 0) {
        if (!(await supportsTransactions(this.connection))) {
          throw new ServiceUnavailableException('Record Page title updates require MongoDB replica set transactions')
        }
        const ownSession = await this.connection.startSession()
        try {
          let result!: T
          await ownSession.withTransaction(async () => { result = await apply(ownSession) }, { readConcern: { level: 'snapshot' } })
          return result
        } finally {
          await ownSession.endSession()
        }
      }
      if (!before) return update()
      const updated = await update(undefined, before.updatedAt)
      if (updated) return updated
    }

    throw new ConflictException('Page changed while updating its title; read it again before retrying')
  }
}
