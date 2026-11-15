import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { compareViewOrderPosition, isViewOrderRank, type DatabaseProperty } from '@eotion/domain'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseService } from './services/database.service'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabasePropertyEntity } from './schemas/database-property.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
import { DatabaseViewOrderOverrideEntity } from './schemas/database-view-order.schema'
import { DatabasePropertyRepository, DatabaseRecordRepository } from './repositories/database.repository'

const propertyId = 'group.$status'
const optionIds = {
  rare: 'rare.$option',
  sparse: 'sparse.option',
  medium: 'medium-option',
  dense: 'dense-option',
} as const
const batchSize = 5_000

type FixtureRecord = { id: string; creationOrdinal: number; optionId: string }
type Position = { slotOrdinal: number; rank: string }

function createIsolatedApp() {
  const configured = process.env.P4_TEST_MONGODB_URI?.trim()
  assert.ok(configured, 'P4_TEST_MONGODB_URI must explicitly name an isolated MongoDB instance; this benchmark never falls back to port 27017')
  const uri = new URL(configured)
  uri.pathname = `/eotion_group_token_performance_${randomUUID().replaceAll('-', '')}`
  @Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
  class GroupTokenPerformanceModule {}
  return NestFactory.createApplicationContext(GroupTokenPerformanceModule, { logger: false })
}

function fixtureOption(index: number, count: number): string {
  const rareStep = Math.max(1, Math.floor(count / 10))
  const sparseStep = Math.max(1, Math.floor(count / 70))
  if (index % rareStep === 0) return optionIds.rare
  if (index % sparseStep === 0) return optionIds.sparse
  if (index % 4 === 0) return optionIds.medium
  return optionIds.dense
}

function rankFor(index: number, overrideCount: number): string {
  const width = Math.max(1, Math.ceil(Math.log2(overrideCount + 1)))
  return `0${index.toString(2).padStart(width, '0')}1`
}

function comparePosition(left: Position, right: Position, leftId: string, rightId: string): number {
  return compareViewOrderPosition(left, right) || Buffer.compare(Buffer.from(leftId), Buffer.from(rightId))
}

function collectExplain(value: unknown, stages: Set<string>, indexes: Set<string>): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectExplain(item, stages, indexes)
    return
  }
  const object = value as Record<string, unknown>
  if (typeof object.stage === 'string') stages.add(object.stage)
  if (typeof object.indexName === 'string') indexes.add(object.indexName)
  for (const child of Object.values(object)) collectExplain(child, stages, indexes)
}

async function explainRecordAggregates(connection: Connection, profile: Array<Record<string, any>>) {
  const stages = new Set<string>()
  const indexes = new Set<string>()
  for (const entry of profile) {
    const command = entry.command as { aggregate?: string; pipeline?: unknown[]; collation?: unknown } | undefined
    if (command?.aggregate !== 'database_records' || !command.pipeline) continue
    const explained = await connection.db!.command({
      explain: {
        aggregate: command.aggregate,
        pipeline: command.pipeline,
        cursor: {},
        ...(command.collation ? { collation: command.collation } : {}),
      },
      verbosity: 'executionStats',
    })
    collectExplain(explained, stages, indexes)
  }
  return { stages: [...stages], indexes: [...indexes] }
}

