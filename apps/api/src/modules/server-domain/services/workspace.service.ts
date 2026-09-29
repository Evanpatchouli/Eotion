import { Injectable, NotFoundException } from '@nestjs/common'
import type { WorkspaceRecord } from '../types'

import { WorkspaceRepository } from '../repositories/workspace.repository'
import { UserRepository } from '../repositories/user.repository'
import { WorkspacePermissionService } from './workspace-permission.service'

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly users: UserRepository,
    private readonly permissions: WorkspacePermissionService,
  ) {}

  async create(userId: string, input: Pick<WorkspaceRecord, 'id' | 'name'>) {
    if (!(await this.users.existsById(userId))) throw new NotFoundException('User not found')
    return this.workspaces.create({ ...input, ownerId: userId })
  }

  async findById(userId: string, id: string) {
    await this.permissions.assertCanRead(userId, id)
    return this.workspaces.findById(id)
  }

  async listByOwner(userId: string) {
    if (!(await this.users.existsById(userId))) throw new NotFoundException('User not found')
    return this.workspaces.listByOwner(userId)
  }

  async updateName(userId: string, id: string, name: string) {
    await this.permissions.assertCanWrite(userId, id)
    return this.workspaces.updateOwned(id, userId, { name })
  }
}
