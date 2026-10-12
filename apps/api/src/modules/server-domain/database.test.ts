import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { DATABASE_MAX_PROPERTIES, DATABASE_MAX_VIEWS, DEFAULT_DATABASE_VIEW_CONFIG, type DatabaseFilter, type DatabasePropertyConfig, type DatabasePropertyValue } from '@eotion/domain'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseEntity } from './schemas/database.schema'
import { PageEntity } from './schemas/page.schema'
import { DatabasePropertyEntity } from './schemas/database-property.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
import { DatabasePropertyRepository, DatabaseRecordRepository, DatabaseRepository, DatabaseViewRepository } from './repositories/database.repository'
import { BlockService } from './services/block.service'
import { DatabaseService } from './services/database.service'
import { supportsTransactions } from './services/mongo-transactions'
import { PageService } from './services/page.service'
import { SyncService } from './services/sync.service'
import { AuthService } from './services/auth.service'
import { WorkspaceService } from './services/workspace.service'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
uri.pathname = `/eotion_database_test_${randomUUID().replaceAll('-', '')}`
@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class DatabaseTestModule {}

test('database service keeps references scoped and writes initial data atomically', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const blocks = app.get(BlockService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const databaseModel = app.get<Model<unknown>>(getModelToken(DatabaseEntity.name))
  const propertyModel = app.get<Model<unknown>>(getModelToken(DatabasePropertyEntity.name))
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const viewModel = app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name))
  const pageModel = app.get<Model<unknown>>(getModelToken(PageEntity.name))
  await Promise.all([databaseModel.init(), propertyModel.init(), recordModel.init(), viewModel.init()])
  const storedProperties = async (id: string) => ((await recordModel.findOne({ id }).lean()) as { properties?: Record<string, unknown> } | null)?.properties ?? {}
  assert.deepEqual([databaseModel.collection.name, propertyModel.collection.name, recordModel.collection.name, viewModel.collection.name], ['databases', 'database_properties', 'database_records', 'database_views'])
  const titleIndex = (await propertyModel.collection.indexes()).find(index => index.partialFilterExpression?.type === 'title')
  assert.equal(titleIndex?.unique, true)

  const owner = await auth.register(`database-${randomUUID()}@example.com`, 'correct horse battery staple')
  const outsider = await auth.register(`database-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'workspace-a', name: 'A' })
  await workspaces.create(owner.id, { id: 'workspace-c', name: 'C' })
  await workspaces.create(outsider.id, { id: 'workspace-b', name: 'B' })
  await pages.create(owner.id, 'workspace-a', { id: 'page-a', parentPageId: null, title: 'A', orderKey: 'a' })
  await pages.create(owner.id, 'workspace-a', { id: 'page-row', parentPageId: null, title: 'Row', orderKey: 'b' })
  await pages.create(outsider.id, 'workspace-b', { id: 'page-b', parentPageId: null, title: 'B', orderKey: 'a' })
  await pages.create(owner.id, 'workspace-c', { id: 'page-c', parentPageId: null, title: 'C', orderKey: 'a' })

  const create = (id: string, blockId: string, viewId = `${id}-view`) => databases.createInPage(owner.id, 'workspace-a', 'page-a', { id, name: 'Tasks', titlePropertyId: `${id}-title`, viewId, blockId, orderKey: 'a', parentBlockId: null })
  if (!(await supportsTransactions(connection))) {
    await assert.rejects(create('database-a', 'block-a'), error => (error as { status?: number }).status === 503)
    assert.equal(await databaseModel.countDocuments(), 0)
    assert.equal(await propertyModel.countDocuments(), 0)
    assert.equal(await viewModel.countDocuments(), 0)
    return
  }

  const initial = await create('database-a', 'block-a')
  assert.deepEqual((await databases.listNavigationWindow(owner.id, 'workspace-a', { limit: 10 })).items.find(item => item.id === 'database-a'), {
    id: 'database-a', workspaceId: 'workspace-a', name: 'Tasks', parentPageId: 'page-a', orderKey: 'a', viewId: 'database-a-view',
  })
  await databaseModel.updateOne({ id: 'database-a' }, { $unset: { parentPageId: '', orderKey: '' } })
  assert.deepEqual((await databases.listNavigationWindow(owner.id, 'workspace-a', { limit: 10 })).items.find(item => item.id === 'database-a'), {
    id: 'database-a', workspaceId: 'workspace-a', name: 'Tasks', parentPageId: 'page-a', orderKey: 'a', viewId: 'database-a-view',
  }, 'existing P8 databases derive navigation from the earliest persisted reference')
  await assert.rejects(databases.listNavigationWindow(outsider.id, 'workspace-a', { limit: 10 }), /Workspace not found/)
  assert.equal(initial.database.version, 1)
  assert.equal(initial.titleProperty.type, 'title')
  assert.equal(initial.titleProperty.name, '名称')
  assert.equal(initial.view.type, 'table')
  assert.equal(initial.view.name, '表格视图')
  assert.deepEqual((await blocks.find(owner.id, 'workspace-a', 'page-a', 'block-a'))?.props, { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-a', viewId: 'database-a-view' } } })
  assert.equal((await databases.find(owner.id, 'workspace-a', 'database-a'))?.name, 'Tasks')
  assert.equal(await databases.find(owner.id, 'workspace-a', 'missing'), null)
  await assert.rejects(databases.find(outsider.id, 'workspace-a', 'database-a'), /Workspace not found/)
  await assert.rejects(databases.listViews(owner.id, 'workspace-b', 'database-a'), /Workspace not found/)
  assert.deepEqual((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).map(row => row.type), ['title'])

  await assert.rejects(create('database-rollback', 'block-a'), /duplicate key/i)
  assert.equal(await databaseModel.countDocuments({ id: 'database-rollback' }), 0)
  assert.equal(await propertyModel.countDocuments({ databaseId: 'database-rollback' }), 0)
  assert.equal(await viewModel.countDocuments({ databaseId: 'database-rollback' }), 0)
  await assert.rejects(databases.createInPage(owner.id, 'workspace-a', 'page-b', { id: 'database-foreign', name: 'Foreign', titlePropertyId: 'foreign-title', viewId: 'foreign-view', blockId: 'foreign-block', orderKey: 'z', parentBlockId: null }), /Page not found/)
  assert.equal(await databaseModel.countDocuments({ id: 'database-foreign' }), 0)

  const reference = (id: string, databaseId: string, viewId: string) => blocks.create(owner.id, 'workspace-a', 'page-a', { id, pageId: 'page-a', parentBlockId: null, type: 'database', orderKey: 'b', props: { node: { type: 'eotionDatabase', attrs: { databaseId, viewId } } } })
  await reference('block-second', 'database-a', 'database-a-view')
  await create('database-b', 'block-b')
  await databases.createInPage(owner.id, 'workspace-c', 'page-c', { id: 'database-c', name: 'C', titlePropertyId: 'database-c-title', viewId: 'database-c-view', blockId: 'block-c', orderKey: 'a', parentBlockId: null })
  await assert.rejects(reference('block-missing', 'missing', 'database-a-view'), /Database block reference/)
  await assert.rejects(reference('block-mismatch', 'database-a', 'database-b-view'), /Database block reference/)
  await assert.rejects(reference('block-cross-workspace', 'database-c', 'database-c-view'), /Database block reference/)
  await assert.rejects(blocks.update(owner.id, 'workspace-a', 'page-a', 'block-second', { props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-a', viewId: 'database-b-view' } } } }), /Database block reference/)
  const toggleWithForeignDatabase = { node: { type: 'eotionToggle', content: [{ type: 'eotionDatabase', attrs: { databaseId: 'database-c', viewId: 'database-c-view' } }] } }
  await assert.rejects(blocks.create(owner.id, 'workspace-a', 'page-a', { id: 'toggle-foreign', pageId: 'page-a', parentBlockId: null, type: 'toggle', orderKey: 'z', props: toggleWithForeignDatabase }), /Database block reference/)
  await assert.rejects(blocks.update(owner.id, 'workspace-a', 'page-a', 'block-second', { type: 'toggle', props: toggleWithForeignDatabase }), /Database block reference/)
  const syncSession = await connection.startSession()
  try {
    await assert.rejects(blocks.upsertSnapshot(owner.id, 'workspace-a', { id: 'sync-invalid', pageId: 'page-a', parentBlockId: null, type: 'database', orderKey: 'z', props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-a', viewId: 'database-b-view' } } } }, syncSession), /Database block reference/)
    await assert.rejects(blocks.upsertSnapshot(owner.id, 'workspace-a', { id: 'sync-toggle-invalid', pageId: 'page-a', parentBlockId: null, type: 'toggle', orderKey: 'z', props: toggleWithForeignDatabase }, syncSession), /Database block reference/)
  } finally {
    await syncSession.endSession()
  }

  await assert.rejects(databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'second-title', name: 'Other', type: 'title', expectedDatabaseVersion: 1 }), /title property/)
  await assert.rejects(databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'invalid-select', name: 'Invalid', type: 'select', expectedDatabaseVersion: 1 }), /Invalid database input/)
  await assert.rejects(databases.createProperty(outsider.id, 'workspace-a', 'database-a', { id: 'forbidden', name: 'Forbidden', type: 'text', expectedDatabaseVersion: 1 }), /Workspace not found/)
  await databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'status', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: 1 })
  const boardView = await databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'board-view', name: 'Board', type: 'board' })
  assert.equal(boardView.view.type, 'board')
  assert.equal((await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', boardView.view.id, { limit: 10 })).view.type, 'board')
  await assert.rejects(databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'invalid-view', name: 'Other', type: 'calendar' as any }), /Invalid database input/)
  const secondView = await databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'table-two', name: 'Other table', type: 'table', config: { filters: [{ propertyId: 'status', operator: 'is', value: 'open' }], sorts: [], visibleProperties: null, propertyOrder: null } })
  assert.equal(secondView.view.version, 1)
  const raceView = await databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'race-view', name: 'Race view', type: 'table' })
  const viewRepository = app.get(DatabaseViewRepository)
  const originalFence = viewRepository.touchReferenceFence.bind(viewRepository)
  let reachedFence!: () => void
  let resumeFence!: () => void
  const fenceReached = new Promise<void>(resolve => { reachedFence = resolve })
  const fenceGate = new Promise<void>(resolve => { resumeFence = resolve })
  viewRepository.touchReferenceFence = async (...args) => { reachedFence(); await fenceGate; return originalFence(...args) }
  const pendingReference = blocks.create(owner.id, 'workspace-a', 'page-a', { id: 'race-reference', pageId: 'page-a', parentBlockId: null, type: 'database', orderKey: 'z', props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-a', viewId: 'race-view' } } } }).then(() => null, error => error as Error)
  await fenceReached
  await databases.deleteView(owner.id, 'workspace-a', 'database-a', 'race-view', { expectedDatabaseVersion: raceView.database.version, expectedViewVersion: raceView.view.version })
  resumeFence()
  const rejectedReference = await pendingReference
  viewRepository.touchReferenceFence = originalFence
  assert.ok(rejectedReference instanceof Error)
  assert.match(rejectedReference.message, /reference/)
  assert.equal(await blocks.find(owner.id, 'workspace-a', 'page-a', 'race-reference'), null)
  await assert.rejects(databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'bad-filter-view', name: 'Bad filter', type: 'table', config: { filters: [{ propertyId: 'not-owned', operator: 'is_empty' }], sorts: [], visibleProperties: null, propertyOrder: null } }), /configuration/)
  await assert.rejects(databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-bad', pageId: 'page-row', properties: { status: 'unknown' } }), /Invalid database record/)
  await assert.rejects(databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-foreign', pageId: 'page-b', properties: { 'database-a-title': 'Foreign' } }), /Record page/)
  const record = await databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-a', pageId: 'page-row', properties: { 'database-a-title': 'Row', status: 'open' } })
  assert.equal(record.version, 1)
  assert.deepEqual(await storedProperties('row-a'), { status: 'open' })
  assert.equal((await databases.listRecords(owner.id, 'workspace-a', 'database-a')).length, 1)
  // P8.2 uses the same permission boundary for linked blocks and table windows.
  await assert.rejects(databases.linkInPage(owner.id, 'workspace-c', 'page-c', { databaseId: 'database-a', viewId: 'database-a-view', blockId: 'cross-workspace-link', parentBlockId: null, orderKey: 'b' }), /database and workspace/)
  await assert.rejects(databases.linkInPage(outsider.id, 'workspace-a', 'page-a', { databaseId: 'database-a', viewId: 'database-a-view', blockId: 'foreign-user-link', parentBlockId: null, orderKey: 'b' }), /Workspace not found/)
  await assert.rejects(databases.createRecordPage(outsider.id, 'workspace-a', 'database-a', { id: 'forbidden-new-row', pageId: 'forbidden-new-page', title: 'No access', orderKey: 'c' }), /Workspace not found/)
  await assert.rejects(databases.getTable(owner.id, 'workspace-c', 'database-a', 'database-a-view', { limit: 25 }), /Database not found/)
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-b-view', { limit: 25 }), /view not found/)
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 101 }), /Limit/)
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 25, cursor: ' bad ' }), /cursor/)
  const newRow = await databases.createRecordPage(owner.id, 'workspace-a', 'database-a', { id: 'row-z', pageId: 'page-new-row', title: 'New row', orderKey: 'c' })
  assert.equal(newRow.page.role, 'database-record')
  assert.equal((await pages.find(owner.id, 'workspace-a', newRow.page.id))?.role, 'database-record')
  assert.equal((await app.get(SyncService).snapshot(owner.id, 'workspace-a')).pages.find(page => page.id === newRow.page.id)?.role, 'database-record')
  assert.equal((await pages.listNavigation(owner.id, 'workspace-a')).some(page => page.id === newRow.page.id || page.id === 'page-row'), false)
  await pageModel.updateOne({ id: newRow.page.id }, { $unset: { role: '' } })
  assert.equal((await app.get(SyncService).snapshot(owner.id, 'workspace-a')).pages.find(page => page.id === newRow.page.id)?.role, 'database-record', 'legacy record pages are projected without migration')
  assert.equal((await pages.listNavigation(owner.id, 'workspace-a')).some(page => page.id === newRow.page.id), false)
  assert.equal(newRow.record.pageId, newRow.page.id)
  assert.deepEqual(newRow.record.properties, { 'database-a-title': 'New row' })
  assert.deepEqual(await storedProperties('row-z'), {}, 'the projected title must not be stored on the record')
  assert.equal(newRow.page.title, 'New row')
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 5 })).records.find(row => row.id === 'row-z')?.properties, { 'database-a-title': 'New row' })
  await recordModel.updateOne({ id: 'row-z' }, { $set: { 'properties.database-a-title': 'Legacy cached title' } })
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 5 })).records.find(row => row.id === 'row-z')?.properties, { 'database-a-title': 'New row' })
  const firstRows = await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 1 })
  assert.deepEqual(firstRows.records.map(row => row.id), ['row-a'])
  assert.ok(firstRows.nextCursor && firstRows.nextCursor.length > 0 && firstRows.nextCursor !== 'row-a')
  const remainingRows = await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 1, cursor: firstRows.nextCursor! })
  assert.deepEqual(remainingRows.records.map(row => row.id), ['row-z'])
  assert.equal(remainingRows.nextCursor, null)
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', 'table-two', { limit: 1, cursor: firstRows.nextCursor! }), /different workspace, database, or view/)
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', 'table-two', { limit: 10 })).records.map(row => row.id), ['row-a'])
  const filteredDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const filteredView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  const sorted = await databases.updateView(owner.id, 'workspace-a', 'database-a', filteredView.id, { config: { filters: [], sorts: [{ propertyId: 'database-a-title', direction: 'desc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: filteredDatabase.version, expectedViewVersion: filteredView.version })
  const sortedFirst = await databases.getTable(owner.id, 'workspace-a', 'database-a', filteredView.id, { limit: 1 })
  assert.deepEqual(sortedFirst.records.map(row => row.properties['database-a-title']), ['Row'])
  assert.ok(sortedFirst.nextCursor && sortedFirst.nextCursor !== sortedFirst.records[0]?.id)
  const sortedNext = await databases.getTable(owner.id, 'workspace-a', 'database-a', filteredView.id, { limit: 1, cursor: sortedFirst.nextCursor! })
  assert.deepEqual(sortedNext.records.map(row => row.properties['database-a-title']), ['New row'])
  await databases.updateView(owner.id, 'workspace-a', 'database-a', filteredView.id, { name: 'Renamed table', expectedDatabaseVersion: sorted.database.version, expectedViewVersion: sorted.view.version })
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', filteredView.id, { limit: 1, cursor: sortedFirst.nextCursor! }), /changed|anchor/)
  const viewDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await assert.rejects(databases.deleteView(owner.id, 'workspace-a', 'database-a', 'database-a-view', { expectedDatabaseVersion: viewDatabase.version, expectedViewVersion: 1 }), /referenced by a Database Block/)
  await assert.rejects(databases.deleteView(owner.id, 'workspace-a', 'database-b', 'database-b-view', { expectedDatabaseVersion: 1, expectedViewVersion: 1 }), /at least one view/)

  // P8.3 schema and cell mutations use the database and record versions as CAS fences.
  const addProperty = async (id: string, name: string, type: 'text' | 'number' | 'checkbox' | 'date') => {
    const current = await databases.find(owner.id, 'workspace-a', 'database-a')
    assert.ok(current)
    return databases.createProperty(owner.id, 'workspace-a', 'database-a', { id, name, type, expectedDatabaseVersion: current.version })
  }
  const textProperty = await addProperty('notes', 'Notes', 'text')
  const legacyRow = (await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-z')!
  const legacyDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', 'row-z', textProperty.property.id, { value: 'touch legacy row', expectedDatabaseVersion: legacyDb.version, expectedRecordVersion: legacyRow.version })
  assert.equal(Object.hasOwn(await storedProperties('row-z'), 'database-a-title'), false)
  assert.equal((await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-z')?.properties['database-a-title'], 'New row')
  await addProperty('count', 'Count', 'number')
  await addProperty('done', 'Done', 'checkbox')
  await addProperty('due', 'Due', 'date')
  const unsafeProperty = await addProperty('property.$key', 'Unsafe key', 'text')
  const cell = async (propertyId: string, value: DatabasePropertyValue, expectedPageUpdatedAt?: string) => {
    const currentDatabase = await databases.find(owner.id, 'workspace-a', 'database-a')
    const currentRecord = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-a')
    assert.ok(currentDatabase && currentRecord)
    return databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', 'row-a', propertyId, {
      value,
      expectedDatabaseVersion: currentDatabase.version,
      expectedRecordVersion: currentRecord.version,
      ...(expectedPageUpdatedAt ? { expectedPageUpdatedAt } : {}),
    })
  }
  await cell('notes', 'Ship the first draft')
  await cell('count', 3.5)
  await cell('done', true)
  await cell('due', '2026-10-10')
  await cell(unsafeProperty.property.id, 'safe whole-object update')
  await cell('status', 'open')
  const zeroRecord = await databases.createRecordPage(owner.id, 'workspace-a', 'database-a', { id: 'row-zero', pageId: 'page-zero', title: 'Zero', orderKey: 'd' })
  for (const [propertyId, value] of [['count', 0], ['done', false]] as const) {
    const db = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
    const recordState = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === zeroRecord.record.id)!
    await databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', zeroRecord.record.id, propertyId, { value, expectedDatabaseVersion: db.version, expectedRecordVersion: recordState.version })
  }
  await cell('notes', 'symbols [.*$]')
  const titleRow = (await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-a')
  assert.ok(titleRow)
  const renamed = await cell('database-a-title', '  Renamed row  ', titleRow.pageVersion)
  assert.equal(renamed.page?.title, 'Renamed row')
  assert.equal(renamed.record.properties['database-a-title'], 'Renamed row')
  const beforeStaleTitle = {
    database: (await databases.find(owner.id, 'workspace-a', 'database-a'))!,
    record: (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-a')!,
    page: (await pages.find(owner.id, 'workspace-a', 'page-row'))!,
  }
  await assert.rejects(databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', 'row-a', 'database-a-title', {
    value: 'stale title', expectedDatabaseVersion: beforeStaleTitle.database.version, expectedRecordVersion: beforeStaleTitle.record.version,
    expectedPageUpdatedAt: '2000-01-01T00:00:00.000Z',
  }), /Page title changed/)
  assert.equal((await databases.find(owner.id, 'workspace-a', 'database-a'))?.version, beforeStaleTitle.database.version)
  assert.equal((await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-a')?.version, beforeStaleTitle.record.version)
  assert.equal((await pages.find(owner.id, 'workspace-a', 'page-row'))?.updatedAt, beforeStaleTitle.page.updatedAt)
  await cell('notes', null)
  const applyViewFilter = async (filter: DatabaseFilter) => {
    const db = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
    const currentView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
    await databases.updateView(owner.id, 'workspace-a', 'database-a', currentView.id, { config: { filters: [filter], sorts: [], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: db.version, expectedViewVersion: currentView.version })
    return (await databases.getTable(owner.id, 'workspace-a', 'database-a', currentView.id, { limit: 10 })).records.map(row => row.id)
  }
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'eq', value: 0 }), ['row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'ne', value: 0 }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'gt', value: 0 }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'gte', value: 3.5 }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'lt', value: 1 }), ['row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'lte', value: 0 }), ['row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'done', operator: 'checked' }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'done', operator: 'unchecked' }), ['row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'status', operator: 'is', value: 'open' }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'status', operator: 'is_not', value: 'open' }), [])
  assert.deepEqual(await applyViewFilter({ propertyId: 'status', operator: 'is_empty' }), ['row-z', 'row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is', value: '2026-10-10' }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'after', value: '2026-10-09' }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'before', value: '2026-10-11' }), ['row-a'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is_empty' }), ['row-z', 'row-zero'])
  const setDate = async (recordId: string, value: DatabasePropertyValue) => {
    const db = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
    const record = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === recordId)!
    return databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', recordId, 'due', { value, expectedDatabaseVersion: db.version, expectedRecordVersion: record.version })
  }
  await setDate('row-a', { start: '2026-10-12T01:00:00.000Z', end: '2026-10-15T00:00:00.000Z', timeZone: 'Asia/Tokyo' })
  await setDate('row-zero', { start: '2026-10-12', end: '2026-10-15' })
  await setDate('row-z', '2026-10-12')
  await databases.createRecordPage(owner.id, 'workspace-a', 'database-a', { id: 'row-empty', pageId: 'page-empty', title: 'Empty date', orderKey: 'f' })
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is', value: '2026-10-12' }), ['row-a', 'row-z', 'row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'after', value: '2026-10-11' }), ['row-a', 'row-z', 'row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is_empty' }), ['row-empty'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is_not_empty' }), ['row-a', 'row-z', 'row-zero'])
  const dateFilterDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const dateFilterView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  await databases.updateView(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { config: { filters: [], sorts: [{ propertyId: 'due', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: dateFilterDb.version, expectedViewVersion: dateFilterView.version })
  const dateWindow = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { limit: 1 })
  assert.equal(dateWindow.records[0]?.id, 'row-z')
  assert.equal(dateWindow.records[0]?.properties.due, '2026-10-12')
  const dateNext = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { limit: 1, cursor: dateWindow.nextCursor! })
  assert.equal(dateNext.records[0]?.id, 'row-zero', 'equal UTC start keys use the record id tie-break')
  const dateLast = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { limit: 2, cursor: dateNext.nextCursor! })
  assert.deepEqual(dateLast.records.map(row => row.id), ['row-a', 'row-empty'], 'missing dates sort last and remain reachable through the cursor')
  const dateTwoFirst = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { limit: 2 })
  const dateTwoNext = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateFilterView.id, { limit: 2, cursor: dateTwoFirst.nextCursor! })
  assert.deepEqual([...dateTwoFirst.records, ...dateTwoNext.records].map(row => row.id), ['row-z', 'row-zero', 'row-a', 'row-empty'])
  const dateDescDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const dateDescView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  await databases.updateView(owner.id, 'workspace-a', 'database-a', dateDescView.id, { config: { filters: [], sorts: [{ propertyId: 'due', direction: 'desc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: dateDescDb.version, expectedViewVersion: dateDescView.version })
  const dateDescFirst = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateDescView.id, { limit: 2 })
  const dateDescNext = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', dateDescView.id, { limit: 2, cursor: dateDescFirst.nextCursor! })
  assert.deepEqual([...dateDescFirst.records, ...dateDescNext.records].map(row => row.id), ['row-a', 'row-z', 'row-zero', 'row-empty'])
  const multiSortDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const multiSortView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  await databases.updateView(owner.id, 'workspace-a', 'database-a', multiSortView.id, { config: { filters: [], sorts: [{ propertyId: 'due', direction: 'asc' }, { propertyId: 'database-a-title', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: multiSortDb.version, expectedViewVersion: multiSortView.version })
  const multiSortFirst = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', multiSortView.id, { limit: 2 })
  const multiSortNext = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', multiSortView.id, { limit: 2, cursor: multiSortFirst.nextCursor! })
  assert.deepEqual([...multiSortFirst.records, ...multiSortNext.records].map(row => row.id), ['row-z', 'row-zero', 'row-a', 'row-empty'], 'date anchor prefix is followed by the title sort key')
  const staleDateCursor = await databases.getViewRecords(owner.id, 'workspace-a', 'database-a', multiSortView.id, { limit: 1 })
  await cell('notes', 'date cursor fence change')
  await assert.rejects(databases.getViewRecords(owner.id, 'workspace-a', 'database-a', multiSortView.id, { limit: 1, cursor: staleDateCursor.nextCursor! }), /Database or view changed/)
  const emptyDateRecord = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-empty')!
  const emptyDateDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.deleteRecord(owner.id, 'workspace-a', 'database-a', 'row-empty', { expectedDatabaseVersion: emptyDateDatabase.version, expectedRecordVersion: emptyDateRecord.version })
  assert.equal(await pages.delete(owner.id, 'workspace-a', 'page-empty'), true)
  await setDate('row-a', '2026-10-10')
  await setDate('row-zero', null)
  await setDate('row-z', null)
  await cell('notes', 'symbols [.*$]')
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'contains', value: '.*$' }), ['row-a'])
  await cell('notes', null)
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is', value: 'touch legacy row' }), ['row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is_not', value: 'other' }), ['row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'does_not_contain', value: 'xyz' }), ['row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is_empty' }), ['row-a', 'row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is_not_empty' }), ['row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'database-a-title', operator: 'contains', value: 'New' }), ['row-z'])
  const pageSortDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const pageSortView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  await databases.updateView(owner.id, 'workspace-a', 'database-a', pageSortView.id, { config: { filters: [], sorts: [{ propertyId: 'database-a-title', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: pageSortDatabase.version, expectedViewVersion: pageSortView.version })
  const titlePageWindow = await databases.getTable(owner.id, 'workspace-a', 'database-a', pageSortView.id, { limit: 1 })
  assert.equal(titlePageWindow.records[0]?.id, 'row-z')
  await pages.update(owner.id, 'workspace-a', 'page-new-row', { title: 'Renamed via Page API' })
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', pageSortView.id, { limit: 1, cursor: titlePageWindow.nextCursor! }), /Database or view changed/)
  assert.deepEqual(await applyViewFilter({ propertyId: 'database-a-title', operator: 'contains', value: 'Page API' }), ['row-z'])
  const tieRecord = await databases.createRecordPage(owner.id, 'workspace-a', 'database-a', { id: 'row-tie', pageId: 'page-tie', title: 'Z title', orderKey: 'e' })
  const tieDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', tieRecord.record.id, 'count', { value: 3.5, expectedDatabaseVersion: tieDb.version, expectedRecordVersion: tieRecord.record.version })
  const tieNotesDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const tieNotesRecord = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === tieRecord.record.id)!
  await databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', tieRecord.record.id, 'notes', { value: '', expectedDatabaseVersion: tieNotesDb.version, expectedRecordVersion: tieNotesRecord.version })
  const sortDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const sortView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  const sortAsc = await databases.updateView(owner.id, 'workspace-a', 'database-a', sortView.id, { config: { filters: [], sorts: [{ propertyId: 'count', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: sortDb.version, expectedViewVersion: sortView.version })
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', sortView.id, { limit: 10 })).records.map(row => row.id), ['row-zero', 'row-a', 'row-tie', 'row-z'])
  const ascWindow = await databases.getTable(owner.id, 'workspace-a', 'database-a', sortView.id, { limit: 2 })
  const ascNext = await databases.getTable(owner.id, 'workspace-a', 'database-a', sortView.id, { limit: 2, cursor: ascWindow.nextCursor! })
  assert.deepEqual([...ascWindow.records, ...ascNext.records].map(row => row.id), ['row-zero', 'row-a', 'row-tie', 'row-z'])
  const descDb = sortAsc.database
  const descView = sortAsc.view
  await databases.updateView(owner.id, 'workspace-a', 'database-a', sortView.id, { config: { filters: [], sorts: [{ propertyId: 'count', direction: 'desc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: descDb.version, expectedViewVersion: descView.version })
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', sortView.id, { limit: 10 })).records.map(row => row.id), ['row-a', 'row-tie', 'row-zero', 'row-z'])
  const multiDb = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const multiView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  await databases.updateView(owner.id, 'workspace-a', 'database-a', sortView.id, { config: { filters: [], sorts: [{ propertyId: 'count', direction: 'asc' }, { propertyId: 'database-a-title', direction: 'desc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: multiDb.version, expectedViewVersion: multiView.version })
  assert.deepEqual((await databases.getTable(owner.id, 'workspace-a', 'database-a', sortView.id, { limit: 10 })).records.map(row => row.id), ['row-zero', 'row-tie', 'row-a', 'row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is_empty' }), ['row-a', 'row-tie', 'row-zero'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'notes', operator: 'is_not_empty' }), ['row-z'])
  await recordModel.updateOne({ id: 'row-z' }, { $set: { 'properties.count': null } })
  await recordModel.updateOne({ id: 'row-zero' }, { $set: { 'properties.due': null } })
  assert.deepEqual(await applyViewFilter({ propertyId: 'count', operator: 'is_empty' }), ['row-z'])
  assert.deepEqual(await applyViewFilter({ propertyId: 'due', operator: 'is_empty' }), ['row-tie', 'row-z', 'row-zero'])
  let projectedRow = (await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-a')
  assert.ok(projectedRow)
  assert.equal(Object.hasOwn(projectedRow.properties, 'notes'), false)
  assert.equal(projectedRow.properties.count, 3.5)
  assert.equal(projectedRow.properties.done, true)
  assert.equal(projectedRow.properties.due, '2026-10-10')
  assert.equal(projectedRow.properties.status, 'open')
  assert.equal(projectedRow.properties['property.$key'], 'safe whole-object update')
  assert.equal(projectedRow.properties['database-a-title'], 'Renamed row')

  let status = (await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'status')!
  let currentDatabaseBeforeOptionView = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [...(status.options ?? []), { id: 'undefined', name: 'Undefined' }], expectedDatabaseVersion: currentDatabaseBeforeOptionView.version, expectedPropertyVersion: status.version })
  status = (await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'status')!
  currentDatabaseBeforeOptionView = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const optionView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  const configuredOptionView = await databases.updateView(owner.id, 'workspace-a', 'database-a', optionView.id, { config: { filters: [{ propertyId: status.id, operator: 'is', value: 'undefined' }, { propertyId: status.id, operator: 'is_not', value: 'open' }, { propertyId: status.id, operator: 'is_empty' }, { propertyId: status.id, operator: 'is_not_empty' }], sorts: [{ propertyId: status.id, direction: 'asc' }], visibleProperties: ['database-a-title', status.id], propertyOrder: [status.id] }, expectedDatabaseVersion: currentDatabaseBeforeOptionView.version, expectedViewVersion: optionView.version })
  let currentDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await assert.rejects(databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [{ id: 'duplicate', name: 'Same' }, { id: 'duplicate', name: 'Other' }], expectedDatabaseVersion: currentDatabase.version, expectedPropertyVersion: status.version }), /Invalid database property/)
  await assert.rejects(databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [{ id: 'one', name: 'Same' }, { id: 'two', name: 'Same' }], expectedDatabaseVersion: currentDatabase.version, expectedPropertyVersion: status.version }), /Invalid database property/)
  assert.equal((await databases.find(owner.id, 'workspace-a', 'database-a'))?.version, currentDatabase.version)
  assert.deepEqual((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === status.id)?.options, status.options)
  await databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: currentDatabase.version, expectedPropertyVersion: status.version })
  const afterUndefinedOptionRemoval = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  assert.ok(afterUndefinedOptionRemoval.version > configuredOptionView.view.version)
  assert.deepEqual(afterUndefinedOptionRemoval.config?.filters, [{ propertyId: 'status', operator: 'is_not', value: 'open' }, { propertyId: 'status', operator: 'is_empty' }, { propertyId: 'status', operator: 'is_not_empty' }])
  status = (await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'status')!
  currentDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await recordModel.updateOne({ id: 'row-a' }, { $set: { 'properties.database-a-title': 'Legacy row title' } })
  const recordRepository = app.get(DatabaseRecordRepository)
  const updateProperties = recordRepository.updateProperties.bind(recordRepository)
  const beforeCleanupRecord = (await recordModel.findOne({ id: 'row-a' }).lean()) as { properties: Record<string, unknown>; version: number } | null
  recordRepository.updateProperties = async () => { throw new Error('forced option cleanup failure') }
  try {
    await assert.rejects(databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [], expectedDatabaseVersion: currentDatabase.version, expectedPropertyVersion: status.version }), /forced option cleanup failure/)
  } finally {
    recordRepository.updateProperties = updateProperties
  }
  assert.equal((await databases.find(owner.id, 'workspace-a', 'database-a'))?.version, currentDatabase.version)
  assert.deepEqual((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === status.id)?.options, status.options)
  const afterFailedCleanup = (await recordModel.findOne({ id: 'row-a' }).lean()) as { properties: Record<string, unknown>; version: number } | null
  assert.deepEqual({ properties: afterFailedCleanup?.properties, version: afterFailedCleanup?.version }, { properties: beforeCleanupRecord?.properties, version: beforeCleanupRecord?.version })
  await databases.updateProperty(owner.id, 'workspace-a', 'database-a', status.id, { options: [], expectedDatabaseVersion: currentDatabase.version, expectedPropertyVersion: status.version })
  const repairedOptionView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  assert.ok(repairedOptionView.version > configuredOptionView.view.version)
  assert.deepEqual(repairedOptionView.config, { filters: [{ propertyId: 'status', operator: 'is_empty' }, { propertyId: 'status', operator: 'is_not_empty' }], sorts: [{ propertyId: 'status', direction: 'asc' }], visibleProperties: ['database-a-title', 'status'], propertyOrder: ['status'] })
  assert.equal(Object.hasOwn(await storedProperties('row-a'), 'database-a-title'), false)
  projectedRow = (await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-a')
  assert.ok(projectedRow)
  assert.equal(Object.hasOwn(projectedRow.properties, 'status'), false)
  assert.ok(projectedRow.version > 1)

  await assert.rejects(cell('count', 'not a number'), /Invalid value/)
  await assert.rejects(cell('missing-property', 'x'), /property not found/)
  const current = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await assert.rejects(databases.deleteProperty(owner.id, 'workspace-a', 'database-a', 'database-a-title', { expectedDatabaseVersion: current.version, expectedPropertyVersion: 1 }), /cannot be deleted/)
  const deleteable = (await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === textProperty.property.id)!
  const beforeDeleteConfigDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const beforeDeleteConfigView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  const configuredDeleteView = await databases.updateView(owner.id, 'workspace-a', 'database-a', beforeDeleteConfigView.id, { config: { filters: [{ propertyId: deleteable.id, operator: 'contains', value: 'keep' }], sorts: [{ propertyId: deleteable.id, direction: 'desc' }], visibleProperties: ['database-a-title', deleteable.id], propertyOrder: [deleteable.id] }, expectedDatabaseVersion: beforeDeleteConfigDatabase.version, expectedViewVersion: beforeDeleteConfigView.version })
  const beforeDelete = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', 'row-a', 'notes', { value: 'remove me', expectedDatabaseVersion: beforeDelete.version, expectedRecordVersion: projectedRow.version })
  await recordModel.updateOne({ id: 'row-a' }, { $set: { 'properties.database-a-title': 'Legacy row title' } })
  const latestRecord = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-a')!
  const latestDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  await databases.deleteProperty(owner.id, 'workspace-a', 'database-a', deleteable.id, { expectedDatabaseVersion: latestDatabase.version, expectedPropertyVersion: deleteable.version })
  const repairedDeleteView = (await databases.listViews(owner.id, 'workspace-a', 'database-a')).find(view => view.id === 'table-two')!
  assert.ok(repairedDeleteView.version > configuredDeleteView.view.version)
  assert.deepEqual(repairedDeleteView.config, { filters: [], sorts: [], visibleProperties: ['database-a-title'], propertyOrder: [] })
  assert.equal(Object.hasOwn(await storedProperties('row-a'), 'database-a-title'), false)
  projectedRow = (await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })).records.find(row => row.id === 'row-a')
  assert.ok(projectedRow)
  assert.equal(Object.hasOwn(projectedRow.properties, 'notes'), false)
  assert.ok(projectedRow.version > latestRecord.version)

  const concurrencyDatabase = (await databases.find(owner.id, 'workspace-a', 'database-a'))!
  const concurrencyRecord = (await databases.listRecords(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'row-a')!
  const countProperty = (await databases.listProperties(owner.id, 'workspace-a', 'database-a')).find(row => row.id === 'count')!
  const concurrent = await Promise.allSettled([
    databases.updateProperty(owner.id, 'workspace-a', 'database-a', countProperty.id, { name: 'Count changed', expectedDatabaseVersion: concurrencyDatabase.version, expectedPropertyVersion: countProperty.version }),
    databases.updateRecordCell(owner.id, 'workspace-a', 'database-a', 'row-a', countProperty.id, { value: 4, expectedDatabaseVersion: concurrencyDatabase.version, expectedRecordVersion: concurrencyRecord.version }),
  ])
  assert.ok(concurrent.some(result => result.status === 'fulfilled'))
  assert.ok(concurrent.some(result => result.status === 'rejected'))
  const consistentAfterRace = await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 10 })
  assert.ok([3.5, 4].includes(consistentAfterRace.records.find(row => row.id === 'row-a')?.properties.count as number))
  // Record insertion and its Page are one transaction, even on a duplicate record ID.
  await assert.rejects(databases.createRecordPage(owner.id, 'workspace-a', 'database-a', { id: 'row-z', pageId: 'page-rolled-back-row', title: 'Duplicate', orderKey: 'd' }), /duplicate key/i)
  assert.equal(await pages.find(owner.id, 'workspace-a', 'page-rolled-back-row'), null)
  await assert.rejects(pages.delete(owner.id, 'workspace-a', 'page-row'), /database record/)
  await blocks.deleteFromPage(owner.id, 'workspace-a', 'page-a', 'block-a')
  assert.ok(await databases.find(owner.id, 'workspace-a', 'database-a'))
  assert.deepEqual((await databases.listViews(owner.id, 'workspace-a', 'database-a')).map(view => view.id).sort(), ['board-view', 'database-a-view', 'table-two'])
  await blocks.deleteFromPage(owner.id, 'workspace-a', 'page-a', 'block-second')
  await blocks.deleteFromPage(owner.id, 'workspace-a', 'page-a', 'block-b')
  assert.equal(await pages.delete(owner.id, 'workspace-a', 'page-a'), true)
  assert.ok(await databases.find(owner.id, 'workspace-a', 'database-a'))
  assert.equal((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).length, 6)
})

test('record Page title changes invalidate all linked table cursors and roll back with the Database version', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))

  const owner = await auth.register(`database-title-cursor-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'title-cursor-workspace', name: 'Title cursor' })
  await pages.create(owner.id, 'title-cursor-workspace', { id: 'title-cursor-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  await databases.createInPage(owner.id, 'title-cursor-workspace', 'title-cursor-home', { id: 'title-cursor-database', name: 'Titles', titlePropertyId: 'title-cursor-title', viewId: 'title-cursor-ascending', blockId: 'title-cursor-block', orderKey: 'a', parentBlockId: null })

  for (const [id, title] of [['a', 'Alpha'], ['b', 'Beta'], ['c', 'Charlie'], ['d', 'Delta']] as const) {
    await databases.createRecordPage(owner.id, 'title-cursor-workspace', 'title-cursor-database', { id: `title-row-${id}`, pageId: `title-page-${id}`, title, orderKey: id })
  }

  let database = (await databases.find(owner.id, 'title-cursor-workspace', 'title-cursor-database'))!
  let ascending = (await databases.listViews(owner.id, 'title-cursor-workspace', 'title-cursor-database'))[0]!
  await databases.updateView(owner.id, 'title-cursor-workspace', database.id, ascending.id, { config: { filters: [], sorts: [{ propertyId: 'title-cursor-title', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: database.version, expectedViewVersion: ascending.version })
  database = (await databases.find(owner.id, 'title-cursor-workspace', 'title-cursor-database'))!
  const descendingCreated = await databases.createView(owner.id, 'title-cursor-workspace', database.id, { id: 'title-cursor-descending', name: 'Descending', type: 'table' })
  await databases.updateView(owner.id, 'title-cursor-workspace', database.id, descendingCreated.view.id, { config: { filters: [], sorts: [{ propertyId: 'title-cursor-title', direction: 'desc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: descendingCreated.database.version, expectedViewVersion: descendingCreated.view.version })

  const ascendingFirst = await databases.getTable(owner.id, 'title-cursor-workspace', database.id, ascending.id, { limit: 2 })
  const descendingFirst = await databases.getTable(owner.id, 'title-cursor-workspace', database.id, 'title-cursor-descending', { limit: 2 })
  assert.deepEqual(ascendingFirst.records.map(record => record.id), ['title-row-a', 'title-row-b'])
  assert.ok(ascendingFirst.nextCursor)
  assert.ok(descendingFirst.nextCursor)

  const beforeRename = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  await pages.update(owner.id, 'title-cursor-workspace', 'title-page-a', { title: 'Zulu' })
  const afterRename = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  assert.equal(afterRename.version, beforeRename.version + 1)
  await assert.rejects(databases.getTable(owner.id, 'title-cursor-workspace', database.id, ascending.id, { limit: 2, cursor: ascendingFirst.nextCursor! }), /Database or view changed/)
  await assert.rejects(databases.getTable(owner.id, 'title-cursor-workspace', database.id, 'title-cursor-descending', { limit: 2, cursor: descendingFirst.nextCursor! }), /Database or view changed/)

  const restartedFirst = await databases.getTable(owner.id, 'title-cursor-workspace', database.id, ascending.id, { limit: 2 })
  const restartedSecond = await databases.getTable(owner.id, 'title-cursor-workspace', database.id, ascending.id, { limit: 2, cursor: restartedFirst.nextCursor! })
  const restartedIds = [...restartedFirst.records, ...restartedSecond.records].map(record => record.id)
  assert.deepEqual(restartedIds, ['title-row-b', 'title-row-c', 'title-row-d', 'title-row-a'])
  assert.equal(new Set(restartedIds).size, 4)

  const documentPage = (await pages.find(owner.id, 'title-cursor-workspace', 'title-page-c'))!
  database = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  await pages.updateDocumentVersion(owner.id, 'title-cursor-workspace', documentPage.id, documentPage.updatedAt, 'Charlie via document mutation')
  const afterDocumentRename = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  assert.equal(afterDocumentRename.version, database.version + 1)

  const snapshotPage = (await pages.find(owner.id, 'title-cursor-workspace', 'title-page-d'))!
  database = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      await pages.upsertSnapshot(owner.id, 'title-cursor-workspace', { id: snapshotPage.id, parentPageId: snapshotPage.parentPageId, title: 'Delta via sync snapshot', icon: null, orderKey: snapshotPage.orderKey }, session)
    })
  } finally {
    await session.endSession()
  }
  const afterSnapshotRename = (await databases.find(owner.id, 'title-cursor-workspace', database.id))!
  assert.equal(afterSnapshotRename.version, database.version + 1)

  const rollbackPage = (await pages.find(owner.id, 'title-cursor-workspace', 'title-page-b'))!
  const versionBeforeRollback = afterSnapshotRename.version
  const databaseRepository = app.get(DatabaseRepository)
  const compareAndBump = databaseRepository.compareAndBump.bind(databaseRepository)
  databaseRepository.compareAndBump = async () => null
  try {
    await assert.rejects(pages.update(owner.id, 'title-cursor-workspace', rollbackPage.id, { title: 'Must roll back' }), /rolled back/)
  } finally {
    databaseRepository.compareAndBump = compareAndBump
  }
  assert.equal((await pages.find(owner.id, 'title-cursor-workspace', rollbackPage.id))?.title, rollbackPage.title)
  assert.equal((await databases.find(owner.id, 'title-cursor-workspace', database.id))?.version, versionBeforeRollback)
})

test('legacy Database view config and base-only Records load without migration', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const records = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const views = app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))

  const owner = await auth.register(`database-legacy-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'legacy-database-workspace', name: 'Legacy Database' })
  await pages.create(owner.id, 'legacy-database-workspace', { id: 'legacy-database-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  await databases.createInPage(owner.id, 'legacy-database-workspace', 'legacy-database-home', { id: 'legacy-database', name: 'Legacy', titlePropertyId: 'legacy-title', viewId: 'legacy-view', blockId: 'legacy-block', orderKey: 'a', parentBlockId: null })
  const text = await databases.createProperty(owner.id, 'legacy-database-workspace', 'legacy-database', { id: 'legacy-text', name: 'Notes', type: 'text', expectedDatabaseVersion: 1 })
  const row = await databases.createRecordPage(owner.id, 'legacy-database-workspace', 'legacy-database', { id: 'legacy-row', pageId: 'legacy-page', title: 'Existing base row', orderKey: 'b' })
  const currentDatabase = (await databases.find(owner.id, 'legacy-database-workspace', 'legacy-database'))!
  await databases.updateRecordCell(owner.id, 'legacy-database-workspace', 'legacy-database', row.record.id, text.property.id, { value: 'Kept without advanced fields', expectedDatabaseVersion: currentDatabase.version, expectedRecordVersion: row.record.version })
  await views.collection.updateOne({ id: 'legacy-view' }, { $unset: { config: '' } })
  const storedRecord = await records.collection.findOne({ id: 'legacy-row' })
  assert.deepEqual(storedRecord?.properties, { 'legacy-text': 'Kept without advanced fields' })

  const table = await databases.getTable(owner.id, 'legacy-database-workspace', 'legacy-database', 'legacy-view', { limit: 100 })
  assert.deepEqual(table.view.config, DEFAULT_DATABASE_VIEW_CONFIG)
  assert.equal(table.records[0]?.id, 'legacy-row')
  assert.equal(table.records[0]?.properties['legacy-title'], 'Existing base row')
  assert.equal(table.records[0]?.properties['legacy-text'], 'Kept without advanced fields')
  assert.equal((await views.findOne({ id: 'legacy-view' }).lean() as { config?: unknown } | null)?.config, undefined)
})

test('Database property and view service caps accept 100 and roll back limit plus one', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const propertyModel = app.get<Model<unknown>>(getModelToken(DatabasePropertyEntity.name))
  const viewModel = app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))

  const owner = await auth.register(`database-cap-${randomUUID()}@example.com`, 'correct horse battery staple')
  const workspaceId = `database-cap-ws-${randomUUID()}`
  const databaseId = `database-cap-${randomUUID()}`
  const homePageId = `database-cap-home-${randomUUID()}`
  await workspaces.create(owner.id, { id: workspaceId, name: 'Database bounds' })
  await pages.create(owner.id, workspaceId, { id: homePageId, parentPageId: null, title: 'Home', orderKey: 'a' })
  const created = await databases.createInPage(owner.id, workspaceId, homePageId, {
    id: databaseId, name: 'Bounded', titlePropertyId: `title-${randomUUID()}`, viewId: `view-${randomUUID()}`, blockId: `block-${randomUUID()}`, orderKey: 'b', parentBlockId: null,
  })
  const timestamp = new Date()
  await propertyModel.insertMany(Array.from({ length: DATABASE_MAX_PROPERTIES - 2 }, (_, index) => ({
    id: `seed-property-${index}-${randomUUID()}`, workspaceId, databaseId, name: `Seed ${index}`, type: 'text', version: 1, createdAt: timestamp, updatedAt: timestamp,
  })))
  const beforePropertyLimit = (await databases.find(owner.id, workspaceId, databaseId))!
  assert.equal((await databases.listProperties(owner.id, workspaceId, databaseId)).length, DATABASE_MAX_PROPERTIES - 1)
  const lastProperty = await databases.createProperty(owner.id, workspaceId, databaseId, {
    id: `last-property-${randomUUID()}`, name: 'Property 100', type: 'text', expectedDatabaseVersion: beforePropertyLimit.version,
  })
  assert.equal((await databases.listProperties(owner.id, workspaceId, databaseId)).length, DATABASE_MAX_PROPERTIES)
  const tableAtPropertyLimit = await databases.getTable(owner.id, workspaceId, databaseId, created.view.id, { limit: 10 })
  assert.equal(tableAtPropertyLimit.properties.length, DATABASE_MAX_PROPERTIES)
  const beforePropertyOverflow = (await databases.find(owner.id, workspaceId, databaseId))!
  await assert.rejects(databases.createProperty(owner.id, workspaceId, databaseId, {
    id: `overflow-property-${randomUUID()}`, name: 'Property 101', type: 'text', expectedDatabaseVersion: beforePropertyOverflow.version,
  }), /maximum of 100 properties/)
  assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforePropertyOverflow.version, 'property limit rejection rolls back the Database version bump')
  const overflowPropertyId = `seed-property-overflow-${randomUUID()}`
  await propertyModel.insertMany([{ id: overflowPropertyId, workspaceId, databaseId, name: 'Corrupt overflow', type: 'text', version: 1, createdAt: timestamp, updatedAt: timestamp }])
  await assert.rejects(databases.getTable(owner.id, workspaceId, databaseId, created.view.id, { limit: 10 }), /maximum of 100 properties/)
  await propertyModel.deleteOne({ id: overflowPropertyId })

  await viewModel.insertMany(Array.from({ length: DATABASE_MAX_VIEWS - 2 }, (_, index) => ({
    id: `seed-view-${index}-${randomUUID()}`, workspaceId, databaseId, name: `Seed ${index}`, type: 'table', config: DEFAULT_DATABASE_VIEW_CONFIG, version: 1, referenceFence: 0, createdAt: timestamp, updatedAt: timestamp,
  })))
  assert.equal((await databases.listViewsWindow(owner.id, workspaceId, databaseId, DATABASE_MAX_VIEWS)).length, DATABASE_MAX_VIEWS - 1)
  const beforeLastView = (await databases.find(owner.id, workspaceId, databaseId))!
  await databases.createView(owner.id, workspaceId, databaseId, { id: `last-view-${randomUUID()}`, name: 'View 100', type: 'table', expectedDatabaseVersion: beforeLastView.version })
  assert.equal((await databases.listViewsWindow(owner.id, workspaceId, databaseId, DATABASE_MAX_VIEWS)).length, DATABASE_MAX_VIEWS)
  const beforeViewOverflow = (await databases.find(owner.id, workspaceId, databaseId))!
  await assert.rejects(databases.createView(owner.id, workspaceId, databaseId, {
    id: `overflow-view-${randomUUID()}`, name: 'View 101', type: 'table', expectedDatabaseVersion: beforeViewOverflow.version,
  }), /maximum of 100 views/)
  assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforeViewOverflow.version, 'view limit rejection rolls back the Database version bump')
  await viewModel.insertMany([{ id: `seed-view-overflow-${randomUUID()}`, workspaceId, databaseId, name: 'Corrupt overflow', type: 'table', config: DEFAULT_DATABASE_VIEW_CONFIG, version: 1, referenceFence: 0, createdAt: timestamp, updatedAt: timestamp }])
  await assert.rejects(databases.listViewsWindow(owner.id, workspaceId, databaseId, DATABASE_MAX_VIEWS), /maximum of 100 views/)
  assert.equal(lastProperty.property.type, 'text')
  assert.ok(await databases.find(owner.id, workspaceId, databaseId))
})

test('default table windows read only limit plus one records and Pages', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const pages = app.get(PageService)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([app.get<Model<unknown>>(getModelToken(DatabaseEntity.name)).init(), app.get<Model<unknown>>(getModelToken(DatabasePropertyEntity.name)).init(), recordModel.init(), app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name)).init()])
  const owner = await auth.register(`database-window-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'window-workspace', name: 'Window' })
  await pages.create(owner.id, 'window-workspace', { id: 'window-root', parentPageId: null, title: 'Window', orderKey: 'a' })
  await databases.createInPage(owner.id, 'window-workspace', 'window-root', { id: 'window-database', name: 'Window data', titlePropertyId: 'window-title', viewId: 'window-view', blockId: 'window-block', orderKey: 'a', parentBlockId: null })

  const totalRecords = 500
  const now = new Date()
  const pagesToInsert = Array.from({ length: totalRecords }, (_, index) => ({
    id: `window-page-${String(index).padStart(4, '0')}`, workspaceId: 'window-workspace', parentPageId: null,
    title: `Window row ${index}`, orderKey: String(index).padStart(4, '0'), structureFence: 0, createdAt: now, updatedAt: now,
  }))
  const recordsToInsert = Array.from({ length: totalRecords }, (_, index) => ({
    id: `window-record-${String(index).padStart(4, '0')}`, workspaceId: 'window-workspace', databaseId: 'window-database',
    pageId: pagesToInsert[index]!.id, properties: {}, version: 1, createdAt: now, updatedAt: now,
  }))
  await connection.db!.collection('pages').insertMany(pagesToInsert)
  await recordModel.insertMany(recordsToInsert)

  const databaseName = connection.db!.databaseName
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    const started = new Date()
    const first = await databases.getTable(owner.id, 'window-workspace', 'window-database', 'window-view', { limit: 5 })
    assert.deepEqual(first.records.map(row => row.id), recordsToInsert.slice(0, 5).map(row => row.id))
    assert.ok(first.nextCursor)
    const second = await databases.getTable(owner.id, 'window-workspace', 'window-database', 'window-view', { limit: 5, cursor: first.nextCursor! })
    assert.deepEqual(second.records.map(row => row.id), recordsToInsert.slice(5, 10).map(row => row.id))
    assert.equal(new Set([...first.records, ...second.records].map(row => row.id)).size, 10)

    const profile = connection.db!.collection('system.profile')
    const recordsQueries = await profile.find({ ns: `${databaseName}.database_records`, ts: { $gte: started } }).toArray()
    const pageQueries = await profile.find({ ns: `${databaseName}.pages`, ts: { $gte: started } }).toArray()
    const windowRecordQueries = recordsQueries.filter(entry => entry.op === 'query' && entry.command?.find === 'database_records' && entry.command?.filter?.databaseId === 'window-database')
    const projectedPageQueries = pageQueries.filter(entry => entry.op === 'query' && entry.command?.find === 'pages' && Array.isArray(entry.command?.filter?.id?.$in))
    assert.ok(windowRecordQueries.length >= 2, 'both page requests must query the bounded record collection')
    assert.ok(projectedPageQueries.length >= 2, 'both page requests must project their page titles with bounded ID batches')
    assert.ok(windowRecordQueries.every(entry => entry.nreturned <= 6 && entry.docsExamined <= 6), 'each record query must examine and return at most limit+1 rows')
    assert.ok(projectedPageQueries.every(entry => entry.nreturned <= 6 && entry.docsExamined <= 6), 'each title projection must read at most limit+1 pages')

    await connection.db!.collection('pages').deleteOne({ id: 'window-page-0000' })
    await assert.rejects(databases.getTable(owner.id, 'window-workspace', 'window-database', 'window-view', { limit: 5 }), /Record page missing/)
  } finally {
    await connection.db!.command({ profile: 0 })
  }
})

