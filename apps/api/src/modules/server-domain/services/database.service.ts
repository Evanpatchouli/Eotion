import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { isValidDatabaseProperty, validateDatabaseRecordValues, type Database, type DatabaseProperty, type DatabaseRecord, type DatabaseView } from '@eotion/domain'
import { DatabaseCreateInPageRequestSchema, DatabasePropertyCreateRequestSchema, DatabaseRecordCreateRequestSchema, DatabaseViewCreateRequestSchema } from '@eotion/contracts'
import type { ClientSession, Connection } from 'mongoose'
import { DatabasePropertyRepository, DatabaseRecordRepository, DatabaseRepository, DatabaseViewRepository } from '../repositories/database.repository'
import { PageRepository } from '../repositories/page.repository'
import { BlockService } from './block.service'
import { supportsTransactions } from './mongo-transactions'
import { WorkspacePermissionService } from './workspace-permission.service'
import type { ServerBlockRecord } from '../types'

type CreateInPage = { id: string; name: string; titlePropertyId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }
type CreateProperty = { id: string; name: string; type: DatabaseProperty['type']; options?: DatabaseProperty['options'] }
type CreateRecord = { id: string; pageId: string; properties: DatabaseRecord['properties'] }
type CreateView = { id: string; name: string; type: DatabaseView['type'] }

@Injectable()
export class DatabaseService {
  constructor(
    private readonly databases: DatabaseRepository,
    private readonly properties: DatabasePropertyRepository,
    private readonly records: DatabaseRecordRepository,
    private readonly views: DatabaseViewRepository,
    private readonly pages: PageRepository,
    private readonly blocks: BlockService,
    private readonly permissions: WorkspacePermissionService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createInPage(userId: string, workspaceId: string, pageId: string, input: CreateInPage): Promise<{ database: Database; titleProperty: DatabaseProperty; view: DatabaseView; block: ServerBlockRecord }> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.parse(DatabaseCreateInPageRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.create({ id: input.id, workspaceId, name: input.name, version: 1 }, session)
      const titleProperty = await this.properties.create({ id: input.titlePropertyId, workspaceId, databaseId: input.id, name: 'Name', type: 'title', version: 1 }, session)
      const view = await this.views.create({ id: input.viewId, workspaceId, databaseId: input.id, name: 'Table', type: 'table', version: 1 }, session)
      const block = await this.blocks.create(userId, workspaceId, pageId, { id: input.blockId, pageId, parentBlockId: input.parentBlockId, type: 'database', orderKey: input.orderKey, props: { node: { type: 'eotionDatabase', attrs: { databaseId: input.id, viewId: input.viewId } } } }, session)
      return { database, titleProperty, view, block }
    })
  }

  async find(userId: string, workspaceId: string, id: string): Promise<Database | null> {
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.databases.findInWorkspace(workspaceId, id)
  }

  async listProperties(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseProperty[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.properties.list(workspaceId, databaseId)
  }

  async listRecords(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseRecord[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.records.list(workspaceId, databaseId)
  }

  async listViews(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseView[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.views.list(workspaceId, databaseId)
  }

  async createProperty(userId: string, workspaceId: string, databaseId: string, input: CreateProperty): Promise<DatabaseProperty> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabasePropertyCreateRequestSchema, input)
    return this.transact(async session => {
      await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      const candidate = { ...input, workspaceId, databaseId, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      if (!isValidDatabaseProperty(candidate)) throw new BadRequestException('Invalid database property')
      if (input.type === 'title' && (await this.properties.list(workspaceId, databaseId, session)).some(property => property.type === 'title')) throw new BadRequestException('Database already has a title property')
      return this.properties.create({ id: input.id, workspaceId, databaseId, name: input.name, type: input.type, ...(input.options === undefined ? {} : { options: input.options }), version: 1 }, session)
    })
  }

  async createRecord(userId: string, workspaceId: string, databaseId: string, input: CreateRecord): Promise<DatabaseRecord> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordCreateRequestSchema, input)
    return this.transact(async session => {
      await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      if (!validateDatabaseRecordValues(input.properties, properties)) throw new BadRequestException('Invalid database record properties')
      if (!(await this.pages.touchStructure(workspaceId, input.pageId, session))) throw new BadRequestException('Record page must belong to the same workspace')
      return this.records.create({ id: input.id, workspaceId, databaseId, pageId: input.pageId, properties: input.properties, version: 1 }, session)
    })
  }

  async createView(userId: string, workspaceId: string, databaseId: string, input: CreateView): Promise<DatabaseView> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseViewCreateRequestSchema, input)
    return this.transact(async session => {
      await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      return this.views.create({ id: input.id, workspaceId, databaseId, name: input.name, type: 'table', version: 1 }, session)
    })
  }

  private async requireDatabase(userId: string, workspaceId: string, databaseId: string, write: boolean, session?: ClientSession): Promise<Database> {
    if (write) await this.permissions.assertCanWrite(userId, workspaceId)
    else await this.permissions.assertCanRead(userId, workspaceId)
    const database = await this.databases.findInWorkspace(workspaceId, databaseId, session)
    if (!database) throw new NotFoundException('Database not found in workspace')
    return database
  }

  private parse(schema: { safeParse: (value: unknown) => { success: boolean } }, input: unknown): void {
    if (!schema.safeParse(input).success) throw new BadRequestException('Invalid database input')
  }

  private async transact<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    if (!(await supportsTransactions(this.connection))) throw new ServiceUnavailableException('Database writes require MongoDB replica set transactions')
    const session = await this.connection.startSession()
    try {
      let result!: T
      await session.withTransaction(async () => { result = await operation(session) })
      return result
    } finally {
      await session.endSession()
    }
  }
}
