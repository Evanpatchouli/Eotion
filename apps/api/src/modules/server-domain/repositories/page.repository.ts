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

  async findById(id: string, session?: ClientSession): Promise<PageRecord | null> {
    const doc = await this.model.findOne({ id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }

  async touchStructure(workspaceId: string, id: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate(
      { workspaceId, id }, [{ $set: { structureFence: { $add: ['$structureFence', 1] }, updatedAt: this.nextUpdatedAt() } }],
      { session, returnDocument: 'after', timestamps: false, updatePipeline: true },
    ).exec())
  }

  async listByWorkspace(workspaceId: string, session?: ClientSession): Promise<PageRecord[]> {
    return (await this.model.find({ workspaceId }).sort({ parentPageId: 1, orderKey: 1, id: 1 }).session(session ?? null).exec()).map((doc) => this.toRecord(doc))
  }

  async listWindow(workspaceId: string, input: { cursor?: string; limit: number; query?: string }, session?: ClientSession): Promise<PageRecord[]> {
    const filter: Record<string, unknown> = { workspaceId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    if (input.query !== undefined) filter.title = new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    return (await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()).map((doc) => this.toRecord(doc))
  }

  async updateInWorkspace(workspaceId: string, id: string, patch: PagePatch, session?: ClientSession): Promise<PageRecord | null> {
    assertUpdateFields(patch, ['title', 'icon', 'orderKey'])
    this.assertPatchValues(patch)
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, [{ $set: this.setPatch(patch) }], { returnDocument: 'after', runValidators: true, session, timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  /** Reparents a page. Callers must validate the new parent inside the same workspace first. */
  async moveInWorkspace(workspaceId: string, id: string, input: { parentPageId: string | null; orderKey: string }, session?: ClientSession): Promise<PageRecord | null> {
    this.assertRequiredString('orderKey', input.orderKey)
    this.assertOptionalString('parentPageId', input.parentPageId)
    const doc = await this.model.findOneAndUpdate(
      { workspaceId, id },
      [{ $set: { parentPageId: { $literal: input.parentPageId }, orderKey: { $literal: input.orderKey }, updatedAt: this.nextUpdatedAt() } }],
      { returnDocument: 'after', runValidators: true, session, timestamps: false, updatePipeline: true },
    ).exec()
    return doc ? this.toRecord(doc) : null
  }

  async updateSnapshot(workspaceId: string, id: string, input: { title: string; icon: string | null; orderKey: string }, session: ClientSession): Promise<PageRecord | null> {
    this.assertRequiredString('title', input.title)
    this.assertRequiredString('orderKey', input.orderKey)
    this.assertOptionalString('icon', input.icon)
    const fields: Record<string, unknown> = {
      title: { $literal: input.title },
      orderKey: { $literal: input.orderKey },
      updatedAt: this.nextUpdatedAt(),
    }
    fields.icon = input.icon === null ? '$$REMOVE' : { $literal: input.icon }
    const doc = await this.model.findOneAndUpdate({ workspaceId, id }, [{ $set: fields }], { returnDocument: 'after', runValidators: true, session, timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async compareAndUpdate(workspaceId: string, id: string, expectedUpdatedAt: string, patch: { title?: string }, session?: ClientSession): Promise<PageRecord | null> {
    assertUpdateFields(patch, ['title'])
    this.assertPatchValues(patch)
    const expectedDate = new Date(expectedUpdatedAt)
    if (!Number.isFinite(expectedDate.getTime())) return null
    const doc = await this.model.findOneAndUpdate(
      { workspaceId, id, updatedAt: expectedDate },
      [{ $set: this.setPatch(patch) }],
      { returnDocument: 'after', runValidators: true, session, timestamps: false, updatePipeline: true },
    ).exec()
    return doc ? this.toRecord(doc) : null
  }

  async hasChildren(workspaceId: string, id: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, parentPageId: id }).session(session ?? null))
  }

  async deleteInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, id }, { session }).exec())
  }

  private setPatch(patch: PagePatch | { title?: string }): Record<string, unknown> {
    const fields: Record<string, unknown> = { updatedAt: this.nextUpdatedAt() }
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) fields[key] = { $literal: value }
    }
    return fields
  }

  private nextUpdatedAt(): Record<string, unknown> {
    return { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] }
  }

  private assertPatchValues(patch: PagePatch | { title?: string }): void {
    if ('title' in patch && patch.title !== undefined) this.assertRequiredString('title', patch.title)
    if ('orderKey' in patch && patch.orderKey !== undefined) this.assertRequiredString('orderKey', patch.orderKey)
    if ('icon' in patch && patch.icon !== undefined) this.assertOptionalString('icon', patch.icon)
  }

  private assertRequiredString(field: string, value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} must be a non-empty string`)
  }

  private assertOptionalString(field: string, value: unknown): void {
    if (value !== null && typeof value !== 'string') throw new TypeError(`${field} must be a string or null`)
  }

  private toRecord(doc: PageDocument): PageRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, parentPageId: doc.parentPageId, title: doc.title, ...(doc.icon === undefined ? {} : { icon: doc.icon }), orderKey: doc.orderKey, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
