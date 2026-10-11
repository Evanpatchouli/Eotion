import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model, PipelineStage } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { BlockEntity } from './schemas/block.schema'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { PageEntity } from './schemas/page.schema'
import { AuthService } from './services/auth.service'
import { DatabaseService } from './services/database.service'
import { PageService } from './services/page.service'
import { SyncService } from './services/sync.service'
import { WorkspaceService } from './services/workspace.service'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
const databaseName = `eotion_page_tree_bench_${randomUUID().replaceAll('-', '')}`
uri.pathname = `/${databaseName}`
uri.searchParams.set('serverSelectionTimeoutMS', '5000')

@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class PageTreeBenchmarkModule {}

type ProfileEntry = {
  ns?: string
  docsExamined?: number
  keysExamined?: number
  nreturned?: number
  millis?: number
  ts?: Date
}

const pipelineFor = (workspaceId: string): PipelineStage[] => [
  { $match: { workspaceId, role: { $ne: 'database-record' } } },
  { $sort: { id: 1 } },
  { $lookup: { from: 'database_records', let: { pageId: '$id' }, pipeline: [
    { $match: { workspaceId, $expr: { $eq: ['$pageId', '$$pageId'] } } },
    { $limit: 1 }, { $project: { _id: 1 } },
  ], as: '_recordReference' } },
  { $match: { _recordReference: { $eq: [] } } },
  { $limit: 101 },
]

const explainSummary = (input: unknown) => {
  const stages = new Set<string>()
  const indexNames = new Set<string>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    const object = value as Record<string, unknown>
    if (typeof object.stage === 'string') stages.add(object.stage)
    if (typeof object.indexName === 'string') indexNames.add(object.indexName)
    if (Array.isArray(object.indexesUsed)) {
      for (const indexName of object.indexesUsed) {
        if (typeof indexName === 'string') indexNames.add(indexName)
      }
    }
    Object.values(object).forEach(visit)
  }
  visit(input)

  // Aggregate explain reports the page cursor and each $lookup as separate
  // pipeline stages. Sum those stage summaries, rather than taking the largest
  // nested executionStats value (which would omit the lookup work).
  const pipeline = input as { stages?: Array<Record<string, unknown>> }
  const stageStats = (pipeline.stages ?? []).flatMap(stage => {
    const stageName = Object.keys(stage).find(key => key.startsWith('$'))
    if (stageName !== '$cursor' && stageName !== '$lookup') return []
    const details = stage[stageName] as Record<string, unknown> | undefined
    const stats = stageName === '$cursor'
      ? details?.executionStats as Record<string, unknown> | undefined
      : details
    return [{
      stage: stageName,
      docsExamined: typeof stats?.totalDocsExamined === 'number' ? stats.totalDocsExamined : null,
      keysExamined: typeof stats?.totalKeysExamined === 'number' ? stats.totalKeysExamined : null,
      indexesUsed: Array.isArray(stats?.indexesUsed) ? stats.indexesUsed : [],
      collectionScans: typeof stats?.collectionScans === 'number' ? stats.collectionScans : null,
    }]
  })
  return {
    stages: [...stages],
    indexNames: [...indexNames],
    docsExamined: stageStats.reduce((sum, stage) => sum + (stage.docsExamined ?? 0), 0),
    keysExamined: stageStats.reduce((sum, stage) => sum + (stage.keysExamined ?? 0), 0),
    lookupCountersAvailable: typeof stageStats.find(stage => stage.stage === '$lookup')?.docsExamined === 'number',
    stageStats,
  }
}

const stats = (values: number[]): { minMs: number; medianMs: number; maxMs: number } => {
  const sorted = [...values].sort((a, b) => a - b)
  return { minMs: sorted[0]!, medianMs: sorted[Math.floor(sorted.length / 2)]!, maxMs: sorted.at(-1)! }
}

