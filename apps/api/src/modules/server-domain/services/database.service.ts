import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { createHash } from 'node:crypto'
import { DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES, DATABASE_DERIVED_MAX_DEPENDENCY_DEPTH, DATABASE_RELATION_SEARCH_MAX_RECORDS, DATABASE_DERIVED_MAX_LINKED_RECORDS, DATABASE_DERIVED_MAX_RECORDS, DATABASE_RECORD_SCAN_MAX_RECORDS, DATABASE_RELATION_CLEANUP_MAX_RECORDS, DATABASE_RELATION_MAX_LINKS, DEFAULT_DATABASE_VIEW_CONFIG, evaluateDatabaseFormula, evaluateDatabaseRollup, isValidDatabaseProperty, validateDatabasePropertyDependencies, validateDatabaseRecordValues, validateStoredDatabaseRecordValues, validateDatabaseViewConfig, type Database, type DatabaseProperty, type DatabaseRecord, type DatabaseTableRecord, type DatabaseView, type DatabaseViewConfig, type DatabasePropertyValue, type FormulaExpression } from '@eotion/domain'
import { DatabaseCreateInPageRequestSchema, DatabaseLinkInPageRequestSchema, DatabasePropertyCreateRequestSchema, DatabasePropertyDeleteRequestSchema, DatabasePropertyUpdateRequestSchema, DatabaseRecordCellUpdateRequestSchema, DatabaseRecordCreateRequestSchema, DatabaseRecordPageCreateRequestSchema, DatabaseViewCreateRequestSchema, DatabaseViewUpdateRequestSchema, DatabaseViewDeleteRequestSchema, DatabaseRelationCandidatesQuerySchema, DatabaseRelationTitlesRequestSchema } from '@eotion/contracts'
import type { ClientSession, Connection } from 'mongoose'
import { DatabasePropertyRepository, DatabaseRecordRepository, DatabaseRepository, DatabaseViewRepository } from '../repositories/database.repository'
import { PageRepository } from '../repositories/page.repository'
import { BlockService } from './block.service'
import { supportsTransactions } from './mongo-transactions'
import { WorkspacePermissionService } from './workspace-permission.service'
import type { ServerBlockRecord } from '../types'

