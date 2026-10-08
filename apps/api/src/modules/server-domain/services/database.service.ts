import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { isValidDatabaseProperty, validateDatabaseRecordValues, type Database, type DatabaseProperty, type DatabaseRecord, type DatabaseTableRecord, type DatabaseView } from '@eotion/domain'
import { DatabaseCreateInPageRequestSchema, DatabaseLinkInPageRequestSchema, DatabasePropertyCreateRequestSchema, DatabasePropertyDeleteRequestSchema, DatabasePropertyUpdateRequestSchema, DatabaseRecordCellUpdateRequestSchema, DatabaseRecordCreateRequestSchema, DatabaseRecordPageCreateRequestSchema, DatabaseViewCreateRequestSchema } from '@eotion/contracts'
import type { ClientSession, Connection } from 'mongoose'
import { DatabasePropertyRepository, DatabaseRecordRepository, DatabaseRepository, DatabaseViewRepository } from '../repositories/database.repository'
import { PageRepository } from '../repositories/page.repository'
import { BlockService } from './block.service'
import { supportsTransactions } from './mongo-transactions'
import { WorkspacePermissionService } from './workspace-permission.service'
import type { ServerBlockRecord } from '../types'

type CreateInPage = { id: string; name: string; titlePropertyId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }
type CreateProperty = { id: string; name: string; type: DatabaseProperty['type']; options?: DatabaseProperty['options']; expectedDatabaseVersion: number }
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
    const projected = await this.projectRecords(workspaceId, window.items, properties)
    const latestDatabase = await this.databases.findInWorkspace(workspaceId, databaseId)
    if (!latestDatabase || latestDatabase.version !== database.version) throw new ConflictException('Database changed during table read; refresh and retry')
    return { database, view, properties, records: projected, nextCursor: window.nextCursor }
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

  async createRecordPage(userId: string, workspaceId: string, databaseId: string, input: { id: string; pageId: string; title: string; orderKey: string }): Promise<{ record: DatabaseTableRecord; page: Awaited<ReturnType<PageRepository['create']>> }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordPageCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      await this.bumpDatabaseVersion(database, session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const title = properties.find(property => property.type === 'title')
      if (!title) throw new BadRequestException('Database title property is missing')
      const page = await this.pages.create(workspaceId, { id: input.pageId, parentPageId: null, title: input.title, orderKey: input.orderKey }, session)
      const record = await this.records.create({ id: input.id, workspaceId, databaseId: database.id, pageId: page.id, properties: {}, version: 1 }, session)
      return { record: { ...record, properties: { [title.id]: page.title }, pageVersion: page.updatedAt }, page }
    })
  }

  async listProperties(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseProperty[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.properties.list(workspaceId, databaseId)
  }

  async listRecords(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseTableRecord[]> {
    const database = await this.requireDatabase(userId, workspaceId, databaseId, false)
    const [records, properties] = await Promise.all([this.records.list(workspaceId, databaseId), this.properties.list(workspaceId, databaseId)])
    const projected = await this.projectRecords(workspaceId, records, properties)
    const latest = await this.databases.findInWorkspace(workspaceId, databaseId)
    if (!latest || latest.version !== database.version) throw new ConflictException('Database changed during record read; refresh and retry')
    return projected
  }

  private async projectRecords(workspaceId: string, records: DatabaseRecord[], properties: DatabaseProperty[]): Promise<DatabaseTableRecord[]> {
    const title = properties.find(property => property.type === 'title')
    if (!title) throw new BadRequestException('Database title property is missing')
    const pages = await this.pages.findManyInWorkspace(workspaceId, records.map(record => record.pageId))
    const pageById = new Map(pages.map(page => [page.id, page]))
    return records.flatMap(record => {
      const page = pageById.get(record.pageId)
      if (!page) return []
      return [{ ...record, properties: { ...record.properties, [title.id]: page.title }, pageVersion: page.updatedAt }]
    })
  }

  async listViews(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseView[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.views.list(workspaceId, databaseId)
  }

  async createProperty(userId: string, workspaceId: string, databaseId: string, input: CreateProperty): Promise<{ database: Database; property: DatabaseProperty }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabasePropertyCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const candidate = { id: input.id, name: input.name, type: input.type, ...(input.options === undefined ? {} : { options: input.options }), workspaceId, databaseId, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      if (!isValidDatabaseProperty(candidate)) throw new BadRequestException('Invalid database property')
      if (input.type === 'title' && (await this.properties.list(workspaceId, databaseId, session)).some(property => property.type === 'title')) throw new BadRequestException('Database already has a title property')
      if ((await this.properties.listLimited(workspaceId, databaseId, 101, session)).length >= 100) throw new BadRequestException('Database exceeds the maximum of 100 properties')
      const property = await this.properties.create({ id: input.id, workspaceId, databaseId, name: input.name, type: input.type, ...(input.options === undefined ? {} : { options: input.options }), version: 1 }, session)
      return { database, property }
    })
  }

  async updateProperty(userId: string, workspaceId: string, databaseId: string, propertyId: string, input: { name?: string; options?: DatabaseProperty['options']; expectedDatabaseVersion: number; expectedPropertyVersion: number }): Promise<{ database: Database; property: DatabaseProperty }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabasePropertyUpdateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const existing = await this.properties.findInDatabase(workspaceId, databaseId, propertyId, session)
      if (!existing) throw new NotFoundException('Database property not found')
      if (input.options !== undefined && existing.type !== 'select') throw new BadRequestException('Only select properties have options')
      const candidate = {
        ...existing,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.options === undefined ? {} : { options: input.options }),
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      }
      if (!isValidDatabaseProperty(candidate)) throw new BadRequestException('Invalid database property')
      const property = await this.properties.update(workspaceId, databaseId, propertyId, input.expectedPropertyVersion, { ...(input.name === undefined ? {} : { name: input.name }), ...(input.options === undefined ? {} : { options: input.options }) }, session)
      if (!property) throw new ConflictException('Database property version is stale')
      if (input.options !== undefined) {
        const kept = new Set(input.options.map(option => option.id))
        const removed = new Set((existing.options ?? []).map(option => option.id).filter(optionId => !kept.has(optionId)))
        if (removed.size > 0) {
          const titleId = (await this.properties.list(workspaceId, databaseId, session)).find(row => row.type === 'title')?.id
          for (const record of await this.records.listForCleanup(workspaceId, databaseId, session)) {
            const current = record.properties[existing.id]
            if (typeof current === 'string' && removed.has(current)) {
              const values = { ...record.properties }
              delete values[existing.id]
              if (titleId) delete values[titleId]
              if (!await this.records.updateProperties(workspaceId, databaseId, record.id, record.version, values, session)) throw new ConflictException('Database record changed during option cleanup')
            }
          }
        }
      }
      return { database, property }
    })
  }

  async deleteProperty(userId: string, workspaceId: string, databaseId: string, propertyId: string, input: { expectedDatabaseVersion: number; expectedPropertyVersion: number }): Promise<{ database: Database }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabasePropertyDeleteRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const existing = await this.properties.findInDatabase(workspaceId, databaseId, propertyId, session)
      if (!existing) throw new NotFoundException('Database property not found')
      if (existing.type === 'title') throw new BadRequestException('The title property cannot be deleted')
      if (!await this.properties.delete(workspaceId, databaseId, propertyId, input.expectedPropertyVersion, session)) throw new ConflictException('Database property version is stale')
      const titleId = (await this.properties.list(workspaceId, databaseId, session)).find(row => row.type === 'title')?.id
      for (const record of await this.records.listForCleanup(workspaceId, databaseId, session)) {
        if (!Object.hasOwn(record.properties, propertyId)) continue
        const values = { ...record.properties }
        delete values[propertyId]
        if (titleId) delete values[titleId]
        if (!await this.records.updateProperties(workspaceId, databaseId, record.id, record.version, values, session)) throw new ConflictException('Database record changed during property cleanup')
      }
      return { database }
    })
  }

  async updateRecordCell(userId: string, workspaceId: string, databaseId: string, recordId: string, propertyId: string, input: { value: string | number | boolean | null; expectedDatabaseVersion: number; expectedRecordVersion: number; expectedPageUpdatedAt?: string }): Promise<{ database: Database; record: DatabaseTableRecord; page?: NonNullable<Awaited<ReturnType<PageRepository['findInWorkspace']>>> }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordCellUpdateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const record = await this.records.findInDatabase(workspaceId, databaseId, recordId, session)
      if (!record) throw new NotFoundException('Database record not found')
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const property = properties.find(row => row.id === propertyId)
      if (!property) throw new NotFoundException('Database property not found')
      const titleProperty = properties.find(row => row.type === 'title')
      if (!titleProperty) throw new BadRequestException('Database title property is missing')
      const page = await this.pages.findInWorkspace(workspaceId, record.pageId, session)
      if (!page) throw new NotFoundException('Record page not found in workspace')
      let value = input.value
      if (property.type === 'title') {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new BadRequestException('Title must contain 1 to 200 characters')
        value = value.trim()
        if (!input.expectedPageUpdatedAt) throw new BadRequestException('expectedPageUpdatedAt is required for title updates')
      }
      const projectedValues = { ...record.properties, [titleProperty.id]: page.title, ...(property.type === 'title' ? {} : { [propertyId]: value }) }
      if (!validateDatabaseRecordValues(projectedValues, properties)) throw new BadRequestException('Invalid value for database property')
      let values = { ...record.properties }
      delete values[titleProperty.id]
      if (property.type === 'title') delete values[propertyId]
      else if (value === null) delete values[propertyId]
      else values = { ...values, [propertyId]: value }
      const updatedRecord = await this.records.updateProperties(workspaceId, databaseId, recordId, input.expectedRecordVersion, values, session)
      if (!updatedRecord) throw new ConflictException('Database record version is stale')
      if (property.type === 'title') {
        const updatedPage = await this.pages.compareAndUpdate(workspaceId, record.pageId, input.expectedPageUpdatedAt!, { title: value as string }, session)
        if (!updatedPage) throw new ConflictException('Page title changed; refresh before editing')
        return { database, record: { ...updatedRecord, properties: { ...updatedRecord.properties, [property.id]: updatedPage.title }, pageVersion: updatedPage.updatedAt }, page: updatedPage }
      }
      return { database, record: { ...updatedRecord, properties: { ...updatedRecord.properties, [titleProperty.id]: page.title }, pageVersion: page.updatedAt } }
    })
  }

  async createRecord(userId: string, workspaceId: string, databaseId: string, input: CreateRecord): Promise<DatabaseRecord> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      await this.bumpDatabaseVersion(database, session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      if (!validateDatabaseRecordValues(input.properties, properties)) throw new BadRequestException('Invalid database record properties')
      const page = await this.pages.findInWorkspace(workspaceId, input.pageId, session)
      if (!page) throw new BadRequestException('Record page must belong to the same workspace')
      const title = properties.find(property => property.type === 'title')!
      if (input.properties[title.id] !== page.title) throw new BadRequestException('Record title must match its Page title')
      if (!(await this.pages.touchStructure(workspaceId, input.pageId, session))) throw new BadRequestException('Record page must belong to the same workspace')
      const persisted = { ...input.properties }
      delete persisted[title.id]
      return this.records.create({ id: input.id, workspaceId, databaseId, pageId: input.pageId, properties: persisted, version: 1 }, session)
    })
  }

  async createView(userId: string, workspaceId: string, databaseId: string, input: CreateView): Promise<DatabaseView> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseViewCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      await this.bumpDatabaseVersion(database, session)
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

  private async bumpDatabaseVersion(database: Database, session: ClientSession): Promise<Database> {
    const updated = await this.databases.compareAndBump(database.workspaceId, database.id, database.version, session)
    if (!updated) throw new ConflictException('Database version is stale')
    return updated
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
