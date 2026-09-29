import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { PageRecord } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { PageDocument, PageEntity } from '../schemas/page.schema'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }
export type PagePatch = Partial<Pick<PageRecord, 'title' | 'icon' | 'orderKey'>>

@Injectable()
export class PageRepository {
  constructor(@InjectModel(PageEntity.name) private readonly model: Model<PageDocument>) {}

  async create(workspaceId: string, input: PageCreate): Promise<PageRecord> {
    return this.toRecord(await this.model.create({ ...input, workspaceId }))
  }

  async findInWorkspace(workspaceId: string, id: string): Promise<PageRecord | null> {
    const doc = await this.model.findOne({ workspaceId, id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async listByWorkspace(workspaceId: string): Promise<PageRecord[]> {
    return (await this.model.find({ workspaceId }).sort({ parentPageId: 1, orderKey: 1, id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  async updateInWorkspace(workspaceId: string, id: string, patch: PagePatch): Promise<PageRecord | null> {
    assertUpdateFields(patch, ['title', 'icon', 'orderKey'])
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, patch, { returnDocument: 'after', runValidators: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  private toRecord(doc: PageDocument): PageRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, parentPageId: doc.parentPageId, title: doc.title, ...(doc.icon === undefined ? {} : { icon: doc.icon }), orderKey: doc.orderKey, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