async function seedFixture(connection: Connection, count: number) {
  const database = connection.db!
  const databaseVersion = count + 1
  const workspaceId = 'group-token-workspace'
  const databaseId = 'group-token-database'
  const now = new Date()
  const pageCollection = database.collection('pages')
  const databaseModel = connection.model(DatabaseEntity.name) as Model<DatabaseEntity>
  const propertyModel = connection.model(DatabasePropertyEntity.name) as Model<DatabasePropertyEntity>
  const recordModel = connection.model(DatabaseRecordEntity.name) as Model<DatabaseRecordEntity>
  const viewModel = connection.model(DatabaseViewEntity.name) as Model<DatabaseViewEntity>
  const overrideModel = connection.model(DatabaseViewOrderOverrideEntity.name) as Model<DatabaseViewOrderOverrideEntity>

  await database.collection('workspaces').insertOne({ id: workspaceId, ownerId: 'group-token-owner', name: 'Group token benchmark', createdAt: now, updatedAt: now })
  await databaseModel.collection.insertOne({ id: databaseId, workspaceId, name: 'Group token benchmark', version: databaseVersion,
    queryTokenReadyVersion: databaseVersion, advancedReferenceFence: 0, createdAt: now, updatedAt: now })
  // Every fixture Record has current short tokens and the Database is already certified,
  // so grouped reads do not schedule a background token backfill before teardown.
  await propertyModel.collection.insertMany([
    { id: 'title', workspaceId, databaseId, name: 'Title', type: 'title', version: 1, createdAt: now, updatedAt: now },
    { id: propertyId, workspaceId, databaseId, name: 'Group', type: 'select', options: Object.entries(optionIds).map(([name, id]) => ({ id, name })), version: 1, createdAt: now, updatedAt: now },
  ])
  const plainScopeId = `group-token-plain-${count}`
  const manualScopeId = `group-token-manual-${count}`
  const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: propertyId } }
  await viewModel.collection.insertMany([
    { id: 'group-token-plain-view', workspaceId, databaseId, name: 'Plain', type: 'board', config, version: 1, referenceFence: 0,
      orderScopeId: plainScopeId, manualOrderActive: false, createdAt: now, updatedAt: now },
    { id: 'group-token-manual-view', workspaceId, databaseId, name: 'Manual', type: 'board', config, version: 1, referenceFence: 0,
      orderScopeId: manualScopeId, manualOrderActive: true, createdAt: now, updatedAt: now },
  ])

  const records: FixtureRecord[] = []
  const overrideCount = Math.floor(count * 0.9)
  for (let base = 0; base < count; base += batchSize) {
    const end = Math.min(base + batchSize, count)
    const pages = []
    const storedRecords = []
    const overrides = []
    for (let index = base; index < end; index++) {
      const ordinal = index + 1
      const id = `group-token-record-${String(index).padStart(6, '0')}`
      const pageId = `group-token-page-${String(index).padStart(6, '0')}`
      const optionId = fixtureOption(index, count)
      const properties = { [propertyId]: optionId }
      pages.push({ id: pageId, workspaceId, parentPageId: null, title: `Group row ${index}`, orderKey: String(ordinal), structureFence: 0, createdAt: now, updatedAt: now })
      storedRecords.push({ id, workspaceId, databaseId, pageId, properties, queryTokens: [{ p: propertyId, v: optionId }],
        queryTokenSourceVersion: 1, version: 1, creationOrdinal: ordinal, createdAt: now, updatedAt: now })
      records.push({ id, creationOrdinal: ordinal, optionId })
      if (index < overrideCount) {
        const rank = rankFor(overrideCount - index - 1, overrideCount)
        assert.ok(isViewOrderRank(rank))
        overrides.push({ workspaceId, databaseId, orderScopeId: manualScopeId, recordId: id,
          joinKey: { workspaceId, databaseId, orderScopeId: manualScopeId, recordId: id },
          sourceCreationOrdinal: ordinal, slotOrdinal: 0, rank })
      }
    }
    await pageCollection.insertMany(pages)
    await recordModel.collection.insertMany(storedRecords)
    if (overrides.length) await overrideModel.collection.insertMany(overrides)
  }

  const storedDatabase = await databaseModel.collection.findOne({ workspaceId, id: databaseId })
  assert.equal(storedDatabase?.queryTokenReadyVersion, storedDatabase?.version)
  assert.ok(storedDatabase!.version > count, 'database version must be newer than every fixture creation ordinal')
  assert.equal(await recordModel.collection.countDocuments({ workspaceId, databaseId, queryTokenSourceVersion: { $ne: 1 } }), 0)
  assert.equal(await recordModel.collection.countDocuments({ workspaceId, databaseId, 'queryTokens.p': propertyId }), count)
  assert.equal(await overrideModel.countDocuments({ workspaceId, databaseId, orderScopeId: manualScopeId }), overrideCount)

  const positions = new Map<string, Position>()
  for (let index = 0; index < count; index++) {
    const row = records[index]!
    positions.set(row.id, index < overrideCount
      ? { slotOrdinal: 0, rank: rankFor(overrideCount - index - 1, overrideCount) }
      : { slotOrdinal: row.creationOrdinal, rank: '1' })
  }
  return { workspaceId, databaseId, databaseVersion, plainScopeId, manualScopeId, records, positions, overrideCount }
}

