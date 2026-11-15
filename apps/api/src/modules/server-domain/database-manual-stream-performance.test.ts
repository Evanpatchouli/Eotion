import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { compareViewOrderPosition } from '@eotion/domain'
import { createConnection } from 'mongoose'
import { readManualOrderDefaultIndexStream } from './repositories/manual-order-index-stream'
import type { ManualOrderDirection, ManualOrderKey, ManualOrderTuple } from './repositories/manual-order-index-stream'

type Row = { id: string; position: { slotOrdinal: number; rank: string } }
type RecordDoc = { id: string; workspaceId: string; databaseId: string; creationOrdinal: number; flag: string }
type OverrideDoc = { recordId: string; workspaceId: string; databaseId: string; orderScopeId: string;
  sourceCreationOrdinal: number; slotOrdinal: number; rank: string }
const recordIndex = 'manual_stream_record_cover'
const sourceIndex = 'manual_stream_source_cover'
const byTuple = (a: ManualOrderTuple, b: ManualOrderTuple) => compareViewOrderPosition(a.position, b.position)
  || Buffer.compare(Buffer.from(a.recordId, 'utf8'), Buffer.from(b.recordId, 'utf8'))
const tuple = (row: Row): ManualOrderTuple => ({ position: row.position, recordId: row.id })

