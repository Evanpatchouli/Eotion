import { BadRequestException, Injectable } from '@nestjs/common'
import type { PageRecord } from '../types'

import { PagePatch, PageRepository } from '../repositories/page.repository'
import { WorkspacePermissionService } from './workspace-permission.service'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }

@Injectable()
export class PageService {
  constructor(private readonly pages: PageRepository, private readonly permissions: WorkspacePermissionService) {}

  async create(userId: string, workspaceId: string, input: PageCreate): Promise<PageRecord> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (input.parentPageId === input.id) throw new BadRequestException('A page cannot be its own parent')
    await this.assertParentInWorkspace(workspaceId, input.parentPageId)
    return this.pages.create(workspaceId, input)
  }

  async find(userId: string, workspaceId: string, id: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.pages.findInWorkspace(workspaceId, id)
  }

  async list(userId: string, workspaceId: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.pages.listByWorkspace(workspaceId)
  }

  async update(userId: string, workspaceId: string, id: string, patch: PagePatch): Promise<PageRecord | null> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if ('parentPageId' in patch) throw new BadRequestException('Moving a page is not supported yet')
    return this.pages.updateInWorkspace(workspaceId, id, patch)
  }

  private async assertParentInWorkspace(workspaceId: string, parentPageId: string | null): Promise<void> {
    if (parentPageId === null) return
    if (!(await this.pages.findInWorkspace(workspaceId, parentPageId))) {
      throw new BadRequestException('Parent page must belong to the same workspace')
    }
  }
}
