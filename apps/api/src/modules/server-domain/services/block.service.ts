import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { BLOCK_TYPES, blockCapability, isAllowedChildBlockType, parentRejection, parentRejectionMessage, validateBlockProps } from '@eotion/domain'
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
    if (!validateBlockProps(input.type, input.props)) throw new BadRequestException('Invalid block attributes')
    if (!session && !(await supportsTransactions(this.connection))) {
      if (!(await this.pages.findInWorkspace(workspaceId, pageId))) throw new NotFoundException('Page not found in workspace')
      const parentBlockId = input.parentBlockId ?? null
      if (parentBlockId !== null) {
        const parent = await this.blocks.findInWorkspace(workspaceId, parentBlockId)
        if (!parent || parent.pageId !== pageId) throw new BadRequestException('Parent block must belong to the same page and workspace')
        if (!isAllowedChildBlockType(parent.type, input.type)) throw new BadRequestException('Parent block type does not support child blocks')
      }
      if (!(await this.pages.touchStructure(workspaceId, pageId))) throw new NotFoundException('Page not found in workspace')
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

  async list(userId: string, workspaceId: string, pageId: string, session?: ClientSession): Promise<ServerBlockRecord[]> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const page = await this.pages.findInWorkspace(workspaceId, pageId, session)
    if (!page) return []
    return this.blocks.listByPage(workspaceId, pageId, undefined, session)
  }

  async listBounded(userId: string, workspaceId: string, pageId: string, maxBlocks: number, session?: ClientSession): Promise<ServerBlockRecord[]> {
    if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > 1000) throw new BadRequestException('maxBlocks must be an integer between 1 and 1000')
    await this.permissions.assertCanRead(userId, workspaceId)
    if (!(await this.pages.findInWorkspace(workspaceId, pageId, session))) throw new NotFoundException('Page not found')
    const blocks = await this.blocks.listByPage(workspaceId, pageId, maxBlocks + 1, session)
    if (blocks.length > maxBlocks) throw new BadRequestException('Page exceeds the maximum block count')
    return blocks
  }

  async listByWorkspace(userId: string, workspaceId: string): Promise<ServerBlockRecord[]> {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.blocks.listByWorkspace(workspaceId)
  }

  async update(userId: string, workspaceId: string, pageId: string, id: string, patch: BlockPatch, session?: ClientSession): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentBlockId' in patch) throw new BadRequestException('Moving a block is not supported yet')
    if (!session && await supportsTransactions(this.connection)) {
      const ownSession = await this.connection.startSession()
      try {
        let updated: ServerBlockRecord | null = null
        await ownSession.withTransaction(async () => { updated = await this.update(userId, workspaceId, pageId, id, patch, ownSession) })
        return updated
      } finally {
        await ownSession.endSession()
      }
    }
    const page = await this.pages.findInWorkspace(workspaceId, pageId, session)
    if (!page) return null
    const existing = await this.blocks.findInWorkspace(workspaceId, id, session)
    if (!existing || existing.pageId !== pageId) return null
    if (!validateBlockProps(patch.type ?? existing.type, patch.props ?? existing.props)) {
      throw new BadRequestException('Invalid block attributes')
    }
    const targetType = patch.type
    if (targetType !== undefined && targetType !== existing.type) {
      const capability = blockCapability(targetType)
      if (!capability.allowsChildren) {
        if (await this.blocks.hasChildren(workspaceId, pageId, id, session)) {
          throw new BadRequestException('Block type does not support its existing child blocks')
        }
      } else if (!BLOCK_TYPES.every((type) => capability.allowedChildTypes.includes(type))) {
        const children = (await this.blocks.listByPage(workspaceId, pageId, undefined, session))
          .filter((block) => block.parentBlockId === id)
        if (children.some((child) => !isAllowedChildBlockType(targetType, child.type))) {
          throw new BadRequestException('Block type does not support its existing child blocks')
        }
      }
    }
    const updated = await this.blocks.updateInWorkspace(workspaceId, pageId, id, patch, session)
    if (updated && !(await this.pages.touchStructure(workspaceId, pageId, session))) throw new NotFoundException('Page not found in workspace')
    return updated
  }

  async move(userId: string, workspaceId: string, pageId: string, id: string, parentBlockId: string | null, orderKey: string, session?: ClientSession): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (!session && await supportsTransactions(this.connection)) {
      const ownSession = await this.connection.startSession()
      try {
        let moved: ServerBlockRecord | null = null
        await ownSession.withTransaction(async () => { moved = await this.move(userId, workspaceId, pageId, id, parentBlockId, orderKey, ownSession) })
        return moved
      } finally {
        await ownSession.endSession()
      }
    }
    const page = await this.pages.findInWorkspace(workspaceId, pageId, session)
    if (!page) return null
    const pageBlocks = await this.blocks.listByPage(workspaceId, pageId, undefined, session)
    const existing = pageBlocks.find((block) => block.id === id)
    if (!existing) return null
    const rejection = parentRejection(pageBlocks, id, parentBlockId, pageId)
    if (rejection !== null) throw new BadRequestException(parentRejectionMessage(rejection, id, parentBlockId ?? ''))
    if (parentBlockId !== null) {
      const parent = pageBlocks.find((block) => block.id === parentBlockId)
      if (!parent || !isAllowedChildBlockType(parent.type, existing.type)) throw new BadRequestException('Parent block type does not support child blocks')
    }
    const moved = await this.blocks.moveInWorkspace(workspaceId, pageId, id, parentBlockId, orderKey, session)
    if (!moved) return null
    if (!(await this.pages.touchStructure(workspaceId, pageId, session))) throw new NotFoundException('Page not found in workspace')
    // Refresh the structure fence of both ends of the moved link so clients see the change.
    if (session) {
      if (existing.parentBlockId) await this.blocks.touchStructure(workspaceId, pageId, existing.parentBlockId, session)
      if (parentBlockId) await this.blocks.touchStructure(workspaceId, pageId, parentBlockId, session)
    }
    return moved
  }

  async upsertSnapshot(userId: string, workspaceId: string, input: BlockCreate, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.blocks.findInWorkspace(workspaceId, input.id, session)
    if (existing) {
      if (existing.pageId !== input.pageId || (existing.parentBlockId ?? null) !== (input.parentBlockId ?? null)) throw new BadRequestException('Moving a block is not supported yet')
      if (!(await this.pages.findInWorkspace(workspaceId, input.pageId, session))) throw new NotFoundException('Page not found in workspace')
      await this.update(userId, workspaceId, input.pageId, input.id, { type: input.type, orderKey: input.orderKey, props: input.props }, session)
      return
    }
    await this.create(userId, workspaceId, input.pageId, input, session)
  }

  async delete(userId: string, workspaceId: string, id: string, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.blocks.findInWorkspace(workspaceId, id, session)
    if (!existing) return
    if (await this.blocks.hasChildren(workspaceId, existing.pageId, id, session)) throw new BadRequestException('Delete child blocks first')
    if (!(await this.pages.touchStructure(workspaceId, existing.pageId, session))) throw new NotFoundException('Page not found in workspace')
    if (existing.parentBlockId && !(await this.blocks.touchStructure(workspaceId, existing.pageId, existing.parentBlockId, session))) throw new BadRequestException('Parent block must belong to the same page and workspace')
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
    if (await this.blocks.hasChildren(workspaceId, pageId, id, session)) throw new BadRequestException('Delete child blocks first')
    if (!(await this.pages.touchStructure(workspaceId, pageId, session))) return false
    if (session && !(await this.blocks.touchStructure(workspaceId, pageId, id, session))) return false
    if (existing.parentBlockId && session && !(await this.blocks.touchStructure(workspaceId, pageId, existing.parentBlockId, session))) throw new BadRequestException('Parent block must belong to the same page and workspace')
    return this.blocks.deleteInWorkspace(workspaceId, pageId, id, session)
  }

  private async createInSession(workspaceId: string, pageId: string, input: BlockCreate, session: ClientSession): Promise<ServerBlockRecord> {
    if (!(await this.pages.touchStructure(workspaceId, pageId, session))) throw new NotFoundException('Page not found in workspace')
    const parentBlockId = input.parentBlockId ?? null
    if (parentBlockId !== null) {
      const parent = await this.blocks.findInWorkspace(workspaceId, parentBlockId, session)
      if (!parent || parent.pageId !== pageId) throw new BadRequestException('Parent block must belong to the same page and workspace')
      if (!isAllowedChildBlockType(parent.type, input.type)) throw new BadRequestException('Parent block type does not support child blocks')
      await this.blocks.touchStructure(workspaceId, pageId, parentBlockId, session)
    }
    return this.blocks.create(workspaceId, input, session)
  }
}
