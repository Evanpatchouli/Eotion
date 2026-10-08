import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import type { DatabaseFilter } from '@eotion/domain'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabasePropertyEntity } from './schemas/database-property.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
import { DatabaseRecordRepository, DatabaseViewRepository } from './repositories/database.repository'
import { BlockService } from './services/block.service'
import { DatabaseService } from './services/database.service'
import { supportsTransactions } from './services/mongo-transactions'
import { PageService } from './services/page.service'
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
  assert.equal(initial.database.version, 1)
  assert.equal(initial.titleProperty.type, 'title')
  assert.equal(initial.view.type, 'table')
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
  await assert.rejects(databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'invalid-view', name: 'Other', type: 'board' as 'table' }), /Invalid database input/)
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
  const cell = async (propertyId: string, value: string | number | boolean | null, expectedPageUpdatedAt?: string) => {
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
  await assert.rejects(databases.getTable(owner.id, 'workspace-a', 'database-a', pageSortView.id, { limit: 1, cursor: titlePageWindow.nextCursor! }), /anchor changed/)
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
  assert.equal((await databases.listViews(owner.id, 'workspace-a', 'database-a')).length, 2)
  await blocks.deleteFromPage(owner.id, 'workspace-a', 'page-a', 'block-second')
  await blocks.deleteFromPage(owner.id, 'workspace-a', 'page-a', 'block-b')
  assert.equal(await pages.delete(owner.id, 'workspace-a', 'page-a'), true)
  assert.ok(await databases.find(owner.id, 'workspace-a', 'database-a'))
  assert.equal((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).length, 6)
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
  const service = new DatabaseService(repository as never, repository as never, repository as never, repository as never, repository as never, repository as never, permissions as never, connection as never)
  await assert.rejects(service.createInPage('user', 'workspace', 'page', { id: 'db', name: 'Tasks', titlePropertyId: 'title', viewId: 'view', blockId: 'block', orderKey: 'a', parentBlockId: null }), error => (error as { status?: number }).status === 503)
  assert.equal(writes, 0)
  assert.equal(sessions, 0)
})
