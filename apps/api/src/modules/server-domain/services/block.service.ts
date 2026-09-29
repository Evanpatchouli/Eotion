import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { ServerBlockRecord } from '../types'

import { BlockPatch, BlockRepository } from '../repositories/block.repository'
import { PageRepository } from '../repositories/page.repository'
import { WorkspacePermissionService } from './workspace-permission.service'

type BlockCreate = Omit<ServerBlockRecord, 'workspaceId' | 'createdAt' | 'updatedAt'>

@Injectable()
export class BlockService {
  constructor(
    private readonly blocks: BlockRepository,
    private readonly pages: PageRepository,
    private readonly permissions: WorkspacePermissionService,
  ) {}

  async create(userId: string, workspaceId: string, pageId: string, input: BlockCreate): Promise<ServerBlockRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (input.pageId !== pageId) throw new BadRequestException('Block pageId does not match the target page')
    const page = await this.pages.findInWorkspace(workspaceId, pageId)
    if (!page) throw new NotFoundException('Page not found in workspace')
    await this.assertParentBlock(workspaceId, pageId, input.parentBlockId ?? null)
    return this.blocks.create(workspaceId, input)
  }

  async find(userId: string, workspaceId: string, pageId: string, id: string): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const page = await this.pages.findInWorkspace(workspaceId, pageId)
    if (!page) return null
    const block = await this.blocks.findInWorkspace(workspaceId, id)
    return block?.pageId === pageId ? block : null
  }

  async list(userId: string, workspaceId: string, pageId: string): Promise<ServerBlockRecord[]> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const page = await this.pages.findInWorkspace(workspaceId, pageId)
    if (!page) return []
    return this.blocks.listByPage(workspaceId, pageId)
  }

  async update(userId: string, workspaceId: string, pageId: string, id: string, patch: BlockPatch): Promise<ServerBlockRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentBlockId' in patch) throw new BadRequestException('Moving a block is not supported yet')
    const page = await this.pages.findInWorkspace(workspaceId, pageId)
    if (!page) return null
    return this.blocks.updateInWorkspace(workspaceId, pageId, id, patch)
  }

  private async assertParentBlock(workspaceId: string, pageId: string, parentBlockId: string | null): Promise<void> {
    if (parentBlockId === null) return
    const parent = await this.blocks.findInWorkspace(workspaceId, parentBlockId)
    if (!parent || parent.pageId !== pageId) {
      throw new BadRequestException('Parent block must belong to the same page and workspace')
    }
  }
}
