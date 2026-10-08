import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabasePropertyEntity } from './schemas/database-property.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
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

  await assert.rejects(databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'second-title', name: 'Other', type: 'title' }), /title property/)
  await assert.rejects(databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'invalid-select', name: 'Invalid', type: 'select' }), /Invalid database input/)
  await assert.rejects(databases.createProperty(outsider.id, 'workspace-a', 'database-a', { id: 'forbidden', name: 'Forbidden', type: 'text' }), /Workspace not found/)
  await databases.createProperty(owner.id, 'workspace-a', 'database-a', { id: 'status', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }] })
  await assert.rejects(databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'invalid-view', name: 'Other', type: 'board' as 'table' }), /Invalid database input/)
  const secondView = await databases.createView(owner.id, 'workspace-a', 'database-a', { id: 'table-two', name: 'Other table', type: 'table' })
  assert.equal(secondView.version, 1)
  await assert.rejects(databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-bad', pageId: 'page-row', properties: { status: 'unknown' } }), /Invalid database record/)
  await assert.rejects(databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-foreign', pageId: 'page-b', properties: { 'database-a-title': 'Foreign' } }), /Record page/)
  const record = await databases.createRecord(owner.id, 'workspace-a', 'database-a', { id: 'row-a', pageId: 'page-row', properties: { 'database-a-title': 'Row', status: 'open' } })
  assert.equal(record.version, 1)
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
  const firstRows = await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 1 })
  assert.deepEqual(firstRows.records.map(row => row.id), ['row-a'])
  assert.equal(firstRows.nextCursor, 'row-a')
  const remainingRows = await databases.getTable(owner.id, 'workspace-a', 'database-a', 'database-a-view', { limit: 1, cursor: firstRows.nextCursor! })
  assert.deepEqual(remainingRows.records.map(row => row.id), ['row-z'])
  assert.equal(remainingRows.nextCursor, null)
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
  assert.equal((await databases.listProperties(owner.id, 'workspace-a', 'database-a')).length, 2)
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
