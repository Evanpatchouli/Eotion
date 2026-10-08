import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ClientSession, Model } from 'mongoose'
import type { ServerBlockRecord } from '../types'
import { assertUpdateFields } from './assert-update-fields'

import { BlockDocument, BlockEntity } from '../schemas/block.schema'

type BlockCreate = Omit<ServerBlockRecord, 'workspaceId' | 'createdAt' | 'updatedAt'>
export type BlockPatch = Partial<Pick<ServerBlockRecord, 'type' | 'orderKey' | 'props'>>

@Injectable()
export class BlockRepository {
  constructor(@InjectModel(BlockEntity.name) private readonly model: Model<BlockDocument>) {}

  async create(workspaceId: string, input: BlockCreate, session?: ClientSession): Promise<ServerBlockRecord> {
    const [doc] = await this.model.create([{ ...input, workspaceId }], { session })
    return this.toRecord(doc!)
  }

  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<ServerBlockRecord | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }

  async touchStructure(workspaceId: string, pageId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate(
      { workspaceId, pageId, id }, { $inc: { structureFence: 1 } }, { session, returnDocument: 'after' },
    ).exec())
  }

  async listByPage(workspaceId: string, pageId: string, limit?: number, session?: ClientSession): Promise<ServerBlockRecord[]> {
    const query = this.model.find({ workspaceId, pageId }).sort({ parentBlockId: 1, orderKey: 1, id: 1 })
    if (limit !== undefined) query.limit(limit)
    query.session(session ?? null)
    return (await query.exec()).map((doc) => this.toRecord(doc))
  }

  async listByWorkspace(workspaceId: string): Promise<ServerBlockRecord[]> {
    return (await this.model.find({ workspaceId }).sort({ pageId: 1, parentBlockId: 1, orderKey: 1, id: 1 }).exec()).map((doc) => this.toRecord(doc))
  }

  /** Scans workspace block ASTs, including nested Toggle/content nodes. Cost is O(workspace blocks). */
  async hasDatabaseViewReference(workspaceId: string, databaseId: string, viewId: string, session?: ClientSession): Promise<boolean> {
    const rows = await this.model.find({ workspaceId }, { props: 1 }).session(session ?? null).lean().exec()
    const pending: unknown[] = rows.map(row => row.props)
    while (pending.length > 0) {
      const node = pending.pop()
      if (Array.isArray(node)) { pending.push(...node); continue }
      if (typeof node !== 'object' || node === null) continue
      const value = node as Record<string, unknown>
      if (value.type === 'eotionDatabase' && typeof value.attrs === 'object' && value.attrs !== null && !Array.isArray(value.attrs)) {
        const attrs = value.attrs as Record<string, unknown>
        if (attrs.databaseId === databaseId && attrs.viewId === viewId) return true
      }
      for (const child of Object.values(value)) if (typeof child === 'object' && child !== null) pending.push(child)
    }
    return false
  }

  async updateInWorkspace(workspaceId: string, pageId: string, id: string, patch: BlockPatch, session?: ClientSession): Promise<ServerBlockRecord | null> {
    assertUpdateFields(patch, ['type', 'orderKey', 'props'])
    const doc = await this.model.findOneAndUpdate({ workspaceId, pageId, id }, patch, { returnDocument: 'after', runValidators: true, session }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async moveInWorkspace(workspaceId: string, pageId: string, id: string, parentBlockId: string | null, orderKey: string, session?: ClientSession): Promise<ServerBlockRecord | null> {
    const doc = await this.model.findOneAndUpdate(
      { workspaceId, pageId, id },
      { parentBlockId, orderKey },
      { returnDocument: 'after', runValidators: true, session },
    ).exec()
    return doc ? this.toRecord(doc) : null
  }

  async hasChildren(workspaceId: string, pageId: string, id: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, pageId, parentBlockId: id }).session(session ?? null))
  }

  async deleteInWorkspace(workspaceId: string, pageId: string, id: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, pageId, id }, { session }).exec())
  }

  async deleteByPage(workspaceId: string, pageId: string, session?: ClientSession): Promise<void> {
    await this.model.deleteMany({ workspaceId, pageId }, { session }).exec()
  }

  private toRecord(doc: BlockDocument): ServerBlockRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, pageId: doc.pageId, parentBlockId: doc.parentBlockId, type: doc.type as ServerBlockRecord['type'], orderKey: doc.orderKey, props: doc.props, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
