import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { isValidDatabaseProperty, validateDatabaseRecordValues, type Database, type DatabaseProperty, type DatabaseRecord, type DatabaseView } from '@eotion/domain'
import { DatabaseCreateInPageRequestSchema, DatabaseLinkInPageRequestSchema, DatabasePropertyCreateRequestSchema, DatabaseRecordCreateRequestSchema, DatabaseRecordPageCreateRequestSchema, DatabaseViewCreateRequestSchema } from '@eotion/contracts'
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
type WindowInput = { cursor?: string; limit: number }

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

  async listWindow(userId: string, workspaceId: string, input: WindowInput): Promise<{ items: Database[]; nextCursor: string | null }> {
    this.validateWindow(input)
    await this.permissions.assertCanRead(userId, workspaceId)
    return this.toWindow(await this.databases.listWindow(workspaceId, input), input.limit)
  }

  async listViewsWindow(userId: string, workspaceId: string, databaseId: string, limit: number): Promise<DatabaseView[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Limit must be an integer between 1 and 100')
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    const rows = await this.views.listWindow(workspaceId, databaseId, limit)
    if (rows.length > limit) throw new BadRequestException('Database exceeds the maximum of 100 views')
    return rows
  }

  async getTable(userId: string, workspaceId: string, databaseId: string, viewId: string, input: WindowInput) {
    this.validateWindow(input)
    const database = await this.requireDatabase(userId, workspaceId, databaseId, false)
    const view = await this.views.findInWorkspace(workspaceId, viewId)
    if (!view || view.databaseId !== database.id || view.type !== 'table') throw new NotFoundException('Database view not found')
    const properties = await this.properties.listLimited(workspaceId, databaseId, 101)
    if (properties.length > 100) throw new BadRequestException('Database exceeds the maximum of 100 properties')
    const records = await this.records.listWindow(workspaceId, databaseId, input)
    const window = this.toWindow(records, input.limit)
    return { database, view, properties, records: window.items, nextCursor: window.nextCursor }
  }

  async linkInPage(userId: string, workspaceId: string, pageId: string, input: { databaseId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }): Promise<{ block: ServerBlockRecord }> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.parse(DatabaseLinkInPageRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.findInWorkspace(workspaceId, input.databaseId, session)
      const view = await this.views.findInWorkspace(workspaceId, input.viewId, session)
      if (!database || !view || view.databaseId !== database.id || view.type !== 'table') throw new BadRequestException('Database view must belong to the database and workspace')
      const block = await this.blocks.create(userId, workspaceId, pageId, {
        id: input.blockId,
        pageId,
        parentBlockId: input.parentBlockId,
        type: 'database',
        orderKey: input.orderKey,
        props: { node: { type: 'eotionDatabase', attrs: { databaseId: input.databaseId, viewId: input.viewId } } },
      }, session)
      return { block }
    })
  }

  async createRecordPage(userId: string, workspaceId: string, databaseId: string, input: { id: string; pageId: string; title: string; orderKey: string }): Promise<{ record: DatabaseRecord; page: Awaited<ReturnType<PageRepository['create']>> }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordPageCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const title = properties.find(property => property.type === 'title')
      if (!title) throw new BadRequestException('Database title property is missing')
      const values = { [title.id]: input.title }
      if (!validateDatabaseRecordValues(values, properties)) throw new BadRequestException('Invalid database record properties')
      const page = await this.pages.create(workspaceId, { id: input.pageId, parentPageId: null, title: input.title, orderKey: input.orderKey }, session)
      const record = await this.records.create({ id: input.id, workspaceId, databaseId: database.id, pageId: page.id, properties: values, version: 1 }, session)
      return { record, page }
    })
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

  private validateWindow(input: WindowInput): void {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new BadRequestException('Limit must be an integer between 1 and 100')
    if (input.cursor !== undefined && (input.cursor.length < 1 || input.cursor.length > 256 || input.cursor.trim() !== input.cursor)) throw new BadRequestException('Invalid cursor')
  }

  private toWindow<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null }
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
