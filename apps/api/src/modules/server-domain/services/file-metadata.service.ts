import { BadRequestException, Injectable } from '@nestjs/common'
import type { FileMetadata } from '../types'

import { FileMetadataPatch, FileMetadataRepository } from '../repositories/file-metadata.repository'
import { WorkspacePermissionService } from './workspace-permission.service'

type FileMetadataCreate = Omit<FileMetadata, 'ownerId' | 'createdAt' | 'updatedAt'>

@Injectable()
export class FileMetadataService {
  constructor(private readonly files: FileMetadataRepository, private readonly permissions: WorkspacePermissionService) {}

  async create(userId: string, workspaceId: string, input: FileMetadataCreate) {
    await this.permissions.assertCanWrite(userId, workspaceId)
    if (input.workspaceId !== workspaceId) throw new BadRequestException('File workspaceId does not match the target workspace')
    return this.files.create({ ...input, ownerId: userId })
  }

  async find(userId: string, workspaceId: string, id: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.files.findInWorkspace(workspaceId, id)
  }

  async list(userId: string, workspaceId: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.files.listByWorkspace(workspaceId)
  }

  async update(userId: string, workspaceId: string, id: string, patch: FileMetadataPatch) {
    await this.permissions.assertCanWrite(userId, workspaceId)
    return this.files.updateInWorkspace(workspaceId, id, patch)
  }

  async delete(userId: string, workspaceId: string, id: string) {
    await this.permissions.assertCanWrite(userId, workspaceId)
    return this.files.deleteInWorkspace(workspaceId, id)
  }
}
