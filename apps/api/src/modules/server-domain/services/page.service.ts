import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import type { ClientSession, Connection } from 'mongoose'
import type { PageRecord } from '../types'

import { PagePatch, PageRepository } from '../repositories/page.repository'
import { BlockRepository } from '../repositories/block.repository'
import { WorkspacePermissionService } from './workspace-permission.service'
import { supportsTransactions } from './mongo-transactions'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }

@Injectable()
export class PageService {
  constructor(private readonly pages: PageRepository, private readonly permissions: WorkspacePermissionService, private readonly blocks: BlockRepository, @InjectConnection() private readonly connection: Connection) {}

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
    return this.pages.listByWorkspace(workspaceId, session)
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
    return this.pages.updateInWorkspace(workspaceId, id, patch, session)
  }

  async updateDocumentVersion(userId: string, workspaceId: string, pageId: string, expectedUpdatedAt: string, title?: string, session?: ClientSession): Promise<PageRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const updated = await this.pages.compareAndUpdate(workspaceId, pageId, expectedUpdatedAt, title === undefined ? {} : { title }, session)
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
      await this.pages.updateSnapshot(workspaceId, input.id, input, session)
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
}