async function benchmark(count: number): Promise<void> {
  const configuredUri = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!configuredUri) throw new Error('P4_TEST_MONGODB_URI must explicitly name the isolated benchmark Mongo server')
  const uri = new URL(configuredUri)
  uri.pathname = `/eotion_manual_stream_bench_${randomUUID().replaceAll('-', '')}`
  const connection = await createConnection(uri.toString()).asPromise()
  const database = connection.db!
  const records = database.collection<RecordDoc>('database_records')
  const overrides = database.collection<OverrideDoc>('database_view_order_overrides')
  const scope = { workspaceId: 'bench-workspace', databaseId: 'bench-database' }
  const distributedScope = 'distributed'
  const tailScope = 'unique-tail'
  try {
    await records.createIndex({ workspaceId: 1, databaseId: 1, creationOrdinal: 1, id: 1 }, { name: recordIndex })
    await records.createIndex({ workspaceId: 1, databaseId: 1, id: 1 }, { name: 'manual_stream_record_by_id' })
    await overrides.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1, recordId: 1 },
      { name: sourceIndex, collation: { locale: 'simple' } })
    await overrides.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, recordId: 1 },
      { name: 'manual_stream_verify_record', collation: { locale: 'simple' } })
    const expectedRecords: RecordDoc[] = []
    const expectedOverrides = new Map<string, OverrideDoc[]>()
    expectedOverrides.set(distributedScope, [])
    expectedOverrides.set(tailScope, [])
    for (let start = 0; start < count; start += 5_000) {
      const end = Math.min(start + 5_000, count)
      const batch = Array.from({ length: end - start }, (_, offset) => start + offset)
      const recordBatch = batch.map(index => ({ ...scope, id: `record-${String(index).padStart(6, '0')}`,
        creationOrdinal: index + 1, flag: index % 997 === 0 ? 'match' : 'other' }))
      expectedRecords.push(...recordBatch)
      await records.insertMany(recordBatch)
      for (const [scopeId, included] of [
        [distributedScope, (index: number) => index % 100 !== 0],
        [tailScope, (index: number) => index !== count - 1],
      ] as const) {
        const overrideBatch = batch.filter(included).map(index => ({ ...scope, orderScopeId: scopeId,
          recordId: recordBatch[index - start]!.id, sourceCreationOrdinal: index + 1,
          // The slot will exist before insertion; ranks are unique and precede default rank '1'.
          slotOrdinal: count, rank: `0${index.toString(2).padStart(17, '0')}1` }))
        expectedOverrides.get(scopeId)!.push(...overrideBatch)
      }
    }
    // Insert only after every Record exists, so the chosen slot is never in the future.
    for (const scopeRows of expectedOverrides.values()) {
      for (let start = 0; start < scopeRows.length; start += 5_000) {
        await overrides.insertMany(scopeRows.slice(start, start + 5_000))
      }
    }
    assert.equal(expectedOverrides.get(distributedScope)!.length, count - count / 100)
    assert.equal(expectedOverrides.get(tailScope)!.length, count - 1)

    const cases: Array<{ name: string; scopeId: string; direction: ManualOrderDirection; boundary?: ManualOrderTuple;
      remote?: ManualOrderTuple; excludeRecordId?: string; sparse?: boolean; take: number }> = [
      { name: 'distributed-after', scopeId: distributedScope, direction: 'after', take: 51 },
      { name: 'distributed-before', scopeId: distributedScope, direction: 'before', take: 51 },
      { name: 'distributed-cursor-remote', scopeId: distributedScope, direction: 'after', take: 51,
        boundary: { position: { slotOrdinal: 2_001, rank: '1' }, recordId: 'record-002000' },
        remote: { position: { slotOrdinal: count, rank: '11' }, recordId: 'remote' }, excludeRecordId: 'record-002100' },
      { name: 'distributed-sparse-filter-to-end', scopeId: distributedScope, direction: 'after', take: 51, sparse: true },
      { name: 'unique-tail-to-end', scopeId: tailScope, direction: 'after', take: 51 },
    ]
    const measurements: unknown[] = []
    for (const item of cases) {
      const sign = item.direction === 'after' ? 1 : -1
      const scoped = { ...scope, orderScopeId: item.scopeId }
      const sourceRows = expectedOverrides.get(item.scopeId)!
      const moved = new Map(sourceRows.map(row => [row.recordId, row]))
      const oracle = expectedRecords.map(record => {
        const override = moved.get(record.id)
        return { id: record.id, position: override
          ? { slotOrdinal: override.slotOrdinal, rank: override.rank }
          : { slotOrdinal: record.creationOrdinal, rank: '1' } }
      }).filter(row => row.id !== item.excludeRecordId)
        .filter(row => !item.sparse || row.id === `record-${String(count - 100).padStart(6, '0')}`)
        .filter(row => !item.boundary || sign * byTuple(tuple(row), item.boundary) > 0)
        .filter(row => !item.remote || sign * byTuple(tuple(row), item.remote) <= 0)
        .sort((a, b) => sign * byTuple(tuple(a), tuple(b)))
      const expectedDefaults = oracle.filter(row => !moved.has(row.id)).slice(0, item.take)
      const read = (kind: 'record' | 'override') => async (after: number | undefined, limit: number): Promise<ManualOrderKey[]> => {
        const field = kind === 'record' ? 'creationOrdinal' : 'sourceCreationOrdinal'
        const ordinal = { $gte: 1, $lte: count, ...(after === undefined ? {} : { [sign === 1 ? '$gt' : '$lt']: after }) }
        if (kind === 'record') {
          const docs = await records.find({ ...scope, creationOrdinal: ordinal }, { projection: { _id: 0, creationOrdinal: 1, id: 1 }, hint: recordIndex })
            .sort({ creationOrdinal: sign, id: sign }).limit(limit).toArray()
          return docs.map(doc => ({ ordinal: doc.creationOrdinal, recordId: doc.id }))
        }
        const docs = await overrides.find({ ...scoped, [field]: ordinal }, { projection: { _id: 0, sourceCreationOrdinal: 1, recordId: 1 },
          hint: sourceIndex, collation: { locale: 'simple' } }).sort({ sourceCreationOrdinal: sign, recordId: sign }).limit(limit).toArray()
        return docs.map(doc => ({ ordinal: doc.sourceCreationOrdinal, recordId: doc.recordId }))
      }
      for (const { batchSize, keyBatchSize } of [
        { batchSize: 256, keyBatchSize: 256 },
        { batchSize: 1024, keyBatchSize: 1024 },
        { batchSize: 1024, keyBatchSize: 8192 },
      ]) {
      let candidateDocuments = 0
      const started = new Date()
      await database.command({ profile: 2, slowms: 0 })
      const timer = performance.now()
      let result: Awaited<ReturnType<typeof readManualOrderDefaultIndexStream<Row>>>
      try {
        result = await readManualOrderDefaultIndexStream<Row>({ direction: item.direction, take: item.take,
          ordinalRange: { min: 1, max: count }, ...(item.boundary ? { boundary: item.boundary } : {}),
          ...(item.remote ? { remote: item.remote } : {}), ...(item.excludeRecordId ? { excludeRecordId: item.excludeRecordId } : {}),
          batchSize, keyBatchSize, fetchRecordKeys: read('record'), fetchOverrideKeys: read('override'),
          verifyDefaultCandidates: async keys => {
            const found = await overrides.find({ ...scoped, recordId: { $in: keys.map(key => key.recordId) } },
              { projection: { _id: 0, recordId: 1, sourceCreationOrdinal: 1 }, hint: 'manual_stream_verify_record', collation: { locale: 'simple' } }).toArray()
            if (found.length) throw new Error('Candidate gained an override or has corrupt source ordinal')
          },
          filterAndProject: async keys => {
            const found = await records.find({ ...scope, id: { $in: keys.map(key => key.recordId) } },
              { projection: { _id: 0, id: 1, creationOrdinal: 1, flag: 1 }, hint: 'manual_stream_record_by_id' }).toArray()
            candidateDocuments += found.length
            const byId = new Map(found.map(record => [record.id, record]))
            if (keys.some(key => byId.get(key.recordId)?.creationOrdinal !== key.ordinal)) throw new Error('Candidate Record disappeared or changed ordinal')
            return found.filter(record => !item.sparse || record.id === `record-${String(count - 100).padStart(6, '0')}`)
              .map(record => ({ id: record.id, position: { slotOrdinal: record.creationOrdinal, rank: '1' } }))
          },
        })
      } finally { await database.command({ profile: 0 }) }
      const elapsedMs = Number((performance.now() - timer).toFixed(2))
      assert.deepEqual(result.rows, expectedDefaults, `${item.name} batchSize=${batchSize} keyBatchSize=${keyBatchSize}`)
      const eligibleOverrides = sourceRows.map(row => ({ id: row.recordId, position: { slotOrdinal: row.slotOrdinal, rank: row.rank } }))
        .filter(row => row.id !== item.excludeRecordId)
        .filter(row => !item.sparse || row.id === `record-${String(count - 100).padStart(6, '0')}`)
        .filter(row => !item.boundary || sign * byTuple(tuple(row), item.boundary) > 0)
        .filter(row => !item.remote || sign * byTuple(tuple(row), item.remote) <= 0)
      const merged = [...result.rows, ...eligibleOverrides].sort((a, b) => sign * byTuple(tuple(a), tuple(b))).slice(0, item.take)
      assert.deepEqual(merged, oracle.slice(0, item.take), `${item.name} batchSize=${batchSize} keyBatchSize=${keyBatchSize} complete order`)
      assert.equal(candidateDocuments, result.debug.candidates)
      if (item.name.endsWith('to-end')) {
        assert.ok(result.rows.length < item.take, 'the stream must observe real EOF')
        assert.equal(result.debug.recordKeys, count, 'the final key range must be visited before EOF')
      }
      const profile = await database.collection('system.profile').find({ ts: { $gte: started },
        ns: { $in: [`${database.databaseName}.database_records`, `${database.databaseName}.database_view_order_overrides`] } }).toArray()
      const streamEntries = profile.filter(entry => entry.command?.find && entry.command?.hint &&
        [recordIndex, sourceIndex].includes(entry.command.hint))
      assert.ok(streamEntries.length >= 2)
      assert.ok(streamEntries.every(entry => (entry.docsExamined ?? 0) === 0), 'both index key streams must be covered')
      measurements.push({ case: item.name, count, batchSize, keyBatchSize, elapsedMs, returned: result.rows.length, ...result.debug,
        candidateDocuments, keysExamined: profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0),
        docsExamined: profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
        streamKeysExamined: streamEntries.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0),
        streamDocsExamined: streamEntries.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0) })
      }
    }
    const sampleRecord = await records.find({ ...scope, creationOrdinal: { $gte: 1, $lte: count } },
      { projection: { _id: 0, creationOrdinal: 1, id: 1 }, hint: recordIndex }).sort({ creationOrdinal: 1, id: 1 }).limit(51).explain('executionStats')
    const sampleOverride = await overrides.find({ ...scope, orderScopeId: tailScope, sourceCreationOrdinal: { $gte: 1, $lte: count } },
      { projection: { _id: 0, sourceCreationOrdinal: 1, recordId: 1 }, hint: sourceIndex, collation: { locale: 'simple' } })
      .sort({ sourceCreationOrdinal: 1, recordId: 1 }).limit(51).explain('executionStats')
    assert.equal(sampleRecord.executionStats?.totalDocsExamined, 0)
    assert.equal(sampleOverride.executionStats?.totalDocsExamined, 0)
    console.log(JSON.stringify({ manualStreamBenchmark: { count, measurements,
      ...(count === 10_000 ? { priorRepositoryReference: 'database-view-order-performance.test.ts measured about 642ms for a local 10k dense sample; fixture and host may differ' } : {}),
      indexOnlyExplain: { recordKeys: sampleRecord.executionStats?.totalKeysExamined,
        overrideKeys: sampleOverride.executionStats?.totalKeysExamined } } }))
  } finally {
    try { await database.dropDatabase() } finally { await connection.close() }
  }
}

test('10k manual order index stream uses bounded covered key pages', async () => benchmark(10_000))
test('100k manual order index stream uses bounded covered key pages',
  { skip: process.env.EOTION_ORDER_STREAM_BENCH_100K !== '1' }, async () => benchmark(100_000))
