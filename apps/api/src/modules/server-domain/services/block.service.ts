import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import type { ServerBlockRecord } from '../types'
import type { ClientSession, Connection } from 'mongoose'

import { BlockPatch, BlockRepository } from '../repositories/block.repository'
import { PageRepository } from '../repositories/page.repository'
import { WorkspacePermissionService } from './workspace-permission.service'
import { supportsTransactions } from './mongo-transactions'

type BlockCreate = Omit<ServerBlockRecord, 'workspaceId' | 'createdAt' | 'updatedAt'>

@Injectable()
export class BlockService {
  constructor(
    private readonly blocks: BlockRepository,
    private readonly pages: PageRepository,
    private readonly permissions: WorkspacePermissionService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(userId: string, workspaceId: string, pageId: string, input: BlockCreate, session?: ClientSession): Promise<ServerBlockRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (input.pageId !== pageId) throw new BadRequestException('Block pageId does not match the target page')
    if (!session && !(await supportsTransactions(this.connection))) {
      if (!(await this.pages.findInWorkspace(workspaceId, pageId))) throw new NotFoundException('Page not found in workspace')
      const parentBlockId = input.parentBlockId ?? null
      if (parentBlockId !== null) {
        const parent = await this.blocks.findInWorkspace(workspaceId, parentBlockId)
        if (!parent || parent.pageId !== pageId) throw new BadRequestException('Parent block must belong to the same page and workspace')
      }
      return this.blocks.create(workspaceId, input)
    }
    if (!session) {
      const ownSession = await this.connection.startSession()
      try {
        let created: ServerBlockRecord | undefined
        await ownSession.withTransaction(async () => { created = await this.createInSession(workspaceId, pageId, input, ownSession) })
        return created!
      } finally {
        await ownSession.endSession()
      }
    }
    return this.createInSession(workspaceId, pageId, input, session)
  }

  async find(userId: string, workspaceId: string, pageId: string, id: string, session?: ClientSession): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const page = await this.pages.findInWorkspace(workspaceId, pageId, session)
    if (!page) return null
    const block = await this.blocks.findInWorkspace(workspaceId, id, session)
    return block?.pageId === pageId ? block : null
  }

  async list(userId: string, workspaceId: string, pageId: string): Promise<ServerBlockRecord[]> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const page = await this.pages.findInWorkspace(workspaceId, pageId)
    if (!page) return []
    return this.blocks.listByPage(workspaceId, pageId)
  }

  async update(userId: string, workspaceId: string, pageId: string, id: string, patch: BlockPatch, session?: ClientSession): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentBlockId' in patch) throw new BadRequestException('Moving a block is not supported yet')
    const page = await this.pages.findInWorkspace(workspaceId, pageId, session)
    if (!page) return null
    return this.blocks.updateInWorkspace(workspaceId, pageId, id, patch, session)
  }

  async upsertSnapshot(userId: string, workspaceId: string, input: BlockCreate, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.blocks.findInWorkspace(workspaceId, input.id, session)
    if (existing) {
      if (existing.pageId !== input.pageId || (existing.parentBlockId ?? null) !== (input.parentBlockId ?? null)) throw new BadRequestException('Moving a block is not supported yet')
      if (!(await this.pages.findInWorkspace(workspaceId, input.pageId, session))) throw new NotFoundException('Page not found in workspace')
      await this.blocks.updateInWorkspace(workspaceId, input.pageId, input.id, { type: input.type, orderKey: input.orderKey, props: input.props }, session)
      return
    }
    await this.create(userId, workspaceId, input.pageId, input, session)
  }

  async delete(userId: string, workspaceId: string, id: string, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.blocks.findInWorkspace(workspaceId, id, session)
    if (!existing) return
    if (await this.blocks.hasChildren(workspaceId, existing.pageId, id, session)) throw new BadRequestException('Delete child blocks first')
    await this.blocks.deleteInWorkspace(workspaceId, existing.pageId, id, session)
  }

  /** HTTP deletion is page-scoped and reports a missing block to the controller. */
  async deleteFromPage(userId: string, workspaceId: string, pageId: string, id: string): Promise<boolean> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (!(await supportsTransactions(this.connection))) return this.deleteFromPageInSession(workspaceId, pageId, id)
    const session = await this.connection.startSession()
    try {
      let deleted = false
      await session.withTransaction(async () => { deleted = await this.deleteFromPageInSession(workspaceId, pageId, id, session) })
      return deleted
    } finally {
      await session.endSession()
    }
  }

  private async deleteFromPageInSession(workspaceId: string, pageId: string, id: string, session?: ClientSession): Promise<boolean> {
    const existing = await this.blocks.findInWorkspace(workspaceId, id, session)
    if (!existing || existing.pageId !== pageId) return false
    if (session && !(await this.blocks.touchStructure(workspaceId, pageId, id, session))) return false
    if (await this.blocks.hasChildren(workspaceId, pageId, id, session)) throw new BadRequestException('Delete child blocks first')
    return this.blocks.deleteInWorkspace(workspaceId, pageId, id, session)
  }

  private async createInSession(workspaceId: string, pageId: string, input: BlockCreate, session: ClientSession): Promise<ServerBlockRecord> {
    if (!(await this.pages.touchStructure(workspaceId, pageId, session))) throw new NotFoundException('Page not found in workspace')
    const parentBlockId = input.parentBlockId ?? null
    if (parentBlockId !== null && !(await this.blocks.touchStructure(workspaceId, pageId, parentBlockId, session))) {
      throw new BadRequestException('Parent block must belong to the same page and workspace')
    }
    return this.blocks.create(workspaceId, input, session)
  }
}
