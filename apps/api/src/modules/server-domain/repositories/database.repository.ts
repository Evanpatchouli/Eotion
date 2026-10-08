import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Database, DatabaseProperty, DatabaseRecord, DatabaseView } from '@eotion/domain'
import type { ClientSession, Model } from 'mongoose'
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
  async listWindow(workspaceId: string, databaseId: string, input: { cursor?: string; limit: number }, session?: ClientSession): Promise<DatabaseRecord[]> {
    const filter: Record<string, unknown> = { workspaceId, databaseId }
    if (input.cursor !== undefined) filter.id = { $gt: input.cursor }
    const docs = await this.model.find(filter).sort({ id: 1 }).limit(input.limit + 1).session(session ?? null).exec()
    return docs.map(doc => this.toRecord(doc))
  }
  async referencesPage(workspaceId: string, pageId: string, session?: ClientSession): Promise<boolean> {
    return !!(await this.model.exists({ workspaceId, pageId }).session(session ?? null))
  }
  private toRecord(doc: DatabaseRecordDocument): DatabaseRecord {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, pageId: doc.pageId, properties: doc.properties, version: doc.version, ...dates(doc) }
  }
}

@Injectable()
export class DatabaseViewRepository {
  constructor(@InjectModel(DatabaseViewEntity.name) private readonly model: Model<DatabaseViewDocument>) {}
  async create(input: Stored<DatabaseView>, session: ClientSession): Promise<DatabaseView> {
    const [doc] = await this.model.create([input], { session })
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
  private toRecord(doc: DatabaseViewDocument): DatabaseView {
    return { id: doc.id, workspaceId: doc.workspaceId, databaseId: doc.databaseId, name: doc.name, type: doc.type, version: doc.version, ...dates(doc) }
  }
}
