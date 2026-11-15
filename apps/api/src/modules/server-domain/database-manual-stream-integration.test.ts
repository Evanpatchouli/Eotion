import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import { compareViewOrderPosition } from '@eotion/domain'
import type { Connection, Model } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseRecordRepository } from './repositories/database.repository'
import type { ManualBoundary, DatabaseRecordGroupQuery } from './repositories/database.repository'
import { checkedManualOrdinalPage } from './repositories/manual-order-index-stream'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, DatabaseViewOrderOverrideEntity } from './schemas/database-view-order.schema'

const configuredUri = process.env.P4_TEST_MONGODB_URI?.trim()
if (!configuredUri) throw new Error('P4_TEST_MONGODB_URI must name an isolated Mongo server')
const uri = new URL(configuredUri)
uri.pathname = `/eotion_stream_${randomUUID().replaceAll('-', '')}`
@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class ManualStreamTestModule {}

test('manual default index stream matches full order and exact fallback', async t => {
  const app = await NestFactory.createApplicationContext(ManualStreamTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { try { await connection.dropDatabase() } finally { await app.close() } })
  const repository = app.get(DatabaseRecordRepository)
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const overrideModel = app.get<Model<unknown>>(getModelToken(DatabaseViewOrderOverrideEntity.name))
  await Promise.all([recordModel.init(), overrideModel.init()])
  await recordModel.collection.createIndex({ workspaceId: 1, databaseId: 1, creationOrdinal: 1, id: 1 },
    { name: 'decoy_partial_record_order', partialFilterExpression: { version: { $gte: 2 } } })
  await overrideModel.collection.createIndex({ workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1, recordId: 1 },
    { name: 'decoy_collated_source_order', collation: { locale: 'en' } })
  const recordOrderIndex = (await recordModel.collection.indexes()).find(index => index.key?.creationOrdinal === 1
    && index.key?.id === 1 && !index.partialFilterExpression && !index.collation)?.name
  assert.ok(recordOrderIndex)
  const workspaceId = 'stream-workspace'
  const databaseId = 'stream-database'
  const scopeId = 'stream-scope'
  const count = 300
  const now = new Date()
  const records = Array.from({ length: count }, (_, index) => ({ id: `record-${String(index).padStart(3, '0')}`, workspaceId, databaseId,
    pageId: `page-${index}`, creationOrdinal: index + 1, properties: { membership: 'a', flag: 'common' },
    queryTokens: [{ p: 'membership', v: 'a' }, { p: 'flag', v: 'common' }], queryTokenSourceVersion: 1,
    version: 1, createdAt: now, updatedAt: now }))
  await connection.db!.collection('pages').insertMany(records.map((record, index) => ({ id: record.pageId, workspaceId,
    parentPageId: null, title: `Row ${index}`, orderKey: String(index), structureFence: 0, createdAt: now, updatedAt: now })))
  await recordModel.insertMany(records)
  const moved = records.filter((_, index) => index % 100 !== 0).map((record, index) => ({ workspaceId, databaseId, orderScopeId: scopeId,
    recordId: record.id, joinKey: { workspaceId, databaseId, orderScopeId: scopeId, recordId: record.id },
    sourceCreationOrdinal: record.creationOrdinal, slotOrdinal: count, rank: `0${index.toString(2).padStart(10, '0')}1` }))
  await overrideModel.insertMany(moved)
  const titleId = 'title'
  const properties = [
    { id: titleId, workspaceId, databaseId, name: 'Title', type: 'title' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'membership', workspaceId, databaseId, name: 'Membership', type: 'select' as const,
      options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'flag', workspaceId, databaseId, name: 'Flag', type: 'text' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
  const byId = new Map(moved.map(row => [row.recordId, row]))
  const compare = (left: { position: { slotOrdinal: number; rank: string }; id: string }, right: { position: { slotOrdinal: number; rank: string }; id: string }) =>
    compareViewOrderPosition(left.position, right.position) || Buffer.compare(Buffer.from(left.id, 'utf8'), Buffer.from(right.id, 'utf8'))
  const cases: Array<{ name: string; direction: 'after' | 'before'; take: number; boundary?: ManualBoundary;
    excludeRecordId?: string; group?: DatabaseRecordGroupQuery; titleMatch?: string; flagMatch?: string }> = [
    { name: 'first page', direction: 'after', take: 51 },
    { name: 'reverse neighbor', direction: 'before', take: 1, boundary: { position: { slotOrdinal: count, rank: '1' }, recordId: 'record-299' } },
    { name: 'same slot forward', direction: 'after', take: 3, boundary: { position: { slotOrdinal: count, rank: moved[20]!.rank }, recordId: moved[20]!.recordId } },
    { name: 'same slot reverse', direction: 'before', take: 3, boundary: { position: { slotOrdinal: count, rank: moved[20]!.rank }, recordId: moved[20]!.recordId } },
    { name: 'exclude source', direction: 'after', take: 51, excludeRecordId: records[0]!.id },
    { name: 'option group', direction: 'after', take: 51,
      group: { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option', optionId: 'a' } } },
    { name: 'option group next page same slot', direction: 'after', take: 3,
      group: { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option', optionId: 'a' } },
      boundary: { position: { slotOrdinal: count, rank: moved[20]!.rank }, recordId: moved[20]!.recordId } },
    { name: 'option group record filter', direction: 'after', take: 51, flagMatch: 'common',
      group: { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option', optionId: 'a' } } },
    { name: 'option group title filter', direction: 'after', take: 51, titleMatch: 'Row 200',
      group: { propertyId: 'membership', optionIds: ['a', 'b'], group: { kind: 'option', optionId: 'a' } } },
    { name: 'title filter after empty batches', direction: 'after', take: 51, titleMatch: 'Row 200' },
  ]
  for (const item of cases) {
    const filters = item.titleMatch ? [{ propertyId: titleId, operator: 'is' as const, value: item.titleMatch }]
      : item.flagMatch ? [{ propertyId: 'flag', operator: 'is' as const, value: item.flagMatch }] : []
    const profileBefore = item.name === 'first page' || item.name === 'option group'
      ? await connection.db!.collection('system.profile').countDocuments({}) : 0
    if (item.name === 'first page' || item.name === 'option group') await connection.db!.command({ profile: 2, slowms: 0 })
    const rows = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true, properties, filters,
      direction: item.direction, take: item.take, ...(item.boundary ? { boundary: item.boundary } : {}),
      ...(item.excludeRecordId ? { excludeRecordId: item.excludeRecordId } : {}), ...(item.group ? { group: item.group, queryTokensReady: true } : {}) })
    if (item.name === 'first page' || item.name === 'option group') {
      await connection.db!.command({ profile: 0 })
      const newEvents = await connection.db!.collection('system.profile').find({}).sort({ $natural: 1 }).skip(profileBefore).toArray()
      const profile = newEvents
        .filter(entry => ['database_records', 'database_view_order_overrides'].includes(entry.command?.find as string))
      assert.ok(profile.some(entry => entry.command?.hint === recordOrderIndex), 'Record key stream must name the valid covering index')
      assert.ok(profile.some(entry => entry.command?.hint === DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX), 'override key stream must use the source covering index')
      if (item.name === 'first page') {
        assert.ok(profile.some(entry => entry.command?.hint === recordOrderIndex && entry.command?.limit === 1025),
          'dense first page must run the bounded Record prefix probe')
        assert.equal(newEvents.some(entry => Array.isArray(entry.command?.pipeline)
          && entry.command.pipeline.some((stage: Record<string, unknown>) => '$unionWith' in stage)), false,
        'a real early default disproves saturation without a full pair scan')
      }
    }
    const sign = item.direction === 'after' ? 1 : -1
    const oracle = records.map((record, index) => {
      const override = byId.get(record.id)
      return { id: record.id, position: override ? { slotOrdinal: override.slotOrdinal, rank: override.rank }
        : { slotOrdinal: record.creationOrdinal, rank: '1' }, membership: record.properties.membership,
        flag: record.properties.flag, title: `Row ${index}` }
    }).filter(row => row.id !== item.excludeRecordId && (!item.titleMatch || row.title === item.titleMatch))
      .filter(row => !item.flagMatch || row.flag === item.flagMatch)
      .filter(row => !item.group || (item.group.group.kind === 'option'
        ? row.membership === item.group.group.optionId : !item.group.optionIds.includes(row.membership)))
      .filter(row => !item.boundary || sign * compare(row, { ...item.boundary, id: item.boundary.recordId }) > 0)
      .sort((a, b) => sign * compare(a, b)).slice(0, item.take)
    assert.deepEqual(rows.map(row => ({ id: row.id, position: row.position })), oracle.map(row => ({ id: row.id, position: row.position })), item.name)
  }

  for (const ordinal of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    await recordModel.collection.updateOne({ id: records[0]!.id }, { $set: { creationOrdinal: ordinal } })
    await assert.rejects(repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
      properties, filters: [], direction: 'after', take: 51 }), /creation ordinal is outside the safe range/)
    await recordModel.collection.updateOne({ id: records[0]!.id }, { $set: { creationOrdinal: 1 } })
  }

  const lowScopeId = 'low-cover-scope'
  await overrideModel.insertMany(moved.slice(0, 60).map(row => ({ ...row, orderScopeId: lowScopeId,
    joinKey: { workspaceId, databaseId, orderScopeId: lowScopeId, recordId: row.recordId } })))
  const lowProfileBefore = await connection.db!.collection('system.profile').countDocuments({})
  await connection.db!.command({ profile: 2, slowms: 0 })
  const lowRows = await repository.readManualWindow({ workspaceId, databaseId, scopeId: lowScopeId, manualActive: true,
    properties, filters: [], direction: 'after', take: 51 })
  await connection.db!.command({ profile: 0 })
  assert.equal(lowRows.length, 51)
  assert.equal(lowRows[0]!.id, records[0]!.id)
  const lowEvents = await connection.db!.collection('system.profile').find({}).sort({ $natural: 1 }).skip(lowProfileBefore).toArray()
  const limitedCount = lowEvents.find(entry => entry.command?.aggregate === 'database_records'
    && Array.isArray(entry.command?.pipeline)
    && entry.command.pipeline.some((stage: Record<string, unknown>) => stage.$limit === 61))
  assert.ok(limitedCount, 'small source count keeps the Record count cap at overrideCount + 1')
  assert.ok((limitedCount.keysExamined ?? Infinity) <= 65)
  assert.equal(lowEvents.some(entry => entry.command?.find === 'database_records' && entry.command?.limit === 1025), false,
    'small override scopes must avoid the larger Record prefix probe')
  assert.equal(lowEvents.some(entry => Array.isArray(entry.command?.pipeline)
    && entry.command.pipeline.some((stage: Record<string, unknown>) => '$unionWith' in stage)), false,
  'low coverage cannot require the full pair proof')

  const coveredScope = 'covered-prefix'
  const prefixDatabaseId = 'prefix-database'
  const prefixCount = 1100
  const prefixRecords = Array.from({ length: prefixCount }, (_, index) => ({ id: `prefix-${index}`, workspaceId,
    databaseId: prefixDatabaseId, pageId: `prefix-page-${index}`, creationOrdinal: index + 1,
    properties: { membership: 'a', flag: 'common' }, version: 1, createdAt: now, updatedAt: now }))
  await connection.db!.collection('pages').insertMany(prefixRecords.map((record, index) => ({ id: record.pageId, workspaceId,
    parentPageId: null, title: `Prefix ${index}`, orderKey: String(index), structureFence: 0, createdAt: now, updatedAt: now })))
  await recordModel.insertMany(prefixRecords)
  const coveredOverrides = prefixRecords.filter((_, index) => index !== 1050).map((record, index) => ({ workspaceId,
    databaseId: prefixDatabaseId, orderScopeId: coveredScope, recordId: record.id,
    joinKey: { workspaceId, databaseId: prefixDatabaseId, orderScopeId: coveredScope, recordId: record.id },
    sourceCreationOrdinal: record.creationOrdinal, slotOrdinal: prefixCount, rank: `0${index.toString(2).padStart(12, '0')}1` }))
  await overrideModel.insertMany(coveredOverrides)
  const laterGap = await repository.readManualWindow({ workspaceId, databaseId: prefixDatabaseId, scopeId: coveredScope, manualActive: true,
    properties, filters: [], direction: 'after', take: 51 })
  assert.equal(laterGap[0]!.id, prefixRecords[1050]!.id, 'equal first 1024 keys cannot certify a later default gap')
  await overrideModel.collection.insertOne({ workspaceId, databaseId: prefixDatabaseId, orderScopeId: coveredScope,
    recordId: 'ghost-prefix', joinKey: { workspaceId, databaseId: prefixDatabaseId, orderScopeId: coveredScope, recordId: 'ghost-prefix' },
    sourceCreationOrdinal: 1051, slotOrdinal: prefixCount, rank: '011111111111111' })
  const pairBefore = await connection.db!.collection('system.profile').countDocuments({})
  await connection.db!.command({ profile: 2, slowms: 0 })
  const laterMismatch = await repository.readManualWindow({ workspaceId, databaseId: prefixDatabaseId, scopeId: coveredScope, manualActive: true,
    properties, filters: [], direction: 'after', take: 51 })
  await connection.db!.command({ profile: 0 })
  assert.equal(laterMismatch[0]!.id, prefixRecords[1050]!.id, 'equal counts after the sample still require pair identity proof')
  const laterEvents = await connection.db!.collection('system.profile').find({}).sort({ $natural: 1 }).skip(pairBefore).toArray()
  assert.ok(laterEvents.some(entry => Array.isArray(entry.command?.pipeline)
    && entry.command.pipeline.some((stage: Record<string, unknown>) => '$unionWith' in stage)),
  'a matching sample and matching total count must run the full pair proof')

  const probeBaseline = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
    properties, filters: [], direction: 'after', take: 51 })
  const probeInternals = repository as unknown as { hasManualStreamIndexes: () => Promise<{ record: string; source: string } | null> }
  const probeCheck = probeInternals.hasManualStreamIndexes.bind(repository)
  probeInternals.hasManualStreamIndexes = async () => {
    const names = await probeCheck()
    if (names) await connection.db!.command({ collMod: overrideModel.collection.collectionName,
      index: { name: names.source, hidden: true } })
    return names
  }
  try {
    const hiddenDuringProbe = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
      properties, filters: [], direction: 'after', take: 51 })
    assert.deepEqual(hiddenDuringProbe.map(row => row.id), probeBaseline.map(row => row.id),
      'a hidden source hint during the prefix probe falls back to exact ordering')
  } finally {
    probeInternals.hasManualStreamIndexes = probeCheck
    await connection.db!.command({ collMod: overrideModel.collection.collectionName,
      index: { name: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, hidden: false } })
  }

  const pairDatabaseId = 'pair-database'
  const pairRecords = [
    { id: 'pair-a', pageId: 'pair-page-a', creationOrdinal: 1 },
    { id: 'pair-b', pageId: 'pair-page-b', creationOrdinal: 2 },
  ]
  await connection.db!.collection('pages').insertMany(pairRecords.map(record => ({ id: record.pageId, workspaceId,
    parentPageId: null, title: record.id, orderKey: record.id, structureFence: 0, createdAt: now, updatedAt: now })))
  await recordModel.collection.insertMany(pairRecords.map(record => ({ ...record, workspaceId, databaseId: pairDatabaseId,
    properties: { membership: 'a', flag: 'common' }, version: 1, createdAt: now, updatedAt: now })))
  const pairOverride = (scope: string, recordId: string, sourceCreationOrdinal: number, rank = '01') => ({
    workspaceId, databaseId: pairDatabaseId, orderScopeId: scope, recordId,
    joinKey: { workspaceId, databaseId: pairDatabaseId, orderScopeId: scope, recordId },
    sourceCreationOrdinal, slotOrdinal: 2, rank,
  })
  await overrideModel.collection.insertOne(pairOverride('good-pair', 'pair-a', 1))
  await connection.db!.command({ profile: 2, slowms: 0 })
  const goodPair = await repository.readManualWindow({ workspaceId, databaseId: pairDatabaseId, scopeId: 'good-pair',
    manualActive: true, properties, filters: [], direction: 'after', take: 1 })
  await connection.db!.command({ profile: 0 })
  assert.deepEqual(goodPair.map(row => row.id), ['pair-a'])
  const pairProfiles = await connection.db!.collection('system.profile').find({ 'command.aggregate': 'database_records' }).toArray()
  const pairProof = pairProfiles.find(entry => Array.isArray(entry.command?.pipeline)
    && entry.command.pipeline.some((stage: Record<string, unknown>) => '$unionWith' in stage))
  assert.ok(pairProof, 'valid saturated prefix must run a full pair proof')
  assert.equal(pairProof.docsExamined, 0, 'full pair proof should remain index-only')
  const pairExplain = await connection.db!.command({ explain: { aggregate: 'database_records', pipeline: pairProof.command.pipeline,
    cursor: {}, hint: recordOrderIndex,
    collation: { locale: 'simple' }, allowDiskUse: true }, verbosity: 'executionStats' })
  const explainedDocs: number[] = []
  const inspectStats = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const item of value) inspectStats(item); return }
    const object = value as Record<string, unknown>
    if (typeof object.totalDocsExamined === 'number') explainedDocs.push(object.totalDocsExamined)
    for (const child of Object.values(object)) inspectStats(child)
  }
  inspectStats(pairExplain)
  assert.ok(explainedDocs.length > 0 && explainedDocs.every(count => count === 0), 'pair explain must examine zero documents')
  const proofInternals = repository as unknown as { hasManualStreamIndexes: () => Promise<{ record: string; source: string } | null> }
  const proofCheck = proofInternals.hasManualStreamIndexes.bind(repository)
  proofInternals.hasManualStreamIndexes = async () => {
    const names = await proofCheck()
    if (names) await recordModel.collection.dropIndex(names.record)
    return names
  }
  try {
    const proofRace = await repository.readManualWindow({ workspaceId, databaseId: pairDatabaseId, scopeId: 'good-pair',
      manualActive: true, properties, filters: [], direction: 'after', take: 1 })
    assert.deepEqual(proofRace.map(row => row.id), ['pair-a'], 'dropped pair-proof hint uses exact fallback')
  } finally {
    proofInternals.hasManualStreamIndexes = proofCheck
    await recordModel.collection.createIndex({ workspaceId: 1, databaseId: 1, creationOrdinal: 1, id: 1 }, { name: recordOrderIndex })
  }

  await overrideModel.collection.insertOne(pairOverride('wrong-source', 'pair-b', 1))
  const wrongSource = await repository.readManualWindow({ workspaceId, databaseId: pairDatabaseId, scopeId: 'wrong-source',
    manualActive: true, properties, filters: [], direction: 'after', take: 1 })
  assert.deepEqual(wrongSource.map(row => row.id), ['pair-a'], 'equal source counts cannot hide an unmatched default')
  await overrideModel.collection.insertMany([
    pairOverride('swapped-source', 'pair-a', 2, '01'), pairOverride('swapped-source', 'pair-b', 1, '001'),
  ])
  const swapped = await repository.readManualWindow({ workspaceId, databaseId: pairDatabaseId, scopeId: 'swapped-source',
    manualActive: true, properties, filters: [], direction: 'after', take: 1 })
  assert.deepEqual(swapped.map(row => row.id), ['pair-b'], 'swapped source IDs use the exact fallback order')

  const sourceBefore = moved[0]!
  await overrideModel.collection.updateOne({ orderScopeId: scopeId, recordId: sourceBefore.recordId }, { $set: { sourceCreationOrdinal: 1 } })
  const corruptRows = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true, properties, filters: [], direction: 'after', take: 51 })
  assert.equal(corruptRows.length, 51, 'bad source identity falls back to exact recordId join')
  assert.equal(corruptRows[0]!.id, records[0]!.id)
  await overrideModel.collection.updateOne({ orderScopeId: scopeId, recordId: sourceBefore.recordId },
    { $set: { sourceCreationOrdinal: sourceBefore.sourceCreationOrdinal } })

  const session = await connection.startSession()
  const transactionStarted = new Date()
  await connection.db!.command({ profile: 2, slowms: 0 })
  try {
    await session.withTransaction(async () => {
      const inTransaction = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
        properties, filters: [], direction: 'after', take: 51, session })
      assert.equal(inTransaction.length, 51)
      assert.equal(inTransaction[0]!.id, records[0]!.id)
    })
  } finally { await connection.db!.command({ profile: 0 }); await session.endSession() }
  const transactionProfiles = await connection.db!.collection('system.profile').find({ ts: { $gte: transactionStarted } }).toArray()
  assert.equal(transactionProfiles.some(entry => Array.isArray(entry.command?.pipeline)
    && entry.command.pipeline.some((stage: Record<string, unknown>) => '$unionWith' in stage)), false,
  'session reads must never use $unionWith')

  await recordModel.collection.deleteOne({ workspaceId, databaseId, id: records[0]!.id })
  const newId = 'record-300'
  await connection.db!.collection('pages').insertOne({ id: 'page-300', workspaceId, parentPageId: null,
    title: 'Row 300', orderKey: '300', structureFence: 0, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: newId, workspaceId, databaseId, pageId: 'page-300', creationOrdinal: 301,
    properties: { membership: 'a', flag: 'common' }, version: 1, createdAt: now, updatedAt: now })
  const changedRows = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
    properties, filters: [], direction: 'after', take: 51 })
  assert.equal(changedRows[0]!.id, records[100]!.id, 'deletion leaves an ordinal gap without hiding later defaults')
  const appendNeighbor = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
    properties, filters: [], direction: 'before', take: 1, boundary: { position: { slotOrdinal: 301, rank: '1' }, recordId: newId } })
  assert.equal(appendNeighbor[0]!.id, moved.at(-1)!.recordId, 'new Record follows the existing last override')

  const internals = repository as unknown as {
    hasManualStreamIndexes: () => Promise<{ record: string; source: string } | null>
    readIndexedManualDefaults: (...args: unknown[]) => Promise<unknown>
  }
  const checkIndexes = internals.hasManualStreamIndexes.bind(repository)
  internals.hasManualStreamIndexes = async () => {
    const available = await checkIndexes()
    if (available) await connection.db!.command({ collMod: overrideModel.collection.collectionName,
      index: { name: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, hidden: true } })
    return available
  }
  try {
    const hiddenDuringRead = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
      properties, filters: [], direction: 'after', take: 51 })
    assert.deepEqual(hiddenDuringRead.map(row => row.id), changedRows.map(row => row.id), 'hidden hint falls back outside a transaction')
  } finally {
    internals.hasManualStreamIndexes = checkIndexes
    await connection.db!.command({ collMod: overrideModel.collection.collectionName,
      index: { name: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, hidden: false } })
  }

  const indexedRead = internals.readIndexedManualDefaults.bind(repository)
  internals.readIndexedManualDefaults = async () => {
    const error = new Error('hint index was dropped') as Error & { code: number }
    error.code = 27
    throw error
  }
  const abortSession = await connection.startSession()
  try {
    await assert.rejects(abortSession.withTransaction(async () => {
      await recordModel.collection.insertOne({ id: 'tx-sentinel', workspaceId, databaseId, pageId: 'tx-page', creationOrdinal: 302,
        properties: {}, version: 1, createdAt: now, updatedAt: now }, { session: abortSession })
      await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
        properties, filters: [], direction: 'after', take: 51, session: abortSession })
    }), /hint index was dropped/)
  } finally {
    internals.readIndexedManualDefaults = indexedRead
    await abortSession.endSession()
  }
  assert.equal(await recordModel.collection.countDocuments({ id: 'tx-sentinel' }), 0, 'hint failure cannot commit a partial transaction')

  internals.hasManualStreamIndexes = async () => {
    const available = await checkIndexes()
    if (available) await overrideModel.collection.dropIndex(DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX)
    return available
  }
  try {
    const droppedDuringRead = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true,
      properties, filters: [], direction: 'after', take: 51 })
    assert.deepEqual(droppedDuringRead.map(row => row.id), changedRows.map(row => row.id), 'dropped hint falls back outside a transaction')
  } finally { internals.hasManualStreamIndexes = checkIndexes }
  const fallbackRows = await repository.readManualWindow({ workspaceId, databaseId, scopeId, manualActive: true, properties, filters: [], direction: 'after', take: 51 })
  assert.deepEqual(fallbackRows.map(row => row.id), changedRows.map(row => row.id), 'missing covering index uses the exact join')

  const edges = connection.db!.collection('manual_key_edges')
  await edges.insertMany([
    { creationOrdinal: 1, sourceCreationOrdinal: 1, recordId: 'a' },
    { creationOrdinal: 2, sourceCreationOrdinal: 2, recordId: 'b' },
    { creationOrdinal: 2, sourceCreationOrdinal: 2, recordId: 'c' },
    { creationOrdinal: 3, sourceCreationOrdinal: 3, recordId: 'd' },
  ])
  await edges.createIndex({ creationOrdinal: 1, recordId: 1 })
  await edges.createIndex({ sourceCreationOrdinal: 1, recordId: 1 })
  for (const field of ['creationOrdinal', 'sourceCreationOrdinal'] as const) for (const sign of [1, -1] as const) {
    const docs = await edges.find({}, { projection: { _id: 0, [field]: 1, recordId: 1 } })
      .sort({ [field]: sign, recordId: sign }).limit(3).toArray()
    assert.throws(() => checkedManualOrdinalPage(docs.map(doc => ({ ordinal: doc[field] as number, recordId: doc.recordId as string })),
      2, field), /ordinal repeats across key pages/, `${field} direction ${sign}`)
  }
})
