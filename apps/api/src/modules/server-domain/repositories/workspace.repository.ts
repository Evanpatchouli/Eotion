import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { WorkspaceRecord } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { WorkspaceEntity, WorkspaceDocument } from '../schemas/workspace.schema'

type WorkspaceCreate = Pick<WorkspaceRecord, 'id' | 'name' | 'ownerId'>

@Injectable()
export class WorkspaceRepository {
  constructor(@InjectModel(WorkspaceEntity.name) private readonly model: Model<WorkspaceDocument>) {}

  async create(input: WorkspaceCreate): Promise<WorkspaceRecord> {
    return this.toRecord(await this.model.create(input))
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const doc = await this.model.findOne({ id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async listByOwner(ownerId: string): Promise<WorkspaceRecord[]> {
    return (await this.model.find({ ownerId }).sort({ id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  async updateOwned(id: string, ownerId: string, patch: Pick<WorkspaceRecord, 'name'>): Promise<WorkspaceRecord | null> {
    assertUpdateFields(patch, ['name'])
    const doc = await this.model.findOneAndUpdate({ id, ownerId }, patch, { returnDocument: 'after', runValidators: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  private toRecord(doc: WorkspaceDocument): WorkspaceRecord {
    return { id: doc.id, name: doc.name, ownerId: doc.ownerId, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
