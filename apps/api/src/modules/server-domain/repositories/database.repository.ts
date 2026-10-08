import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { DEFAULT_DATABASE_VIEW_CONFIG } from '@eotion/domain'
import type { Database, DatabaseProperty, DatabaseRecord, DatabaseTableRecord, DatabaseView, DatabaseViewConfig } from '@eotion/domain'
import type { ClientSession, Model, PipelineStage } from 'mongoose'
import { DatabaseDocument, DatabaseEntity } from '../schemas/database.schema'
import { DatabasePropertyDocument, DatabasePropertyEntity } from '../schemas/database-property.schema'
import { DatabaseRecordDocument, DatabaseRecordEntity } from '../schemas/database-record.schema'
import { DatabaseViewDocument, DatabaseViewEntity } from '../schemas/database-view.schema'

type Stored<T> = Omit<T, 'createdAt' | 'updatedAt'>
const dates = (doc: { createdAt: Date; updatedAt: Date }) => ({ createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() })

@Injectable()
export class DatabaseRepository {
  constructor(@InjectModel(DatabaseEntity.name) private readonly model: Model<DatabaseDocument>) {}
  async create(input: Stored<Database>, session: ClientSession): Promise<Database> {
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
  async listWindow(workspaceId: string, input: { cursor?: string; limit: number }, session?: ClientSession): Promise<Database[]> {
    const filter: Record<string, unknown> = { workspaceId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()
    return docs.map(doc => ({ id: doc.id, workspaceId: doc.workspaceId, name: doc.name, version: doc.version, ...dates(doc) }))
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
  async update(workspaceId: string, databaseId: string, id: string, expectedVersion: number, patch: { name?: string; options?: DatabaseProperty['options'] }, session: ClientSession): Promise<DatabaseProperty | null> {
    const set: Record<string, unknown> = { version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } }
    if (patch.name !== undefined) set.name = { $literal: patch.name }
    if (patch.options !== undefined) set.options = { $literal: patch.options }
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: set }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async delete(workspaceId: string, databaseId: string, id: string, expectedVersion: number, session: ClientSession): Promise<boolean> {
    return !!(await this.model.findOneAndDelete({ workspaceId, databaseId, id, version: expectedVersion }, { session }).exec())
  }
  private toRecord(doc: DatabasePropertyDocument): DatabaseProperty {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, name: doc.name, type: doc.type as DatabaseProperty['type'], ...(doc.options === undefined ? {} : { options: doc.options.map(option => ({ id: option.id, name: option.name })) }), version: doc.version, ...dates(doc) }
  }
}

@Injectable()
export class DatabaseRecordRepository {
  constructor(@InjectModel(DatabaseRecordEntity.name) private readonly model: Model<DatabaseRecordDocument>) {}
  async create(input: Stored<DatabaseRecord>, session: ClientSession): Promise<DatabaseRecord> {
    const [doc] = await this.model.create([input], { session })
    return this.toRecord(doc!)
  }
  async list(workspaceId: string, databaseId: string, session?: ClientSession): Promise<DatabaseRecord[]> {
    return (await this.model.find({ workspaceId, databaseId }).sort({ createdAt: 1, id: 1 }).session(session ?? null).exec()).map(doc => this.toRecord(doc))
  }
  async findInDatabase(workspaceId: string, databaseId: string, id: string, session?: ClientSession): Promise<DatabaseRecord | null> {
    const doc = await this.model.findOne({ workspaceId, databaseId, id }).session(session ?? null).exec()
    return doc ? this.toRecord(doc) : null
  }
  async listWindow(workspaceId: string, databaseId: string, input: { cursor?: string; limit: number }, session?: ClientSession): Promise<DatabaseRecord[]> {
    const filter: Record<string, unknown> = { workspaceId, databaseId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  async queryTableWindow(input: {
    workspaceId: string; databaseId: string; properties: readonly DatabaseProperty[]; config: DatabaseViewConfig;
    limit: number; anchor?: DatabaseTableRecord; session?: ClientSession;
  }): Promise<DatabaseTableRecord[]> {
    const title = input.properties.find(property => property.type === 'title')
    if (!title) throw new TypeError('Database title property is missing')
    const expressions = new Map(input.properties.map(property => [property.id, property.type === 'title'
      ? '$_page.title'
      : ({ $getField: { field: { $literal: property.id }, input: { $ifNull: ['$properties', {}] } } } as unknown)]))
    const propertyExpression = (id: string): unknown => ({ $ifNull: [expressions.get(id), null] })
    const emptyExpression = (expression: unknown): unknown => ({ $or: [{ $eq: [expression, null] }, { $eq: [expression, ''] }] })
    const pipeline: Record<string, unknown>[] = [
      { $match: { workspaceId: input.workspaceId, databaseId: input.databaseId } },
      { $lookup: { from: 'pages', let: { pageId: '$pageId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$id', '$$pageId'] }, { $eq: ['$workspaceId', { $literal: input.workspaceId }] }] } } },
        { $project: { _id: 0, title: 1, updatedAt: 1 } },
      ], as: '_page' } },
      { $unwind: '$_page' },
    ]
    const filterExpr = input.config.filters.map(filter => {
      const expression = propertyExpression(filter.propertyId)
      const operator = filter.operator
      if (operator === 'is_empty') return emptyExpression(expression)
      if (operator === 'is_not_empty') return { $not: [emptyExpression(expression)] }
      if (operator === 'checked') return { $eq: [expression, true] }
      if (operator === 'unchecked') return { $eq: [expression, false] }
      const expected = { $literal: filter.value }
      if (operator === 'contains' || operator === 'does_not_contain') {
        const contains = { $gte: [{ $indexOfCP: [{ $ifNull: [expression, ''] }, expected] }, 0] }
        return operator === 'contains' ? { $and: [{ $not: [emptyExpression(expression)] }, contains] } : { $and: [{ $not: [emptyExpression(expression)] }, { $not: [contains] }] }
      }
      const compare = operator === 'is' || operator === 'eq' ? '$eq'
        : operator === 'is_not' || operator === 'ne' ? '$ne'
          : operator === 'gt' || operator === 'after' ? '$gt'
            : operator === 'gte' ? '$gte' : operator === 'lt' || operator === 'before' ? '$lt' : '$lte'
      const result = { [compare]: [expression, expected] }
      return { $and: [{ $not: [emptyExpression(expression)] }, result] }
    })
    if (filterExpr.length > 0) pipeline.push({ $match: { $expr: { $and: filterExpr } } })

    const sortFields: Record<string, unknown> = {}
    const sortOrder: Record<string, 1 | -1> = {}
    input.config.sorts.forEach((sort, index) => {
      const expression = propertyExpression(sort.propertyId)
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
      if (input.config.sorts.length === 0) pipeline.push({ $match: { id: { $gt: anchor.id } } })
      else {
        const branch: unknown[] = []
        const prefix: unknown[] = []
        input.config.sorts.forEach((sort, index) => {
          const raw = Object.hasOwn(anchor.properties, sort.propertyId) ? anchor.properties[sort.propertyId] : undefined
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
    }
    pipeline.push({ $sort: Object.keys(sortOrder).length > 0 ? { ...sortOrder, id: 1 } : { id: 1 } })
    pipeline.push({ $limit: input.limit + 1 })
    pipeline.push({ $set: { properties: { $arrayToObject: { $concatArrays: [{ $objectToArray: { $ifNull: ['$properties', {}] } }, [{ k: { $literal: title.id }, v: '$_page.title' }]] } }, pageVersion: '$_page.updatedAt' } })
    pipeline.push({ $project: { _id: 0, id: 1, databaseId: 1, workspaceId: 1, pageId: 1, properties: 1, pageVersion: 1, version: 1, createdAt: 1, updatedAt: 1 } })
    const docs = await this.model.aggregate(pipeline as unknown as PipelineStage[]).collation({ locale: 'simple' }).session(input.session ?? null).exec()
    return docs.map((doc: Record<string, unknown>) => ({
      id: doc.id as string, databaseId: doc.databaseId as string, workspaceId: doc.workspaceId as string, pageId: doc.pageId as string,
      properties: doc.properties as DatabaseTableRecord['properties'], pageVersion: new Date(doc.pageVersion as string | Date).toISOString(),
      version: doc.version as number, createdAt: new Date(doc.createdAt as string | Date).toISOString(), updatedAt: new Date(doc.updatedAt as string | Date).toISOString(),
    }))
  }
  async referencesPage(workspaceId: string, pageId: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, pageId }).session(session ?? null))
  }
  async updateProperties(workspaceId: string, databaseId: string, id: string, expectedVersion: number, properties: DatabaseRecord['properties'], session: ClientSession): Promise<DatabaseRecord | null> {
    const doc = await this.model.findOneAndUpdate({ workspaceId, databaseId, id, version: expectedVersion }, [{ $set: { properties: { $literal: properties }, version: { $add: ['$version', 1] }, updatedAt: { $max: ['$$NOW', { $add: ['$updatedAt', 1] }] } } }], { session, returnDocument: 'after', timestamps: false, updatePipeline: true }).exec()
    return doc ? this.toRecord(doc) : null
  }
  async listForCleanup(workspaceId: string, databaseId: string, session: ClientSession): Promise<DatabaseRecord[]> {
    return (await this.model.find({ workspaceId, databaseId }).session(session).exec()).map(doc => this.toRecord(doc))
  }
  private toRecord(doc: DatabaseRecordDocument): DatabaseRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, pageId: doc.pageId, properties: doc.properties, version: doc.version, ...dates(doc) }
  }
}

@Injectable()
export class DatabaseViewRepository {
  constructor(@InjectModel(DatabaseViewEntity.name) private readonly model: Model<DatabaseViewDocument>) {}
  async create(input: Stored<DatabaseView>, session: ClientSession): Promise<DatabaseView> {
    const [doc] = await this.model.create([{ ...input, config: input.config ?? DEFAULT_DATABASE_VIEW_CONFIG }], { session })
    return this.toRecord(doc!)
  }
  async findInWorkspace(workspaceId: string, id: string, session?: ClientSession): Promise<DatabaseView | null> {
    const doc = await this.model.findOne({ workspaceId, id }).session(session ?? null).exec()
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
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, name: doc.name, type: doc.type, config: doc.config ?? DEFAULT_DATABASE_VIEW_CONFIG, version: doc.version, ...dates(doc) }
  }
}
