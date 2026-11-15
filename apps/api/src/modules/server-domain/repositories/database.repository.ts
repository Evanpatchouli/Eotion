import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'node:crypto'
import { DATABASE_RECORD_SCAN_MAX_RECORDS, DEFAULT_DATABASE_VIEW_CONFIG, compareViewOrderPosition } from '@eotion/domain'
import type { Database, DatabaseProperty, DatabaseRecord, DatabaseTableRecord, DatabaseView, DatabaseViewConfig } from '@eotion/domain'
import { getDatabaseDateStartInstant } from '@eotion/domain/date'
import type { ClientSession, Model, PipelineStage, Types } from 'mongoose'
import { DatabaseDocument, DatabaseEntity } from '../schemas/database.schema'
import { DatabasePropertyDocument, DatabasePropertyEntity } from '../schemas/database-property.schema'
import { DatabaseRecordDocument, DatabaseRecordEntity } from '../schemas/database-record.schema'
import { DatabaseViewDocument, DatabaseViewEntity } from '../schemas/database-view.schema'
import { DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, DatabaseViewOrderOverrideEntity, type DatabaseViewOrderOverrideDocument } from '../schemas/database-view-order.schema'
import { ManualOrderIndexCorruptionError, checkedManualOrdinalPage, readManualOrderDefaultIndexStream } from './manual-order-index-stream'
import type { ManualOrderKey } from './manual-order-index-stream'

type Stored<T> = Omit<T, 'createdAt' | 'updatedAt'>
const MANUAL_PREFIX_PROBE_RECORDS = 1024
export type DatabaseViewOrderState = { orderScopeId: string; manualOrderActive: boolean; version: number }
export type DatabaseRecordCreationOrder = { recordId: string; creationOrdinal: number }
export type ManualRecordRow = DatabaseTableRecord & { position: { slotOrdinal: number; rank: string } }
export type ManualBoundary = { position: { slotOrdinal: number; rank: string }; recordId: string }
type ManualWindowInput = {
  workspaceId: string; databaseId: string; scopeId: string; manualActive: boolean;
  properties: readonly DatabaseProperty[]; filters: DatabaseViewConfig['filters'];
  boundary?: ManualBoundary; direction: 'after' | 'before'; excludeRecordId?: string;
  take: number; session?: ClientSession;
  group?: DatabaseRecordGroupQuery;
  queryTokensReady?: boolean;
}
export type DatabaseRecordGroupQuery = { propertyId: string; optionIds: readonly string[]; group: { kind: 'option'; optionId: string } | { kind: 'ungrouped' } }
const dates = (doc: { createdAt: Date; updatedAt: Date }) => ({ createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() })
const QUERY_TOKEN_BACKFILL_BATCH = 500
const QUERY_TOKEN_BACKFILL_WRITE_BATCH = 50
const QUERY_TOKEN_BACKFILL_CONCURRENCY = 2
const QUERY_TOKEN_BACKFILL_RETRY_MS = 10_000
const QUERY_TOKEN_BUILD_LEASE_SECONDS = 60

function queryTokens(properties: DatabaseRecord['properties']): { p: string; v: string }[] {
  return Object.entries(properties).flatMap(([p, value]) => {
    if (typeof value !== 'string' || value.length === 0) return []
    let length = 0
    for (const _ of value) if (++length > 256) return []
    return [{ p, v: value }]
  })
}

const queryTokensFromCurrentProperties = { $map: {
  input: { $filter: {
    input: { $objectToArray: { $ifNull: ['$properties', {}] } }, as: 'item',
    cond: { $cond: [{ $eq: [{ $type: '$$item.v' }, 'string'] }, { $and: [{ $gt: [{ $strLenCP: '$$item.v' }, 0] }, { $lte: [{ $strLenCP: '$$item.v' }, 256] }] }, false] },
  } },
  as: 'item', in: { p: '$$item.k', v: '$$item.v' },
} }
const missingQueryTokens = { $or: [
  { queryTokenSourceVersion: { $exists: false } },
  { $expr: { $ne: ['$queryTokenSourceVersion', { $ifNull: ['$version', 0] }] } },
] }