async function assertCompleteGroupPages(input: {
  service: DatabaseService; ownerId: string; workspaceId: string; databaseId: string; viewId: string; optionId: string;
  records: FixtureRecord[]; positions: Map<string, Position>; limit: number;
}) {
  const expected = input.records.filter(row => row.optionId === input.optionId)
    .sort((left, right) => comparePosition(input.positions.get(left.id)!, input.positions.get(right.id)!, left.id, right.id))
    .map(row => row.id)
  const actual: string[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  let pages = 0
  do {
    const result = await input.service.getViewGroupRecords(input.ownerId, input.workspaceId, input.databaseId, input.viewId,
      { groupKind: 'option', optionId: input.optionId, limit: input.limit, ...(cursor ? { cursor } : {}) })
    pages++
    for (const record of result.records) {
      assert.ok(!seen.has(record.id), `record ${record.id} appeared in more than one group page`)
      seen.add(record.id)
      actual.push(record.id)
    }
    cursor = result.nextCursor ?? undefined
    assert.ok(pages <= expected.length + 1, 'group pagination did not terminate')
  } while (cursor)
  assert.deepEqual(actual, expected, `complete ${input.viewId} group traversal for ${input.optionId}`)
  assert.equal(seen.size, expected.length, 'each matching record appears exactly once')
  return { pages, count: expected.length }
}

async function profileGroupRead(connection: Connection, service: DatabaseService, input: {
  ownerId: string; workspaceId: string; databaseId: string; viewId: string; optionId: string; limit: number;
  expectedIds: string[]; assertIndexed: boolean; docsLimit: number;
}) {
  await delay(2)
  const started = new Date()
  const timer = performance.now()
  const result = await service.getViewGroupRecords(input.ownerId, input.workspaceId, input.databaseId, input.viewId,
    { groupKind: 'option', optionId: input.optionId, limit: input.limit })
  const elapsedMs = Number((performance.now() - timer).toFixed(2))
  assert.deepEqual(result.records.map(record => record.id), input.expectedIds.slice(0, input.limit))
  const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started }, 'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] } }).toArray()
  const docsExamined = profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0)
  const keysExamined = profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0)
  const explain = await explainRecordAggregates(connection, profile)
  const measurement = {
    viewId: input.viewId,
    optionId: input.optionId,
    elapsedMs,
    returned: result.records.length,
    docsExamined,
    keysExamined,
    plans: [...new Set(profile.map(entry => String(entry.planSummary ?? 'unknown')))],
    collections: profile.map(entry => ({ collection: String(entry.command?.aggregate), docsExamined: entry.docsExamined ?? 0,
      keysExamined: entry.keysExamined ?? 0, nreturned: entry.nreturned ?? 0, planSummary: String(entry.planSummary ?? 'unknown') })),
    explain,
  }
  console.log(JSON.stringify({ groupTokenRead: measurement }))
  if (input.assertIndexed) {
    assert.ok(explain.stages.includes('IXSCAN'), `ready sparse group must use IXSCAN; stages=${explain.stages.join(',')}`)
    assert.ok(explain.indexes.some(index => index.includes('queryTokens.p') && index.includes('queryTokens.v')),
      `IXSCAN must use the compound queryTokens index; indexes=${explain.indexes.join(',')}`)
    assert.ok(docsExamined < input.docsLimit, `sparse indexed read examined ${docsExamined} documents (limit ${input.docsLimit})`)
  }
  return measurement
}

