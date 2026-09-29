import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { FileMetadata } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { FileMetadataDocument, FileMetadataEntity } from '../schemas/file-metadata.schema'

type FileMetadataCreate = Omit<FileMetadata, 'createdAt' | 'updatedAt'>
export type FileMetadataPatch = Partial<Pick<FileMetadata, 'name' | 'mimeType' | 'size' | 'objectKey' | 'url'>>

@Injectable()
export class FileMetadataRepository {
  constructor(@InjectModel(FileMetadataEntity.name) private readonly model: Model<FileMetadataDocument>) {}

  async create(input: FileMetadataCreate): Promise<FileMetadata> {
    return this.toRecord(await this.model.create(input))
  }

  async findInWorkspace(workspaceId: string, id: string): Promise<FileMetadata | null> {
    const doc = await this.model.findOne({ workspaceId, id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async listByWorkspace(workspaceId: string): Promise<FileMetadata[]> {
    return (await this.model.find({ workspaceId }).sort({ id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  async updateInWorkspace(workspaceId: string, id: string, patch: FileMetadataPatch): Promise<FileMetadata | null> {
    assertUpdateFields(patch, ['name', 'mimeType', 'size', 'objectKey', 'url'])
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, patch, { returnDocument: 'after', runValidators: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async deleteInWorkspace(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.model.deleteOne({ workspaceId, id }).exec()
    return result.deletedCount === 1
  }

  private toRecord(doc: FileMetadataDocument): FileMetadata {
    return { id: doc.id, workspaceId: doc.workspaceId, ownerId: doc.ownerId, name: doc.name, mimeType: doc.mimeType, size: doc.size, objectKey: doc.objectKey, ...(doc.url === undefined ? {} : { url: doc.url }), createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
