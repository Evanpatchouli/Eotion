import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ClientSession, Model } from 'mongoose'
import type { PageRecord } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { PageDocument, PageEntity } from '../schemas/page.schema'

type PageCreate = Pick<PageRecord, 'id' | 'parentPageId' | 'title' | 'orderKey'> & { icon?: string }
export type PagePatch = Partial<Pick<PageRecord, 'title' | 'icon' | 'orderKey'>>

@Injectable()
export class PageRepository {
  constructor(@InjectModel(PageEntity.name) private readonly model: Model<PageDocument>) {}

  async create(workspaceId: string, input: PageCreate, session?: ClientSession): Promise<PageRecord> {
    const [doc] = await this.model.create([{ ...input, workspaceId }], { session })
    return this.toRecord(doc!)
  }

  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<PageRecord | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }

  async touchStructure(workspaceId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate(
      { workspaceId, id }, { $inc: { structureFence: 1 } }, { session, returnDocument: 'after' },
    ).exec())
  }

  async listByWorkspace(workspaceId: string): Promise<PageRecord[]> {
    return (await this.model.find({ workspaceId }).sort({ parentPageId: 1, orderKey: 1, id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  async updateInWorkspace(workspaceId: string, id: string, patch: PagePatch, session?: ClientSession): Promise<PageRecord | null> {
    assertUpdateFields(patch, ['title', 'icon', 'orderKey'])
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, patch, { returnDocument: 'after', runValidators: true, session }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async updateSnapshot(workspaceId: string, id: string, input: { title: string; icon: string | null; orderKey: string }, session: ClientSession): Promise<PageRecord | null> {
    const change = input.icon === null
      ? { $set: { title: input.title, orderKey: input.orderKey }, $unset: { icon: '' } }
      : { $set: { title: input.title, icon: input.icon, orderKey: input.orderKey } }
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, change, { returnDocument: 'after', runValidators: true, session }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async hasChildren(workspaceId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, parentPageId: id }).session(session))
  }

  async deleteInWorkspace(workspaceId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, id }, { session }).exec())
  }

  private toRecord(doc: PageDocument): PageRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, parentPageId: doc.parentPageId, title: doc.title, ...(doc.icon === undefined ? {} : { icon: doc.icon }), orderKey: doc.orderKey, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
