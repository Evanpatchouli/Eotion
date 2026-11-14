import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewOrderOverrideEntity } from './schemas/database-view-order.schema'
import { DatabaseRecordRepository } from './repositories/database.repository'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
uri.pathname = `/eotion_view_order_performance_${randomUUID().replaceAll('-', '')}`
@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class ViewOrderPerformanceModule {}

test('10k View order windows bound scans for zero, sparse, dense overrides and sparse filters', async t => {
  const app = await NestFactory.createApplicationContext(ViewOrderPerformanceModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const records = app.get(DatabaseRecordRepository)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const overrideModel = app.get<Model<unknown>>(getModelToken(DatabaseViewOrderOverrideEntity.name))
  await Promise.all([recordModel.init(), overrideModel.init()])
  const workspaceId = 'performance-workspace'
  const databaseId = 'performance-database'
  const now = new Date()
  const count = 10_000
  const pages = Array.from({ length: count }, (_, index) => ({
    id: `performance-page-${index}`, workspaceId, parentPageId: null, title: `Row ${index}`,
    orderKey: String(index), structureFence: 0, createdAt: now, updatedAt: now,
  }))
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `performance-record-${index}`, workspaceId, databaseId, pageId: pages[index]!.id,
    properties: { flag: index % 997 === 0 ? 'match' : 'other', bucket: index < 256 ? 'under' : index === 256 ? 'edge' : 'other',
      optional: index % 997 === 0 ? null : 'set', links: index % 997 === 0 ? ['linked'] : [],
      due: index % 997 === 0 ? { start: '2026-11-15', end: '2026-11-16' } : null,
      membership: index % 997 === 0 ? 'a' : 'b' }, version: 1,
    creationOrdinal: index + 1, createdAt: now, updatedAt: now,
  }))
  await connection.db!.collection('pages').insertMany(pages)
  await recordModel.insertMany(rows)
  const scopes = [
    { name: 'zero', id: 'performance-zero', count: 0, active: false },
    { name: 'one-percent', id: 'performance-one', count: 100, active: true },
    { name: 'ninety-nine-percent', id: 'performance-ninety-nine', count: 9_900, active: true },
    { name: 'unique-default-tail', id: 'performance-unique-tail', count: 9_999, active: true },
  ]
  for (const scope of scopes.slice(1)) {
    const overrides = Array.from({ length: scope.count }, (_, index) => ({
      workspaceId, databaseId, orderScopeId: scope.id, recordId: rows[index]!.id,
      joinKey: { workspaceId, databaseId, orderScopeId: scope.id, recordId: rows[index]!.id },
      sourceCreationOrdinal: index + 1,
      slotOrdinal: count, rank: `0${index.toString(2).padStart(14, '0')}1`,
    }))
    await overrideModel.insertMany(overrides)
  }
  const properties = [
    { id: 'title', workspaceId, databaseId, name: 'Title', type: 'title' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'flag', workspaceId, databaseId, name: 'Flag', type: 'text' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'bucket', workspaceId, databaseId, name: 'Bucket', type: 'text' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'optional', workspaceId, databaseId, name: 'Optional', type: 'text' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'links', workspaceId, databaseId, name: 'Links', type: 'relation' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'due', workspaceId, databaseId, name: 'Due', type: 'date' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'membership', workspaceId, databaseId, name: 'Membership', type: 'select' as const, options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
  const measurements: Array<{ case: string; elapsedMs: number; returned: number; docsExamined: number; keysExamined: number; plans: string[]; streams: Array<{ collection: string; docsExamined: number; keysExamined: number; nreturned: number }>; explainStages?: string[] }> = []
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    for (const scope of scopes) {
      for (const sparse of [false, true]) {
        const started = new Date()
        const timer = performance.now()
        const result = await records.readManualWindow({
          workspaceId, databaseId, scopeId: scope.id, manualActive: scope.active, properties,
          filters: sparse ? [{ propertyId: 'flag', operator: 'is', value: 'match' }] : [],
          direction: 'after', take: 51,
        })
        const elapsedMs = performance.now() - timer
        assert.equal(result.length, sparse ? 11 : 51)
        const profile = await connection.db!.collection('system.profile').find({
          ts: { $gte: started }, 'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] },
        }).toArray()
        const docsExamined = profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0)
        const keysExamined = profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0)
        const plans = [...new Set(profile.map(entry => String(entry.planSummary ?? 'unknown')))]
        const explainStages: string[] = []
        if (scope.name === 'ninety-nine-percent' && !sparse) for (const entry of profile) {
          const command = entry.command as { aggregate?: string; pipeline?: unknown[] } | undefined
          if (!command?.aggregate || !command.pipeline) continue
          const explained = await connection.db!.command({ explain: { aggregate: command.aggregate, pipeline: command.pipeline, cursor: {}, collation: { locale: 'simple' } }, verbosity: 'executionStats' })
          const visit = (value: unknown): void => {
            if (!value || typeof value !== 'object') return
            if (Array.isArray(value)) { for (const item of value) visit(item); return }
            const object = value as Record<string, unknown>
            if (typeof object.stage === 'string') explainStages.push(object.stage)
            for (const child of Object.values(object)) visit(child)
          }
          visit(explained)
        }
        const streams = profile.map(entry => ({ collection: String(entry.command?.aggregate), docsExamined: entry.docsExamined ?? 0, keysExamined: entry.keysExamined ?? 0, nreturned: entry.nreturned ?? 0 }))
        measurements.push({ case: `${scope.name}-${sparse ? 'sparse-filter' : 'unfiltered'}`, elapsedMs: Number(elapsedMs.toFixed(2)), returned: result.length, docsExamined, keysExamined, plans, streams,
          ...(explainStages.length ? { explainStages: [...new Set(explainStages)] } : {}) })
      }
    }
  } finally {
    await connection.db!.command({ profile: 0 })
  }
  console.log(JSON.stringify({ viewOrder10k: measurements }))
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    for (const optionId of ['a', 'b']) {
      const started = new Date()
      const timer = performance.now()
      const group = { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option' as const, optionId } }
      const window = await records.readManualWindow({ workspaceId, databaseId, scopeId: scopes[2]!.id, manualActive: true, properties, filters: [], group,
        direction: 'after', take: 51 })
      assert.equal(window.length, optionId === 'a' ? 11 : 51)
      const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started },
        'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] } }).toArray()
      console.log(JSON.stringify({ viewGroup10k: { optionId, elapsedMs: Number((performance.now() - timer).toFixed(2)), returned: window.length,
        docsExamined: profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
        keysExamined: profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) } }))
    }
    const started = new Date()
    const timer = performance.now()
    const counted = await recordModel.collection.aggregate([{ $match: { workspaceId, databaseId } },
      { $match: { $expr: { $eq: [{ $getField: { field: 'membership', input: '$properties' } }, 'a'] } } }, { $count: 'total' }]).toArray()
    assert.equal(counted[0]?.total, 11)
    const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started }, 'command.aggregate': 'database_records' }).toArray()
    console.log(JSON.stringify({ viewGroup10kCountCandidate: { elapsedMs: Number((performance.now() - timer).toFixed(2)), count: counted[0]?.total,
      docsExamined: profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      keysExamined: profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) } }))
  } finally { await connection.db!.command({ profile: 0 }) }
  const dense = scopes[2]!
  const read = (filters: Array<{ propertyId: string; operator: string; value?: string }>, options: { boundary?: { position: { slotOrdinal: number; rank: string }; recordId: string }; direction?: 'after' | 'before'; take?: number } = {}) => records.readManualWindow({
    workspaceId, databaseId, scopeId: dense.id, manualActive: true, properties,
    filters: filters as never, direction: options.direction ?? 'after', take: options.take ?? 51,
    ...(options.boundary ? { boundary: options.boundary } : {}),
  })
  for (const filters of [
    [{ propertyId: 'flag', operator: 'is', value: 'match' }],
    [{ propertyId: 'flag', operator: 'is_not', value: 'other' }],
    [{ propertyId: 'flag', operator: 'does_not_contain', value: 'other' }],
    [{ propertyId: 'optional', operator: 'is_empty' }],
    [{ propertyId: 'links', operator: 'is_not_empty' }],
    [{ propertyId: 'due', operator: 'is', value: '2026-11-15' }],
    [{ propertyId: 'flag', operator: 'is', value: 'match' }, { propertyId: 'title', operator: 'contains', value: 'Row' }],
  ]) {
    const found = await read(filters)
    assert.deepEqual(found.map(row => row.id), [rows[9970]!.id, ...Array.from({ length: 10 }, (_, index) => rows[index * 997]!.id)], JSON.stringify(filters))
    const backward = await read(filters, { direction: 'before', boundary: { position: found[5]!.position, recordId: found[5]!.id }, take: 2 })
    assert.deepEqual(backward.map(row => row.id), [found[4]!.id, found[3]!.id], `reverse neighbor ${JSON.stringify(filters)}`)
  }
  const under = [{ propertyId: 'bucket', operator: 'is', value: 'under' }]
  const throughEdge = [{ propertyId: 'bucket', operator: 'is_not', value: 'other' }]
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    const probeStarted = new Date()
    assert.equal((await read(under, { take: 100 })).length, 100)
    const probeProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: probeStarted }, 'command.aggregate': 'database_view_order_overrides' }).toArray()
    assert.equal(probeProfile.length, 0, '256 matching Record properties use the complete candidate path')
    const fallbackStarted = new Date()
    assert.equal((await read(throughEdge, { take: 100 })).length, 100)
    const fallbackProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: fallbackStarted }, 'command.aggregate': 'database_view_order_overrides' }).toArray()
    assert.ok(fallbackProfile.length >= 1, '257 matching Record properties fall back to both ordered streams')
  } finally { await connection.db!.command({ profile: 0 }) }
  const row49Boundary = { position: { slotOrdinal: count, rank: `0${(49).toString(2).padStart(14, '0')}1` }, recordId: rows[49]!.id }
  assert.deepEqual((await read(under, { boundary: row49Boundary, take: 2 })).map(row => row.id), [rows[50]!.id, rows[51]!.id])
  assert.deepEqual((await read(throughEdge, { boundary: row49Boundary, take: 2 })).map(row => row.id), [rows[50]!.id, rows[51]!.id])
  await overrideModel.collection.updateOne({ orderScopeId: dense.id, recordId: rows[0]!.id }, { $set: { slotOrdinal: 9901, rank: '01' } })
  const sameSlot = { position: { slotOrdinal: 9901, rank: '01' }, recordId: rows[0]!.id }
  assert.deepEqual((await read([], { boundary: sameSlot, take: 1 })).map(row => row.id), [rows[9900]!.id])
  assert.deepEqual((await read([], { boundary: { position: { slotOrdinal: 9901, rank: '1' }, recordId: rows[9900]!.id }, direction: 'before', take: 1 })).map(row => row.id), [rows[0]!.id])
  await connection.db!.collection('pages').insertOne({ id: 'performance-new-page', workspaceId, parentPageId: null, title: 'New', orderKey: 'new', structureFence: 0, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'performance-new-record', workspaceId, databaseId, pageId: 'performance-new-page', properties: {}, version: 1, creationOrdinal: count + 1, createdAt: now, updatedAt: now })
  assert.deepEqual((await read([], { boundary: { position: { slotOrdinal: count + 1, rank: '1' }, recordId: 'performance-new-record' }, direction: 'before', take: 1 })).map(row => row.id), [rows[count - 1]!.id], 'new Record appends after reachable same-slot overrides')
  const uniqueScope = scopes[3]!
  const uniqueWindow = () => records.readManualWindow({ workspaceId, databaseId, scopeId: uniqueScope.id, manualActive: true, properties, filters: [], direction: 'after', take: 2 })
  await overrideModel.collection.deleteOne({ orderScopeId: uniqueScope.id, recordId: rows[5000]!.id })
  assert.deepEqual((await uniqueWindow()).map(row => row.id), [rows[5000]!.id, rows[0]!.id], 'a missing override inside the count prefix forces the default stream')
  await recordModel.collection.deleteOne({ workspaceId, databaseId, id: rows[5000]!.id })
  await overrideModel.collection.deleteMany({ workspaceId, databaseId, recordId: rows[5000]!.id })
  assert.deepEqual((await uniqueWindow()).map(row => row.id), [rows[0]!.id, rows[1]!.id], 'deletion creates an ordinal gap without hiding remaining rows')
  await overrideModel.collection.updateOne({ orderScopeId: uniqueScope.id, recordId: rows[0]!.id }, { $set: { rank: '1' } })
  await assert.rejects(records.readManualWindow({ workspaceId, databaseId, scopeId: uniqueScope.id, manualActive: true, properties, filters: [],
    boundary: { position: { slotOrdinal: count, rank: `0${(9998).toString(2).padStart(14, '0')}1` }, recordId: rows[9998]!.id },
    direction: 'after', take: 2 }), /positions overlap/, 'an override colliding with a default position fails closed')
})

