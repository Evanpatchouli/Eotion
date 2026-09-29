import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { FileMetadata } from '../types'

import { FileMetadataPatch, FileMetadataRepository } from '../repositories/file-metadata.repository'
import { WorkspaceRepository } from '../repositories/workspace.repository'

type FileMetadataCreate = Omit<FileMetadata, 'createdAt' | 'updatedAt'>

@Injectable()
export class FileMetadataService {
  constructor(private readonly files: FileMetadataRepository, private readonly workspaces: WorkspaceRepository) {}

  async create(workspaceId: string, input: FileMetadataCreate) {
    if (input.workspaceId !== workspaceId) throw new BadRequestException('File workspaceId does not match the target workspace')
    if (!(await this.workspaces.findById(workspaceId))) throw new NotFoundException('Workspace not found')
    return this.files.create(input)
  }

  find(workspaceId: string, id: string) {
    return this.files.findInWorkspace(workspaceId, id)
  }

  list(workspaceId: string) {
    return this.files.listByWorkspace(workspaceId)
  }

  update(workspaceId: string, id: string, patch: FileMetadataPatch) {
    return this.files.updateInWorkspace(workspaceId, id, patch)
  }

  delete(workspaceId: string, id: string) {
    return this.files.deleteInWorkspace(workspaceId, id)
  }
}