async function profileRepositoryGroupRead(connection: Connection, records: DatabaseRecordRepository, input: {
  workspaceId: string; databaseId: string; scopeId: string; properties: readonly DatabaseProperty[];
  group: { propertyId: string; optionIds: readonly string[]; group: { kind: 'option'; optionId: string } };
  queryTokensReady: boolean;
}) {
  await delay(2)
  const started = new Date()
  const timer = performance.now()
  // This direct repository call controls only the read-path flag and never asks DatabaseRepository to backfill.
  const rows = await records.readManualWindow({ ...input, manualActive: true, filters: [], direction: 'after', take: 51 })
  const elapsedMs = Number((performance.now() - timer).toFixed(2))
  const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started },
    'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] } }).toArray()
  const docsExamined = profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0)
  const keysExamined = profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0)
  const explain = await explainRecordAggregates(connection, profile)
  return {
    queryTokensReady: input.queryTokensReady,
    ids: rows.map(row => row.id),
    elapsedMs,
    docsExamined,
    keysExamined,
    plans: [...new Set(profile.map(entry => String(entry.planSummary ?? 'unknown')))],
    collections: profile.map(entry => ({ collection: String(entry.command?.aggregate), docsExamined: entry.docsExamined ?? 0,
      keysExamined: entry.keysExamined ?? 0, nreturned: entry.nreturned ?? 0, planSummary: String(entry.planSummary ?? 'unknown') })),
    explain,
  }
}

async function assertRepositoryTokenIndexAba(connection: Connection, records: DatabaseRecordRepository, input: {
  count: number; workspaceId: string; databaseId: string; scopeId: string; properties: readonly DatabaseProperty[];
  expectedIds: string[];
}) {
  const group = { propertyId, optionIds: Object.values(optionIds), group: { kind: 'option' as const, optionId: optionIds.rare } }
  const shared = { workspaceId: input.workspaceId, databaseId: input.databaseId, scopeId: input.scopeId, properties: input.properties, group }
  const fallback = await profileRepositoryGroupRead(connection, records, { ...shared, queryTokensReady: false })
  const ready = await profileRepositoryGroupRead(connection, records, { ...shared, queryTokensReady: true })
  assert.deepEqual(fallback.ids, ready.ids, 'ready and fallback direct repository reads return identical ordered IDs')
  assert.deepEqual(ready.ids, input.expectedIds.slice(0, 51), 'ready repository window matches the manual-position oracle')
  assert.ok(ready.explain.stages.includes('IXSCAN'), `ready repository path must use IXSCAN; stages=${ready.explain.stages.join(',')}`)
  assert.ok(ready.explain.indexes.some(index => index.includes('queryTokens.p') && index.includes('queryTokens.v')),
    `ready repository path must use the queryTokens compound index; indexes=${ready.explain.indexes.join(',')}`)
  assert.ok(fallback.docsExamined >= input.count, `fallback path should examine the database records; examined ${fallback.docsExamined}`)
  assert.ok(fallback.docsExamined > ready.docsExamined * 10,
    `ready path must examine substantially fewer documents: fallback=${fallback.docsExamined}, ready=${ready.docsExamined}`)
  console.log(JSON.stringify({ groupTokenRepositoryAba: {
    fallback: { elapsedMs: fallback.elapsedMs, docsExamined: fallback.docsExamined, keysExamined: fallback.keysExamined,
      plans: fallback.plans, collections: fallback.collections, explain: fallback.explain },
    ready: { elapsedMs: ready.elapsedMs, docsExamined: ready.docsExamined, keysExamined: ready.keysExamined,
      plans: ready.plans, collections: ready.collections, explain: ready.explain },
    returned: ready.ids.length,
  } }))
}