test('100k View order window with a unique default tail remains complete', { skip: process.env.VIEW_ORDER_BENCH_100K !== '1' }, async t => {
  const app = await NestFactory.createApplicationContext(ViewOrderPerformanceModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const records = app.get(DatabaseRecordRepository)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const overrideModel = app.get<Model<unknown>>(getModelToken(DatabaseViewOrderOverrideEntity.name))
  await Promise.all([recordModel.init(), overrideModel.init()])
  const workspaceId = 'large-workspace'
  const databaseId = 'large-database'
  const scopeId = 'large-scope'
  const count = 100_000
  const now = new Date()
  const countProbe = connection.db!.collection('view_order_count_probe')
  await countProbe.createIndex({ scopeId: 1, creationOrdinal: 1 }, { unique: true })
  for (let base = 0; base < count; base += 5_000) {
    const batch = Array.from({ length: Math.min(5_000, count - base) }, (_, offset) => base + offset)
    await connection.db!.collection('pages').insertMany(batch.map(index => ({
      id: `large-page-${index}`, workspaceId, title: `Large row ${index}`, parentPageId: null,
      orderKey: String(index), structureFence: 0, createdAt: now, updatedAt: now,
    })))
    await recordModel.collection.insertMany(batch.map(index => ({
      id: `large-record-${index}`, workspaceId, databaseId, pageId: `large-page-${index}`,
      properties: { flag: index % 10_003 === 0 ? 'match' : 'other', membership: index % 10_003 === 0 ? 'a' : 'b' }, version: 1,
      creationOrdinal: index + 1, createdAt: now, updatedAt: now,
    })))
    await overrideModel.collection.insertMany(batch.filter(index => index < count - 1).map(index => ({
      workspaceId, databaseId, orderScopeId: scopeId, recordId: `large-record-${index}`,
      joinKey: { workspaceId, databaseId, orderScopeId: scopeId, recordId: `large-record-${index}` },
      sourceCreationOrdinal: index + 1,
      slotOrdinal: count, rank: `0${index.toString(2).padStart(17, '0')}1`,
    })))
    await countProbe.insertMany(batch.filter(index => index < count - 1).map(index => ({ scopeId, creationOrdinal: index + 1 })))
  }
  const properties = [
    { id: 'title', workspaceId, databaseId, name: 'Title', type: 'title' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'flag', workspaceId, databaseId, name: 'Flag', type: 'text' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'membership', workspaceId, databaseId, name: 'Membership', type: 'select' as const, options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    const countStarted = new Date()
    const countTimer = performance.now()
    const recordPrefix = await recordModel.collection.countDocuments({ workspaceId, databaseId, creationOrdinal: { $lt: count } })
    const overridePrefix = await countProbe.countDocuments({ scopeId, creationOrdinal: { $lt: count } })
    const countElapsedMs = Number((performance.now() - countTimer).toFixed(2))
    assert.equal(recordPrefix, count - 1)
    assert.equal(overridePrefix, count - 1)
    const countProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: countStarted },
      'command.aggregate': { $in: ['database_records', 'view_order_count_probe'] } }).toArray()
    console.log(JSON.stringify({ viewOrder100kCountProbe: { countElapsedMs, recordPrefix, overridePrefix,
      streams: countProfile.map(entry => ({ collection: String(entry.command?.aggregate), docsExamined: entry.docsExamined ?? 0,
        keysExamined: entry.keysExamined ?? 0, planSummary: entry.planSummary ?? 'unknown' })) } }))
    for (const sparse of [false, true]) {
      const started = new Date()
      const timer = performance.now()
      const window = await records.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true, properties,
        filters: sparse ? [{ propertyId: 'flag', operator: 'is', value: 'match' }] : [], direction: 'after', take: 51 })
      const elapsedMs = Number((performance.now() - timer).toFixed(2))
      assert.equal(window.length, sparse ? 10 : 51)
      const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started },
        'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] } }).toArray()
      console.log(JSON.stringify({ viewOrder100k: { case: sparse ? 'unique-tail-sparse-filter' : 'unique-tail-unfiltered', elapsedMs,
        returned: window.length, docsExamined: profile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
        keysExamined: profile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0),
        plans: [...new Set(profile.map(entry => String(entry.planSummary ?? 'unknown')))],
        streams: profile.map(entry => ({ collection: String(entry.command?.aggregate), docsExamined: entry.docsExamined ?? 0, keysExamined: entry.keysExamined ?? 0, nreturned: entry.nreturned ?? 0 })) } }))
    }
    const groupStarted = new Date()
    const groupTimer = performance.now()
    const groupRows = await records.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true, properties, filters: [],
      group: { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option', optionId: 'a' } }, direction: 'after', take: 51 })
    assert.equal(groupRows.length, 10)
    const groupProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: groupStarted },
      'command.aggregate': { $in: ['database_records', 'database_view_order_overrides'] } }).toArray()
    console.log(JSON.stringify({ viewGroup100k: { elapsedMs: Number((performance.now() - groupTimer).toFixed(2)), returned: groupRows.length,
      docsExamined: groupProfile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      keysExamined: groupProfile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) } }))
    const groupCountStarted = new Date()
    const groupCountTimer = performance.now()
    const countRows = await recordModel.collection.aggregate([{ $match: { workspaceId, databaseId } },
      { $match: { $expr: { $eq: [{ $getField: { field: 'membership', input: '$properties' } }, 'a'] } } }, { $count: 'total' }]).toArray()
    assert.equal(countRows[0]?.total, 10)
    const groupCountProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: groupCountStarted }, 'command.aggregate': 'database_records' }).toArray()
    console.log(JSON.stringify({ viewGroup100kCountCandidate: { elapsedMs: Number((performance.now() - groupCountTimer).toFixed(2)), count: countRows[0]?.total,
      docsExamined: groupCountProfile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      keysExamined: groupCountProfile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) } }))
    for (const titleFilter of [false, true]) {
      const summaryStarted = new Date()
      const summaryTimer = performance.now()
      const grouped = await recordModel.collection.aggregate([
        { $match: { workspaceId, databaseId } },
        ...(titleFilter ? [{ $lookup: { from: 'pages', let: { pageId: '$pageId' }, pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$id', '$$pageId'] }, { $eq: ['$workspaceId', workspaceId] }] } } },
          { $project: { title: 1 } },
        ], as: 'page' } }, { $unwind: '$page' }, { $match: { 'page.title': { $regex: 'Large row 1' } } }] : []),
        { $group: { _id: { $let: { vars: { value: { $getField: { field: 'membership', input: '$properties' } } },
          in: { $cond: [{ $in: ['$$value', ['a', 'b']] }, '$$value', null] } } }, total: { $sum: 1 } } },
      ]).toArray()
      assert.equal(grouped.reduce((sum, item) => sum + item.total, 0), titleFilter ? 11111 : count)
      const summaryProfile = await connection.db!.collection('system.profile').find({ ts: { $gte: summaryStarted }, 'command.aggregate': 'database_records' }).toArray()
      console.log(JSON.stringify({ viewGroup100kAllCounts: { titleFilter, elapsedMs: Number((performance.now() - summaryTimer).toFixed(2)),
        groups: grouped, docsExamined: summaryProfile.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
        keysExamined: summaryProfile.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0),
        plans: [...new Set(summaryProfile.map(entry => String(entry.planSummary ?? 'unknown')))] } }))
    }
  } finally { await connection.db!.command({ profile: 0 }) }
})
