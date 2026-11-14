import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'node:crypto'
import { DATABASE_RECORD_SCAN_MAX_RECORDS, DEFAULT_DATABASE_VIEW_CONFIG, compareViewOrderPosition } from '@eotion/domain'
import type { Database, DatabaseProperty, DatabaseRecord, DatabaseTableRecord, DatabaseView, DatabaseViewConfig } from '@eotion/domain'
import { getDatabaseDateStartInstant } from '@eotion/domain/date'
import type { ClientSession, Model, PipelineStage } from 'mongoose'
import { DatabaseDocument, DatabaseEntity } from '../schemas/database.schema'
import { DatabasePropertyDocument, DatabasePropertyEntity } from '../schemas/database-property.schema'
import { DatabaseRecordDocument, DatabaseRecordEntity } from '../schemas/database-record.schema'
import { DatabaseViewDocument, DatabaseViewEntity } from '../schemas/database-view.schema'
import { DatabaseViewOrderOverrideEntity, type DatabaseViewOrderOverrideDocument } from '../schemas/database-view-order.schema'

type Stored<T> = Omit<T, 'createdAt' | 'updatedAt'>
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
}
export type DatabaseRecordGroupQuery = { propertyId: string; optionIds: readonly string[]; group: { kind: 'option'; optionId: string } | { kind: 'ungrouped' } }
const dates = (doc: { createdAt: Date; updatedAt: Date }) => ({ createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() })

@Injectable()
export class DatabaseRepository {
  constructor(@InjectModel(DatabaseEntity.name) private readonly model: Model<DatabaseDocument>) {}
  async create(input: Stored<Database> & { parentPageId?: string; orderKey?: string }, session: ClientSession): Promise<Database> {
    const [doc] = await this.model.create([input], { session })
    return { id: doc!.id, workspaceId: doc!.workspaceId, name: doc!.name, version: doc!.version, ...dates(doc!) }
  }
  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async compareAndBump(workspaceId: string, id: string, expectedVersion: number, session: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, id, version: expectedVersion }, [{ $set: { version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async rename(workspaceId: string, id: string, expectedVersion: number, name: string, session: ClientSession): Promise<Database | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, id, version: expectedVersion }, [{ $set: { name: { $literal: name }, version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? { id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) } : null
  }
  async touchAdvancedReferenceFence(workspaceId: string, id: string, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndUpdate({ workspaceId, id }, { $inc: { advancedReferenceFence: 1 } }, { session, returnDocument: 'after' }).exec())
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
    const [doc] = await this.model.create([input], { session })
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
    limit: number; anchor?: DatabaseTableRecord; session?: ClientSession; group?: DatabaseRecordGroupQuery;
  }): Promise<DatabaseTableRecord[]> {
    const title = input.properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const pipeline: Record<string, unknown>[] = [
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId } },
      ...this.groupStages(input.group),
      ...this.pageFilterStages(input.workspaceId, input.properties, input.config),
    ]
    return this.querySortedTableWindow(input, pipeline, title.id)
  }
  private async querySortedTableWindow(input: {
    workspaceId: string; databaseId: string; properties: readonly DatabaseProperty[]; config: DatabaseViewConfig;
    limit: number; anchor?: DatabaseTableRecord; session?: ClientSession; group?: DatabaseRecordGroupQuery;
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
  private groupStages(group?: DatabaseRecordGroupQuery): Record<string, unknown>[] {
    if (!group) return []
    const value = { $ifNull: [{ $getField: { field: { $literal: group.propertyId }, input: { $ifNull: ['$properties', {}] } } }, null] }
    const expression = group.group.kind === 'option'
      ? { $eq: [value, { $literal: group.group.optionId }] }
      : { $not: [{ $in: [value, { $literal: group.optionIds }] }] }
    return [{ $match: { $expr: expression } }]
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
      ...this.groupStages(input.group),
      ...this.pageFilterStages(input.workspaceId, input.properties, effectiveFilter),
      { $limit: input.take },
      ...this.tableProjectionStages(title.id),
    ] : []
    const overrideDocs = input.manualActive
      ? await this.overrides.aggregate(overridePipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
      : []
    const overrides = overrideDocs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
    // The default rank is '1'. Only an override strictly before it excludes the
    // record at the same slot from the first-page prefix proof.
    if (input.manualActive && input.filters.length === 0 && !input.group && input.direction === 'after' && !input.boundary && !input.excludeRecordId && overrides.length >= input.take) {
      const remote = overrides.at(-1)!.position
      const maximumDefaultOrdinal = remote.slotOrdinal - (remote.rank < '1' ? 1 : 0)
      if (maximumDefaultOrdinal < 1) return overrides
      const recordCount = await this.model.countDocuments({ workspaceId: input.workspaceId, databaseId: input.databaseId,
        creationOrdinal: { $gte: 1, $lte: maximumDefaultOrdinal } }).session(input.session ?? null).exec()
      const overrideCount = await this.overrides.countDocuments({ ...scope,
        sourceCreationOrdinal: { $gte: 1, $lte: maximumDefaultOrdinal } }).collation({ locale: 'simple' }).session(input.session ?? null).exec()
      if (recordCount === overrideCount) return overrides
    }
    // A full override window gives a remote bound for the default stream.
    if (overrides.length >= input.take) {
      const remote = overrides.at(-1)!.position.slotOrdinal
      const bound = baseMatch.creationOrdinal as Record<string, number>
      bound[ascending ? '$lte' : '$gte'] = remote
    }
    const defaultPipeline: Record<string, unknown>[] = [
      { $match: baseMatch },
      { $sort: { creationOrdinal: sign, id: sign } },
      ...this.groupStages(input.group),
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
    const defaultDocs = await this.model.aggregate(defaultPipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    const defaults = defaultDocs.map((doc: Record<string, unknown>) => ({ ...this.toTableRow(doc), position: doc.position as ManualRecordRow['position'] }))
    const merged = [...defaults, ...overrides].sort((a, b) => sign * (compareViewOrderPosition(a.position, b.position) || Buffer.compare(Buffer.from(a.id, 'utf8'), Buffer.from(b.id, 'utf8'))))
    if (new Set(merged.map(row => row.id)).size !== merged.length) throw new TypeError('Database view order streams overlap')
    if (merged.some((row, index) => index > 0 && compareViewOrderPosition(row.position, merged[index - 1]!.position) === 0)) throw new TypeError('Database view order positions overlap')
    return merged.slice(0, input.take)
  }
  private async readSelectiveManualWindow(input: ManualWindowInput, titleId: string): Promise<ManualRecordRow[] | null> {
    const config = { ...DEFAULT_DATABASE_VIEW_CONFIG, filters: input.filters }
    const recordStages = [...this.groupStages(input.group), ...this.filterStages(input.properties, config, false)]
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
      ...this.groupStages(input.group),
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
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: { properties: { $literal: properties }, version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
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
