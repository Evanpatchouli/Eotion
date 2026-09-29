import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { PageRecord } from '../types'

import { PagePatch, PageRepository } from '../repositories/page.repository'
import { WorkspaceRepository } from '../repositories/workspace.repository'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }

@Injectable()
export class PageService {
  constructor(private readonly pages: PageRepository, private readonly workspaces: WorkspaceRepository) {}

  async create(workspaceId: string, input: PageCreate): Promise<PageRecord> {
    if (!(await this.workspaces.findById(workspaceId))) throw new NotFoundException('Workspace not found')
    if (input.parentPageId === input.id) throw new BadRequestException('A page cannot be its own parent')
    await this.assertParentInWorkspace(workspaceId, input.parentPageId)
    return this.pages.create(workspaceId, input)
  }

  find(workspaceId: string, id: string) {
    return this.pages.findInWorkspace(workspaceId, id)
  }

  list(workspaceId: string) {
    return this.pages.listByWorkspace(workspaceId)
  }

  async update(workspaceId: string, id: string, patch: PagePatch): Promise<PageRecord | null> {
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