type CreateInPage = { id: string; name: string; titlePropertyId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }
type CreateProperty = { id: string; name: string; type: DatabaseProperty['type']; options?: DatabaseProperty['options']; config?: DatabaseProperty['config']; expectedDatabaseVersion: number }
type CreateRecord = { id: string; pageId: string; properties: DatabaseRecord['properties'] }
type CreateView = { id: string; name: string; type: DatabaseView['type']; config?: DatabaseViewConfig; expectedDatabaseVersion?: number }
type WindowInput = { cursor?: string; limit: number }
type TableCursor = { w: string; d: string; v: string; dv: number; vv: number; ch: string; r: string; p: string }

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

  async listRecordOptions(userId: string, workspaceId: string, databaseId: string, input: { search?: string; cursor?: string; limit: number }) {
    this.parse(DatabaseRelationCandidatesQuerySchema, input)
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    const candidateIds = input.search ? await this.records.listRecordOptionCandidateIds(workspaceId, databaseId, input.cursor, DATABASE_RELATION_SEARCH_MAX_RECORDS) : undefined
    if (candidateIds && candidateIds.length > DATABASE_RELATION_SEARCH_MAX_RECORDS) throw new ConflictException('Record option search exceeds the maximum of 5000 candidate records')
    const rows = await this.records.listRecordOptions(workspaceId, databaseId, { ...input, ...(candidateIds ? { candidateIds } : {}) })
    const hasMore = rows.length > input.limit
    const items = rows.slice(0, input.limit)
    return { items, nextCursor: hasMore ? items.at(-1)!.recordId : null }
  }

  async resolveRecordOptions(userId: string, workspaceId: string, databaseId: string, input: { recordIds: string[] }) {
    this.parse(DatabaseRelationTitlesRequestSchema, input)
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    const records = await this.records.findManyInDatabase(workspaceId, databaseId, input.recordIds)
    const pages = await this.pages.findManyInWorkspace(workspaceId, records.map(record => record.pageId))
    const titles = new Map(pages.map(page => [page.id, page.title]))
    const byId = new Map(records.map(record => [record.id, record]))
    return { items: input.recordIds.flatMap(recordId => {
      const record = byId.get(recordId)
      const title = record ? titles.get(record.pageId) : undefined
      return record && title !== undefined ? [{ recordId, pageId: record.pageId, title }] : []
    }) }
  }

  async getTable(userId: string, workspaceId: string, databaseId: string, viewId: string, input: WindowInput, session?: ClientSession): Promise<{ database: Database; view: DatabaseView; properties: DatabaseProperty[]; records: DatabaseTableRecord[]; nextCursor: string | null }> {
    this.validateTableWindow(input)
    const database = await this.requireDatabase(userId, workspaceId, databaseId, false, session)
    const view = await this.views.findInWorkspace(workspaceId, viewId, session)
    if (!view || view.databaseId !== database.id || view.type !== 'table') throw new NotFoundException('Database view not found')
    const properties = await this.properties.listLimited(workspaceId, databaseId, 101, session)
    if (properties.length > 100) throw new BadRequestException('Database exceeds the maximum of 100 properties')
    if (!session && properties.some(property => property.type === 'rollup' || property.type === 'formula')) {
      return this.transact(readSession => this.getTable(userId, workspaceId, databaseId, viewId, input, readSession))
    }
    const config = view.config ?? DEFAULT_DATABASE_VIEW_CONFIG
    if (!validateDatabaseViewConfig(config, properties)) throw new ConflictException('Database view configuration is invalid; refresh and repair the view before querying it')
    const configHash = this.viewConfigHash(config)
    let anchor: DatabaseTableRecord | undefined
    if (input.cursor !== undefined) {
      const cursor = this.decodeTableCursor(input.cursor)
      if (cursor.w !== workspaceId || cursor.d !== databaseId || cursor.v !== viewId) throw new BadRequestException('Table cursor belongs to a different workspace, database, or view')
      if (cursor.dv !== database.version || cursor.vv !== view.version || cursor.ch !== configHash) throw new ConflictException('Database or view changed; reload the table before continuing')
      const record = await this.records.findInDatabase(workspaceId, databaseId, cursor.r, session)
      const page = record ? await this.pages.findInWorkspace(workspaceId, record.pageId, session) : null
      if (!record || !page || page.updatedAt !== cursor.p) throw new ConflictException('Table cursor anchor changed; reload the table before continuing')
      const titleProperty = properties.find(property => property.type === 'title')!
      anchor = { ...record, properties: { ...record.properties, [titleProperty.id]: page.title }, pageVersion: page.updatedAt }
    }
    const isDefaultQuery = config.filters.length === 0 && config.sorts.length === 0
    const rows = isDefaultQuery
      ? await this.records.listWindow(workspaceId, databaseId, { limit: input.limit, ...(anchor ? { cursor: anchor.id } : {}) }, session)
      : await this.records.queryTableWindow({ workspaceId, databaseId, properties, config, limit: input.limit, ...(anchor ? { anchor } : {}), session })
    const projectedRows: DatabaseTableRecord[] = isDefaultQuery
      ? await this.projectRecords(workspaceId, rows, properties, session)
      : rows as DatabaseTableRecord[]
    if (projectedRows.length !== rows.length) throw new ConflictException('Record page missing from workspace; reload the table after repairing record data')
    const hasMore = rows.length > input.limit
    const projected = await this.projectDerived(workspaceId, projectedRows.slice(0, input.limit), properties, session)
    const latestDatabase = await this.databases.findInWorkspace(workspaceId, databaseId, session)
    const latestView = await this.views.findInWorkspace(workspaceId, viewId, session)
    if (!latestDatabase || latestDatabase.version !== database.version || !latestView || latestView.version !== view.version) throw new ConflictException('Database or view changed during table read; refresh and retry')
    const last = projected.at(-1)
    return { database, view, properties, records: projected, nextCursor: hasMore && last ? this.encodeTableCursor({ w: workspaceId, d: databaseId, v: viewId, dv: database.version, vv: view.version, ch: configHash, r: last.id, p: last.pageVersion }) : null }
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
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const title = properties.find(property => property.type === 'title')
      if (!title) throw new BadRequestException('Database title property is missing')
      const page = await this.pages.create(workspaceId, { id: input.pageId, parentPageId: null, title: input.title, orderKey: input.orderKey }, session)
      const record = await this.records.create({ id: input.id, workspaceId, databaseId: database.id, pageId: page.id, properties: {}, version: 1 }, session)
      const projected = { ...record, properties: { [title.id]: page.title }, pageVersion: page.updatedAt }
      return { record: (await this.projectDerived(workspaceId, [projected], properties, session))[0]!, page }
    })
  }

  async listProperties(userId: string, workspaceId: string, databaseId: string): Promise<DatabaseProperty[]> {
    await this.requireDatabase(userId, workspaceId, databaseId, false)
    return this.properties.list(workspaceId, databaseId)
  }

  async listRecords(userId: string, workspaceId: string, databaseId: string, session?: ClientSession): Promise<DatabaseTableRecord[]> {
    const database = await this.requireDatabase(userId, workspaceId, databaseId, false, session)
    const records = await this.records.list(workspaceId, databaseId, session)
    const properties = await this.properties.list(workspaceId, databaseId, session)
    if (!session && properties.some(property => property.type === 'rollup' || property.type === 'formula')) return this.transact(readSession => this.listRecords(userId, workspaceId, databaseId, readSession))
    if (records.length > DATABASE_RECORD_SCAN_MAX_RECORDS) throw new ConflictException('Database exceeds the maximum of 10000 records for this read')
    if (properties.some(property => property.type === 'rollup' || property.type === 'formula') && records.length > DATABASE_DERIVED_MAX_RECORDS) throw new ConflictException('Derived read exceeds the maximum of 100 records')
    const projected = await this.projectDerived(workspaceId, await this.projectRecords(workspaceId, records, properties, session), properties, session)
    const latest = await this.databases.findInWorkspace(workspaceId, databaseId, session)
    if (!latest || latest.version !== database.version) throw new ConflictException('Database changed during record read; refresh and retry')
    return projected
  }

  private async projectRecords(workspaceId: string, records: DatabaseRecord[], properties: DatabaseProperty[], session?: ClientSession): Promise<DatabaseTableRecord[]> {
    const title = properties.find(property => property.type === 'title')
    if (!title) throw new BadRequestException('Database title property is missing')
    const pages = await this.pages.findManyInWorkspace(workspaceId, records.map(record => record.pageId), session)
    const pageById = new Map(pages.map(page => [page.id, page]))
    return records.flatMap(record => {
      const page = pageById.get(record.pageId)
      if (!page) return []
      return [{ ...record, properties: { ...record.properties, [title.id]: page.title }, pageVersion: page.updatedAt }]
    })
  }

  private async projectDerived(workspaceId: string, rows: DatabaseTableRecord[], properties: DatabaseProperty[], session?: ClientSession): Promise<DatabaseTableRecord[]> {
    const derived = properties.filter(property => property.type === 'rollup' || property.type === 'formula')
    if (derived.length === 0 || rows.length === 0) return rows
    if (!session) throw new ServiceUnavailableException('Derived reads require a MongoDB snapshot transaction')
    if (rows.length > DATABASE_DERIVED_MAX_RECORDS) throw new BadRequestException('Derived read exceeds the maximum of 100 records')
    const title = properties.find(property => property.type === 'title')
    if (!title) throw new ConflictException('Database title property is missing')
    for (const row of rows) {
      const stored = { ...row.properties }
      delete stored[title.id]
      if (!validateStoredDatabaseRecordValues(stored, properties)) throw new ConflictException('Stored database record contains invalid or derived values')
    }
    const relationIds = new Set(derived.filter(property => property.type === 'rollup').map(property => (property.config as { relationPropertyId: string }).relationPropertyId))
    const relations = properties.filter(property => property.type === 'relation' && relationIds.has(property.id))
    const targetIds = new Map<string, Set<string>>()
    for (const relation of relations) {
      const targetDatabaseId = (relation.config as { targetDatabaseId: string }).targetDatabaseId
      const ids = targetIds.get(targetDatabaseId) ?? new Set<string>()
      for (const row of rows) for (const id of Array.isArray(row.properties[relation.id]) ? row.properties[relation.id] as string[] : []) ids.add(id)
      targetIds.set(targetDatabaseId, ids)
    }
    const targetRows = new Map<string, Map<string, DatabaseRecord>>()
    const targetProperties = new Map<string, DatabaseProperty[]>()
    const targetTitles = new Map<string, Map<string, string>>()
    if ([...targetIds.values()].reduce((count, ids) => count + ids.size, 0) > DATABASE_DERIVED_MAX_LINKED_RECORDS) throw new BadRequestException('Derived read exceeds the maximum of 5000 linked records')
    for (const [targetDatabaseId, ids] of targetIds) {
      const props = targetDatabaseId === rows[0]!.databaseId ? properties : await this.properties.listLimited(workspaceId, targetDatabaseId, 101, session)
      if (props.length > 100) throw new BadRequestException('Linked database exceeds the maximum of 100 properties')
      targetProperties.set(targetDatabaseId, props)
      const found = await this.records.findManyInDatabase(workspaceId, targetDatabaseId, [...ids], session)
      if (found.length !== ids.size || found.some(record => !validateStoredDatabaseRecordValues(record.properties, props))) throw new ConflictException('Linked records are missing or invalid')
      targetRows.set(targetDatabaseId, new Map(found.map(record => [record.id, record])))
      const pages = await this.pages.findManyInWorkspace(workspaceId, found.map(record => record.pageId), session)
      if (pages.length !== found.length) throw new ConflictException('Linked record Page is missing')
      targetTitles.set(targetDatabaseId, new Map(pages.map(page => [page.id, page.title])))
    }
    if (!validateDatabasePropertyDependencies(properties, id => id === rows[0]!.databaseId ? properties : targetProperties.get(id))) throw new ConflictException('Database property dependencies are invalid')
    return rows.map(row => {
      const values = { ...row.properties }
      const active = new Set<string>()
      const read = (id: string): DatabasePropertyValue | undefined => {
        if (Object.hasOwn(values, id)) return values[id]
        const property = derived.find(item => item.id === id)
        if (!property || active.has(id) || active.size >= DATABASE_DERIVED_MAX_DEPENDENCY_DEPTH) return undefined
        active.add(id)
        let value: DatabasePropertyValue = null
        if (property.type === 'formula') value = evaluateDatabaseFormula((property.config as Extract<NonNullable<DatabaseProperty['config']>, { expression: unknown }>).expression, read)
        else {
          const config = property.config as { relationPropertyId: string; targetPropertyId: string; aggregation: Parameters<typeof evaluateDatabaseRollup>[1] }
          const relation = properties.find(item => item.id === config.relationPropertyId)!
          const targetDatabaseId = (relation.config as { targetDatabaseId: string }).targetDatabaseId
          const targetProperty = targetProperties.get(targetDatabaseId)?.find(item => item.id === config.targetPropertyId)
          const linked = Array.isArray(values[relation.id]) ? values[relation.id] as string[] : []
          const inputs = linked.map(id => {
            const record = targetRows.get(targetDatabaseId)?.get(id)
            if (!record || !targetProperty) throw new ConflictException('Linked record or rollup target is missing')
            if (targetProperty.type === 'title') return targetTitles.get(targetDatabaseId)?.get(record.pageId) ?? null
            return record.properties[targetProperty.id] ?? null
          })
          value = evaluateDatabaseRollup(inputs, config.aggregation)
        }
        active.delete(id)
        Object.defineProperty(values, id, { value, enumerable: true, writable: true, configurable: true })
        return value
      }
      for (const property of derived) read(property.id)
      return { ...row, properties: values }
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
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const candidate = { id: input.id, name: input.name, type: input.type, ...(input.options === undefined ? {} : { options: input.options }), ...(input.config === undefined ? {} : { config: input.config }), workspaceId, databaseId, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      if (!isValidDatabaseProperty(candidate)) throw new BadRequestException('Invalid database property')
      if (input.type === 'title' && (await this.properties.list(workspaceId, databaseId, session)).some(property => property.type === 'title')) throw new BadRequestException('Database already has a title property')
      if ((await this.properties.listLimited(workspaceId, databaseId, 101, session)).length >= 100) throw new BadRequestException('Database exceeds the maximum of 100 properties')
      await this.assertDependencies(workspaceId, databaseId, [...await this.properties.list(workspaceId, databaseId, session), candidate], session)
      const property = await this.properties.create({ id: input.id, workspaceId, databaseId, name: input.name, type: input.type, ...(input.options === undefined ? {} : { options: input.options }), ...(input.config === undefined ? {} : { config: input.config }), version: 1 }, session)
      return { database, property }
    })
  }

  async updateProperty(userId: string, workspaceId: string, databaseId: string, propertyId: string, input: { name?: string; options?: DatabaseProperty['options']; config?: DatabaseProperty['config']; expectedDatabaseVersion: number; expectedPropertyVersion: number }): Promise<{ database: Database; property: DatabaseProperty }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabasePropertyUpdateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const existing = await this.properties.findInDatabase(workspaceId, databaseId, propertyId, session)
      if (!existing) throw new NotFoundException('Database property not found')
      if (input.options !== undefined && existing.type !== 'select') throw new BadRequestException('Only select properties have options')
      const candidate = {
        ...existing,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.options === undefined ? {} : { options: input.options }),
        ...(input.config === undefined ? {} : { config: input.config }),
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      }
      if (!isValidDatabaseProperty(candidate)) throw new BadRequestException('Invalid database property')
      const existingProperties = await this.properties.list(workspaceId, databaseId, session)
      if (existing.type === 'relation' && input.config !== undefined && JSON.stringify(input.config) !== JSON.stringify(existing.config)) {
        const linked = await this.records.listForCleanup(workspaceId, databaseId, session)
        if (linked.length > DATABASE_RECORD_SCAN_MAX_RECORDS) throw new ConflictException('Database exceeds the maximum of 10000 records for relation retargeting')
        if (linked.some(record => Array.isArray(record.properties[propertyId]) && (record.properties[propertyId] as string[]).length > 0)) throw new ConflictException('Clear relation values before changing its target database')
      }
      await this.assertDependencies(workspaceId, databaseId, existingProperties.map(property => property.id === propertyId ? candidate : property), session)
      const property = await this.properties.update(workspaceId, databaseId, propertyId, input.expectedPropertyVersion, { ...(input.name === undefined ? {} : { name: input.name }), ...(input.options === undefined ? {} : { options: input.options }), ...(input.config === undefined ? {} : { config: input.config }) }, session)
      if (!property) throw new ConflictException('Database property version is stale')
      if (input.options !== undefined) {
        const kept = new Set(input.options.map(option => option.id))
        const removed = new Set((existing.options ?? []).map(option => option.id).filter(optionId => !kept.has(optionId)))
        if (removed.size > 0) {
          const titleId = (await this.properties.list(workspaceId, databaseId, session)).find(row => row.type === 'title')?.id
          const cleanupRecords = await this.records.listForCleanup(workspaceId, databaseId, session)
          if (cleanupRecords.length > DATABASE_RECORD_SCAN_MAX_RECORDS) throw new ConflictException('Database exceeds the maximum of 10000 records for option cleanup')
          for (const record of cleanupRecords) {
            const current = record.properties[existing.id]
            if (typeof current === 'string' && removed.has(current)) {
              const values = { ...record.properties }
              delete values[existing.id]
              if (titleId) delete values[titleId]
              if (!await this.records.updateProperties(workspaceId, databaseId, record.id, record.version, values, session)) throw new ConflictException('Database record changed during option cleanup')
            }
          }
          for (const view of await this.views.list(workspaceId, databaseId, session)) {
            const config = view.config ?? DEFAULT_DATABASE_VIEW_CONFIG
            const nextConfig = { ...config, filters: config.filters.filter(filter => !(filter.propertyId === existing.id && typeof filter.value === 'string' && removed.has(filter.value))) }
            if (nextConfig.filters.length === config.filters.length) continue
            if (!validateDatabaseViewConfig(nextConfig, (await this.properties.list(workspaceId, databaseId, session)))) throw new ConflictException('Database view configuration could not be repaired after deleting a select option')
            if (!await this.views.updateConfigForProperty(workspaceId, databaseId, view, nextConfig, session)) throw new ConflictException('Database view changed during option cleanup')
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
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const existing = await this.properties.findInDatabase(workspaceId, databaseId, propertyId, session)
      if (!existing) throw new NotFoundException('Database property not found')
      if (existing.type === 'title') throw new BadRequestException('The title property cannot be deleted')
      const existingProperties = await this.properties.list(workspaceId, databaseId, session)
      const localRelations = new Map(existingProperties.filter(property => property.type === 'relation').map(property => [property.id, property]))
      if (existingProperties.some(property => property.type === 'rollup' && (property.config as { relationPropertyId: string; targetPropertyId: string }).relationPropertyId === propertyId
        || property.type === 'rollup' && (property.config as { relationPropertyId: string; targetPropertyId: string }).targetPropertyId === propertyId
          && (localRelations.get((property.config as { relationPropertyId: string }).relationPropertyId)?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId === databaseId
        || property.type === 'formula' && this.formulaReferences((property.config as { expression: FormulaExpression }).expression, propertyId))) {
        throw new ConflictException('Property is referenced by formula or rollup; modify dependencies first')
      }
      await this.assertDependencies(workspaceId, databaseId, existingProperties.filter(property => property.id !== propertyId), session)
      await this.assertNoIncomingPropertyDependencies(workspaceId, existing, session)
      if (!await this.properties.delete(workspaceId, databaseId, propertyId, input.expectedPropertyVersion, session)) throw new ConflictException('Database property version is stale')
      const titleId = (await this.properties.list(workspaceId, databaseId, session)).find(row => row.type === 'title')?.id
      const cleanupRecords = await this.records.listForCleanup(workspaceId, databaseId, session)
      if (cleanupRecords.length > DATABASE_RECORD_SCAN_MAX_RECORDS) throw new ConflictException('Database exceeds the maximum of 10000 records for property cleanup')
      for (const record of cleanupRecords) {
        if (!Object.hasOwn(record.properties, propertyId)) continue
        const values = { ...record.properties }
        delete values[propertyId]
        if (titleId) delete values[titleId]
        if (!await this.records.updateProperties(workspaceId, databaseId, record.id, record.version, values, session)) throw new ConflictException('Database record changed during property cleanup')
      }
      for (const view of await this.views.list(workspaceId, databaseId, session)) {
        const config = view.config ?? DEFAULT_DATABASE_VIEW_CONFIG
        const nextConfig: DatabaseViewConfig = {
          filters: config.filters.filter(filter => filter.propertyId !== propertyId),
          sorts: config.sorts.filter(sort => sort.propertyId !== propertyId),
          visibleProperties: config.visibleProperties?.filter(id => id !== propertyId) ?? null,
          propertyOrder: config.propertyOrder?.filter(id => id !== propertyId) ?? null,
        }
        if (JSON.stringify(nextConfig) === JSON.stringify(config)) continue
        const remainingProperties = await this.properties.list(workspaceId, databaseId, session)
        if (!validateDatabaseViewConfig(nextConfig, remainingProperties)) throw new ConflictException('Database view configuration could not be repaired after deleting a property')
        if (!await this.views.updateConfigForProperty(workspaceId, databaseId, view, nextConfig, session)) throw new ConflictException('Database view changed during property cleanup')
      }
      return { database }
    })
  }

  async updateRecordCell(userId: string, workspaceId: string, databaseId: string, recordId: string, propertyId: string, input: { value: DatabasePropertyValue; expectedDatabaseVersion: number; expectedRecordVersion: number; expectedPageUpdatedAt?: string }): Promise<{ database: Database; record: DatabaseTableRecord; page?: NonNullable<Awaited<ReturnType<PageRepository['findInWorkspace']>>> }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordCellUpdateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const record = await this.records.findInDatabase(workspaceId, databaseId, recordId, session)
      if (!record) throw new NotFoundException('Database record not found')
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const property = properties.find(row => row.id === propertyId)
      if (!property) throw new NotFoundException('Database property not found')
      if (property.type === 'rollup' || property.type === 'formula') throw new BadRequestException('Derived properties are read only')
      if (property.type === 'relation') {
        const targetId = (property.config as { targetDatabaseId: string }).targetDatabaseId
        await this.touchAdvanced(workspaceId, [databaseId, targetId], session)
        await this.assertRelationValues(workspaceId, targetId, input.value, session)
      }
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
        const projected = { ...updatedRecord, properties: { ...updatedRecord.properties, [property.id]: updatedPage.title }, pageVersion: updatedPage.updatedAt }
        return { database, record: (await this.projectDerived(workspaceId, [projected], properties, session))[0]!, page: updatedPage }
      }
      const projected = { ...updatedRecord, properties: { ...updatedRecord.properties, [titleProperty.id]: page.title }, pageVersion: page.updatedAt }
      return { database, record: (await this.projectDerived(workspaceId, [projected], properties, session))[0]! }
    })
  }

  async createRecord(userId: string, workspaceId: string, databaseId: string, input: CreateRecord): Promise<DatabaseRecord> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseRecordCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      await this.bumpDatabaseVersion(database, session)
      await this.touchAdvanced(workspaceId, [databaseId], session)
      const properties = await this.properties.list(workspaceId, databaseId, session)
      if (!validateDatabaseRecordValues(input.properties, properties)) throw new BadRequestException('Invalid database record properties')
      for (const relation of properties.filter(property => property.type === 'relation')) {
        const targetId = (relation.config as { targetDatabaseId: string }).targetDatabaseId
        await this.touchAdvanced(workspaceId, [targetId], session)
        await this.assertRelationValues(workspaceId, targetId, input.properties[relation.id], session)
      }
      const page = await this.pages.findInWorkspace(workspaceId, input.pageId, session)
      if (!page) throw new BadRequestException('Record page must belong to the same workspace')
      const title = properties.find(property => property.type === 'title')!
      if (input.properties[title.id] !== page.title) throw new BadRequestException('Record title must match its Page title')
      if (!(await this.pages.touchStructure(workspaceId, input.pageId, session))) throw new BadRequestException('Record page must belong to the same workspace')
      const persisted = { ...input.properties }
      delete persisted[title.id]
      if (!validateStoredDatabaseRecordValues(persisted, properties)) throw new BadRequestException('Derived values cannot be persisted')
      return this.records.create({ id: input.id, workspaceId, databaseId, pageId: input.pageId, properties: persisted, version: 1 }, session)
    })
  }

  async deleteRecord(userId: string, workspaceId: string, databaseId: string, recordId: string, input: { expectedDatabaseVersion: number; expectedRecordVersion: number }): Promise<{ database: Database }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    if (!Number.isSafeInteger(input.expectedDatabaseVersion) || input.expectedDatabaseVersion < 1 || !Number.isSafeInteger(input.expectedRecordVersion) || input.expectedRecordVersion < 1) throw new BadRequestException('Invalid record deletion versions')
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const refs = await this.properties.listRelationsInWorkspace(workspaceId, DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES, session)
      if (refs.length > DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES) throw new ConflictException('Workspace exceeds the maximum of 1000 relation properties for record cleanup')
      const incoming = refs.filter(property => property.type === 'relation' && (property.config as { targetDatabaseId: string }).targetDatabaseId === databaseId)
      const sourceIds = [...new Set(incoming.map(property => property.databaseId))]
      await this.touchAdvanced(workspaceId, [databaseId, ...sourceIds], session)
      const sourceVersions = new Set<string>()
      let scanned = 0
      for (const sourceId of sourceIds) {
        const relations = incoming.filter(property => property.databaseId === sourceId)
        const remaining = DATABASE_RELATION_CLEANUP_MAX_RECORDS - scanned
        const rows = await this.records.listForCleanup(workspaceId, sourceId, session, remaining)
        if (rows.length > remaining) throw new ConflictException('Relation cleanup exceeds the maximum of 10000 scanned records')
        scanned += rows.length
        for (const row of rows) {
          if (row.databaseId === databaseId && row.id === recordId) continue
          const values = { ...row.properties }
          let changed = false
          for (const relation of relations) {
            const current = values[relation.id]
            if (!Array.isArray(current) || !current.includes(recordId)) continue
            Object.defineProperty(values, relation.id, { value: current.filter(id => id !== recordId), enumerable: true, writable: true, configurable: true })
            changed = true
          }
          if (!changed) continue
          if (!await this.records.updateProperties(workspaceId, sourceId, row.id, row.version, values, session)) throw new ConflictException('Linked database record changed during relation cleanup')
          sourceVersions.add(sourceId)
        }
      }
      for (const sourceId of sourceVersions) {
        if (sourceId === databaseId) continue
        const source = await this.databases.findInWorkspace(workspaceId, sourceId, session)
        if (!source || !await this.databases.compareAndBump(workspaceId, sourceId, source.version, session)) throw new ConflictException('Linked database changed during relation cleanup')
      }
      if (!await this.records.delete(workspaceId, databaseId, recordId, input.expectedRecordVersion, session)) throw new ConflictException('Database record version is stale')
      return { database }
    })
  }

  private async assertRelationValues(workspaceId: string, targetDatabaseId: string, value: DatabasePropertyValue | undefined, session: ClientSession): Promise<void> {
    if (value === undefined || value === null) return
    if (!Array.isArray(value) || value.length > DATABASE_RELATION_MAX_LINKS || new Set(value).size !== value.length) throw new BadRequestException('Invalid relation value')
    if (!await this.databases.findInWorkspace(workspaceId, targetDatabaseId, session)) throw new BadRequestException('Relation target database must belong to the workspace')
    if ((await this.records.findManyInDatabase(workspaceId, targetDatabaseId, value, session)).length !== value.length) throw new BadRequestException('Relation targets must be existing records in the target database')
  }

  async createView(userId: string, workspaceId: string, databaseId: string, input: CreateView): Promise<{ database: Database; view: DatabaseView }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseViewCreateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.requireDatabase(userId, workspaceId, databaseId, true, session)
      const expectedVersion = input.expectedDatabaseVersion ?? database.version
      const bumped = await this.databases.compareAndBump(workspaceId, databaseId, expectedVersion, session)
      if (!bumped) throw new ConflictException('Database version is stale')
      if ((await this.views.listWindow(workspaceId, databaseId, 101, session)).length >= 100) throw new ConflictException('Database already has the maximum of 100 views')
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const config = input.config ?? DEFAULT_DATABASE_VIEW_CONFIG
      if (!validateDatabaseViewConfig(config, properties)) throw new BadRequestException('Invalid database view configuration for this database')
      const view = await this.views.create({ id: input.id, workspaceId, databaseId, name: input.name, type: 'table', config, version: 1 }, session)
      return { database: bumped, view }
    })
  }

  async updateView(userId: string, workspaceId: string, databaseId: string, viewId: string, input: { name?: string; config?: DatabaseViewConfig; expectedDatabaseVersion: number; expectedViewVersion: number }): Promise<{ database: Database; view: DatabaseView }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseViewUpdateRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const existing = await this.views.findInWorkspace(workspaceId, viewId, session)
      if (!existing || existing.databaseId !== databaseId) throw new NotFoundException('Database view not found')
      const properties = await this.properties.list(workspaceId, databaseId, session)
      const config = input.config ?? existing.config ?? DEFAULT_DATABASE_VIEW_CONFIG
      if (!validateDatabaseViewConfig(config, properties)) throw new BadRequestException('Invalid database view configuration for this database')
      const view = await this.views.update(workspaceId, databaseId, viewId, input.expectedViewVersion, { ...(input.name === undefined ? {} : { name: input.name }), ...(input.config === undefined ? {} : { config }) }, session)
      if (!view) throw new ConflictException('Database view version is stale')
      return { database, view }
    })
  }

  async deleteView(userId: string, workspaceId: string, databaseId: string, viewId: string, input: { expectedDatabaseVersion: number; expectedViewVersion: number }): Promise<{ database: Database }> {
    await this.requireDatabase(userId, workspaceId, databaseId, true)
    this.parse(DatabaseViewDeleteRequestSchema, input)
    return this.transact(async session => {
      const database = await this.databases.compareAndBump(workspaceId, databaseId, input.expectedDatabaseVersion, session)
      if (!database) throw new ConflictException('Database version is stale')
      const existing = await this.views.findInWorkspace(workspaceId, viewId, session)
      if (!existing || existing.databaseId !== databaseId) throw new NotFoundException('Database view not found')
      if ((await this.views.listWindow(workspaceId, databaseId, 2, session)).length <= 1) throw new ConflictException('A database must keep at least one view')
      if (!await this.views.delete(workspaceId, databaseId, viewId, input.expectedViewVersion, session)) throw new ConflictException('Database view version is stale')
      if (await this.blocks.hasDatabaseViewReference(workspaceId, databaseId, viewId, session)) {
        throw new ConflictException('This view is still referenced by a Database Block. Switch those blocks to another view or remove the references, then retry.')
      }
      return { database }
    })
  }

  private async touchAdvanced(workspaceId: string, ids: readonly string[], session: ClientSession): Promise<void> {
    for (const id of [...new Set(ids)].sort()) {
      if (!await this.databases.touchAdvancedReferenceFence(workspaceId, id, session)) throw new ConflictException('Referenced database changed; refresh and retry')
    }
  }

  private async assertDependencies(workspaceId: string, databaseId: string, properties: DatabaseProperty[], session: ClientSession): Promise<void> {
    const targets = new Set(properties.filter(property => property.type === 'relation').map(property => (property.config as { targetDatabaseId: string }).targetDatabaseId))
    await this.touchAdvanced(workspaceId, [...targets].filter(id => id !== databaseId), session)
    const targetProperties = new Map<string, DatabaseProperty[]>()
    for (const targetId of targets) {
      if (targetId === databaseId) continue
      const database = await this.databases.findInWorkspace(workspaceId, targetId, session)
      if (!database) throw new BadRequestException('Relation target database must belong to the workspace')
      const rows = await this.properties.listLimited(workspaceId, targetId, 101, session)
      if (rows.length > 100) throw new ConflictException('Relation target exceeds the maximum of 100 properties')
      targetProperties.set(targetId, rows)
    }
    if (!validateDatabasePropertyDependencies(properties, targetId => targetId === databaseId ? properties : targetProperties.get(targetId))) {
      throw new BadRequestException('Invalid database property dependencies')
    }
  }

  private async assertNoIncomingPropertyDependencies(workspaceId: string, property: DatabaseProperty, session: ClientSession): Promise<void> {
    const refs = await this.properties.listRelationsInWorkspace(workspaceId, DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES, session)
    if (refs.length > DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES) throw new ConflictException('Workspace exceeds the maximum of 1000 relation properties for dependency cleanup')
    const relationById = new Map(refs.filter(ref => ref.type === 'relation').map(ref => [ref.id, ref]))
    for (const ref of refs) {
      if (ref.type !== 'rollup' || ref.databaseId === property.databaseId) continue
      const config = ref.config as { relationPropertyId: string; targetPropertyId: string }
      const relation = relationById.get(config.relationPropertyId)
      if (config.targetPropertyId === property.id && (relation?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId === property.databaseId) {
        throw new ConflictException('Property is used by a rollup in another database; modify dependencies first')
      }
    }
  }

  private formulaReferences(expression: FormulaExpression, propertyId: string): boolean {
    if (expression.kind === 'property') return expression.propertyId === propertyId
    if (expression.kind === 'binary') return this.formulaReferences(expression.left, propertyId) || this.formulaReferences(expression.right, propertyId)
    if (expression.kind === 'unary') return this.formulaReferences(expression.operand, propertyId)
    if (expression.kind === 'if') return this.formulaReferences(expression.condition, propertyId) || this.formulaReferences(expression.then, propertyId) || this.formulaReferences(expression.else, propertyId)
    if (expression.kind === 'call') return expression.args.some(arg => this.formulaReferences(arg, propertyId))
    return false
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

  private validateTableWindow(input: WindowInput): void {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new BadRequestException('Limit must be an integer between 1 and 100')
    if (input.cursor !== undefined && (input.cursor.length < 1 || input.cursor.length > 16_384 || input.cursor.trim() !== input.cursor)) throw new BadRequestException('Invalid table cursor')
  }

  private viewConfigHash(config: DatabaseViewConfig): string {
    return createHash('sha256').update(JSON.stringify(config)).digest('hex')
  }

  private encodeTableCursor(cursor: TableCursor): string {
    const encoded = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
    if (encoded.length > 16_384) throw new ConflictException('Table cursor exceeded its maximum size; reload the table')
    return encoded
  }

  private decodeTableCursor(value: string): TableCursor {
    try {
      if (value.length > 16_384 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid encoding')
      const json = Buffer.from(value, 'base64url').toString('utf8')
      if (Buffer.from(json, 'utf8').toString('base64url') !== value) throw new Error('non-canonical encoding')
      const parsed: unknown = JSON.parse(json)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid payload')
      const cursor = parsed as Record<string, unknown>
      if (Object.keys(cursor).sort().join(',') !== 'ch,d,dv,p,r,v,vv,w'
        || ![cursor.w, cursor.d, cursor.v, cursor.r].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value)
        || !Number.isSafeInteger(cursor.dv) || (cursor.dv as number) < 1 || !Number.isSafeInteger(cursor.vv) || (cursor.vv as number) < 1
        || typeof cursor.ch !== 'string' || !/^[a-f0-9]{64}$/u.test(cursor.ch)
        || typeof cursor.p !== 'string' || !Number.isFinite(Date.parse(cursor.p))) throw new Error('invalid fields')
      return cursor as TableCursor
    } catch {
      throw new BadRequestException('Invalid table cursor')
    }
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
      await session.withTransaction(async () => { result = await operation(session) }, { readConcern: { level: 'snapshot' } })
      return result
    } finally {
      await session.endSession()
    }
  }
}