test('Page Tree / 10k audit benchmark', async t => {
  const app = await NestFactory.createApplicationContext(PageTreeBenchmarkModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  const auth = app.get(AuthService)
  const workspaces = app.get(WorkspaceService)
  const pages = app.get(PageService)
  const databases = app.get(DatabaseService)
  const sync = app.get(SyncService)
  const pageModel = app.get<Model<unknown>>(getModelToken(PageEntity.name))
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const databaseModel = app.get<Model<unknown>>(getModelToken(DatabaseEntity.name))
  const blockModel = app.get<Model<unknown>>(getModelToken(BlockEntity.name))
  await Promise.all([pageModel.init(), recordModel.init(), databaseModel.init(), blockModel.init()])

  let profilerEnabled = false
  let profilerAvailable = false
  try {
    await connection.db!.command({ profile: 2, slowms: 0 })
    profilerEnabled = profilerAvailable = true
  } catch {
    // Profiler support is optional; each measurement reports unavailable scans.
  }
  t.after(async () => {
    try {
      if (profilerEnabled) await connection.db!.command({ profile: 0 })
      await connection.dropDatabase()
    } finally { await app.close() }
  })

  const owner = await auth.register(`page-tree-bench-${randomUUID()}@example.com`, 'correct horse battery staple')
  const results: Array<Record<string, unknown>> = []
  const batchSize = 1000

  for (const size of [0, 1000, 5000, 10000]) {
    for (const mode of ['marked', 'legacy'] as const) {
      const suffix = `${size}-${mode}-${randomUUID()}`
      const workspaceId = `pt-ws-${suffix}`
      const databaseId = `pt-db-${suffix}`
      const now = new Date()
      await workspaces.create(owner.id, { id: workspaceId, name: `Page Tree benchmark ${size} ${mode}` })

      const ordinaryPageRows = Array.from({ length: 50 }, (_, index) => ({
        id: `pt-normal-${suffix}-${String(index).padStart(3, '0')}`, workspaceId,
        parentPageId: null, title: `Normal ${String(index).padStart(3, '0')}`,
        orderKey: String(index).padStart(8, '0'), version: 1, createdAt: now, updatedAt: now,
      }))
      const recordPages = Array.from({ length: size }, (_, index) => ({
        id: `pt-record-page-${suffix}-${String(index).padStart(5, '0')}`, workspaceId,
        parentPageId: null, title: `Record ${String(index).padStart(5, '0')}`,
        orderKey: `r${String(index).padStart(8, '0')}`, ...(mode === 'marked' ? { role: 'database-record' } : {}),
        version: 1, createdAt: now, updatedAt: now,
      }))
      await pageModel.insertMany(ordinaryPageRows, { ordered: true })
      for (let offset = 0; offset < size; offset += batchSize) {
        await pageModel.insertMany(recordPages.slice(offset, offset + batchSize), { ordered: true })
      }
      await databaseModel.create({ id: databaseId, workspaceId, name: 'Benchmark database', version: 1, parentPageId: ordinaryPageRows[0]!.id, orderKey: 'database', createdAt: now, updatedAt: now })
      await blockModel.create({
        id: `pt-block-${suffix}`, workspaceId, pageId: ordinaryPageRows[0]!.id,
        parentBlockId: null, type: 'database', orderKey: 'database',
        props: { node: { type: 'eotionDatabase', attrs: { databaseId, viewId: null } } },
        createdAt: now, updatedAt: now,
      })
      for (let offset = 0; offset < size; offset += batchSize) {
        const rows = recordPages.slice(offset, offset + batchSize).map(page => ({
          id: `pt-record-${suffix}-${page.id.slice(-5)}`, workspaceId, databaseId, pageId: page.id,
          properties: {}, version: 1, createdAt: now, updatedAt: now,
        }))
        await recordModel.insertMany(rows, { ordered: true })
      }

      const measure = async (name: string, operation: () => Promise<unknown>): Promise<{ name: string; elapsedMs: number; scan: unknown; value: unknown }> => {
        const profileCollection = connection.db!.collection<ProfileEntry>('system.profile')
        const previous = profilerAvailable ? await profileCollection.find({}, { projection: { ts: 1 } }).sort({ ts: -1 }).limit(1).next() as ProfileEntry | null : null
        if (previous?.ts) await new Promise(resolve => setTimeout(resolve, 2))
        const startAt = previous?.ts ?? new Date()
        const start = performance.now()
        const value = await operation()
        const elapsedMs = Number((performance.now() - start).toFixed(2))
        const profile = profilerAvailable
          ? (await profileCollection.find({ ts: { $gt: startAt }, ns: { $regex: `^${databaseName}\\.` } }).toArray()).filter(row => !row.ns?.endsWith('.system.profile'))
          : []
        const scan = profilerAvailable
          ? { operations: profile.length, docsExamined: profile.reduce((sum, row) => sum + (row.docsExamined ?? 0), 0), keysExamined: profile.reduce((sum, row) => sum + (row.keysExamined ?? 0), 0), byCollection: Object.fromEntries([...new Set(profile.map(row => row.ns?.split('.').at(-1) ?? 'unavailable'))].map(collection => [collection, profile.filter(row => row.ns?.endsWith(`.${collection}`)).reduce((sum, row) => sum + (row.docsExamined ?? 0), 0)])) }
          : 'unavailable'
        return { name, elapsedMs, scan, value }
      }

      const runThree = async (name: string, operation: () => Promise<{ value: unknown; returnedPages: number; projectedPages: number }>): Promise<{ operation: string; minMs: number; medianMs: number; maxMs: number; returnedPages: number; projectedPages: number; scans: unknown[] }> => {
        const runs = []
        for (let index = 0; index < 3; index += 1) runs.push(await measure(name, operation))
        const samples = runs.map(row => row.elapsedMs)
        const last = runs.at(-1)!
        return { operation: name, ...stats(samples), returnedPages: (last.value as { returnedPages: number }).returnedPages, projectedPages: (last.value as { projectedPages: number }).projectedPages, scans: runs.map(row => row.scan) }
      }

      const navigation = await runThree('PageService.listNavigation', async () => {
        const rows = await pages.listNavigation(owner.id, workspaceId)
        return { value: null, returnedPages: rows.length, projectedPages: rows.length }
      })
      const navigationRows = await pages.listNavigation(owner.id, workspaceId)
      assert.equal(navigationRows.length, 50)
      assert.ok(navigationRows.every(page => !page.role))

      const databaseNavigation = await runThree('DatabaseService.listNavigationWindow', async () => {
        const result = await databases.listNavigationWindow(owner.id, workspaceId, { limit: 10 })
        return { value: null, returnedPages: result.items.length, projectedPages: 1 }
      })
      assert.equal(databaseNavigation.returnedPages, 1)

      const snapshot = await runThree('SyncService.snapshot', async () => {
        const result = await sync.snapshot(owner.id, workspaceId)
        const recordRolesCorrect = result.pages.filter(page => page.role === 'database-record').length === size
        assert.equal(recordRolesCorrect, true)
        return { value: { jsonBytes: Buffer.byteLength(JSON.stringify(result)), pageCount: result.pages.length, blockCount: result.blocks.length }, returnedPages: result.pages.length, projectedPages: result.pages.length }
      })
      const snapshotDetail = await sync.snapshot(owner.id, workspaceId)
      assert.equal(snapshotDetail.pages.length, 50 + size)
      assert.equal(snapshotDetail.blocks.length, 1)
      assert.equal(snapshotDetail.pages.filter(page => page.role === 'database-record').length, size)
      const directRead = size === 0
        ? (await pages.find(owner.id, workspaceId, `pt-no-record-${suffix}`)) === null
        : (await pages.find(owner.id, workspaceId, recordPages[0]!.id))?.id === recordPages[0]!.id
      assert.equal(directRead, true)

      let explain: unknown
      try {
        explain = explainSummary(await pageModel.aggregate(pipelineFor(workspaceId)).explain('executionStats'))
      } catch (error) {
        explain = { unavailable: error instanceof Error ? error.message : String(error) }
      }
      const entry = {
        size, mode, normalPages: 50, recordPages: size, pageCount: 50 + size, blockCount: 1,
        roleCorrect: navigationRows.length === 50 && snapshotDetail.pages.filter(page => page.role === 'database-record').length === size,
        directRecordRead: directRead,
        navigation, databaseNavigation, snapshot: { ...snapshot, jsonBytes: Buffer.byteLength(JSON.stringify(snapshotDetail)), pageCount: snapshotDetail.pages.length, blockCount: snapshotDetail.blocks.length },
        pageNavigationAggregateExplain: explain,
        profiler: profilerAvailable ? 'available' : 'unavailable',
      }
      results.push(entry)
      console.log(`[PageTree benchmark] ${JSON.stringify(entry)}`)
    }
  }
  assert.equal(results.length, 8)
})
