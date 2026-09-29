import { BadRequestException, Injectable } from '@nestjs/common'
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

  async list(userId: string, workspaceId: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.pages.listByWorkspace(workspaceId)
  }

  async update(userId: string, workspaceId: string, id: string, patch: PagePatch, session?: ClientSession): Promise<PageRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentPageId' in patch) throw new BadRequestException('Moving a page is not supported yet')
    return this.pages.updateInWorkspace(workspaceId, id, patch, session)
  }

  async upsertSnapshot(userId: string, workspaceId: string, input: { id: string; parentPageId: string | null; title: string; icon: string | null; orderKey: string }, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    const existing = await this.pages.findInWorkspace(workspaceId, input.id, session)
    if (existing) {
      if (existing.parentPageId !== input.parentPageId) throw new BadRequestException('Moving a page is not supported yet')
      await this.pages.updateSnapshot(workspaceId, input.id, input, session)
      return
    }
    await this.create(userId, workspaceId, { ...input, ...(input.icon === null ? { icon: undefined } : { icon: input.icon }) }, session)
  }

  async delete(userId: string, workspaceId: string, id: string, session: ClientSession): Promise<void> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (await this.pages.hasChildren(workspaceId, id, session)) throw new BadRequestException('Delete child pages first')
    await this.blocks.deleteByPage(workspaceId, id, session)
    await this.pages.deleteInWorkspace(workspaceId, id, session)
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