test('database writes reject unsupported transactions before any write', async () => {
  let writes = 0
  let sessions = 0
  const repository = new Proxy({}, { get: () => () => { writes += 1; throw new Error('unexpected write') } })
  const connection = { db: { admin: () => ({ command: async () => ({}) }) }, startSession: () => { sessions += 1; throw new Error('unexpected session') } }
  const permissions = { assertCanWrite: async () => {} }
  const service = new DatabaseService(repository as never, repository as never, repository as never, repository as never, repository as never, repository as never, repository as never, permissions as never, connection as never)
  await assert.rejects(service.createInPage('user', 'workspace', 'page', { id: 'db', name: 'Tasks', titlePropertyId: 'title', viewId: 'view', blockId: 'block', orderKey: 'a', parentBlockId: null }), error => (error as { status?: number }).status === 503)
  assert.equal(writes, 0)
  assert.equal(sessions, 0)
})

test('advanced properties keep links scoped, project values, and clean incoming relations on record deletion', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))
  const owner = await auth.register(`advanced-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'advanced-ws', name: 'Advanced' })
  await pages.create(owner.id, 'advanced-ws', { id: 'advanced-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  const createDatabase = (id: string) => databases.createInPage(owner.id, 'advanced-ws', 'advanced-home', { id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: id, parentBlockId: null })
  await createDatabase('advanced-source')
  await createDatabase('advanced-target')
  const number = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-target', { id: 'target-number', name: 'Number', type: 'number', expectedDatabaseVersion: 1 })
  const target = await databases.createRecordPage(owner.id, 'advanced-ws', 'advanced-target', { id: 'target-row', pageId: 'target-page', title: 'Target title', orderKey: 'b' })
  await databases.updateRecordCell(owner.id, 'advanced-ws', 'advanced-target', 'target-row', 'target-number', { value: 8, expectedDatabaseVersion: 3, expectedRecordVersion: 1 })
  const relation = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-source', { id: 'links.alt', name: 'Links', type: 'relation', config: { targetDatabaseId: 'advanced-target' }, expectedDatabaseVersion: 1 })
  const rollup = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-source', { id: 'source-total', name: 'Total', type: 'rollup', config: { relationPropertyId: 'links.alt', targetPropertyId: number.property.id, aggregation: 'sum' }, expectedDatabaseVersion: relation.database.version })
  const formula = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-source', { id: 'source-double', name: 'Double', type: 'formula', config: { expression: { kind: 'binary', operator: '*', left: { kind: 'property', propertyId: 'source-total' }, right: { kind: 'literal', value: 2 } }, resultType: 'number' }, expectedDatabaseVersion: rollup.database.version })
  const source = await databases.createRecordPage(owner.id, 'advanced-ws', 'advanced-source', { id: 'source-row', pageId: 'source-page', title: 'Source title', orderKey: 'c' })
  await assert.rejects(databases.updateRecordCell(owner.id, 'advanced-ws', 'advanced-source', 'source-row', 'source-total', { value: 5, expectedDatabaseVersion: formula.database.version + 1, expectedRecordVersion: 1 }), /read only/)
  await assert.rejects(databases.updateRecordCell(owner.id, 'advanced-ws', 'advanced-source', 'source-row', 'links.alt', { value: ['missing'], expectedDatabaseVersion: formula.database.version + 1, expectedRecordVersion: 1 }), /existing records/)
  const linked = await databases.updateRecordCell(owner.id, 'advanced-ws', 'advanced-source', 'source-row', 'links.alt', { value: [target.record.id], expectedDatabaseVersion: formula.database.version + 1, expectedRecordVersion: 1 })
  assert.deepEqual(linked.record.properties['links.alt'], ['target-row'])
  assert.equal(linked.record.properties['source-total'], 8)
  assert.equal(linked.record.properties['source-double'], 16)
  const table = await databases.getTable(owner.id, 'advanced-ws', 'advanced-source', 'advanced-source-view', { limit: 10 })
  assert.equal(table.records[0]?.properties['source-double'], 16)
  assert.deepEqual(await databases.resolveRecordOptions(owner.id, 'advanced-ws', 'advanced-target', { recordIds: ['target-row', 'missing'] }), { items: [{ recordId: 'target-row', pageId: 'target-page', title: 'Target title' }] })
  assert.deepEqual((await databases.listRecordOptions(owner.id, 'advanced-ws', 'advanced-target', { search: 'Target', limit: 50 })).items, [{ recordId: 'target-row', pageId: 'target-page', title: 'Target title' }])
  await assert.rejects(databases.deleteProperty(owner.id, 'advanced-ws', 'advanced-target', 'target-number', { expectedDatabaseVersion: 4, expectedPropertyVersion: 1 }), /rollup/)
  await assert.rejects(databases.updateProperty(owner.id, 'advanced-ws', 'advanced-source', 'links.alt', { config: { targetDatabaseId: 'advanced-source' }, expectedDatabaseVersion: linked.database.version, expectedPropertyVersion: 1 }), /Clear relation values/)
  await assert.rejects(databases.deleteRecord(owner.id, 'advanced-ws', 'advanced-target', 'target-row', { expectedDatabaseVersion: 4, expectedRecordVersion: 1 }), /version is stale/)
  await recordModel.create({ id: 'target-row-shadow', workspaceId: 'advanced-ws', databaseId: 'advanced-target', pageId: target.page.id, properties: {}, version: 1 })
  const deleted = await databases.deleteRecord(owner.id, 'advanced-ws', 'advanced-target', 'target-row', { expectedDatabaseVersion: 4, expectedRecordVersion: 2 })
  assert.equal(deleted.database.version, 5)
  const preservedTargetPage = await pages.find(owner.id, 'advanced-ws', target.page.id)
  assert.ok(preservedTargetPage, 'record deletion preserves its Page')
  assert.equal(preservedTargetPage.role, 'database-record', 'a Page remains hidden while another Record still references it')
  assert.equal((await pages.listNavigation(owner.id, 'advanced-ws')).some(page => page.id === target.page.id), false)
  await databases.deleteRecord(owner.id, 'advanced-ws', 'advanced-target', 'target-row-shadow', { expectedDatabaseVersion: 5, expectedRecordVersion: 1 })
  assert.equal((await pages.find(owner.id, 'advanced-ws', target.page.id))?.role, undefined, 'the final Record deletion returns its preserved Page to ordinary navigation')
  assert.ok((await pages.listNavigation(owner.id, 'advanced-ws')).some(page => page.id === target.page.id))
  const after = await databases.getTable(owner.id, 'advanced-ws', 'advanced-source', 'advanced-source-view', { limit: 10 })
  assert.deepEqual(after.records[0]?.properties['links.alt'], [])
  assert.equal(after.records[0]?.properties['source-total'], null)
  assert.equal(after.records[0]?.properties['source-double'], null)
  const proto = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-source', { id: '__proto__', name: 'Safe formula', type: 'formula', config: { expression: { kind: 'property', propertyId: 'source-total' }, resultType: 'number' }, expectedDatabaseVersion: after.database.version })
  const protoRow = (await databases.getTable(owner.id, 'advanced-ws', 'advanced-source', 'advanced-source-view', { limit: 10 })).records[0]!
  assert.equal(Object.hasOwn(protoRow.properties, '__proto__'), true)
  assert.equal(protoRow.properties['__proto__'], null)
  const self = await databases.createProperty(owner.id, 'advanced-ws', 'advanced-source', { id: 'source-self', name: 'Self', type: 'relation', config: { targetDatabaseId: 'advanced-source' }, expectedDatabaseVersion: proto.database.version })
  const selfLinked = await databases.updateRecordCell(owner.id, 'advanced-ws', 'advanced-source', 'source-row', 'source-self', { value: ['source-row'], expectedDatabaseVersion: self.database.version, expectedRecordVersion: after.records[0]!.version })
  await databases.deleteRecord(owner.id, 'advanced-ws', 'advanced-source', 'source-row', { expectedDatabaseVersion: selfLinked.database.version, expectedRecordVersion: selfLinked.record.version })
  const preservedSourcePage = await pages.find(owner.id, 'advanced-ws', source.page.id)
  assert.ok(preservedSourcePage, 'self-linked record deletion preserves its Page')
  assert.equal(preservedSourcePage.role, undefined)
  assert.deepEqual((await databases.getTable(owner.id, 'advanced-ws', 'advanced-source', 'advanced-source-view', { limit: 10 })).records, [])
  await recordModel.insertMany(Array.from({ length: 101 }, (_, index) => ({ id: `advanced-bounded-${index}`, workspaceId: 'advanced-ws', databaseId: 'advanced-source', pageId: `advanced-page-${index}`, properties: {}, version: 1 })))
  await assert.rejects(databases.listRecords(owner.id, 'advanced-ws', 'advanced-source'), /maximum of 100 records/)
  await recordModel.insertMany(Array.from({ length: 9900 }, (_, index) => ({ id: `advanced-large-${index}`, workspaceId: 'advanced-ws', databaseId: 'advanced-source', pageId: `advanced-large-page-${index}`, properties: {}, version: 1 })))
  await assert.rejects(databases.listRecordOptions(owner.id, 'advanced-ws', 'advanced-source', { search: 'anything', limit: 50 }), /maximum of 5000 candidate records/)
  const boundedTarget = await databases.createRecordPage(owner.id, 'advanced-ws', 'advanced-target', { id: 'bounded-target', pageId: 'bounded-target-page', title: 'Bounded', orderKey: 'd' })
  await assert.rejects(databases.deleteRecord(owner.id, 'advanced-ws', 'advanced-target', boundedTarget.record.id, { expectedDatabaseVersion: (await databases.find(owner.id, 'advanced-ws', 'advanced-target'))!.version, expectedRecordVersion: boundedTarget.record.version }), /maximum of 10000 scanned records/)
  assert.ok(await recordModel.findOne({ id: boundedTarget.record.id }), 'failed bounded cleanup rolls back target deletion')
  assert.equal(source.record.id, 'source-row')
})

test('relation properties reject cross-workspace and invalid links, filter empty values, and clean up without deleting targets', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const records = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))

  const owner = await auth.register(`relation-lifecycle-${randomUUID()}@example.com`, 'correct horse battery staple')
  const outsider = await auth.register(`relation-outsider-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'relation-ws-a', name: 'A' })
  await workspaces.create(owner.id, { id: 'relation-ws-b', name: 'B' })
  await workspaces.create(outsider.id, { id: 'relation-ws-foreign', name: 'Foreign' })
  await pages.create(owner.id, 'relation-ws-a', { id: 'relation-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  await pages.create(owner.id, 'relation-ws-b', { id: 'relation-home-b', parentPageId: null, title: 'Home B', orderKey: 'a' })
  await pages.create(outsider.id, 'relation-ws-foreign', { id: 'relation-home-foreign', parentPageId: null, title: 'Foreign', orderKey: 'a' })
  const createDatabase = (workspaceId: string, id: string) => databases.createInPage(owner.id, workspaceId, workspaceId === 'relation-ws-a' ? 'relation-home' : 'relation-home-b', { id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: id, parentBlockId: null })
  await createDatabase('relation-ws-a', 'relation-source')
  await createDatabase('relation-ws-a', 'relation-target')
  await createDatabase('relation-ws-b', 'relation-other-workspace')
  // Use the foreign owner directly for the foreign Database fixture.
  await databases.createInPage(outsider.id, 'relation-ws-foreign', 'relation-home-foreign', { id: 'relation-foreign', name: 'Foreign', titlePropertyId: 'relation-foreign-title', viewId: 'relation-foreign-view', blockId: 'relation-foreign-block', orderKey: 'a', parentBlockId: null })

  const sourceDatabase = async () => (await databases.find(owner.id, 'relation-ws-a', 'relation-source'))!
  const targetDatabase = async () => (await databases.find(owner.id, 'relation-ws-a', 'relation-target'))!
  const targetNumber = await databases.createProperty(owner.id, 'relation-ws-a', 'relation-target', { id: 'relation-target-number', name: 'Number', type: 'number', expectedDatabaseVersion: (await targetDatabase()).version })
  const target = await databases.createRecordPage(owner.id, 'relation-ws-a', 'relation-target', { id: 'relation-target-row', pageId: 'relation-target-page', title: 'Target', orderKey: 'a' })
  const source = await databases.createRecordPage(owner.id, 'relation-ws-a', 'relation-source', { id: 'relation-source-row', pageId: 'relation-source-page', title: 'Source', orderKey: 'a' })
  const emptySource = await databases.createRecordPage(owner.id, 'relation-ws-a', 'relation-source', { id: 'relation-empty-row', pageId: 'relation-empty-page', title: 'Empty', orderKey: 'b' })
  const otherTarget = await databases.createRecordPage(owner.id, 'relation-ws-b', 'relation-other-workspace', { id: 'relation-other-row', pageId: 'relation-other-page', title: 'Other workspace', orderKey: 'a' })
  const foreignTarget = await databases.createRecordPage(outsider.id, 'relation-ws-foreign', 'relation-foreign', { id: 'relation-foreign-row', pageId: 'relation-foreign-page', title: 'Foreign target', orderKey: 'a' })

  const rejectUnscopedTarget = async (propertyId: string, targetDatabaseId: string) => {
    const before = await sourceDatabase()
    await assert.rejects(databases.createProperty(owner.id, 'relation-ws-a', 'relation-source', { id: propertyId, name: propertyId, type: 'relation', config: { targetDatabaseId }, expectedDatabaseVersion: before.version }), error => {
      assert.equal((error as { status?: number }).status, 409)
      assert.match((error as Error).message, /Referenced database changed; refresh and retry/)
      return true
    })
    assert.equal((await sourceDatabase()).version, before.version, 'failed cross-workspace Relation creation rolls back the Database version bump')
    assert.equal((await databases.listProperties(owner.id, 'relation-ws-a', 'relation-source')).some(property => property.id === propertyId), false, 'failed cross-workspace Relation creation writes no Property')
  }
  await rejectUnscopedTarget('relation-cross-workspace', 'relation-other-workspace')
  await rejectUnscopedTarget('relation-foreign-target', 'relation-foreign')

  const relation = await databases.createProperty(owner.id, 'relation-ws-a', 'relation-source', { id: 'relation-links', name: 'Links', type: 'relation', config: { targetDatabaseId: 'relation-target' }, expectedDatabaseVersion: (await sourceDatabase()).version })
  const backRelation = await databases.createProperty(owner.id, 'relation-ws-a', 'relation-target', { id: 'relation-back-links', name: 'Back links', type: 'relation', config: { targetDatabaseId: 'relation-source' }, expectedDatabaseVersion: (await targetDatabase()).version })
  await assert.rejects(databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-source', source.record.id, relation.property.id, { value: [otherTarget.record.id], expectedDatabaseVersion: (await sourceDatabase()).version, expectedRecordVersion: source.record.version }), /existing records|target|workspace/i)
  await assert.rejects(databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-source', source.record.id, relation.property.id, { value: [target.record.id, target.record.id], expectedDatabaseVersion: (await sourceDatabase()).version, expectedRecordVersion: source.record.version }), /invalid database input|duplicate|relation|value/i)
  await assert.rejects(databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-source', source.record.id, relation.property.id, { value: Array.from({ length: 51 }, (_, index) => `target-${index}`), expectedDatabaseVersion: (await sourceDatabase()).version, expectedRecordVersion: source.record.version }), /invalid database input|50|maximum|relation|value/i)
  await assert.rejects(databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-source', source.record.id, relation.property.id, { value: [foreignTarget.record.id], expectedDatabaseVersion: (await sourceDatabase()).version, expectedRecordVersion: source.record.version }), /existing records|target|workspace/i)
  const linked = await databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-source', source.record.id, relation.property.id, { value: [target.record.id], expectedDatabaseVersion: (await sourceDatabase()).version, expectedRecordVersion: source.record.version })
  const backLinked = await databases.updateRecordCell(owner.id, 'relation-ws-a', 'relation-target', target.record.id, backRelation.property.id, { value: [source.record.id], expectedDatabaseVersion: (await targetDatabase()).version, expectedRecordVersion: target.record.version })
  assert.deepEqual(linked.record.properties[relation.property.id], [target.record.id])
  assert.deepEqual(backLinked.record.properties[backRelation.property.id], [source.record.id], 'opposite one-way Relations may form a cycle')

  const rollup = await databases.createProperty(owner.id, 'relation-ws-a', 'relation-source', { id: 'relation-rollup', name: 'Target total', type: 'rollup', config: { relationPropertyId: relation.property.id, targetPropertyId: targetNumber.property.id, aggregation: 'sum' }, expectedDatabaseVersion: (await sourceDatabase()).version })
  const formula = await databases.createProperty(owner.id, 'relation-ws-a', 'relation-source', { id: 'relation-formula', name: 'Double total', type: 'formula', config: { expression: { kind: 'binary', operator: '*', left: { kind: 'property', propertyId: rollup.property.id }, right: { kind: 'literal', value: 2 } }, resultType: 'number' }, expectedDatabaseVersion: (await sourceDatabase()).version })
  const currentView = (await databases.listViews(owner.id, 'relation-ws-a', 'relation-source')).find(view => view.id === 'relation-source-view')!
  const filterConfig = { filters: [{ propertyId: relation.property.id, operator: 'is_empty' as const }], sorts: [], visibleProperties: null, propertyOrder: null }
  await databases.updateView(owner.id, 'relation-ws-a', 'relation-source', currentView.id, { config: filterConfig, expectedDatabaseVersion: (await sourceDatabase()).version, expectedViewVersion: currentView.version })
  const emptyFiltered = await databases.getTable(owner.id, 'relation-ws-a', 'relation-source', currentView.id, { limit: 10 })
  assert.deepEqual(emptyFiltered.records.map(row => row.id), [emptySource.record.id])
  const filteredView = (await databases.listViews(owner.id, 'relation-ws-a', 'relation-source')).find(view => view.id === currentView.id)!
  await databases.updateView(owner.id, 'relation-ws-a', 'relation-source', filteredView.id, { config: { ...filterConfig, filters: [{ propertyId: relation.property.id, operator: 'is_not_empty' as const }] }, expectedDatabaseVersion: (await sourceDatabase()).version, expectedViewVersion: filteredView.version })
  assert.deepEqual((await databases.getTable(owner.id, 'relation-ws-a', 'relation-source', currentView.id, { limit: 10 })).records.map(row => row.id), [source.record.id])

  await assert.rejects(databases.deleteProperty(owner.id, 'relation-ws-a', 'relation-source', relation.property.id, { expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: relation.property.version }), /referenced|rollup|formula/i)
  await assert.rejects(databases.deleteProperty(owner.id, 'relation-ws-a', 'relation-source', rollup.property.id, { expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: rollup.property.version }), /referenced|formula/i)
  await databases.deleteProperty(owner.id, 'relation-ws-a', 'relation-source', formula.property.id, { expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: formula.property.version })
  await databases.deleteProperty(owner.id, 'relation-ws-a', 'relation-source', rollup.property.id, { expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: rollup.property.version })
  const renamed = await databases.updateProperty(owner.id, 'relation-ws-a', 'relation-source', relation.property.id, { name: 'Renamed links', expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: relation.property.version })
  assert.equal(renamed.property.name, 'Renamed links')
  await databases.deleteProperty(owner.id, 'relation-ws-a', 'relation-source', relation.property.id, { expectedDatabaseVersion: (await sourceDatabase()).version, expectedPropertyVersion: renamed.property.version })
  const deletedRelationView = (await databases.listViews(owner.id, 'relation-ws-a', 'relation-source')).find(view => view.id === currentView.id)!
  assert.deepEqual(deletedRelationView.config?.filters, [])
  const persistedSource = await records.findOne({ id: source.record.id }).lean() as { properties: Record<string, unknown> } | null
  assert.ok(persistedSource)
  assert.equal(Object.hasOwn(persistedSource.properties, relation.property.id), false)
  assert.ok(await databases.find(owner.id, 'relation-ws-a', 'relation-target'), 'deleting a Relation preserves its target Database')
  assert.ok(await records.findOne({ id: target.record.id }), 'deleting a Relation preserves its target Record')
  assert.ok(await pages.find(owner.id, 'relation-ws-a', target.page.id), 'deleting a Relation preserves the target Page')
  assert.deepEqual((await databases.getTable(owner.id, 'relation-ws-a', 'relation-target', 'relation-target-view', { limit: 10 })).records[0]?.properties[backRelation.property.id], [source.record.id], 'deleting one Relation preserves the independent back Relation')
})

test('derived reads reject more than 5000 distinct linked records before fetching targets', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const pages = app.get(PageService)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))
  const owner = await auth.register(`derived-link-bound-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'derived-bound-ws', name: 'Bounds' })
  await pages.create(owner.id, 'derived-bound-ws', { id: 'derived-bound-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  for (const id of ['derived-bound-source', 'derived-bound-target']) await databases.createInPage(owner.id, 'derived-bound-ws', 'derived-bound-home', { id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: id, parentBlockId: null })
  const currentDatabase = async (id: string) => (await databases.find(owner.id, 'derived-bound-ws', id))!
  const targetProperty = await databases.createProperty(owner.id, 'derived-bound-ws', 'derived-bound-target', { id: 'derived-bound-number', name: 'Number', type: 'number', expectedDatabaseVersion: (await currentDatabase('derived-bound-target')).version })
  const relationA = await databases.createProperty(owner.id, 'derived-bound-ws', 'derived-bound-source', { id: 'derived-bound-links-a', name: 'Links A', type: 'relation', config: { targetDatabaseId: 'derived-bound-target' }, expectedDatabaseVersion: (await currentDatabase('derived-bound-source')).version })
  const rollupA = await databases.createProperty(owner.id, 'derived-bound-ws', 'derived-bound-source', { id: 'derived-bound-rollup-a', name: 'Count A', type: 'rollup', config: { relationPropertyId: relationA.property.id, targetPropertyId: targetProperty.property.id, aggregation: 'count' }, expectedDatabaseVersion: relationA.database.version })
  const relationB = await databases.createProperty(owner.id, 'derived-bound-ws', 'derived-bound-source', { id: 'derived-bound-links-b', name: 'Links B', type: 'relation', config: { targetDatabaseId: 'derived-bound-target' }, expectedDatabaseVersion: rollupA.database.version })
  await databases.createProperty(owner.id, 'derived-bound-ws', 'derived-bound-source', { id: 'derived-bound-rollup-b', name: 'Count B', type: 'rollup', config: { relationPropertyId: relationB.property.id, targetPropertyId: targetProperty.property.id, aggregation: 'count' }, expectedDatabaseVersion: relationB.database.version })

  const now = new Date()
  const sourceRows = Array.from({ length: 100 }, (_, index) => {
    const linksA = Array.from({ length: 50 }, (__, link) => `derived-bound-target-${String(index * 50 + link).padStart(4, '0')}`)
    const linksB = index === 0 ? ['derived-bound-target-5000'] : []
    return {
      id: `derived-bound-row-${String(index).padStart(3, '0')}`, workspaceId: 'derived-bound-ws', databaseId: 'derived-bound-source',
      pageId: `derived-bound-page-${String(index).padStart(3, '0')}`, properties: { [relationA.property.id]: linksA, ...(linksB.length ? { [relationB.property.id]: linksB } : {}) }, version: 1, createdAt: now, updatedAt: now,
    }
  })
  const sourcePages = sourceRows.map((row, index) => ({ id: row.pageId, workspaceId: 'derived-bound-ws', parentPageId: null, title: `Row ${index}`, orderKey: String(index).padStart(3, '0'), structureFence: 0, createdAt: now, updatedAt: now }))
  await connection.db!.collection('pages').insertMany(sourcePages)
  await recordModel.insertMany(sourceRows)

  const databaseName = connection.db!.databaseName
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    await assert.rejects(databases.getTable(owner.id, 'derived-bound-ws', 'derived-bound-source', 'derived-bound-source-view', { limit: 100 }), /maximum of 5000 linked records/)
    const targetQueries = await connection.db!.collection('system.profile').find({ ns: `${databaseName}.database_records`, 'command.filter.databaseId': 'derived-bound-target' }).toArray()
    assert.equal(targetQueries.length, 0, 'the bound is checked before any target Record fetch')
  } finally {
    await connection.db!.command({ profile: 0 })
  }
})

test('advanced reference fences resolve relation and rollup races without dangling references', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const recordRepository = app.get(DatabaseRecordRepository)
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))
  const owner = await auth.register(`advanced-race-${randomUUID()}@example.com`, 'correct horse battery staple')
  await workspaces.create(owner.id, { id: 'race-ws', name: 'Races' })
  await pages.create(owner.id, 'race-ws', { id: 'race-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  for (const id of ['race-source', 'race-target']) await databases.createInPage(owner.id, 'race-ws', 'race-home', { id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: id, parentBlockId: null })
  const targetProperty = await databases.createProperty(owner.id, 'race-ws', 'race-target', { id: 'race-number', name: 'Number', type: 'number', expectedDatabaseVersion: 1 })
  const relation = await databases.createProperty(owner.id, 'race-ws', 'race-source', { id: 'race-links', name: 'Links', type: 'relation', config: { targetDatabaseId: 'race-target' }, expectedDatabaseVersion: 1 })
  const target = await databases.createRecordPage(owner.id, 'race-ws', 'race-target', { id: 'race-target-row', pageId: 'race-target-page', title: 'Target', orderKey: 'b' })
  const source = await databases.createRecordPage(owner.id, 'race-ws', 'race-source', { id: 'race-source-row', pageId: 'race-source-page', title: 'Source', orderKey: 'c' })
  const concurrent = await Promise.allSettled([
    databases.updateRecordCell(owner.id, 'race-ws', 'race-source', source.record.id, relation.property.id, { value: [target.record.id], expectedDatabaseVersion: source.record.version + 2, expectedRecordVersion: source.record.version }),
    databases.deleteRecord(owner.id, 'race-ws', 'race-target', target.record.id, { expectedDatabaseVersion: target.record.version + 2, expectedRecordVersion: target.record.version }),
  ])
  assert.ok(concurrent.some(result => result.status === 'fulfilled'))
  const targetAfter = await recordRepository.findInDatabase('race-ws', 'race-target', target.record.id)
  const sourceAfter = await recordRepository.findInDatabase('race-ws', 'race-source', source.record.id)
  assert.ok(sourceAfter)
  if (!targetAfter) assert.deepEqual(sourceAfter.properties[relation.property.id] ?? [], [], 'deleted target cannot leave a dangling link')
  else assert.ok(sourceAfter.properties[relation.property.id] === undefined || (sourceAfter.properties[relation.property.id] as string[]).every(id => id === targetAfter.id))

  const rollupRace = await Promise.allSettled([
    databases.createProperty(owner.id, 'race-ws', 'race-source', { id: 'race-rollup', name: 'Rollup', type: 'rollup', config: { relationPropertyId: relation.property.id, targetPropertyId: targetProperty.property.id, aggregation: 'sum' }, expectedDatabaseVersion: (await databases.find(owner.id, 'race-ws', 'race-source'))!.version }),
    databases.deleteProperty(owner.id, 'race-ws', 'race-target', targetProperty.property.id, { expectedDatabaseVersion: (await databases.find(owner.id, 'race-ws', 'race-target'))!.version, expectedPropertyVersion: targetProperty.property.version }),
  ])
  assert.equal(rollupRace.filter(result => result.status === 'fulfilled').length, 1, 'target property deletion and rollup creation cannot both commit')
  const sourceProperties = await databases.listProperties(owner.id, 'race-ws', 'race-source')
  const targetProperties = await databases.listProperties(owner.id, 'race-ws', 'race-target')
  assert.equal(sourceProperties.some(property => property.id === 'race-rollup'), targetProperties.some(property => property.id === 'race-number'))
})

test('property type mutation atomically migrates records, repairs views and protects dependencies', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  assert.equal(await supportsTransactions(connection), true, 'type mutation regression requires Mongo replica set')
  const service = app.get(DatabaseService)
  const pages = app.get(PageService)
  const owner = await app.get(AuthService).register(`mutation-${randomUUID()}@example.com`, 'correct horse battery staple')
  await app.get(WorkspaceService).create(owner.id, { id: 'mutation-ws', name: 'Mutation' })
  await pages.create(owner.id, 'mutation-ws', { id: 'mutation-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  const models = [DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<any>>(getModelToken(entity.name)))
  await Promise.all(models.map(model => model.init()))
  const [databaseModel, propertyModel, recordModel, viewModel] = models as [Model<any>, Model<any>, Model<any>, Model<any>]
  const ws = 'mutation-ws', db = 'mutation-db'
  const createDb = (id: string) => service.createInPage(owner.id, ws, 'mutation-home', { id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: id, parentBlockId: null })
  await createDb(db)
  const current = async (databaseId = db) => (await service.find(owner.id, ws, databaseId))!
  const property = async (id: string, databaseId = db) => (await service.listProperties(owner.id, ws, databaseId)).find(row => row.id === id)!
  const add = async (id: string, type: any, extras: any = {}, databaseId = db) => (await service.createProperty(owner.id, ws, databaseId, { id, name: id, type, ...extras, expectedDatabaseVersion: (await current(databaseId)).version })).property
  const change = async (id: string, targetType: any, extras: any = {}, databaseId = db) => service.changePropertyType(owner.id, ws, databaseId, id, { targetType, ...extras, expectedDatabaseVersion: (await current(databaseId)).version, expectedPropertyVersion: (await property(id, databaseId)).version })
  const snapshot = async () => Promise.all(models.map(model => model.find({ workspaceId: ws }).sort({ id: 1 }).lean()))
  await add('value', 'text')
  await add('other', 'checkbox')
  for (let i = 0; i < 5; i++) await service.createRecordPage(owner.id, ws, db, { id: `mutation-row-${i}`, pageId: `mutation-page-${i}`, title: `Row ${i}`, orderKey: String(i) })
  for (const [i, value] of ['12.5', ' 42 ', 'abc', ''].entries()) await recordModel.updateOne({ id: `mutation-row-${i}` }, { $set: { properties: { value, other: true } } })
  await recordModel.updateOne({ id: 'mutation-row-4' }, { $set: { properties: { other: false } } })
  const view = (await service.listViews(owner.id, ws, db))[0]!
  await service.updateView(owner.id, ws, db, view.id, { expectedDatabaseVersion: (await current()).version, expectedViewVersion: view.version, config: { filters: [{ propertyId: 'value', operator: 'contains', value: '1' }], sorts: [{ propertyId: 'value', direction: 'desc' }], visibleProperties: [`${db}-title`, 'value', 'other'], propertyOrder: ['other', 'value'] } })
  const before = await snapshot()
  await assert.rejects(change(`${db}-title`, 'text'), /title/i)
  await assert.rejects(change('value', 'title'), /Invalid database input/i)
  const stale = { targetType: 'number' as const, expectedDatabaseVersion: (await current()).version, expectedPropertyVersion: 999 }
  await assert.rejects(service.changePropertyType(owner.id, ws, db, 'value', stale), /stale/i)
  await assert.rejects(service.changePropertyType(owner.id, ws, db, 'value', { ...stale, expectedDatabaseVersion: 999, expectedPropertyVersion: 1 }), /stale/i)
  const noop = await change('value', 'text')
  assert.deepEqual([noop.convertedRecordCount, noop.clearedRecordCount, noop.repairedViewCount], [0, 0, 0])
  assert.deepEqual(await snapshot(), before, 'rejected and same-type operations write nothing, including fences/timestamps')

  const recordRepository = app.get(DatabaseRecordRepository)
  const save = recordRepository.updateProperties.bind(recordRepository)
  let writes = 0
  recordRepository.updateProperties = async (...args: Parameters<typeof save>) => {
    const saved = await save(...args)
    if (++writes === 2) throw new Error('injected second record failure')
    return saved
  }
  try { await assert.rejects(change('value', 'number'), /injected second record failure/) } finally { recordRepository.updateProperties = save }
  assert.deepEqual(await snapshot(), before, 'first and second record writes and database fence fully roll back')
  const viewsRepository = app.get(DatabaseViewRepository)
  const repair = viewsRepository.updateConfigForProperty.bind(viewsRepository)
  viewsRepository.updateConfigForProperty = async (...args: Parameters<typeof repair>) => { await repair(...args); throw new Error('injected view failure') }
  try { await assert.rejects(change('value', 'number'), /injected view failure/) } finally { viewsRepository.updateConfigForProperty = repair }
  assert.deepEqual(await snapshot(), before, 'records and repaired view fully roll back')
  const propertyRepository = app.get(DatabasePropertyRepository)
  const saveType = propertyRepository.changeType.bind(propertyRepository)
  propertyRepository.changeType = async (...args: Parameters<typeof saveType>) => { await saveType(...args); throw new Error('injected property failure') }
  try { await assert.rejects(change('value', 'number'), /injected property failure/) } finally { propertyRepository.changeType = saveType }
  assert.deepEqual(await snapshot(), before, 'property definition, records, view and database all roll back after final write')
  const migrated = await change('value', 'number')
  assert.deepEqual([migrated.convertedRecordCount, migrated.clearedRecordCount, migrated.repairedViewCount], [2, 2, 1])
  const original = before[1]!.find((row: any) => row.id === 'value')!
  assert.equal(migrated.property.id, original.id)
  assert.equal(migrated.property.name, original.name)
  assert.equal(migrated.property.createdAt, original.createdAt.toISOString())
  assert.equal(migrated.property.version, original.version + 1)
  assert.equal(migrated.database.version, noop.database.version + 1)
  const rows = await recordModel.find({ databaseId: db }).sort({ id: 1 }).lean()
  assert.deepEqual(rows.map(row => row.properties), [{ value: 12.5, other: true }, { value: 42, other: true }, { other: true }, { other: true }, { other: false }])
  for (const row of rows) assert.equal(row.version, before[2]!.find((old: any) => old.id === row.id)!.version + 1)
  const repaired = (await service.listViews(owner.id, ws, db))[0]!
  assert.deepEqual(repaired.config, { filters: [], sorts: [{ propertyId: 'value', direction: 'desc' }], visibleProperties: [`${db}-title`, 'value', 'other'], propertyOrder: ['other', 'value'] })
  assert.equal(repaired.version, view.version + 2)
  await change('value', 'text')
  assert.equal((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties.value, '12.5')
  await change('value', 'date')
  assert.equal(Object.hasOwn((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties, 'value'), false)
  await recordModel.updateOne({ id: 'mutation-row-0' }, { $set: { 'properties.value': '2026-10-12' } })
  await change('value', 'text')
  assert.equal((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties.value, '2026-10-12')
  await change('value', 'select')
  assert.deepEqual((await property('value')).options, [])
  await service.updateProperty(owner.id, ws, db, 'value', { options: [{ id: 'opt', name: 'Option' }], expectedDatabaseVersion: (await current()).version, expectedPropertyVersion: (await property('value')).version })
  await recordModel.updateOne({ id: 'mutation-row-0' }, { $set: { 'properties.value': 'opt' } })
  await change('value', 'text')
  assert.equal(Object.hasOwn((await propertyModel.findOne({ id: 'value' }).lean())!, 'options'), false)
  assert.equal(Object.hasOwn((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties, 'value'), false)
  await change('value', 'checkbox')
  await recordModel.updateOne({ id: 'mutation-row-0' }, { $set: { 'properties.value': true } })
  await change('value', 'number')
  assert.equal(Object.hasOwn((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties, 'value'), false)
  for (const targetType of ['relation', 'rollup', 'formula']) await assert.rejects(change('value', targetType), /Invalid database input/)

  // Real overflow scan: repository must return the 10001st row and abort before migration.
  await recordModel.insertMany(Array.from({ length: 9996 }, (_, i) => ({ id: `overflow-${i}`, databaseId: db, workspaceId: ws, pageId: `overflow-page-${i}`, properties: {}, version: 1 })))
  const overflowBefore = await snapshot()
  await assert.rejects(change('value', 'text'), /10000/)
  assert.deepEqual(await snapshot(), overflowBefore)
  await recordModel.deleteMany({ id: /^overflow-/ })

  await add('numeric-formula', 'formula', { config: { expression: { kind: 'binary', operator: '*', left: { kind: 'property', propertyId: 'value' }, right: { kind: 'literal', value: 2 } }, resultType: 'number' } })
  let dependencyBefore = await snapshot()
  await assert.rejects(change('value', 'text'), (error: any) => error.status === 409 && /dependenc/i.test(error.message))
  assert.deepEqual(await snapshot(), dependencyBefore)
  await service.deleteProperty(owner.id, ws, db, 'numeric-formula', { expectedDatabaseVersion: (await current()).version, expectedPropertyVersion: 1 })
  await createDb('incoming-db')
  await add('incoming-link', 'relation', { config: { targetDatabaseId: db } }, 'incoming-db')
  await add('incoming-rollup', 'rollup', { config: { relationPropertyId: 'incoming-link', targetPropertyId: 'value', aggregation: 'sum' } }, 'incoming-db')
  dependencyBefore = await snapshot()
  await assert.rejects(change('value', 'text'), (error: any) => error.status === 409 && /dependenc/i.test(error.message))
  assert.deepEqual(await snapshot(), dependencyBefore, 'incoming rollup dependency and both database fences roll back')
  await service.deleteProperty(owner.id, ws, 'incoming-db', 'incoming-rollup', { expectedDatabaseVersion: (await current('incoming-db')).version, expectedPropertyVersion: 1 })

  const race = await Promise.allSettled([
    change('value', 'text'),
    add('racing-rollup', 'rollup', { config: { relationPropertyId: 'incoming-link', targetPropertyId: 'value', aggregation: 'sum' } }, 'incoming-db'),
  ])
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1, 'type mutation and incompatible incoming rollup creation cannot both commit')
  const racingRollup = (await service.listProperties(owner.id, ws, 'incoming-db')).find(row => row.id === 'racing-rollup')
  assert.equal((await property('value')).type === 'number', !!racingRollup)
  if (racingRollup) await service.deleteProperty(owner.id, ws, 'incoming-db', racingRollup.id, { expectedDatabaseVersion: (await current('incoming-db')).version, expectedPropertyVersion: racingRollup.version })
  // Every advanced target removes its sort; leaving it removes the old config.
  for (const [targetType, config] of [
    ['relation', { targetDatabaseId: 'incoming-db' }],
    ['rollup', { relationPropertyId: 'local-link', targetPropertyId: 'incoming-db-title', aggregation: 'count' }],
    ['formula', { expression: { kind: 'literal', value: 1 }, resultType: 'number' }],
  ] as const) {
    if (targetType === 'rollup') await add('local-link', 'relation', { config: { targetDatabaseId: 'incoming-db' } })
    const oldView = (await service.listViews(owner.id, ws, db))[0]!
    await service.updateView(owner.id, ws, db, oldView.id, { expectedDatabaseVersion: (await current()).version, expectedViewVersion: oldView.version, config: { ...oldView.config!, filters: [{ propertyId: 'value', operator: 'is_empty' }], sorts: [{ propertyId: 'value', direction: 'asc' }] } })
    const advanced = await change('value', targetType, { config })
    assert.equal(advanced.repairedViewCount, 1)
    assert.deepEqual((await service.listViews(owner.id, ws, db))[0]!.config?.sorts, [])
    if (targetType === 'relation') await recordModel.updateOne({ id: 'mutation-row-0' }, { $set: { 'properties.value': [] } })
    await change('value', 'text')
    assert.equal(Object.hasOwn((await propertyModel.findOne({ id: 'value' }).lean())!, 'config'), false)
    assert.equal(Object.hasOwn((await recordModel.findOne({ id: 'mutation-row-0' }).lean())!.properties, 'value'), false)
  }
})

test('P11.1B Date values round-trip through createRecord, derived reads, CAS rollback, and type conversion', async t => {
  const app = await NestFactory.createApplicationContext(DatabaseTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const databases = app.get(DatabaseService)
  const pages = app.get(PageService)
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const databaseModel = app.get<Model<unknown>>(getModelToken(DatabaseEntity.name))
  const propertyModel = app.get<Model<unknown>>(getModelToken(DatabasePropertyEntity.name))
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([DatabaseEntity, DatabasePropertyEntity, DatabaseRecordEntity, DatabaseViewEntity].map(entity => app.get<Model<unknown>>(getModelToken(entity.name)).init()))
  const owner = await auth.register(`p11b-date-${randomUUID()}@example.com`, 'correct horse battery staple')
  const workspaceId = 'p11b-date-workspace'
  const databaseId = 'p11b-date-database'
  const targetDatabaseId = 'p11b-date-target'
  await workspaces.create(owner.id, { id: workspaceId, name: 'P11.1B dates' })
  await pages.create(owner.id, workspaceId, { id: 'p11b-home', parentPageId: null, title: 'Home', orderKey: 'a' })
  await databases.createInPage(owner.id, workspaceId, 'p11b-home', { id: databaseId, name: 'Date values', titlePropertyId: 'p11b-title', viewId: 'p11b-view', blockId: 'p11b-block', orderKey: 'a', parentBlockId: null })
  await databases.createInPage(owner.id, workspaceId, 'p11b-home', { id: targetDatabaseId, name: 'Date targets', titlePropertyId: 'p11b-target-title', viewId: 'p11b-target-view', blockId: 'p11b-target-block', orderKey: 'b', parentBlockId: null })
  const add = async (database: string, definition: { id: string; name: string; type: 'date' | 'text' | 'number' | 'checkbox' | 'select' | 'formula' | 'relation' | 'rollup'; options?: Array<{ id: string; name: string }>; config?: DatabasePropertyConfig }) => {
    const current = (await databases.find(owner.id, workspaceId, database))!
    return databases.createProperty(owner.id, workspaceId, database, { ...definition, expectedDatabaseVersion: current.version })
  }
  const due = (await add(databaseId, { id: 'p11b-due', name: 'Due', type: 'date' })).property
  await add(databaseId, { id: 'p11b-text', name: 'Text', type: 'text' })
  await add(databaseId, { id: 'p11b-number', name: 'Number', type: 'number' })
  await add(databaseId, { id: 'p11b-checkbox', name: 'Checkbox', type: 'checkbox' })
  await add(databaseId, { id: 'p11b-select', name: 'Select', type: 'select', options: [{ id: 'p11b-option', name: 'Option' }] })
  const formula = (await add(databaseId, { id: 'p11b-formula-date', name: 'Formula date', type: 'formula', config: { expression: { kind: 'property', propertyId: due.id }, resultType: 'date' } })).property
  const targetDate = (await add(targetDatabaseId, { id: 'p11b-target-date', name: 'Target date', type: 'date' })).property
  const relation = (await add(databaseId, { id: 'p11b-links', name: 'Targets', type: 'relation', config: { targetDatabaseId } })).property
  await add(databaseId, { id: 'p11b-count', name: 'Target count', type: 'rollup', config: { relationPropertyId: relation.id, targetPropertyId: targetDate.id, aggregation: 'count' } })
  await add(databaseId, { id: 'p11b-count-values', name: 'Target values', type: 'rollup', config: { relationPropertyId: relation.id, targetPropertyId: targetDate.id, aggregation: 'count_values' } })
  for (const aggregation of ['min', 'max'] as const) {
    const current = (await databases.find(owner.id, workspaceId, databaseId))!
    await assert.rejects(databases.createProperty(owner.id, workspaceId, databaseId, { id: `p11b-${aggregation}`, name: aggregation, type: 'rollup', config: { relationPropertyId: relation.id, targetPropertyId: targetDate.id, aggregation }, expectedDatabaseVersion: current.version }), /Invalid database property/i)
    assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, current.version)
  }

  const targetValues = [
    { start: '2026-10-10', end: '2026-10-11' },
    '2026-10-12',
    undefined,
  ] as const
  const targetIds: string[] = []
  for (const [index, value] of targetValues.entries()) {
    const id = `p11b-target-${index}`
    targetIds.push(id)
    await databases.createRecordPage(owner.id, workspaceId, targetDatabaseId, {
      id, pageId: `${id}-page`, title: `Target ${index}`, orderKey: String(index),
      ...(value === undefined ? {} : { properties: { [targetDate.id]: value } }),
    })
  }

  const dateValues: readonly DatabasePropertyValue[] = [
    '2026-10-11',
    { start: '2026-10-12' },
    { start: '2026-10-13', end: '2026-10-14' },
    { start: '2026-10-12T23:00:00.000Z', timeZone: 'Asia/Tokyo' },
    { start: '2026-10-13T01:00:00.000Z', end: '2026-10-14T01:00:00.000Z', timeZone: 'Asia/Tokyo' },
  ]
  const recordIds: string[] = []
  for (const [index, value] of dateValues.entries()) {
    const id = `p11b-record-${index}`
    const pageId = `${id}-page`
    const titleValue = `Date ${index}`
    recordIds.push(id)
    await pages.create(owner.id, workspaceId, { id: pageId, parentPageId: null, title: titleValue, orderKey: String(index + 10) })
    await databases.createRecord(owner.id, workspaceId, databaseId, {
      id, pageId,
      properties: { 'p11b-title': titleValue, [due.id]: value, ...(index === 4 ? { [relation.id]: targetIds } : {}) },
    })
    const database = (await databases.find(owner.id, workspaceId, databaseId))!
    const record = (await databases.listRecords(owner.id, workspaceId, databaseId)).find(row => row.id === id)!
    await databases.updateRecordCell(owner.id, workspaceId, databaseId, id, due.id, { value, expectedDatabaseVersion: database.version, expectedRecordVersion: record.version })
  }
  const rows = await databases.getViewRecords(owner.id, workspaceId, databaseId, 'p11b-view', { limit: 10 })
  for (const [index, id] of recordIds.entries()) assert.deepEqual(rows.records.find(row => row.id === id)?.properties[due.id], dateValues[index], `date shape ${index} remains raw after create, patch, and read`)
  assert.equal(rows.records.find(row => row.id === recordIds[3])?.properties[formula.id], '2026-10-12', 'Formula projects the UTC start day even when the local timezone is on the next day')
  assert.equal(rows.records.find(row => row.id === recordIds[4])?.properties[formula.id], '2026-10-13', 'Formula uses start and ignores range end')
  assert.equal(rows.records.find(row => row.id === recordIds[4])?.properties['p11b-count-values'], 2, 'count_values counts Date objects as values and ignores the missing target date')
  assert.equal(rows.records.find(row => row.id === recordIds[4])?.properties['p11b-count'], 3, 'count counts linked records regardless of Date emptiness')
  await assert.rejects(databases.updateRecordCell(owner.id, workspaceId, databaseId, recordIds[4], formula.id, { value: '2026-10-13', expectedDatabaseVersion: rows.database.version, expectedRecordVersion: rows.records.find(row => row.id === recordIds[4])!.version }), /read only/)
  await assert.rejects(databases.updateRecordCell(owner.id, workspaceId, databaseId, recordIds[4], 'p11b-count', { value: 3, expectedDatabaseVersion: rows.database.version, expectedRecordVersion: rows.records.find(row => row.id === recordIds[4])!.version }), /read only/)

  for (const propertyId of ['p11b-text', 'p11b-number', 'p11b-checkbox', 'p11b-select', 'p11b-title']) {
    const beforeDatabase = (await databases.find(owner.id, workspaceId, databaseId))!
    const beforeRecord = (await databases.listRecords(owner.id, workspaceId, databaseId)).find(row => row.id === recordIds[0])!
    const beforeProps = { ...beforeRecord.properties }
    await assert.rejects(databases.updateRecordCell(owner.id, workspaceId, databaseId, recordIds[0], propertyId, {
      value: { start: '2026-10-15' }, expectedDatabaseVersion: beforeDatabase.version, expectedRecordVersion: beforeRecord.version,
      ...(propertyId === 'p11b-title' ? { expectedPageUpdatedAt: beforeRecord.pageVersion } : {}),
    }), error => (error as { status?: number }).status === 400)
    assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforeDatabase.version)
    assert.deepEqual((await databases.listRecords(owner.id, workspaceId, databaseId)).find(row => row.id === recordIds[0])?.properties, beforeProps)
  }

  const beforeStaleDatabase = (await databases.find(owner.id, workspaceId, databaseId))!
  const beforeStaleRecord = (await databases.listRecords(owner.id, workspaceId, databaseId)).find(row => row.id === recordIds[4])!
  const rawSnapshot = async () => await recordModel.find({ databaseId }).sort({ id: 1 }).lean() as unknown as Array<{ id: string; properties: Record<string, unknown>; version: number }>
  const rawBeforeStale = await rawSnapshot()
  await assert.rejects(databases.updateRecordCell(owner.id, workspaceId, databaseId, recordIds[4], due.id, { value: { start: '2026-10-15' }, expectedDatabaseVersion: beforeStaleDatabase.version, expectedRecordVersion: beforeStaleRecord.version - 1 }), /record version is stale/i)
  assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforeStaleDatabase.version)
  assert.deepEqual(await rawSnapshot(), rawBeforeStale)

  const recordRepository = app.get(DatabaseRecordRepository)
  const saveProperties = recordRepository.updateProperties.bind(recordRepository)
  recordRepository.updateProperties = async (...args: Parameters<typeof saveProperties>) => saveProperties(...args).then(() => null)
  try {
    await assert.rejects(databases.updateRecordCell(owner.id, workspaceId, databaseId, recordIds[4], due.id, { value: { start: '2026-10-15' }, expectedDatabaseVersion: beforeStaleDatabase.version, expectedRecordVersion: beforeStaleRecord.version }), /record version is stale/i)
  } finally {
    recordRepository.updateProperties = saveProperties
  }
  assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforeStaleDatabase.version)
  assert.deepEqual(await rawSnapshot(), rawBeforeStale, 'failed date cell CAS rolls back the database fence and all date values')

  const sameTypeDatabase = (await databases.find(owner.id, workspaceId, databaseId))!
  const sameTypeProperty = (await databases.listProperties(owner.id, workspaceId, databaseId)).find(property => property.id === due.id)!
  const beforeSameType = await rawSnapshot()
  const sameType = await databases.changePropertyType(owner.id, workspaceId, databaseId, due.id, { targetType: 'date', expectedDatabaseVersion: sameTypeDatabase.version, expectedPropertyVersion: sameTypeProperty.version })
  assert.deepEqual([sameType.convertedRecordCount, sameType.clearedRecordCount], [0, 0])
  assert.deepEqual(await rawSnapshot(), beforeSameType, 'same-type Date conversion preserves range and timezone fields')
  await databases.deleteProperty(owner.id, workspaceId, databaseId, formula.id, { expectedDatabaseVersion: (await databases.find(owner.id, workspaceId, databaseId))!.version, expectedPropertyVersion: formula.version })
  const conversionDb = (await databases.find(owner.id, workspaceId, databaseId))!
  const conversionProperty = (await databases.listProperties(owner.id, workspaceId, databaseId)).find(property => property.id === due.id)!
  const beforeConversion = await rawSnapshot()
  recordRepository.updateProperties = async (...args: Parameters<typeof saveProperties>) => saveProperties(...args).then(() => null)
  try {
    await assert.rejects(databases.changePropertyType(owner.id, workspaceId, databaseId, due.id, { targetType: 'text', expectedDatabaseVersion: conversionDb.version, expectedPropertyVersion: conversionProperty.version }), /record changed during property type conversion/)
  } finally {
    recordRepository.updateProperties = saveProperties
  }
  assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, conversionDb.version)
  assert.equal((await databases.listProperties(owner.id, workspaceId, databaseId)).find(property => property.id === due.id)?.version, conversionProperty.version)
  assert.deepEqual(await rawSnapshot(), beforeConversion, 'failed date type conversion rolls back every record write and version')
  await databases.changePropertyType(owner.id, workspaceId, databaseId, due.id, { targetType: 'text', expectedDatabaseVersion: conversionDb.version, expectedPropertyVersion: conversionProperty.version })
  const afterConversion = await rawSnapshot()
  assert.equal(afterConversion.find(row => row.id === recordIds[0])?.properties[due.id], '2026-10-11', 'legacy Date string to text is preserved')
  for (const id of recordIds.slice(1)) assert.equal(Object.hasOwn(afterConversion.find(row => row.id === id)!.properties, due.id), false, 'range and datetime objects clear when changed to text')
  assert.equal(((await databaseModel.findOne({ id: databaseId }).lean()) as unknown as { version: number }).version, conversionDb.version + 1)
  assert.ok(await propertyModel.findOne({ id: due.id, type: 'text' }).lean())
})
