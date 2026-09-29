import { Injectable } from '@nestjs/common'
import type { WorkspaceRecord } from '../types'

import { WorkspaceRepository } from '../repositories/workspace.repository'

@Injectable()
export class WorkspaceService {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  create(input: Pick<WorkspaceRecord, 'id' | 'name' | 'ownerId'>) {
    return this.workspaces.create(input)
  }

  findById(id: string) {
    return this.workspaces.findById(id)
  }

  listByOwner(ownerId: string) {
    return this.workspaces.listByOwner(ownerId)
  }

  updateName(id: string, ownerId: string, name: string) {
    return this.workspaces.updateOwned(id, ownerId, { name })
  }
}