@Injectable()
export class DatabaseRepository implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseRepository.name)
  private readonly queryTokenBackfills = new Map<string, Promise<void>>()
  private readonly queryTokenRetries = new Map<string, number>()
  private stopping = false
  constructor(@InjectModel(DatabaseEntity.name) private readonly model: Model<DatabaseDocument>,
    @InjectModel(DatabaseRecordEntity.name) private readonly records: Model<DatabaseRecordDocument>) {}
  async onModuleDestroy(): Promise<void> {
    this.stopping = true
    await Promise.allSettled(this.queryTokenBackfills.values())
  }
  async create(input: Stored<Database> & { parentPageId?: string; orderKey?: string }, session: ClientSession): Promise<Database> {
    const [doc] = await this.model.create([{ ...input, queryTokenReadyVersion: input.version }], { session })
    return { id: doc!.id, workspaceId: doc!.workspaceId, name: doc!.name, version: doc!.version, ...dates(doc!) }
  }
  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async compareAndBump(workspaceId: string, id: string, expectedVersion: number, session: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, id, version: expectedVersion }, [{ $set: {
      queryTokenReadyVersion: { $cond: [{ $eq: ['$queryTokenReadyVersion', '$version'] }, { $add: ['$version', 1] }, '$queryTokenReadyVersion'] },
      queryTokenBuildSafeVersion: { $cond: [{ $eq: ['$queryTokenBuildSafeVersion', '$version'] }, { $add: ['$version', 1] }, '$queryTokenBuildSafeVersion'] },
      version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] },
    } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async rename(workspaceId: string, id: string, expectedVersion: number, name: string, session: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, id, version: expectedVersion }, [{ $set: {
      name: { $literal: name }, queryTokenReadyVersion: { $cond: [{ $eq: ['$queryTokenReadyVersion', '$version'] }, { $add: ['$version', 1] }, '$queryTokenReadyVersion'] },
      queryTokenBuildSafeVersion: { $cond: [{ $eq: ['$queryTokenBuildSafeVersion', '$version'] }, { $add: ['$version', 1] }, '$queryTokenBuildSafeVersion'] },
      version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] },
    } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async touchAdvancedReferenceFence(workspaceId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate({ workspaceId, id }, { $inc: { advancedReferenceFence: 1 } }, { session, returnDocument: 'after' }).exec())
  }
  async queryTokensReadyOrSchedule(workspaceId: string, id: string, version: number, session?: ClientSession): Promise<boolean> {
    const raw = await this.model.findOne({ workspaceId, id }).select({ _id: 1, workspaceId: 1, id: 1, version: 1, queryTokenReadyVersion: 1 })
      .session(session ?? null).lean().exec()
    if (!raw || raw.version !== version) return false
    if (Object.hasOwn(raw, 'queryTokenReadyVersion') && raw.queryTokenReadyVersion === version) return true
    this.scheduleQueryTokenBackfill({ _id: raw._id, workspaceId, id, version })
    return false
  }
  async queryTokensReadyForVersion(workspaceId: string, id: string, version: number, session: ClientSession): Promise<boolean> {
    const raw = await this.model.findOne({ workspaceId, id }).select({ _id: 0, version: 1, queryTokenReadyVersion: 1 })
      .session(session).lean().exec()
    return !!raw && raw.version === version && Object.hasOwn(raw, 'queryTokenReadyVersion')
      && raw.queryTokenReadyVersion === version
  }
  private scheduleQueryTokenBackfill(target: { _id: Types.ObjectId; workspaceId: string; id: string; version: number }): void {
    if (this.stopping) return
    const key = String(target._id)
    if (this.queryTokenBackfills.has(key) || this.queryTokenBackfills.size >= QUERY_TOKEN_BACKFILL_CONCURRENCY) return
    if ((this.queryTokenRetries.get(key) ?? 0) > Date.now()) return
    // Do not retain an unbounded registry of database identities.
    if (this.queryTokenRetries.size > 256) this.queryTokenRetries.delete(this.queryTokenRetries.keys().next().value!)
    const task = this.backfillQueryTokens(target).catch(error => {
      this.logger.warn(`Query token backfill failed for database ${target.id}: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => {
      this.queryTokenBackfills.delete(key)
      this.queryTokenRetries.set(key, Date.now() + QUERY_TOKEN_BACKFILL_RETRY_MS)
    })
    this.queryTokenBackfills.set(key, task)
  }
  private async backfillQueryTokens(target: { _id: Types.ObjectId; workspaceId: string; id: string; version: number }): Promise<void> {
    if (this.stopping) return
    const buildId = randomUUID()
    const acquired = await this.model.collection.findOneAndUpdate({ _id: target._id, workspaceId: target.workspaceId, id: target.id,
      $expr: { $and: [
        { $ne: ['$queryTokenReadyVersion', '$version'] },
        { $or: [
          { $eq: [{ $type: '$queryTokenBuildId' }, 'missing'] },
          { $lte: [{ $ifNull: ['$queryTokenBuildLeaseUntil', new Date(0)] }, '$$NOW'] },
        ] },
      ] },
    }, [{ $set: {
      queryTokenBuildId: { $literal: buildId }, queryTokenBuildSafeVersion: '$version',
      queryTokenBuildLeaseUntil: { $dateAdd: { startDate: '$$NOW', unit: 'second', amount: QUERY_TOKEN_BUILD_LEASE_SECONDS } },
    } }], { returnDocument: 'after' })
    if (!acquired) return
    const owner = { _id: target._id, workspaceId: target.workspaceId, id: target.id, queryTokenBuildId: buildId }
    const validLease = { $and: [
      { $eq: ['$queryTokenBuildSafeVersion', '$version'] },
      { $gt: ['$queryTokenBuildLeaseUntil', '$$NOW'] },
    ] }
    try {
      // New writers maintain tokens themselves; a fixed high-water mark keeps this build finite.
      const upperId = (await this.records.collection.find({ workspaceId: target.workspaceId, databaseId: target.id },
        { projection: { _id: 0, id: 1 }, collation: { locale: 'simple' } }).sort({ id: -1 }).limit(1).toArray())[0]?.id
      let after: string | undefined
      while (!this.stopping && upperId !== undefined) {
        const renewed = await this.model.collection.updateOne({ ...owner, $expr: validLease }, [{ $set: {
          queryTokenBuildLeaseUntil: { $dateAdd: { startDate: '$$NOW', unit: 'second', amount: QUERY_TOKEN_BUILD_LEASE_SECONDS } },
        } }])
        if (renewed.matchedCount !== 1) return
        const rows = await this.records.collection.find({ workspaceId: target.workspaceId, databaseId: target.id,
          id: { ...(after === undefined ? {} : { $gt: after }), $lte: upperId }, ...missingQueryTokens },
        { projection: { _id: 1, id: 1, version: 1, queryTokenSourceVersion: 1 }, collation: { locale: 'simple' } })
          .sort({ id: 1 }).limit(QUERY_TOKEN_BACKFILL_BATCH).toArray()
        if (rows.length === 0) break
        for (let offset = 0; offset < rows.length; offset += QUERY_TOKEN_BACKFILL_WRITE_BATCH) {
          if (this.stopping) return
          const renewedWrite = await this.model.collection.updateOne({ ...owner, $expr: validLease }, [{ $set: {
            queryTokenBuildLeaseUntil: { $dateAdd: { startDate: '$$NOW', unit: 'second', amount: QUERY_TOKEN_BUILD_LEASE_SECONDS } },
          } }])
          if (renewedWrite.matchedCount !== 1) return
          const staleIds = rows.slice(offset, offset + QUERY_TOKEN_BACKFILL_WRITE_BATCH)
            .filter(row => row.queryTokenSourceVersion !== (row.version ?? 0)).map(row => row._id)
          if (staleIds.length === 0) continue
          await this.records.collection.updateMany({ _id: { $in: staleIds }, workspaceId: target.workspaceId, databaseId: target.id,
            ...missingQueryTokens }, [
            { $set: { queryTokens: queryTokensFromCurrentProperties, queryTokenSourceVersion: { $ifNull: ['$version', 0] } } },
          ])
        }
        after = rows.at(-1)!.id
      }
      if (this.stopping) return
      const finished = await this.model.collection.updateOne({ ...owner, $expr: validLease }, [
        { $set: { queryTokenReadyVersion: '$version' } },
        { $unset: ['queryTokenBuildId', 'queryTokenBuildSafeVersion', 'queryTokenBuildLeaseUntil'] },
      ])
      if (finished.matchedCount !== 1) this.logger.warn(`Query token build lost its safety fence for database ${target.id}`)
    } finally {
      // A resumed or shutting-down worker can only release its own build, never a successor's lease.
      await this.model.collection.updateOne(owner, { $unset: { queryTokenBuildId: '', queryTokenBuildSafeVersion: '', queryTokenBuildLeaseUntil: '' } })
    }
  }
  async listWindow(workspaceId: string, input: { cursor?: string; limit: number }, session?: ClientSession): Promise<Database[]> {
    const filter: Record<string, unknown> = { workspaceId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()
    return docs.map(doc => ({ id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) }))
  }
  async listNavigationWindow(workspaceId: string, input: { cursor?: string; limit: number }): Promise<Array<Database & { parentPageId?: string; orderKey?: string }>> {
    const filter: Record<string, unknown> = { workspaceId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).exec()
    return docs.map(doc => ({ id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc),
      ...(doc.parentPageId === undefined ? {} : { parentPageId: doc.parentPageId }), ...(doc.orderKey === undefined ? {} : { orderKey: doc.orderKey }) }))
  }
}

@Injectable()
export class DatabasePropertyRepository {
  constructor(@InjectModel(DatabasePropertyEntity.name) private readonly model: Model<DatabasePropertyDocument>) {}
  async create(input: Stored<DatabaseProperty>, session: ClientSession): Promise<DatabaseProperty> {
    const [doc] = await this.model.create([input], { session })
    return this.toRecord(doc!)
  }
  async list(workspaceId: string, databaseId: string, session?: ClientSession): Promise<DatabaseProperty[]> {
    return (await this.model.find({ workspaceId, databaseId }).sort({ createdAt: 1, id: 1 }).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async listLimited(workspaceId: string, databaseId: string, limit: number, session?: ClientSession): Promise<DatabaseProperty[]> {
    const docs = await this.model.find({ workspaceId, databaseId }).sort({ createdAt: 1, id: 1 }).limit(limit).session(session ?? null).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  async findInDatabase(workspaceId: string, databaseId: string, id: string, session?: ClientSession): Promise<DatabaseProperty | null> {
    const doc = await this.model.findOne({ workspaceId, databaseId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }
  async update(workspaceId: string, databaseId: string, id: string, expectedVersion: number, patch: { name?: string; options?: DatabaseProperty['options']; config?: DatabaseProperty['config'] }, session: ClientSession): Promise<DatabaseProperty | null> {
    const set: Record<string, unknown> = { version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } }
    if (patch.name !== undefined) set.name = { $literal: patch.name }
    if (patch.options !== undefined) set.options = { $literal: patch.options }
    if (patch.config !== undefined) set.config = { $literal: patch.config }
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: set }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async changeType(workspaceId: string, databaseId: string, id: string, expectedVersion: number, candidate: DatabaseProperty, session: ClientSession): Promise<DatabaseProperty | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: {
      type: { $literal: candidate.type },
      options: candidate.options === undefined ? '$$REMOVE' : { $literal: candidate.options },
      config: candidate.config === undefined ? '$$REMOVE' : { $literal: candidate.config },
      version: { $add: ['$version', 1] },
      updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] },
    } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async delete(workspaceId: string, databaseId: string, id: string, expectedVersion: number, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, databaseId, id, version: expectedVersion }, { session }).exec())
  }
  async listRelationsInWorkspace(workspaceId: string, limit: number, session: ClientSession): Promise<DatabaseProperty[]> {
    const docs = await this.model.find({ workspaceId, type: { $in: ['relation', 'rollup'] } }).sort({ id: 1 }).limit(limit + 1).session(session).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  private toRecord(doc: DatabasePropertyDocument): DatabaseProperty {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, name: doc.name, type: doc.type as DatabaseProperty['type'], ...(doc.options === undefined ? {} : { options: doc.options.map(option => ({ id: option.id, name: option.name })) }), ...(doc.config === undefined ? {} : { config: doc.config as DatabaseProperty['config'] }), version: doc.version, ...dates(doc) }
  }
}

@Injectable()
export class DatabaseRecordRepository {
  constructor(@InjectModel(DatabaseRecordEntity.name) private readonly model: Model<DatabaseRecordDocument>, @InjectModel(DatabaseViewOrderOverrideEntity.name) private readonly overrides: Model<DatabaseViewOrderOverrideDocument>) {}
  async listPageIdsInWorkspace(workspaceId: string, session?: ClientSession): Promise<string[]> {
    const rows = await this.model.find({ workspaceId }, { pageId: 1, _id: 0 }).session(session ?? null).lean().exec()
    return rows.map(row => row.pageId)
  }
  async create(input: Stored<DatabaseRecord> & { creationOrdinal: number }, session: ClientSession): Promise<DatabaseRecord> {
    if (!Number.isSafeInteger(input.creationOrdinal) || input.creationOrdinal < 1) throw new TypeError('Invalid record creation ordinal')
    const [doc] = await this.model.create([{ ...input, queryTokens: queryTokens(input.properties), queryTokenSourceVersion: input.version }], { session })
    return this.toRecord(doc!)
  }
  async list(workspaceId: string, databaseId: string, session?: ClientSession): Promise<DatabaseRecord[]> {
    return (await this.model.find({ workspaceId, databaseId }).sort({ createdAt: 1, id: 1 }).limit(DATABASE_RECORD_SCAN_MAX_RECORDS + 1).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async findInDatabase(workspaceId: string, databaseId: string, id: string, session?: ClientSession): Promise<DatabaseRecord | null> {
    const doc = await this.model.findOne({ workspaceId, databaseId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }
  async hasMissingCreationOrdinal(workspaceId: string, databaseId: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, databaseId, creationOrdinal: null }).session(session ?? null))
  }
  async getCreationOrder(workspaceId: string, databaseId: string, id: string, session?: ClientSession): Promise<DatabaseRecordCreationOrder | null> {
    const doc = await this.model.findOne({ workspaceId, databaseId, id }).select({ id: 1, creationOrdinal: 1 }).session(session ?? null).lean().exec()
    if (!doc) return null
    if (!Number.isSafeInteger(doc.creationOrdinal) || doc.creationOrdinal < 1) throw new TypeError('Database record creation ordinal is invalid')
    return { recordId: doc.id, creationOrdinal: doc.creationOrdinal }
  }
  async listCreationOrderWindow(workspaceId: string, databaseId: string, after: number | undefined, limit: number, session?: ClientSession): Promise<DatabaseRecordCreationOrder[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101 || (after !== undefined && (!Number.isSafeInteger(after) || after < 0))) throw new TypeError('Invalid creation order window')
    const filter = { workspaceId, databaseId, creationOrdinal: { $gt: after ?? 0 } }
    const docs = await this.model.find(filter).select({ id: 1, creationOrdinal: 1 }).sort({ creationOrdinal: 1 }).limit(limit).session(session ?? null).lean().exec()
    return docs.map(doc => ({ recordId: doc.id, creationOrdinal: doc.creationOrdinal }))
  }
  async findManyInDatabase(workspaceId: string, databaseId: string, ids: readonly string[], session?: ClientSession): Promise<DatabaseRecord[]> {
    if (ids.length === 0) return []
    return (await this.model.find({ workspaceId, databaseId, id: { $in: [...new Set(ids)] } }).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async findForPage(workspaceId: string, pageId: string, session?: ClientSession): Promise<DatabaseRecord[]> {
    return (await this.model.find({ workspaceId, pageId }).sort({ id: 1 }).limit(2).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async delete(workspaceId: string, databaseId: string, id: string, expectedVersion: number, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, databaseId, id, version: expectedVersion }, { session }).exec())
  }
  async listWindow(workspaceId: string, databaseId: string, input: { cursor?: string; limit: number }, session?: ClientSession): Promise<DatabaseRecord[]> {
    const filter: Record<string, unknown> = { workspaceId, databaseId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  async listRecordOptionCandidateIds(workspaceId: string, databaseId: string, cursor: string | undefined, limit: number): Promise<string[]> {
    const filter: Record<string, unknown> = { workspaceId, databaseId }
    if (cursor !== undefined) filter.id = { $gt: cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).select({ id: 1, _id: 0 }).limit(limit + 1).lean().exec()
    return docs.map(doc => doc.id)
  }
  async listRecordOptions(workspaceId: string, databaseId: string, input: { cursor?: string; limit: number; search?: string; candidateIds?: string[] }): Promise<{ recordId: string; pageId: string; title: string }[]> {
    const escaped = input.search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match: Record<string, unknown> = { workspaceId, databaseId }
    if (input.candidateIds !== undefined) match.id = { $in: input.candidateIds }
    else if (input.cursor !== undefined) match.id = { $gt: input.cursor }
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { id: 1 } },
      ...(!escaped ? [{ $limit: input.limit + 1 } as PipelineStage] : []),
      { $lookup: { from: 'pages', let: { pageId: '$pageId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$id', '$$pageId'] }, { $eq: ['$workspaceId', { $literal: workspaceId }] }] } } },
        { $project: { _id: 0, title: 1 } },
      ], as: 'page' } },
      { $unwind: '$page' },
      ...(escaped ? [{ $match: { 'page.title': { $regex: escaped, $options: 'i' } } } as PipelineStage] : []),
      { $sort: { id: 1 } },
      { $limit: input.limit + 1 },
      { $project: { _id: 0, recordId: '$id', pageId: 1, title: '$page.title' } },
    ]
    return this.model.aggregate<{ recordId: string; pageId: string; title: string }>(pipeline).collation({ locale: 'simple' }).exec()
  }
  async queryTableWindow(input: {
    workspaceId: string; databaseId: string; properties: readonly DatabaseProperty[]; config: DatabaseViewConfig;
    limit: number; anchor?: DatabaseTableRecord; session?: ClientSession; group?: DatabaseRecordGroupQuery; queryTokensReady?: boolean;
  }): Promise<DatabaseTableRecord[]> {
    const title = input.properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const pipeline: Record<string, unknown>[] = [
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId } },
      ...this.groupStages(input.group, input.queryTokensReady),
      ...this.pageFilterStages(input.workspaceId, input.properties, input.config),
    ]
    return this.querySortedTableWindow(input, pipeline, title.id)
  }
  private async querySortedTableWindow(input: {
    workspaceId: string; databaseId: string; properties: readonly DatabaseProperty[]; config: DatabaseViewConfig;
    limit: number; anchor?: DatabaseTableRecord; session?: ClientSession; group?: DatabaseRecordGroupQuery; queryTokensReady?: boolean;
  }, pipeline: Record<string, unknown>[], titleId: string): Promise<DatabaseTableRecord[]> {
    const expressions = new Map(input.properties.map(property => [property.id, property.type === 'title'
      ? '$_page.title'
      : ({ $getField: { field: { $literal: property.id }, input: { $ifNull: ['$properties', {}] } } } as unknown)]))
    const propertyExpression = (id: string): unknown => ({ $ifNull: [expressions.get(id), null] })
    const emptyExpression = (expression: unknown): unknown => ({ $or: [{ $eq: [expression, null] }, { $eq: [expression, ''] }] })
    const dateStartExpression = (expression: unknown): unknown => ({ $let: {
      vars: { raw: expression },
      in: { $let: {
        vars: { start: { $cond: [
          { $eq: [{ $type: '$$raw' }, 'object'] },
          { $getField: { field: 'start', input: '$$raw' } },
          '$$raw',
        ] } },
        in: { $cond: [
          { $ne: [{ $type: '$$start' }, 'string'] },
          null,
          { $switch: {
            branches: [
              { case: { $eq: [{ $strLenCP: '$$start' }, 10] }, then: { $concat: ['$$start', 'T00:00:00.000Z'] } },
              { case: { $eq: [{ $strLenCP: '$$start' }, 24] }, then: '$$start' },
            ],
            default: null,
          } },
        ] },
      } },
    } })
    const sortFields: Record<string, unknown> = {}
    const sortOrder: Record<string, 1 | -1> = {}
    input.config.sorts.forEach((sort, index) => {
      const rawExpression = propertyExpression(sort.propertyId)
      const expression = input.properties.find(property => property.id === sort.propertyId)?.type === 'date'
        ? dateStartExpression(rawExpression)
        : rawExpression
      const emptyKey = `_sortEmpty${index}`
      const valueKey = `_sortValue${index}`
      sortFields[emptyKey] = { $cond: [emptyExpression(expression), 1, 0] }
      sortFields[valueKey] = { $cond: [emptyExpression(expression), null, expression] }
      sortOrder[emptyKey] = 1
      sortOrder[valueKey] = sort.direction === 'asc' ? 1 : -1
    })
    if (Object.keys(sortFields).length > 0) pipeline.push({ $set: sortFields })
    const anchor = input.anchor
    if (anchor) {
      const branch: unknown[] = []
      const prefix: unknown[] = []
      input.config.sorts.forEach((sort, index) => {
        const property = input.properties.find(item => item.id === sort.propertyId)
        const anchorValue = Object.hasOwn(anchor.properties, sort.propertyId) ? anchor.properties[sort.propertyId] : undefined
        const raw = property?.type === 'date' ? getDatabaseDateStartInstant(anchorValue) ?? undefined : anchorValue
        const isEmpty = raw === undefined || raw === null || raw === ''
        const value = isEmpty ? null : raw
        const emptyKey = `$_sortEmpty${index}`
        const valueKey = `$_sortValue${index}`
        branch.push({ $and: [...prefix, { $gt: [emptyKey, isEmpty ? 1 : 0] }] })
        prefix.push({ $eq: [emptyKey, isEmpty ? 1 : 0] })
        if (!isEmpty) {
          branch.push({ $and: [...prefix, { [sort.direction === 'asc' ? '$gt' : '$lt']: [valueKey, { $literal: value }] }] })
          prefix.push({ $eq: [valueKey, { $literal: value }] })
        }
      })
      branch.push({ $and: [...prefix, { $gt: ['$id', { $literal: anchor.id }] }] })
      pipeline.push({ $match: { $expr: { $or: branch } } })
    }
    pipeline.push({ $sort: { ...sortOrder, id: 1 } })
    pipeline.push({ $limit: input.limit + 1 })
    pipeline.push(...this.tableProjectionStages(titleId))
    const docs = await this.model.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    return docs.map((doc: Record<string, unknown>) => this.toTableRow(doc))
  }
  private pageFilterStages(workspaceId: string, properties: readonly DatabaseProperty[], config: DatabaseViewConfig): Record<string, unknown>[] {
    return [
      ...this.filterStages(properties, config, false),
      ...this.pageAndTitleFilterStages(workspaceId, properties, config),
    ]
  }
  private pageAndTitleFilterStages(workspaceId: string, properties: readonly DatabaseProperty[], config: DatabaseViewConfig): Record<string, unknown>[] {
    return [
      { $lookup: { from: 'pages', let: { pageId: '$pageId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$id', '$$pageId'] }, { $eq: ['$workspaceId', { $literal: workspaceId }] }] } } },
        { $project: { _id: 0, title: 1, updatedAt: 1 } },
      ], as: '_page' } },
      { $unwind: '$_page' },
      ...this.filterStages(properties, config, true),
    ]
  }
  private filterStages(properties: readonly DatabaseProperty[], config: DatabaseViewConfig, titleFilter: boolean): Record<string, unknown>[] {
    const title = properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const expressions = new Map(properties.map(property => [property.id, property.type === 'title'
      ? '$_page.title'
      : ({ $getField: { field: { $literal: property.id }, input: { $ifNull: ['$properties', {}] } } } as unknown)]))
    const propertyExpression = (id: string): unknown => ({ $ifNull: [expressions.get(id), null] })
    const emptyExpression = (expression: unknown): unknown => ({ $or: [{ $eq: [expression, null] }, { $eq: [expression, ''] }] })
    const dateStartExpression = (expression: unknown): unknown => ({ $let: {
      vars: { raw: expression },
      in: { $let: {
        vars: { start: { $cond: [
          { $eq: [{ $type: '$$raw' }, 'object'] },
          { $getField: { field: 'start', input: '$$raw' } },
          '$$raw',
        ] } },
        in: { $cond: [
          { $ne: [{ $type: '$$start' }, 'string'] },
          null,
          { $switch: {
            branches: [
              { case: { $eq: [{ $strLenCP: '$$start' }, 10] }, then: { $concat: ['$$start', 'T00:00:00.000Z'] } },
              { case: { $eq: [{ $strLenCP: '$$start' }, 24] }, then: '$$start' },
            ],
            default: null,
          } },
        ] },
      } },
    } })
    const pipeline: Record<string, unknown>[] = []
    const filterExpr = config.filters.filter(filter => (properties.find(property => property.id === filter.propertyId)?.type === 'title') === titleFilter).map(filter => {
      const expression = propertyExpression(filter.propertyId)
      const operator = filter.operator
      const property = properties.find(item => item.id === filter.propertyId)
      if (property?.type === 'relation') {
        const size = { $size: { $ifNull: [expression, []] } }
        return operator === 'is_empty' ? { $eq: [size, 0] } : { $gt: [size, 0] }
      }
      if (operator === 'is_empty') return emptyExpression(expression)
      if (operator === 'is_not_empty') return { $not: [emptyExpression(expression)] }
      if (operator === 'checked') return { $eq: [expression, true] }
      if (operator === 'unchecked') return { $eq: [expression, false] }
      const expected = { $literal: filter.value }
      if (operator === 'contains' || operator === 'does_not_contain') {
        const contains = { $gte: [{ $indexOfCP: [{ $ifNull: [expression, ''] }, expected] }, 0] }
        return operator === 'contains' ? { $and: [{ $not: [emptyExpression(expression)] }, contains] } : { $and: [{ $not: [emptyExpression(expression)] }, { $not: [contains] }] }
      }
      const comparedExpression = property?.type === 'date'
        ? { $substrCP: [dateStartExpression(expression), 0, 10] }
        : expression
      const compare = operator === 'is' || operator === 'eq' ? '$eq'
        : operator === 'is_not' || operator === 'ne' ? '$ne'
          : operator === 'gt' || operator === 'after' ? '$gt'
            : operator === 'gte' ? '$gte' : operator === 'lt' || operator === 'before' ? '$lt' : '$lte'
      const result = { [compare]: [comparedExpression, expected] }
      return { $and: [{ $not: [emptyExpression(expression)] }, result] }
    })
    if (filterExpr.length > 0) pipeline.push({ $match: { $expr: { $and: filterExpr } } })
    return pipeline
  }
  private groupStages(group?: DatabaseRecordGroupQuery, queryTokensReady = false): Record<string, unknown>[] {
    if (!group) return []
    const value = { $ifNull: [{ $getField: { field: { $literal: group.propertyId }, input: { $ifNull: ['$properties', {}] } } }, null] }
    const expression = group.group.kind === 'option'
      ? { $eq: [value, { $literal: group.group.optionId }] }
      : { $not: [{ $in: [value, { $literal: group.optionIds }] }] }
    return [
      ...(queryTokensReady && group.group.kind === 'option'
        ? [{ $match: { queryTokens: { $elemMatch: { p: group.propertyId, v: group.group.optionId } } } }]
        : []),
      { $match: { $expr: expression } },
    ]
  }
  private tableProjectionStages(titleId: string): Record<string, unknown>[] {
    return [
      { $set: { properties: { $arrayToObject: { $concatArrays: [{ $objectToArray: { $ifNull: ['$properties', {}] } }, [{ k: { $literal: titleId }, v: '$_page.title' }]] } }, pageVersion: '$_page.updatedAt' } },
      { $project: { _id: 0, id: 1, databaseId: 1, workspaceId: 1, pageId: 1, properties: 1, pageVersion: 1, version: 1, createdAt: 1, updatedAt: 1, position: 1 } },
    ]
  }
  private toTableRow(doc: Record<string, unknown>): DatabaseTableRecord {
    return { id: doc.id as string, databaseId: doc.databaseId as string, workspaceId: doc.workspaceId as string, pageId: doc.pageId as string,
      properties: doc.properties as DatabaseTableRecord['properties'], pageVersion: new Date(doc.pageVersion as string | Date).toISOString(),
      version: doc.version as number, createdAt: new Date(doc.createdAt as string | Date).toISOString(), updatedAt: new Date(doc.updatedAt as string | Date).toISOString() }
  }
  async findManualRecord(input: { workspaceId: string; databaseId: string; recordId: string; properties: readonly DatabaseProperty[]; filters: DatabaseViewConfig['filters']; session?: ClientSession }): Promise<DatabaseTableRecord | null> {
    const title = input.properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const pipeline: Record<string, unknown>[] = [
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId, id: input.recordId } },
      ...this.pageFilterStages(input.workspaceId, input.properties, { ...DEFAULT_DATABASE_VIEW_CONFIG, filters: input.filters }),
      ...this.tableProjectionStages(title.id),
    ]
    const docs = await this.model.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    return docs[0] ? this.toTableRow(docs[0] as Record<string, unknown>) : null
  }
  private async hasManualStreamIndexes(): Promise<{ record: string; source: string } | null> {
    try {
      // listIndexes is deliberately outside the caller's transaction. A missing
      // capability selects the exact legacy join; ordinary query errors propagate.
      const records = await this.model.collection.indexes()
      const overrides = await this.overrides.collection.indexes()
      const recordInfo = await this.model.db.db!.listCollections({ name: this.model.collection.collectionName }, { nameOnly: false }).next()
      const overrideInfo = await this.overrides.db.db!.listCollections({ name: this.overrides.collection.collectionName }, { nameOnly: false }).next()
      const usable = (index: (typeof records)[number], expected: Array<[string, number]>, defaultLocale: string) =>
        JSON.stringify(Object.entries(index.key ?? {})) === JSON.stringify(expected)
        && index.hidden !== true && index.sparse !== true && index.partialFilterExpression === undefined
        && (index.collation?.locale ?? defaultLocale) === 'simple'
      const recordLocale = recordInfo?.options?.collation?.locale ?? 'simple'
      const overrideLocale = overrideInfo?.options?.collation?.locale ?? 'simple'
      const record = records.find(index => index.name
        && usable(index, [['workspaceId', 1], ['databaseId', 1], ['creationOrdinal', 1], ['id', 1]], recordLocale))
      const source = overrides.find(index => index.name === DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX
        && usable(index, [['workspaceId', 1], ['databaseId', 1], ['orderScopeId', 1], ['sourceCreationOrdinal', 1], ['recordId', 1]], overrideLocale))
      return record && source ? { record: record.name!, source: source.name! } : null
    } catch (error) {
      const mongo = error as { code?: number; codeName?: string }
      if (mongo.code === 13 || mongo.code === 26 || mongo.codeName === 'Unauthorized' || mongo.codeName === 'NamespaceNotFound') return null
      throw error
    }
  }
  private isManualHintUnavailable(error: unknown): boolean {
    const mongo = error as { code?: number; codeName?: string; message?: string }
    return mongo?.code === 27 || mongo?.codeName === 'IndexNotFound'
      || ((mongo?.code === 2 || mongo?.code === 175 || mongo?.codeName === 'QueryPlanKilled')
        && /hint|index/iu.test(mongo.message ?? ''))
  }
  private async hasCompleteManualPrefixPairs(input: ManualWindowInput, maximumOrdinal: number, recordIndexName: string): Promise<boolean> {
    const range = { $gte: 1, $lte: maximumOrdinal }
    const anomalies = await this.model.aggregate([
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId, creationOrdinal: range } },
      { $project: { _id: 0, ordinal: '$creationOrdinal', recordId: '$id', kind: { $literal: 'record' } } },
      { $unionWith: { coll: 'database_view_order_overrides', pipeline: [
        { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId, orderScopeId: input.scopeId,
          sourceCreationOrdinal: range } },
        { $project: { _id: 0, ordinal: '$sourceCreationOrdinal', recordId: '$recordId', kind: { $literal: 'override' } } },
      ] } },
      { $group: { _id: { ordinal: '$ordinal', recordId: '$recordId' },
        recordCount: { $sum: { $cond: [{ $eq: ['$kind', 'record'] }, 1, 0] } },
        overrideCount: { $sum: { $cond: [{ $eq: ['$kind', 'override'] }, 1, 0] } } } },
      { $match: { $or: [{ recordCount: { $ne: 1 } }, { overrideCount: { $ne: 1 } }] } },
      { $limit: 1 },
    ] as PipelineStage[]).hint(recordIndexName)
      .collation({ locale: 'simple' }).allowDiskUse(true).exec()
    return anomalies.length === 0
  }
  private async manualPrefixCannotBeSaturated(input: ManualWindowInput, maximumOrdinal: number,
    indexes: { record: string; source: string }): Promise<boolean> {
    // A mismatch in any real ordinal prefix disproves complete coverage. Equal
    // counts are never a proof: the full (ordinal, recordId) check still follows.
    const docs = await this.model.find({ workspaceId: input.workspaceId, databaseId: input.databaseId,
      creationOrdinal: { $gte: 1, $lte: maximumOrdinal } })
      .select({ _id: 0, creationOrdinal: 1, id: 1 }).sort({ creationOrdinal: 1, id: 1 })
      .hint(indexes.record).collation({ locale: 'simple' }).limit(MANUAL_PREFIX_PROBE_RECORDS + 1).lean().exec()
    for (let index = 0; index < docs.length; index++) {
      if (!Number.isSafeInteger(docs[index]!.creationOrdinal) || docs[index]!.creationOrdinal < 1
        || typeof docs[index]!.id !== 'string' || !docs[index]!.id) {
        throw new ManualOrderIndexCorruptionError('Record prefix key is invalid')
      }
      if (index > 0 && docs[index]!.creationOrdinal === docs[index - 1]!.creationOrdinal) {
        throw new ManualOrderIndexCorruptionError('Record creation ordinal repeats in prefix probe')
      }
    }
    const sample = docs.slice(0, MANUAL_PREFIX_PROBE_RECORDS)
    if (sample.length === 0) return false
    const lastOrdinal = sample.at(-1)!.creationOrdinal
    const sourceCount = await this.overrides.countDocuments({ workspaceId: input.workspaceId, databaseId: input.databaseId,
      orderScopeId: input.scopeId, sourceCreationOrdinal: { $gte: 1, $lte: lastOrdinal } },
    { limit: sample.length + 1 }).hint(indexes.source).collation({ locale: 'simple' }).exec()
    return sourceCount !== sample.length
  }
  private async readIndexedManualDefaults(input: ManualWindowInput, titleId: string, remote?: ManualBoundary,
    knownIndexes?: { record: string; source: string }): Promise<ManualRecordRow[] | null> {
    const indexes = knownIndexes ?? await this.hasManualStreamIndexes()
    if (!indexes) return null
    const ascending = input.direction === 'after'
    const sign = ascending ? 1 : -1
    const min = Math.max(1, ascending ? input.boundary?.position.slotOrdinal ?? 1 : remote?.position.slotOrdinal ?? 1)
    const max = ascending ? remote?.position.slotOrdinal ?? Number.MAX_SAFE_INTEGER : input.boundary?.position.slotOrdinal ?? Number.MAX_SAFE_INTEGER
    if (max < min) return []
    const scope = { workspaceId: input.workspaceId, databaseId: input.databaseId, orderScopeId: input.scopeId }
    const config = { ...DEFAULT_DATABASE_VIEW_CONFIG, filters: input.filters }
    const range = { $gte: min, $lte: max }
    const fetchRecordKeys = async (after: number | undefined, limit: number): Promise<ManualOrderKey[]> => {
      const docs = await this.model.find({ workspaceId: input.workspaceId, databaseId: input.databaseId,
        creationOrdinal: { ...range, ...(after === undefined ? {} : { [ascending ? '$gt' : '$lt']: after }) } })
        .select({ _id: 0, id: 1, creationOrdinal: 1 }).sort({ creationOrdinal: sign, id: sign })
        .hint(indexes.record).collation({ locale: 'simple' })
        .limit(limit + 1).session(input.session ?? null).lean().exec()
      return checkedManualOrdinalPage(docs.map(doc => ({ ordinal: doc.creationOrdinal, recordId: doc.id })), limit, 'Record creation')
    }
    const fetchOverrideKeys = async (after: number | undefined, limit: number): Promise<ManualOrderKey[]> => {
      const docs = await this.overrides.find({ ...scope,
        sourceCreationOrdinal: { ...range, ...(after === undefined ? {} : { [ascending ? '$gt' : '$lt']: after }) } })
        .select({ _id: 0, sourceCreationOrdinal: 1, recordId: 1 }).sort({ sourceCreationOrdinal: sign, recordId: sign })
        .hint(indexes.source).collation({ locale: 'simple' })
        .limit(limit + 1).session(input.session ?? null).lean().exec()
      return checkedManualOrdinalPage(docs.map(doc => ({ ordinal: doc.sourceCreationOrdinal, recordId: doc.recordId })), limit, 'override source')
    }
    const result = await readManualOrderDefaultIndexStream<ManualRecordRow>({ direction: input.direction, take: input.take,
      ordinalRange: { min, max }, ...(input.boundary ? { boundary: input.boundary } : {}), ...(remote ? { remote } : {}),
      ...(input.excludeRecordId ? { excludeRecordId: input.excludeRecordId } : {}), batchSize: 1024, keyBatchSize: 8192,
      fetchRecordKeys, fetchOverrideKeys,
      verifyDefaultCandidates: async keys => {
        const found = await this.overrides.find({ ...scope, recordId: { $in: keys.map(key => key.recordId) } })
          .select({ _id: 0, recordId: 1 }).collation({ locale: 'simple' }).session(input.session ?? null).lean().exec()
        if (found.length) throw new ManualOrderIndexCorruptionError('candidate has an override with a mismatched source ordinal')
      },
      filterAndProject: async keys => {
        const pipeline: Record<string, unknown>[] = [
          { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId, id: { $in: keys.map(key => key.recordId) } } },
          ...this.groupStages(input.group, input.queryTokensReady),
          ...this.filterStages(input.properties, config, false),
          { $set: { position: { slotOrdinal: '$creationOrdinal', rank: '1' } } },
          ...this.pageAndTitleFilterStages(input.workspaceId, input.properties, config),
          ...this.tableProjectionStages(titleId),
        ]
        const docs = await this.model.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
        return docs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
      },
    })
    return result.rows
  }
  async readManualWindow(input: ManualWindowInput): Promise<ManualRecordRow[]> {
    const title = input.properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const selected = await this.readSelectiveManualWindow(input, title.id)
    if (selected) return selected
    const ascending = input.direction === 'after'
    const sign = ascending ? 1 : -1
    const scope = { workspaceId: input.workspaceId, databaseId: input.databaseId, orderScopeId: input.scopeId }
    const effectiveFilter = { ...DEFAULT_DATABASE_VIEW_CONFIG, filters: input.filters }
    const baseBoundary = input.boundary?.position.slotOrdinal
    const baseMatch: Record<string, unknown> = { workspaceId: input.workspaceId, databaseId: input.databaseId, creationOrdinal: { [ascending ? '$gte' : '$lte']: baseBoundary ?? (ascending ? 0 : Number.MAX_SAFE_INTEGER) } }
    if (input.excludeRecordId) baseMatch.id = { $ne: input.excludeRecordId }
    const overridePipeline: Record<string, unknown>[] = input.manualActive ? [
      { $match: { ...scope, ...(input.excludeRecordId ? { recordId: { $ne: input.excludeRecordId } } : {}) } },
      ...(input.boundary ? [{ $match: { $or: [
        { slotOrdinal: { [ascending ? '$gt' : '$lt']: input.boundary.position.slotOrdinal } },
        { slotOrdinal: input.boundary.position.slotOrdinal, rank: { [ascending ? '$gt' : '$lt']: input.boundary.position.rank } },
        { slotOrdinal: input.boundary.position.slotOrdinal, rank: input.boundary.position.rank, recordId: { [ascending ? '$gt' : '$lt']: input.boundary.recordId } },
      ] } }] : []),
      { $sort: { slotOrdinal: sign, rank: sign } },
      { $lookup: { from: 'database_records', let: { recordId: '$recordId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$id', '$$recordId'] }, { $eq: ['$workspaceId', { $literal: input.workspaceId }] }, { $eq: ['$databaseId', { $literal: input.databaseId }] }] } } },
      ], as: '_record' } },
      { $unwind: '$_record' },
      { $replaceRoot: { newRoot: { $mergeObjects: ['$_record', { position: { slotOrdinal: '$slotOrdinal', rank: '$rank' } }] } } },
      ...this.groupStages(input.group, input.queryTokensReady),
      ...this.pageFilterStages(input.workspaceId, input.properties, effectiveFilter),
      { $limit: input.take },
      ...this.tableProjectionStages(title.id),
    ] : []
    const overrideDocs = input.manualActive
      ? await this.overrides.aggregate(overridePipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
      : []
    const overrides = overrideDocs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
    if (input.manualActive && await this.model.exists({ workspaceId: input.workspaceId, databaseId: input.databaseId,
      $or: [{ creationOrdinal: { $lt: 1 } }, { creationOrdinal: { $gt: Number.MAX_SAFE_INTEGER } }] }).session(input.session ?? null)) {
      throw new TypeError('Database record creation ordinal is outside the safe range')
    }
    let exactOnly = false
    let streamIndexes: { record: string; source: string } | undefined
    // The default rank is '1'. Only an override strictly before it excludes the
    // record at the same slot from the first-page prefix proof.
    if (input.manualActive && !input.session && input.filters.length === 0 && !input.group && input.direction === 'after' && !input.boundary && !input.excludeRecordId && overrides.length >= input.take) {
      const remote = overrides.at(-1)!.position
      const maximumDefaultOrdinal = remote.slotOrdinal - (remote.rank < '1' ? 1 : 0)
      if (maximumDefaultOrdinal < 1) return overrides
      try {
        const indexes = await this.hasManualStreamIndexes()
        if (!indexes) exactOnly = true
        else {
          streamIndexes = indexes
          const sourceFilter = { ...scope, sourceCreationOrdinal: { $gte: 1, $lte: maximumDefaultOrdinal } }
          const smallOverrideCount = await this.overrides.countDocuments(sourceFilter, { limit: 257 })
            .hint(indexes.source).collation({ locale: 'simple' }).exec()
          let mayBeComplete = false
          if (smallOverrideCount < 257) {
            const recordCount = await this.model.countDocuments({ workspaceId: input.workspaceId, databaseId: input.databaseId,
              creationOrdinal: { $gte: 1, $lte: maximumDefaultOrdinal } }, { limit: smallOverrideCount + 1 })
              .hint(indexes.record).collation({ locale: 'simple' }).exec()
            mayBeComplete = recordCount === smallOverrideCount
          } else if (!await this.manualPrefixCannotBeSaturated(input, maximumDefaultOrdinal, indexes)) {
            const overrideCount = await this.overrides.countDocuments(sourceFilter).hint(indexes.source)
              .collation({ locale: 'simple' }).exec()
            const recordCount = await this.model.countDocuments({ workspaceId: input.workspaceId, databaseId: input.databaseId,
              creationOrdinal: { $gte: 1, $lte: maximumDefaultOrdinal } }, { limit: overrideCount + 1 })
              .hint(indexes.record).collation({ locale: 'simple' }).exec()
            mayBeComplete = recordCount === overrideCount
          }
          if (mayBeComplete && await this.hasCompleteManualPrefixPairs(input, maximumDefaultOrdinal, indexes.record)) return overrides
        }
      } catch (error) {
        if (!(error instanceof ManualOrderIndexCorruptionError) && !this.isManualHintUnavailable(error)) throw error
        exactOnly = true
      }
    }
    // A full override window gives a remote bound for the default stream.
    const remote = overrides.length >= input.take
      ? { position: overrides.at(-1)!.position, recordId: overrides.at(-1)!.id }
      : undefined
    if (overrides.length >= input.take) {
      const remote = overrides.at(-1)!.position.slotOrdinal
      const bound = baseMatch.creationOrdinal as Record<string, number>
      bound[ascending ? '$lte' : '$gte'] = remote
    }
    let indexedDefaults: ManualRecordRow[] | null = null
    if (input.manualActive && !exactOnly) {
      try { indexedDefaults = await this.readIndexedManualDefaults(input, title.id, remote, streamIndexes) }
      catch (error) {
        if (!(error instanceof ManualOrderIndexCorruptionError) && (input.session || !this.isManualHintUnavailable(error))) throw error
      }
    }
    const defaultPipeline: Record<string, unknown>[] = [
      { $match: baseMatch },
      { $sort: { creationOrdinal: sign, id: sign } },
      ...this.groupStages(input.group, input.queryTokensReady),
      ...this.filterStages(input.properties, effectiveFilter, false),
      ...(input.manualActive ? [
        { $set: { _orderJoinKey: {
          workspaceId: { $literal: input.workspaceId }, databaseId: { $literal: input.databaseId },
          orderScopeId: { $literal: input.scopeId }, recordId: '$id',
        } } },
        { $lookup: { from: 'database_view_order_overrides', localField: '_orderJoinKey', foreignField: 'joinKey', as: '_override' } },
        { $match: { _override: { $eq: [] } } },
      ] : []),
      { $set: { position: { slotOrdinal: '$creationOrdinal', rank: '1' } } },
      ...(input.boundary ? [{ $match: { $expr: { $or: [
        { [ascending ? '$gt' : '$lt']: ['$creationOrdinal', input.boundary.position.slotOrdinal] },
        { $and: [
          { $eq: ['$creationOrdinal', input.boundary.position.slotOrdinal] },
          { $or: [
            { [ascending ? '$gt' : '$lt']: ['1', { $literal: input.boundary.position.rank }] },
            { $and: [{ $eq: ['1', { $literal: input.boundary.position.rank }] }, { [ascending ? '$gt' : '$lt']: ['$id', { $literal: input.boundary.recordId }] }] },
          ] },
        ] },
      ] } } }] : []),
      ...this.pageAndTitleFilterStages(input.workspaceId, input.properties, effectiveFilter),
      { $limit: input.take },
      ...this.tableProjectionStages(title.id),
    ]
    const defaultDocs = indexedDefaults === null
      ? await this.model.aggregate(defaultPipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
      : []
    const defaults = indexedDefaults ?? defaultDocs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
    const merged = [...defaults, ...overrides].sort((a, b) => sign * (compareViewOrderPosition(a.position, b.position) || Buffer.compare(Buffer.from(a.id, 'utf8'), Buffer.from(b.id, 'utf8'))))
    if (new Set(merged.map(row => row.id)).size !== merged.length) throw new TypeError('Database view order streams overlap')
    if (merged.some((row, index) => index > 0 && compareViewOrderPosition(row.position, merged[index - 1]!.position) === 0)) throw new TypeError('Database view order positions overlap')
    return merged.slice(0, input.take)
  }
  private async readSelectiveManualWindow(input: ManualWindowInput, titleId: string): Promise<ManualRecordRow[] | null> {
    const config = { ...DEFAULT_DATABASE_VIEW_CONFIG, filters: input.filters }
    const recordStages = [...this.groupStages(input.group, input.queryTokensReady), ...this.filterStages(input.properties, config, false)]
    if (recordStages.length === 0) return null
    const candidates = await this.model.aggregate<{ id: string }>([
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId } },
      ...recordStages,
      { $limit: 257 },
      { $project: { _id: 0, id: 1 } },
    ] as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    if (candidates.length > 256) return null
    if (candidates.length === 0) return []
    const sign = input.direction === 'after' ? 1 : -1
    const comparison = sign === 1 ? '$gt' : '$lt'
    const pipeline: Record<string, unknown>[] = [
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId,
        id: { $in: candidates.map(row => row.id), ...(input.excludeRecordId ? { $ne: input.excludeRecordId } : {}) } } },
      ...(input.manualActive ? [
        { $set: { _orderJoinKey: { workspaceId: { $literal: input.workspaceId }, databaseId: { $literal: input.databaseId },
          orderScopeId: { $literal: input.scopeId }, recordId: '$id' } } },
        { $lookup: { from: 'database_view_order_overrides', localField: '_orderJoinKey', foreignField: 'joinKey', as: '_override' } },
      ] : []),
      ...this.groupStages(input.group, input.queryTokensReady),
      { $set: { position: input.manualActive
        ? { slotOrdinal: { $ifNull: [{ $first: '$_override.slotOrdinal' }, '$creationOrdinal'] }, rank: { $ifNull: [{ $first: '$_override.rank' }, '1'] } }
        : { slotOrdinal: '$creationOrdinal', rank: '1' } } },
      ...(input.boundary ? [{ $match: { $expr: { $or: [
        { [comparison]: ['$position.slotOrdinal', input.boundary.position.slotOrdinal] },
        { $and: [{ $eq: ['$position.slotOrdinal', input.boundary.position.slotOrdinal] }, { [comparison]: ['$position.rank', { $literal: input.boundary.position.rank }] }] },
        { $and: [{ $eq: ['$position.slotOrdinal', input.boundary.position.slotOrdinal] }, { $eq: ['$position.rank', { $literal: input.boundary.position.rank }] }, { [comparison]: ['$id', { $literal: input.boundary.recordId }] }] },
      ] } } }] : []),
      ...this.pageFilterStages(input.workspaceId, input.properties, config),
      { $sort: { 'position.slotOrdinal': sign, 'position.rank': sign, id: sign } },
      { $limit: input.take },
      ...this.tableProjectionStages(titleId),
    ]
    const docs = await this.model.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    const rows = docs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
    if (rows.some((row, index) => index > 0 && compareViewOrderPosition(row.position, rows[index - 1]!.position) === 0)) throw new TypeError('Database view order positions overlap')
    return rows
  }
  async referencesPage(workspaceId: string, pageId: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, pageId }).session(session ?? null))
  }
  async updateProperties(workspaceId: string, databaseId: string, id: string, expectedVersion: number, properties: DatabaseRecord['properties'], session: ClientSession): Promise<DatabaseRecord | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: {
      properties: { $literal: properties }, queryTokens: { $literal: queryTokens(properties) }, queryTokenSourceVersion: { $add: ['$version', 1] },
      version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] },
    } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async listForCleanup(workspaceId: string, databaseId: string, session: ClientSession, limit = DATABASE_RECORD_SCAN_MAX_RECORDS): Promise<DatabaseRecord[]> {
    return (await this.model.find({ workspaceId, databaseId }).sort({ id: 1 }).limit(limit + 1).session(session).exec()).map(doc => this.toRecord(doc))
  }
  private toRecord(doc: DatabaseRecordDocument): DatabaseRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, pageId: doc.pageId, properties: doc.properties, version: doc.version, ...dates(doc) }
  }
}

@Injectable()
export class DatabaseViewRepository {
  constructor(@InjectModel(DatabaseViewEntity.name) private readonly model: Model<DatabaseViewDocument>) {}
  async create(input: Stored<DatabaseView>, session: ClientSession): Promise<DatabaseView> {
    const [doc] = await this.model.create([{ ...input, config: input.config ?? DEFAULT_DATABASE_VIEW_CONFIG, orderScopeId: randomUUID(), manualOrderActive: false }], { session })
    return this.toRecord(doc!)
  }
  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<DatabaseView | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }
  async getOrderState(workspaceId: string, databaseId: string, id: string, session?: ClientSession): Promise<DatabaseViewOrderState | null> {
    const doc = await this.model.findOne({ workspaceId, databaseId, id }).select({ orderScopeId: 1, manualOrderActive: 1, version: 1 }).session(session ?? null).lean().exec()
    if (!doc) return null
    if (!doc.orderScopeId || typeof doc.manualOrderActive !== 'boolean') throw new TypeError('Database view order state is missing')
    return { orderScopeId: doc.orderScopeId, manualOrderActive: doc.manualOrderActive, version: doc.version }
  }
  async listActiveOrderScopeIds(workspaceId: string, databaseId: string, session?: ClientSession): Promise<string[]> {
    const docs = await this.model.find({ workspaceId, databaseId }).select({ orderScopeId: 1 }).limit(101).session(session ?? null).lean().exec()
    if (docs.length > 100 || docs.some(doc => !doc.orderScopeId)) throw new TypeError('Database view order scopes are invalid')
    return docs.map(doc => doc.orderScopeId)
  }
  async activateManualOrder(workspaceId: string, databaseId: string, id: string, expectedVersion: number, session: ClientSession): Promise<DatabaseView | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion, orderScopeId: { $exists: true } }, [{ $set: { manualOrderActive: true, version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async list(workspaceId: string, databaseId: string, session?: ClientSession): Promise<DatabaseView[]> {
    return (await this.model.find({ workspaceId, databaseId }).sort({ createdAt: 1, id: 1 }).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async listWindow(workspaceId: string, databaseId: string, limit: number, session?: ClientSession): Promise<DatabaseView[]> {
    const docs = await this.model.find({ workspaceId, databaseId }).sort({ id: 1 }).limit(limit + 1).session(session ?? null).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  async update(workspaceId: string, databaseId: string, id: string, expectedVersion: number, patch: { name?: string; config?: DatabaseViewConfig }, session: ClientSession): Promise<DatabaseView | null> {
    const set: Record<string, unknown> = { version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } }
    if (patch.name !== undefined) set.name = { $literal: patch.name }
    if (patch.config !== undefined) set.config = { $literal: patch.config }
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: set }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async delete(workspaceId: string, databaseId: string, id: string, expectedVersion: number, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, databaseId, id, version: expectedVersion }, { session }).exec())
  }
  async touchReferenceFence(workspaceId: string, databaseId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate({ workspaceId, databaseId, id }, { $inc: { referenceFence: 1 } }, { session, returnDocument: 'after' }).exec())
  }
  async updateConfigForProperty(workspaceId: string, databaseId: string, view: DatabaseView, config: DatabaseViewConfig, session: ClientSession): Promise<DatabaseView | null> {
    return this.update(workspaceId, databaseId, view.id, view.version, { config }, session)
  }
  private toRecord(doc: DatabaseViewDocument): DatabaseView {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, name: doc.name, type: doc.type, config: doc.config === undefined ? DEFAULT_DATABASE_VIEW_CONFIG : doc.config, version: doc.version, ...dates(doc) }
  }
}
