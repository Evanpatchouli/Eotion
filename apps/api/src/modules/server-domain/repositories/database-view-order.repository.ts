import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { ClientSession, Model } from 'mongoose'
import { isViewOrderRank } from '@eotion/domain'
import { DatabaseViewOrderOverrideEntity, type DatabaseViewOrderOverrideDocument, DatabaseViewOrderCleanupJobEntity, type DatabaseViewOrderCleanupJobDocument } from '../schemas/database-view-order.schema'

export type DatabaseViewOrderScope = Pick<DatabaseViewOrderOverrideEntity, 'workspaceId' | 'databaseId' | 'orderScopeId'>
export type DatabaseViewOrderOverride = DatabaseViewOrderScope & Pick<DatabaseViewOrderOverrideEntity, 'recordId' | 'slotOrdinal' | 'rank' | 'sourceCreationOrdinal'>

@Injectable()
export class DatabaseViewOrderRepository {
  constructor(
    @InjectModel(DatabaseViewOrderOverrideEntity.name) private readonly overrides: Model<DatabaseViewOrderOverrideDocument>,
    @InjectModel(DatabaseViewOrderCleanupJobEntity.name) private readonly jobs: Model<DatabaseViewOrderCleanupJobDocument>,
  ) {}

  async putOverride(input: DatabaseViewOrderOverride, session: ClientSession): Promise<void> {
    if (!Number.isSafeInteger(input.slotOrdinal) || input.slotOrdinal < 0 || !Number.isSafeInteger(input.sourceCreationOrdinal) || input.sourceCreationOrdinal < 1 || !isViewOrderRank(input.rank) || input.rank.length > 1_048_576) throw new TypeError('Invalid database view order override')
    const joinKey = { workspaceId: input.workspaceId, databaseId: input.databaseId, orderScopeId: input.orderScopeId, recordId: input.recordId }
    await this.overrides.updateOne({ workspaceId: input.workspaceId, databaseId: input.databaseId, orderScopeId: input.orderScopeId, recordId: input.recordId }, { $set: { ...input, joinKey } }, { session, upsert: true, collation: { locale: 'simple' } }).exec()
  }

  async findOverride(scope: DatabaseViewOrderScope, recordId: string, session?: ClientSession): Promise<DatabaseViewOrderOverride | null> {
    const doc = await this.overrides.findOne({ ...scope, recordId }).collation({ locale: 'simple' }).session(session ?? null).lean().exec()
    return doc ? { ...scope, recordId: doc.recordId, slotOrdinal: doc.slotOrdinal, rank: doc.rank, sourceCreationOrdinal: doc.sourceCreationOrdinal } : null
  }

  async listOverrideWindow(scope: DatabaseViewOrderScope, after: { slotOrdinal: number; rank: string } | undefined, limit: number, session?: ClientSession): Promise<DatabaseViewOrderOverride[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101) throw new TypeError('Invalid override window')
    const keyFilter = after === undefined ? {} : { $or: [
      { slotOrdinal: { $gt: after.slotOrdinal } },
      { slotOrdinal: after.slotOrdinal, rank: { $gt: after.rank } },
    ] }
    const docs = await this.overrides.find({ ...scope, ...keyFilter }).collation({ locale: 'simple' }).sort({ slotOrdinal: 1, rank: 1 }).limit(limit).session(session ?? null).lean().exec()
    return docs.map(doc => ({ ...scope, recordId: doc.recordId, slotOrdinal: doc.slotOrdinal, rank: doc.rank, sourceCreationOrdinal: doc.sourceCreationOrdinal }))
  }

  async deleteRecordFromActiveScopes(workspaceId: string, databaseId: string, recordId: string, scopeIds: readonly string[], session: ClientSession): Promise<void> {
    if (scopeIds.length > 100) throw new TypeError('Too many active database view order scopes')
    if (scopeIds.length === 0) return
    await this.overrides.deleteMany({ workspaceId, databaseId, recordId, orderScopeId: { $in: [...new Set(scopeIds)] } }, { session, collation: { locale: 'simple' } }).exec()
  }

  async enqueueRetiredScope(scope: DatabaseViewOrderScope, session: ClientSession): Promise<void> {
    await this.jobs.updateOne(scope, { $setOnInsert: scope }, { session, upsert: true, collation: { locale: 'simple' } }).exec()
  }

  async findCleanupJob(): Promise<DatabaseViewOrderScope | null> {
    const doc = await this.jobs.findOne().collation({ locale: 'simple' }).sort({ createdAt: 1, _id: 1 }).lean().exec()
    return doc ? { workspaceId: doc.workspaceId, databaseId: doc.databaseId, orderScopeId: doc.orderScopeId } : null
  }

  async deleteOverrideBatch(scope: DatabaseViewOrderScope, limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Invalid cleanup batch limit')
    const docs = await this.overrides.find(scope).collation({ locale: 'simple' }).select({ _id: 1 }).limit(limit).lean().exec()
    if (docs.length === 0) return 0
    await this.overrides.deleteMany({ ...scope, _id: { $in: docs.map(doc => doc._id) } }, { collation: { locale: 'simple' } }).exec()
    return docs.length
  }

  async hasOverrides(scope: DatabaseViewOrderScope): Promise<boolean> {
    return !!(await this.overrides.exists(scope).collation({ locale: 'simple' }))
  }

  async completeCleanupJob(scope: DatabaseViewOrderScope): Promise<void> {
    await this.jobs.deleteOne(scope, { collation: { locale: 'simple' } }).exec()
  }
}
