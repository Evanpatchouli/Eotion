import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { ServerBlockRecord } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { BlockDocument, BlockEntity } from '../schemas/block.schema'

type BlockCreate = Omit<ServerBlockRecord, 'workspaceId' | 'createdAt' | 'updatedAt'>
export type BlockPatch = Partial<Pick<ServerBlockRecord, 'type' | 'orderKey' | 'props'>>

@Injectable()
export class BlockRepository {
  constructor(@InjectModel(BlockEntity.name) private readonly model: Model<BlockDocument>) {}

  async create(workspaceId: string, input: BlockCreate): Promise<ServerBlockRecord> {
    return this.toRecord(await this.model.create({ ...input, workspaceId }))
  }

  async findInWorkspace(workspaceId: string, id: string): Promise<ServerBlockRecord | null> {
    const doc = await this.model.findOne({ workspaceId, id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async listByPage(workspaceId: string, pageId: string): Promise<ServerBlockRecord[]> {
    return (await this.model.find({ workspaceId, pageId }).sort({ parentBlockId: 1, orderKey: 1, id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  async updateInWorkspace(workspaceId: string, pageId: string, id: string, patch: BlockPatch): Promise<ServerBlockRecord | null> {
    assertUpdateFields(patch, ['type', 'orderKey', 'props'])
    const doc = await this.model.findOneAndUpdate({ workspaceId, pageId, id }, patch, { returnDocument: 'after', runValidators: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  private toRecord(doc: BlockDocument): ServerBlockRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, pageId: doc.pageId, parentBlockId: doc.parentBlockId, type: doc.type as ServerBlockRecord['type'], orderKey: doc.orderKey, props: doc.props, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