async function runBenchmark(t: { after(callback: () => void | Promise<void>): void }, count: number) {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const service = app.get(DatabaseService)
  const recordRepository = app.get(DatabaseRecordRepository)
  const propertyRepository = app.get(DatabasePropertyRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const propertyModel = app.get<Model<DatabasePropertyEntity>>(getModelToken(DatabasePropertyEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const viewModel = app.get<Model<DatabaseViewEntity>>(getModelToken(DatabaseViewEntity.name))
  const overrideModel = app.get<Model<DatabaseViewOrderOverrideEntity>>(getModelToken(DatabaseViewOrderOverrideEntity.name))
  await Promise.all([databaseModel.init(), propertyModel.init(), recordModel.init(), viewModel.init(), overrideModel.init()])
  const fixture = await seedFixture(connection, count)
    const firstOverridden = fixture.records[0]!
    const lastOverridden = fixture.records[fixture.overrideCount - 1]!
    assert.ok(comparePosition(fixture.positions.get(firstOverridden.id)!, fixture.positions.get(lastOverridden.id)!, firstOverridden.id, lastOverridden.id) > 0,
      'manual overrides must reverse the creation order of the covered records')
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    const ownerId = 'group-token-owner'
      const properties = await propertyRepository.list(fixture.workspaceId, fixture.databaseId)
      const manualRareOracle = fixture.records.filter(row => row.optionId === optionIds.rare)
        .sort((left, right) => comparePosition(fixture.positions.get(left.id)!, fixture.positions.get(right.id)!, left.id, right.id))
        .map(row => row.id)
      await assertRepositoryTokenIndexAba(connection, recordRepository, {
        count, workspaceId: fixture.workspaceId, databaseId: fixture.databaseId, scopeId: fixture.manualScopeId,
        properties, expectedIds: manualRareOracle,
      })
    const optionCount = (optionId: string) => fixture.records.filter(row => row.optionId === optionId).length
    assert.ok(optionCount(optionIds.rare) >= 9 && optionCount(optionIds.rare) <= 11,
      `expected approximately ten rare option rows, found ${optionCount(optionIds.rare)}`)
    assert.ok(optionCount(optionIds.sparse) >= 45, `five pages of five sparse records require at least 25, found ${optionCount(optionIds.sparse)}`)
    assert.ok(optionCount(optionIds.medium) >= 257, `medium option group should exceed the selective candidate cap, found ${optionCount(optionIds.medium)}`)
    assert.ok(optionCount(optionIds.dense) > count / 2, `dense option should fill the first window, found ${optionCount(optionIds.dense)}`)

    const views = [
      { id: 'group-token-plain-view', positions: new Map(fixture.records.map(row => [row.id, { slotOrdinal: row.creationOrdinal, rank: '1' }])) },
      { id: 'group-token-manual-view', positions: fixture.positions },
    ]
    for (const view of views) {
      const idsForOption = (optionId: string) => fixture.records.filter(row => row.optionId === optionId)
        .sort((left, right) => comparePosition(view.positions.get(left.id)!, view.positions.get(right.id)!, left.id, right.id))
        .map(row => row.id)
      const sparseIds = idsForOption(optionIds.sparse)
      if (view.id === 'group-token-manual-view') {
        const sparseCreationOrder = fixture.records.filter(row => row.optionId === optionIds.sparse).map(row => row.id)
        assert.notDeepEqual(sparseIds, sparseCreationOrder, 'manual sparse group order must differ from creation order')
      }
      const sparseTraversal = await assertCompleteGroupPages({ service, ownerId, workspaceId: fixture.workspaceId, databaseId: fixture.databaseId,
        viewId: view.id, optionId: optionIds.sparse, records: fixture.records, positions: view.positions, limit: 5 })
      assert.ok(sparseTraversal.pages >= 5, `${view.id} sparse group must span at least five pages`)
      for (const group of [
        { optionId: optionIds.rare },
        { optionId: optionIds.medium },
        { optionId: optionIds.dense },
      ]) {
        const ids = idsForOption(group.optionId)
        await profileGroupRead(connection, service, {
          ownerId, workspaceId: fixture.workspaceId, databaseId: fixture.databaseId, viewId: view.id,
          optionId: group.optionId, limit: 51, expectedIds: ids,
          // Rare remains below the repository's 256-candidate cutoff in both order modes.
          assertIndexed: group.optionId === optionIds.rare,
          docsLimit: count >= 100_000 ? 1_000 : 200,
        })
      }
    }
    console.log(JSON.stringify({ groupTokenFixture: { count, databaseVersion: fixture.databaseVersion,
      manualOverrideCount: fixture.overrideCount, rareMatches: optionCount(optionIds.rare), sparseMatches: optionCount(optionIds.sparse),
      mediumMatches: optionCount(optionIds.medium), denseMatches: optionCount(optionIds.dense) } }))
  } finally {
    await connection.db!.command({ profile: 0 })
  }
}

test('10k real Mongo group token index preserves complete groups and bounds sparse scans', async t => {
  await runBenchmark(t, 10_000)
})

test('100k real Mongo group token index preserves complete groups and bounds sparse scans', { skip: process.env.EOTION_GROUP_INDEX_BENCH_100K !== '1' }, async t => {
  await runBenchmark(t, 100_000)
})
