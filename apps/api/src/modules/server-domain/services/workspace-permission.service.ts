import { Injectable, NotFoundException } from '@nestjs/common'

import { WorkspaceRepository } from '../repositories/workspace.repository'

@Injectable()
export class WorkspacePermissionService {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  async canRead(userId: string, workspaceId: string): Promise<boolean> {
    const workspace = await this.workspaces.findById(workspaceId)
    return workspace?.ownerId === userId
  }

  canWrite(userId: string, workspaceId: string): Promise<boolean> {
    return this.canRead(userId, workspaceId)
  }

  async assertCanRead(userId: string, workspaceId: string): Promise<void> {
    if (!(await this.canRead(userId, workspaceId))) throw new NotFoundException('Workspace not found')
  }

  async assertCanWrite(userId: string, workspaceId: string): Promise<void> {
    if (!(await this.canWrite(userId, workspaceId))) throw new NotFoundException('Workspace not found')
  }
}
