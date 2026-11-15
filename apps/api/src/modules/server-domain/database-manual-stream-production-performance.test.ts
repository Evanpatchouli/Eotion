import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose'
import { compareViewOrderPosition } from '@eotion/domain'
import type { Connection } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseRecordRepository, type ManualBoundary, type ManualRecordRow } from './repositories/database.repository'
import { DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX } from './schemas/database-view-order.schema'

type Expected = { id: string; position: ManualBoundary['position'] }

async function benchmark(count: number): Promise<void> {
  const configuredUri = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!configuredUri) throw new Error('P4_TEST_MONGODB_URI must explicitly name the isolated benchmark MongoDB')
  const uri = new URL(configuredUri)
  uri.pathname = `/eotion_manual_production_bench_${randomUUID().replaceAll('-', '')}`
  @Module({ imports: [MongooseModule.forRoot(uri.toString(), { autoIndex: false }), ServerDomainModule] })
  class ProductionBenchmarkModule {}
  const app = await NestFactory.createApplicationContext(ProductionBenchmarkModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  const db = connection.db!
  const records = db.collection('database_records')
  const overrides = db.collection('database_view_order_overrides')
  const pages = db.collection('pages')
  const repository = app.get(DatabaseRecordRepository)
  const workspaceId = 'bench-workspace'
  const databaseId = 'bench-database'
  const scopeId = 'bench-scope'
  const now = new Date()
  const properties = [{ id: 'title', workspaceId, databaseId, name: 'Title', type: 'title' as const,
    version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() }]
  let recordCoverName = ''
  const rank = (index: number) => `0${index.toString(2).padStart(17, '0')}1`
  const position = (index: number): Expected['position'] => index % 100 === 0
    ? { slotOrdinal: index + 1, rank: '1' } : { slotOrdinal: count, rank: rank(index) }
  const expected: Expected[] = Array.from({ length: count }, (_, index) => ({
    id: `record-${String(index).padStart(6, '0')}`, position: position(index),
  })).sort((left, right) => compareViewOrderPosition(left.position, right.position)
    || Buffer.compare(Buffer.from(left.id, 'utf8'), Buffer.from(right.id, 'utf8')))
  const read = (boundary?: ManualBoundary, take = 51, direction: 'after' | 'before' = 'after') => repository.readManualWindow({
    workspaceId, databaseId, scopeId, manualActive: true, properties, filters: [], direction, take,
    ...(boundary ? { boundary } : {}),
  })
  const measure = async (phase: 'legacy' | 'indexed') => {
    await db.command({ profile: 2, slowms: 0 })
    const started = new Date()
    const timer = performance.now()
    let first: ManualRecordRow[]
    try { first = await read() } finally { await db.command({ profile: 0 }) }
    const elapsedMs = Number((performance.now() - timer).toFixed(2))
    assert.deepEqual(first.map(row => row.id), expected.slice(0, 51).map(row => row.id), `${phase} first page`)
    const profile = await db.collection('system.profile').find({ ts: { $gte: started }, ns: { $in: [
      `${db.databaseName}.database_records`, `${db.databaseName}.database_view_order_overrides`,
    ] } }).toArray()
    const recordStream = profile.filter(entry => entry.command?.find === 'database_records' && entry.command.hint === recordCoverName)
    const sourceStream = profile.filter(entry => entry.command?.find === 'database_view_order_overrides'
      && entry.command.hint === DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX)
    const indexStream = [...recordStream, ...sourceStream]
    if (phase === 'legacy') assert.equal(indexStream.length, 0, 'the source-cover index is absent in the legacy phase')
    else {
      assert.ok(recordStream.length >= 1, 'the indexed phase reads the covered Record stream')
      assert.ok(sourceStream.length >= 1, 'the indexed phase reads the covered override source stream')
    }
    return { phase, elapsedMs, returned: first.length,
      docsExamined: profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      keysExamined: profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0),
      operations: profile.length, streamOperations: indexStream.length,
      streamDocsExamined: indexStream.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      streamKeysExamined: indexStream.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) }
  }
  const allPages = async (phase: string) => {
    const actual: ManualRecordRow[] = []
    let boundary: ManualBoundary | undefined
    const pageSize = 101
    for (let page = 0; page <= Math.ceil(count / pageSize); page++) {
      const rows = await read(boundary, pageSize)
      actual.push(...rows)
      if (rows.length < pageSize) break
      const last = rows.at(-1)!
      boundary = { position: last.position, recordId: last.id }
    }
    assert.deepEqual(actual.map(row => ({ id: row.id, position: row.position })), expected, `${phase} complete paginated order`)
    const middle = actual[Math.floor(actual.length / 2)]!
    const prior = await read({ position: middle.position, recordId: middle.id }, 51, 'before')
    const at = expected.findIndex(row => row.id === middle.id)
    assert.deepEqual(prior.map(row => row.id), expected.slice(Math.max(0, at - 51), at).reverse().map(row => row.id), `${phase} reverse boundary`)
    return actual.length
  }
  const sampledPages = async (phase: string) => {
    let boundary: ManualBoundary | undefined
    for (let page = 0; page < 3; page++) {
      const rows = await read(boundary, 101)
      assert.deepEqual(rows.map(row => ({ id: row.id, position: row.position })), expected.slice(page * 101, (page + 1) * 101), `${phase} leading page ${page}`)
      const last = rows.at(-1)!
      boundary = { position: last.position, recordId: last.id }
    }
    for (const at of [Math.floor(count / 2), count - 51]) {
      const anchor = expected[at - 1]!
      const rows = await read({ position: anchor.position, recordId: anchor.id }, 51)
      assert.deepEqual(rows.map(row => ({ id: row.id, position: row.position })), expected.slice(at, at + 51), `${phase} anchored page ${at}`)
    }
    return 5
  }
  try {
    // Keep the legacy phase free of the new source-cover index while preserving
    // the indexes needed by the existing join and both page projections.
    await records.createIndex({ id: 1 }, { name: 'record_id_unique', unique: true })
    await records.createIndex({ workspaceId: 1, databaseId: 1, id: 1 })
    await records.createIndex({ workspaceId: 1, databaseId: 1, creationOrdinal: 1, id: 1 }, { name: 'record_creation_cover' })
    const recordCover = (await records.indexes()).find(index => index.name
      && JSON.stringify(Object.entries(index.key ?? {})) === JSON.stringify([
        ['workspaceId', 1], ['databaseId', 1], ['creationOrdinal', 1], ['id', 1],
      ]) && index.hidden !== true && index.sparse !== true && index.partialFilterExpression === undefined
      && (index.collation?.locale ?? 'simple') === 'simple')
    assert.ok(recordCover?.name)
    recordCoverName = recordCover.name
    await overrides.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, slotOrdinal: 1, rank: 1 }, { collation: { locale: 'simple' } })
    await overrides.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, recordId: 1 }, { collation: { locale: 'simple' } })
    await overrides.createIndex({ joinKey: 1 }, { unique: true, collation: { locale: 'simple' } })
    await pages.createIndex({ id: 1, workspaceId: 1 }, { name: 'page_lookup' })
    for (let base = 0; base < count; base += 5_000) {
      const indexes = Array.from({ length: Math.min(5_000, count - base) }, (_, offset) => base + offset)
      await pages.insertMany(indexes.map(index => ({ id: `page-${index}`, workspaceId, title: `Row ${index}`,
        createdAt: now, updatedAt: now })))
      await records.insertMany(indexes.map(index => ({ id: `record-${String(index).padStart(6, '0')}`, workspaceId, databaseId,
        pageId: `page-${index}`, properties: {}, version: 1, creationOrdinal: index + 1, createdAt: now, updatedAt: now })))
      const moved = indexes.filter(index => index % 100 !== 0)
      if (moved.length) await overrides.insertMany(moved.map(index => ({ workspaceId, databaseId, orderScopeId: scopeId,
        recordId: `record-${String(index).padStart(6, '0')}`, sourceCreationOrdinal: index + 1,
        joinKey: { workspaceId, databaseId, orderScopeId: scopeId, recordId: `record-${String(index).padStart(6, '0')}` },
        slotOrdinal: count, rank: rank(index) })))
    }
    assert.equal(await overrides.countDocuments({ workspaceId, databaseId, orderScopeId: scopeId }), count - count / 100)
    assert.equal((await overrides.indexes()).some(index => index.name === DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX), false)
    const legacy = await measure('legacy')
    const legacyPages = count === 100_000 ? await sampledPages('legacy') : await allPages('legacy')
    await overrides.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1, recordId: 1 },
      { name: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, collation: { locale: 'simple' } })
    const indexed = await measure('indexed')
    const indexedPages = count === 100_000 ? await sampledPages('indexed') : await allPages('indexed')
    assert.equal(indexedPages, legacyPages)
    console.log(JSON.stringify({ productionManualStream: { count, legacy, indexed,
      verification: count === 100_000 ? { sampledPagesPerPhase: indexedPages } : { completeRowsPerPhase: indexedPages },
      note: 'Local first-window samples are not latency SLOs; both phases used the same records and overrides.' } }))
  } finally {
    try { await db.dropDatabase() } finally { await app.close() }
  }
}

test('small production manual-order repository comparison', async () => benchmark(300))
test('10k production manual-order repository comparison', async () => benchmark(10_000))
test('100k production manual-order repository comparison',
  { skip: process.env.EOTION_ORDER_PRODUCTION_BENCH_100K !== '1' }, async () => benchmark(100_000))
