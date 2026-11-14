import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
import { DatabaseViewOrderOverrideEntity, DatabaseViewOrderCleanupJobEntity } from './schemas/database-view-order.schema'
import { DatabaseRecordRepository, DatabaseViewRepository } from './repositories/database.repository'
import { DatabaseViewOrderRepository } from './repositories/database-view-order.repository'
import { DatabaseViewOrderCleanupService } from './services/database-view-order-cleanup.service'
import { DatabaseService } from './services/database.service'
import { AuthService } from './services/auth.service'
import { WorkspaceService } from './services/workspace.service'
import { PageService } from './services/page.service'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
uri.pathname = `/eotion_view_order_storage_${randomUUID().replaceAll('-', '')}`
@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class OrderStorageTestModule {}

test('view order storage keeps creation, scopes, rollback and retired cleanup transactional', async t => {
  const app = await NestFactory.createApplicationContext(OrderStorageTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const service = app.get(DatabaseService)
  const records = app.get(DatabaseRecordRepository)
  const views = app.get(DatabaseViewRepository)
  const orders = app.get(DatabaseViewOrderRepository)
  const cleanup = app.get(DatabaseViewOrderCleanupService)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const viewModel = app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name))
  const overrideModel = app.get<Model<unknown>>(getModelToken(DatabaseViewOrderOverrideEntity.name))
  const jobModel = app.get<Model<unknown>>(getModelToken(DatabaseViewOrderCleanupJobEntity.name))
  await Promise.all([recordModel.init(), viewModel.init(), overrideModel.init(), jobModel.init()])
  const slotIndex = (await overrideModel.collection.indexes()).find(index => index.key?.slotOrdinal === 1 && index.key?.rank === 1)
  assert.equal(slotIndex?.unique, true)
  assert.equal(slotIndex?.collation?.locale ?? 'simple', 'simple')
  const sourceIndex = (await overrideModel.collection.indexes()).find(index => index.key?.sourceCreationOrdinal === 1)
  assert.equal(sourceIndex?.unique, true)
  assert.equal(sourceIndex?.collation?.locale ?? 'simple', 'simple')
  const owner = await app.get(AuthService).register(`order-${randomUUID()}@example.com`, 'correct horse battery staple')
  const workspaces = app.get(WorkspaceService)
  const pages = app.get(PageService)
  await workspaces.create(owner.id, { id: 'order-ws', name: 'Orders' })
  await workspaces.create(owner.id, { id: 'other-ws', name: 'Other' })
  await pages.create(owner.id, 'order-ws', { id: 'root', parentPageId: null, title: 'Root', orderKey: 'a' })
  await pages.create(owner.id, 'order-ws', { id: 'legacy-page', parentPageId: null, title: 'Legacy', orderKey: 'b' })
  await pages.create(owner.id, 'other-ws', { id: 'other-root', parentPageId: null, title: 'Other', orderKey: 'a' })
  const created = await service.createInPage(owner.id, 'order-ws', 'root', { id: 'db', name: 'DB', titlePropertyId: 'title', viewId: 'view', blockId: 'block', orderKey: 'a', parentBlockId: null })
  const other = await service.createInPage(owner.id, 'other-ws', 'other-root', { id: 'other-db', name: 'Other DB', titlePropertyId: 'other-title', viewId: 'other-view', blockId: 'other-block', orderKey: 'a', parentBlockId: null })
  const firstScope = (await views.getOrderState('order-ws', 'db', 'view'))!
  assert.equal(firstScope.manualOrderActive, false)
  assert.equal(await views.getOrderState('other-ws', 'db', 'view'), null)

  const first = await service.createRecordPage(owner.id, 'order-ws', 'db', { id: 'r1', pageId: 'p1', title: 'One', orderKey: 'a' })
  const second = await service.createRecord(owner.id, 'order-ws', 'db', { id: 'r2', pageId: 'legacy-page', properties: { title: 'Legacy' } })
  assert.equal('creationOrdinal' in first.record, false)
  assert.equal('creationOrdinal' in second, false)
  const firstOrder = (await records.getCreationOrder('order-ws', 'db', 'r1'))!
  const secondOrder = (await records.getCreationOrder('order-ws', 'db', 'r2'))!
  assert.equal(firstOrder.creationOrdinal < secondOrder.creationOrdinal, true)
  assert.deepEqual((await records.listCreationOrderWindow('order-ws', 'db', undefined, 10)).map(row => row.recordId), ['r1', 'r2'])
  assert.equal(await records.hasMissingCreationOrdinal('order-ws', 'db'), false)
  await recordModel.collection.updateOne({ id: 'r1' }, { $unset: { creationOrdinal: '' } })
  await assert.rejects(service.getViewRecords(owner.id, 'order-ws', 'db', 'view', { limit: 10 }), error => (error as { status?: number }).status === 409)
  await recordModel.collection.updateOne({ id: 'r1' }, { $set: { creationOrdinal: firstOrder.creationOrdinal } })
  await recordModel.collection.updateOne({ id: 'r1' }, { $set: { creationOrdinal: null } })
  await assert.rejects(service.getViewRecords(owner.id, 'order-ws', 'db', 'view', { limit: 10 }), error => (error as { status?: number }).status === 409)
  await recordModel.collection.updateOne({ id: 'r1' }, { $set: { creationOrdinal: firstOrder.creationOrdinal } })
  await viewModel.collection.updateOne({ id: 'view' }, { $unset: { orderScopeId: '' } })
  await assert.rejects(service.getViewRecords(owner.id, 'order-ws', 'db', 'view', { limit: 10 }), error => (error as { status?: number }).status === 409)
  await viewModel.collection.updateOne({ id: 'view' }, { $set: { orderScopeId: firstScope.orderScopeId } })
  const beforeInjectedFailure = (await service.find(owner.id, 'order-ws', 'db'))!
  const putBeforeFailure = orders.putOverride.bind(orders)
  orders.putOverride = async () => { throw new Error('injected override write failure') }
  try {
    await assert.rejects(service.reorderViewRecord(owner.id, 'order-ws', 'db', 'view', {
      recordId: 'r1', anchorRecordId: 'r2', placement: 'after',
      expectedDatabaseVersion: beforeInjectedFailure.version, expectedViewVersion: created.view.version,
    }), /injected override write failure/)
  } finally { orders.putOverride = putBeforeFailure }
  assert.equal((await service.find(owner.id, 'order-ws', 'db'))!.version, beforeInjectedFailure.version)
  assert.equal((await views.getOrderState('order-ws', 'db', 'view'))!.version, created.view.version)
  assert.equal((await views.getOrderState('order-ws', 'db', 'view'))!.manualOrderActive, false)
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId }), 0)
  const oversizedNeighborRank = `${'0'.repeat(1_048_575)}1`
  await overrideModel.collection.insertOne({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId,
    recordId: 'r1', joinKey: { workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId, recordId: 'r1' },
    sourceCreationOrdinal: firstOrder.creationOrdinal, slotOrdinal: 0, rank: oversizedNeighborRank })
  await viewModel.collection.updateOne({ id: 'view' }, { $set: { manualOrderActive: true } })
  try {
    await assert.rejects(service.reorderViewRecord(owner.id, 'order-ws', 'db', 'view', {
      recordId: 'r2', anchorRecordId: 'r1', placement: 'before',
      expectedDatabaseVersion: beforeInjectedFailure.version, expectedViewVersion: created.view.version,
    }), error => (error as { status?: number }).status === 409)
    assert.equal((await service.find(owner.id, 'order-ws', 'db'))!.version, beforeInjectedFailure.version)
    assert.equal((await views.getOrderState('order-ws', 'db', 'view'))!.version, created.view.version)
  } finally {
    await overrideModel.collection.deleteOne({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId, recordId: 'r1' })
    await viewModel.collection.updateOne({ id: 'view' }, { $set: { manualOrderActive: false } })
  }
  const beforeFailedCreate = (await service.find(owner.id, 'order-ws', 'db'))!.version
  await assert.rejects(service.createRecordPage(owner.id, 'order-ws', 'db', { id: 'r1', pageId: 'duplicate-page', title: 'Duplicate', orderKey: 'b' }), /duplicate key/i)
  assert.equal(await pages.find(owner.id, 'order-ws', 'duplicate-page'), null)
  assert.equal((await service.find(owner.id, 'order-ws', 'db'))!.version, beforeFailedCreate)
  const concurrent = await Promise.allSettled(['r3', 'r4'].map(id => service.createRecordPage(owner.id, 'order-ws', 'db', { id, pageId: `page-${id}`, title: id, orderKey: id })))
  for (const [index, outcome] of concurrent.entries()) if (outcome.status === 'rejected') {
    const id = `r${index + 3}`
    await service.createRecordPage(owner.id, 'order-ws', 'db', { id, pageId: `page-${id}`, title: id, orderKey: id })
  }
  const createdOrdinals = (await records.listCreationOrderWindow('order-ws', 'db', undefined, 10)).map(row => row.creationOrdinal)
  assert.equal(createdOrdinals.length, 4)
  assert.equal(new Set(createdOrdinals).size, 4, 'concurrent creates cannot reuse an ordinal')

  const extra = await service.createView(owner.id, 'order-ws', 'db', { id: 'view-extra', name: 'Extra', type: 'list' })
  const extraScope = (await views.getOrderState('order-ws', 'db', 'view-extra'))!
  assert.notEqual(extraScope.orderScopeId, firstScope.orderScopeId)
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      await orders.putOverride({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId, recordId: 'r1', sourceCreationOrdinal: firstOrder.creationOrdinal, slotOrdinal: secondOrder.creationOrdinal, rank: '1' }, session)
      await orders.putOverride({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId, recordId: 'r2', sourceCreationOrdinal: secondOrder.creationOrdinal, slotOrdinal: secondOrder.creationOrdinal, rank: '01' }, session)
      await orders.putOverride({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: extraScope.orderScopeId, recordId: 'r1', sourceCreationOrdinal: firstOrder.creationOrdinal, slotOrdinal: secondOrder.creationOrdinal, rank: '1' }, session)
      await orders.putOverride({ workspaceId: 'other-ws', databaseId: 'other-db', orderScopeId: (await views.getOrderState('other-ws', 'other-db', 'other-view', session))!.orderScopeId, recordId: 'r1', sourceCreationOrdinal: 1, slotOrdinal: 1, rank: '1' }, session)
    })
  } finally { await session.endSession() }
  assert.deepEqual((await orders.listOverrideWindow({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId }, undefined, 10)).map(row => row.recordId), ['r2', 'r1'])
  await assert.rejects(orders.putOverride({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: firstScope.orderScopeId, recordId: 'invalid', sourceCreationOrdinal: 99, slotOrdinal: 1, rank: `${'0'.repeat(1_048_576)}1` }, session), /Invalid database view order override/)
  const activated = await connection.startSession()
  try {
    await activated.withTransaction(async () => {
      assert.equal(await views.activateManualOrder('order-ws', 'db', 'view-extra', 999, activated), null)
      const updated = await views.activateManualOrder('order-ws', 'db', 'view-extra', extra.view.version, activated)
      assert.equal(updated?.version, extra.view.version + 1)
      assert.equal('orderScopeId' in updated!, false)
    })
  } finally { await activated.endSession() }
  assert.equal((await views.getOrderState('order-ws', 'db', 'view-extra'))?.manualOrderActive, true)
  assert.equal((await views.getOrderState('order-ws', 'db', 'view-extra'))?.orderScopeId, extraScope.orderScopeId)
  const beforeDelete = (await service.find(owner.id, 'order-ws', 'db'))!
  await assert.rejects(service.deleteRecord(owner.id, 'order-ws', 'db', 'r1', { expectedDatabaseVersion: beforeDelete.version, expectedRecordVersion: first.record.version + 1 }), /version is stale/)
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'order-ws', databaseId: 'db', recordId: 'r1' }), 2)
  assert.equal((await service.find(owner.id, 'order-ws', 'db'))!.version, beforeDelete.version)
  await service.deleteRecord(owner.id, 'order-ws', 'db', 'r1', { expectedDatabaseVersion: beforeDelete.version, expectedRecordVersion: first.record.version })
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'order-ws', databaseId: 'db', recordId: 'r1' }), 0)
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'other-ws', databaseId: 'other-db', recordId: 'r1' }), 1)

  const active = (await service.find(owner.id, 'order-ws', 'db'))!
  await assert.rejects(service.deleteView(owner.id, 'order-ws', 'db', 'view', { expectedDatabaseVersion: active.version, expectedViewVersion: created.view.version }), /referenced by a Database Block/)
  assert.equal(await jobModel.countDocuments(), 0)
  const scope = { workspaceId: 'order-ws', databaseId: 'db', orderScopeId: extraScope.orderScopeId }
  const insertSession = await connection.startSession()
  try {
    await insertSession.withTransaction(async () => {
      for (let i = 0; i < 1001; i++) await orders.putOverride({ ...scope, recordId: `synthetic-${i}`, sourceCreationOrdinal: i + 1, slotOrdinal: i, rank: '1' }, insertSession)
    })
  } finally { await insertSession.endSession() }
  const beforeViewDelete = (await service.find(owner.id, 'order-ws', 'db'))!
  await service.deleteView(owner.id, 'order-ws', 'db', 'view-extra', { expectedDatabaseVersion: beforeViewDelete.version, expectedViewVersion: extra.view.version + 1 })
  assert.equal(await jobModel.countDocuments(scope), 1)
  const originalDeleteBatch = orders.deleteOverrideBatch.bind(orders)
  orders.deleteOverrideBatch = async () => { throw new Error('injected cleanup failure') }
  try {
    await assert.rejects(cleanup.drainBatch(), /injected cleanup failure/)
    assert.equal(await jobModel.countDocuments(scope), 1)
    assert.equal(await overrideModel.countDocuments(scope), 1001)
  } finally { orders.deleteOverrideBatch = originalDeleteBatch }
  const replacement = await service.createView(owner.id, 'order-ws', 'db', { id: 'view-extra', name: 'Replacement', type: 'list' })
  const replacementScope = (await views.getOrderState('order-ws', 'db', replacement.view.id))!.orderScopeId
  assert.notEqual(replacementScope, extraScope.orderScopeId)
  const replacementSession = await connection.startSession()
  try {
    await replacementSession.withTransaction(async () => { await orders.putOverride({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: replacementScope, recordId: 'new', sourceCreationOrdinal: 1, slotOrdinal: 1, rank: '1' }, replacementSession) })
  } finally { await replacementSession.endSession() }
  const secondWorker = new DatabaseViewOrderCleanupService(orders, views)
  const batches = await Promise.all([cleanup.drainBatch(), secondWorker.drainBatch()])
  assert.equal(batches.every(count => count <= 500), true)
  for (let i = 0; i < 5 && await jobModel.countDocuments(scope); i++) await cleanup.drainBatch()
  assert.equal(await jobModel.countDocuments(scope), 0)
  assert.equal(await overrideModel.countDocuments(scope), 0)
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'order-ws', databaseId: 'db', orderScopeId: replacementScope }), 1)
  assert.equal(await overrideModel.countDocuments({ workspaceId: 'other-ws', databaseId: 'other-db' }), 1)
  assert.equal(other.database.version, 1)
  await recordModel.collection.insertMany(Array.from({ length: 10_000 }, (_, i) => ({
    id: `explain-${i}`, workspaceId: 'order-ws', databaseId: 'explain-db', pageId: 'legacy-page', properties: {}, version: 1, creationOrdinal: i + 1,
  })))
  const missingFilter = { workspaceId: 'order-ws', databaseId: 'explain-db', creationOrdinal: null }
  assert.equal(await records.hasMissingCreationOrdinal('order-ws', 'explain-db'), false)
  const explained = await recordModel.collection.find(missingFilter).limit(1).explain('executionStats')
  t.diagnostic(`10k missing ordinal probe: keys=${explained.executionStats.totalKeysExamined}, docs=${explained.executionStats.totalDocsExamined}`)
  assert.equal(explained.executionStats.totalKeysExamined <= 2, true, `missing ordinal probe examined ${explained.executionStats.totalKeysExamined} keys`)
  assert.equal(explained.executionStats.totalDocsExamined <= 2, true)
  await recordModel.collection.insertOne({ id: 'missing-ordinal', workspaceId: 'order-ws', databaseId: 'explain-db', pageId: 'legacy-page', properties: {}, version: 1 })
  assert.equal(await records.hasMissingCreationOrdinal('order-ws', 'explain-db'), true)
  await recordModel.collection.deleteOne({ id: 'missing-ordinal' })
  await recordModel.collection.insertOne({ id: 'null-ordinal', workspaceId: 'order-ws', databaseId: 'explain-db', pageId: 'legacy-page', properties: {}, version: 1, creationOrdinal: null })
  assert.equal(await records.hasMissingCreationOrdinal('order-ws', 'explain-db'), true)
  assert.equal(await records.hasMissingCreationOrdinal('other-ws', 'other-db'), false)
})
