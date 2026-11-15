import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { Module, type INestApplicationContext } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import { ServerDomainModule } from './server-domain.module'
import { HttpApiModule } from '../http-api/http-api.module'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseRepository, DatabaseRecordRepository } from './repositories/database.repository'

async function createIsolatedApp() {
  const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
  assert.equal(uri.port, '55778', 'this test must use the isolated MongoDB instance')
  uri.pathname = `/eotion_query_token_${randomUUID().replaceAll('-', '')}`
  @Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
  class QueryTokenTestModule {}
  return NestFactory.createApplicationContext(QueryTokenTestModule, { logger: false })
}

async function cleanupIsolatedApp(app: INestApplicationContext, connection: Connection, directTasks: readonly Promise<unknown>[] = []): Promise<void> {
  try {
    await app.get(DatabaseRepository).onModuleDestroy()
    await Promise.allSettled(directTasks)
  } finally {
    try { await connection.dropDatabase() } finally { await app.close() }
  }
}

async function eventually(check: () => Promise<boolean>, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await check()) return
    await delay(50)
  }
  assert.fail('query token backfill did not finish')
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function pauseQueryTokenFinalizations(model: Model<DatabaseEntity>, count: number) {
  const collection = model.collection as unknown as { updateOne: (...args: any[]) => Promise<any> }
  const original = collection.updateOne.bind(collection)
  const entered = Array.from({ length: count }, deferred)
  const releases = Array.from({ length: count }, deferred)
  let next = 0
  collection.updateOne = async (...args: any[]) => {
    const update = args[1]
    if (Array.isArray(update) && update.some(stage => stage?.$set?.queryTokenReadyVersion === '$version')) {
      const index = next++
      entered[index]?.resolve()
      if (releases[index]) await releases[index].promise
    }
    return original(...args)
  }
  return {
    entered: (index: number) => entered[index]!.promise,
    release: (index: number) => releases[index]!.resolve(),
    restore: () => { releases.forEach(gate => gate.resolve()); collection.updateOne = original },
  }
}

function pauseQueryTokenAcquisition(model: Model<DatabaseEntity>) {
  const collection = model.collection as unknown as { findOneAndUpdate: (...args: any[]) => Promise<any> }
  const original = collection.findOneAndUpdate.bind(collection)
  const entered = deferred()
  const release = deferred()
  collection.findOneAndUpdate = async (...args: any[]) => {
    const update = args[1]
    if (Array.isArray(update) && update.some(stage => stage?.$set?.queryTokenBuildId !== undefined)) {
      entered.resolve()
      await release.promise
    }
    return original(...args)
  }
  return { entered: entered.promise, release: release.resolve, restore: () => { release.resolve(); collection.findOneAndUpdate = original } }
}

function pauseFirstQueryTokenWriteBatch(model: Model<DatabaseRecordEntity>) {
  const collection = model.collection as unknown as { updateMany: (...args: any[]) => Promise<any> }
  const original = collection.updateMany.bind(collection)
  const entered = deferred()
  const release = deferred()
  let calls = 0
  collection.updateMany = async (...args: any[]) => {
    if (Array.isArray(args[1]) && args[1].some(stage => stage?.$set?.queryTokens !== undefined)) {
      calls++
      if (calls === 1) { entered.resolve(); await release.promise }
    }
    return original(...args)
  }
  return { entered: entered.promise, release: release.resolve, calls: () => calls,
    restore: () => { release.resolve(); collection.updateMany = original } }
}

function beforeQueryTokenScan(model: Model<DatabaseRecordEntity>, onScan: (number: number) => Promise<void>) {
  const collection = model.collection as unknown as { find: (...args: any[]) => any }
  const original = collection.find.bind(collection)
  let scans = 0
  collection.find = (...args: any[]) => {
    const cursor = original(...args)
    if (args[0]?.id?.$lte !== undefined) {
      const toArray = cursor.toArray.bind(cursor)
      cursor.toArray = async () => { await onScan(++scans); return toArray() }
    }
    return cursor
  }
  return { scans: () => scans, restore: () => { collection.find = original } }
}

test('legacy grouped reads remain complete until atomically rebuilt tokens are ready', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([databaseModel.init(), recordModel.init()])
  const now = new Date()
  const propertyId = 'group.$😀'
  const optionId = '😀'.repeat(128)
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await connection.db!.collection('pages').insertMany(Array.from({ length: 6 }, (_, index) => ({ id: `page-${index}`, workspaceId: 'w', title: `Row ${index}`, createdAt: now, updatedAt: now })))
  const values = [optionId, 'retired', null, ['bad'], undefined, optionId]
  await recordModel.collection.insertMany(values.map((value, index) => ({ id: `r${index}`, workspaceId: 'w', databaseId: 'legacy', pageId: `page-${index}`,
    properties: { ...(value === undefined ? {} : { [propertyId]: value }), ...(index === 0 ? { emptyText: '' } : {}) },
    ...(index === 5 ? {} : { version: 1 }), creationOrdinal: index + 1, createdAt: now, updatedAt: now })))
  const properties = [
    { id: 'title', workspaceId: 'w', databaseId: 'legacy', name: 'Title', type: 'title' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: propertyId, workspaceId: 'w', databaseId: 'legacy', name: 'Group', type: 'select' as const, options: [{ id: optionId, name: 'Emoji' }], version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
  const group = { propertyId, optionIds: [optionId], group: { kind: 'option' as const, optionId } }
  const read = (queryTokensReady: boolean) => records.readManualWindow({ workspaceId: 'w', databaseId: 'legacy', scopeId: 'unused', manualActive: false,
    properties, filters: [], direction: 'after', take: 3, group, queryTokensReady })
  assert.deepEqual((await read(false)).map(row => row.id), ['r0', 'r5'])
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  await eventually(async () => (await databaseModel.collection.findOne({ id: 'legacy' }))?.queryTokenReadyVersion === 1)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), true)
  assert.deepEqual((await read(true)).map(row => row.id), ['r0', 'r5'])
  const rebuilt = await recordModel.collection.findOne({ id: 'r0' })
  assert.deepEqual(rebuilt?.queryTokens, [{ p: propertyId, v: optionId }])
  assert.equal(rebuilt?.queryTokenSourceVersion, 1)
  assert.deepEqual((await recordModel.collection.findOne({ id: 'r3' }))?.queryTokens, [])
  assert.deepEqual((await recordModel.collection.findOne({ id: 'r5' }))?.queryTokens, [{ p: propertyId, v: optionId }])
  assert.equal((await recordModel.collection.findOne({ id: 'r5' }))?.queryTokenSourceVersion, 0)
  const pending = () => recordModel.collection.find({ workspaceId: 'w', databaseId: 'legacy', $or: [
    { queryTokenSourceVersion: { $exists: false } },
    { $expr: { $ne: ['$queryTokenSourceVersion', { $ifNull: ['$version', 0] }] } },
  ] }, { projection: { _id: 0, id: 1 } }).sort({ id: 1 }).toArray()
  assert.deepEqual(await pending(), [], 'missing Record.version normalized to 0 is complete after the first rebuild')

  // Simulate an older process: it bumps the public database version but does not advance the internal ready marker.
  await databaseModel.collection.updateOne({ id: 'legacy', version: 1 }, { $inc: { version: 1 } })
  await recordModel.collection.updateOne({ id: 'r1' }, { $set: { properties: { [propertyId]: optionId } }, $inc: { version: 1 } })
  assert.deepEqual((await pending()).map(row => row.id), ['r1'], 'the second rebuild excludes the versionless row')
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 2), false)
  assert.deepEqual((await read(false)).map(row => row.id), ['r0', 'r1', 'r5'])
  await eventually(async () => {
    await databases.queryTokensReadyOrSchedule('w', 'legacy', 2)
    return (await databaseModel.collection.findOne({ id: 'legacy' }))?.queryTokenReadyVersion === 2
  }, 260)
  assert.deepEqual((await read(true)).map(row => row.id), ['r0', 'r1', 'r5'])
  assert.deepEqual((await recordModel.collection.findOne({ id: 'r1' }))?.queryTokens, [{ p: propertyId, v: optionId }])
  assert.deepEqual(await pending(), [])
})

test('new records and property updates keep short scalar tokens and ready version in one transaction', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([databaseModel.init(), recordModel.init()])
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      const database = await databases.create({ id: 'new', workspaceId: 'w', name: 'New', version: 1 }, session)
      const record = await records.create({ id: 'r', workspaceId: 'w', databaseId: 'new', pageId: 'p', version: 1, creationOrdinal: 1,
        properties: { 'dot.$': 'a'.repeat(256), long: '😀'.repeat(257), relation: ['a'], empty: null } }, session)
      assert.equal(Object.hasOwn(database, 'queryTokenReadyVersion'), false)
      assert.equal(Object.hasOwn(record, 'queryTokens'), false)
    })
    assert.equal((await databaseModel.collection.findOne({ id: 'new' }))?.queryTokenReadyVersion, 1)
    assert.deepEqual((await recordModel.collection.findOne({ id: 'r' }))?.queryTokens, [{ p: 'dot.$', v: 'a'.repeat(256) }])
    await session.withTransaction(async () => {
      assert.ok(await databases.compareAndBump('w', 'new', 1, session))
      assert.ok(await records.updateProperties('w', 'new', 'r', 1, { 'dot.$': '😀'.repeat(128), long: 'b'.repeat(257) }, session))
    })
    const doc = await recordModel.collection.findOne({ id: 'r' })
    assert.equal(doc?.version, 2)
    assert.equal(doc?.queryTokenSourceVersion, 2)
    assert.deepEqual(doc?.queryTokens, [{ p: 'dot.$', v: '😀'.repeat(128) }])
    assert.equal((await databaseModel.collection.findOne({ id: 'new' }))?.queryTokenReadyVersion, 2)
    assert.equal(await databases.queryTokensReadyOrSchedule('w', 'new', 2), true)
    await assert.rejects(session.withTransaction(async () => {
      assert.ok(await databases.compareAndBump('w', 'new', 2, session))
      assert.ok(await records.updateProperties('w', 'new', 'r', 2, { 'dot.$': 'rolled-back' }, session))
      throw new Error('abort token mutation')
    }), /abort token mutation/)
    assert.equal((await databaseModel.collection.findOne({ id: 'new' }))?.queryTokenReadyVersion, 2)
    assert.equal((await recordModel.collection.findOne({ id: 'r' }))?.version, 2)
    assert.deepEqual((await recordModel.collection.findOne({ id: 'r' }))?.queryTokens, [{ p: 'dot.$', v: '😀'.repeat(128) }])
  } finally { await session.endSession() }
})

test('legacy database version writes never certify an absent ready marker', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => { assert.equal((await databases.compareAndBump('w', 'legacy', 1, session))?.version, 2) })
    await session.withTransaction(async () => { assert.equal((await databases.rename('w', 'legacy', 2, 'Renamed', session))?.version, 3) })
    const raw = await databaseModel.collection.findOne({ id: 'legacy' })
    assert.equal(raw?.version, 3)
    assert.equal(Object.hasOwn(raw!, 'queryTokenReadyVersion'), false)
  } finally { await session.endSession() }
})

test('a deleted and recreated database ID cannot inherit the old backfill certification', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseQueryTokenFinalizations> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'same', workspaceId: 'w', name: 'Old', version: 1, createdAt: now, updatedAt: now })
  const old = await databaseModel.collection.findOne({ id: 'same' })
  assert.ok(old)
  await recordModel.collection.insertOne({ id: 'old-row', workspaceId: 'w', databaseId: 'same', pageId: 'p', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  gate = pauseQueryTokenFinalizations(databaseModel, 1)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'same', 1), false)
  await gate.entered(0)
  await databaseModel.collection.deleteOne({ _id: old._id })
  await recordModel.collection.deleteOne({ id: 'old-row' })
  await databaseModel.collection.insertOne({ id: 'same', workspaceId: 'w', name: 'New', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'r', workspaceId: 'w', databaseId: 'same', pageId: 'p', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  gate.release(0)
  await eventually(async () => (databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.size === 0)
  assert.equal((await databaseModel.collection.findOne({ id: 'same' }))?.queryTokenReadyVersion, undefined)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'same', 1), false)
  await eventually(async () => (await databaseModel.collection.findOne({ id: 'same' }))?.queryTokenReadyVersion === 1)
  assert.deepEqual((await recordModel.collection.findOne({ id: 'r' }))?.queryTokens, [{ p: 'group', v: 'a' }])
})

test('a version advance before lease acquisition starts the original build at the current version', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseQueryTokenAcquisition> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'r', workspaceId: 'w', databaseId: 'legacy', pageId: 'p', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  gate = pauseQueryTokenAcquisition(databaseModel)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await gate.entered
  await databaseModel.collection.updateOne({ id: 'legacy', version: 1 }, { $inc: { version: 1 } })
  gate.release()
  await originalBuild
  const after = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(after?.version, 2)
  assert.equal(after?.queryTokenReadyVersion, 2, 'the first scheduled task acquired at the current version')
  assert.equal(after?.updatedAt?.toISOString(), now.toISOString())
  assert.deepEqual((await recordModel.collection.findOne({ id: 'r' }))?.queryTokens, [{ p: 'group', v: 'a' }])
})

test('a concurrently appended record before the scan cursor stays visible after certification', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseQueryTokenFinalizations> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'z', workspaceId: 'w', databaseId: 'legacy', pageId: 'pz', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  gate = pauseQueryTokenFinalizations(databaseModel, 1)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await gate.entered(0)
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      assert.ok(await databases.compareAndBump('w', 'legacy', 1, session))
      assert.ok(await records.updateProperties('w', 'legacy', 'z', 1, { group: 'b' }, session))
      await records.create({ id: 'a', workspaceId: 'w', databaseId: 'legacy', pageId: 'pa', properties: { group: 'a' },
        version: 1, creationOrdinal: 2 }, session)
    })
  } finally { await session.endSession() }
  const afterBusinessWrite = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(afterBusinessWrite?.queryTokenBuildSafeVersion, 2)
  gate.release(0)
  await originalBuild
  assert.equal((await databaseModel.collection.findOne({ id: 'legacy' }))?.queryTokenReadyVersion, 2, 'the original build certifies the final version')
  const a = await recordModel.collection.find({ workspaceId: 'w', databaseId: 'legacy', queryTokens: { $elemMatch: { p: 'group', v: 'a' } } }).toArray()
  const b = await recordModel.collection.find({ workspaceId: 'w', databaseId: 'legacy', queryTokens: { $elemMatch: { p: 'group', v: 'b' } } }).toArray()
  assert.deepEqual(a.map(row => row.id), ['a'])
  assert.deepEqual(b.map(row => row.id), ['z'])
  const finalized = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(finalized?.version, afterBusinessWrite?.version)
  assert.equal(finalized?.updatedAt?.toISOString(), afterBusinessWrite?.updatedAt?.toISOString())
})

test('an old writer permanently invalidates a build even after a newer writer advances the database', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseQueryTokenFinalizations> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await connection.db!.collection('pages').insertMany(['A', 'B'].map(id => ({ id: `p${id}`, workspaceId: 'w', title: id, createdAt: now, updatedAt: now })))
  await recordModel.collection.insertMany(['A', 'B'].map((id, index) => ({ id, workspaceId: 'w', databaseId: 'legacy', pageId: `p${id}`,
    properties: { group: index === 0 ? 'a' : 'b' }, version: 1, creationOrdinal: index + 1, createdAt: now, updatedAt: now })))
  gate = pauseQueryTokenFinalizations(databaseModel, 1)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  await gate.entered(0)
  // The old process does not maintain either token or build-safe metadata.
  await databaseModel.collection.updateOne({ id: 'legacy', version: 1 }, { $inc: { version: 1 } })
  await recordModel.collection.updateOne({ id: 'A' }, { $set: { properties: { group: 'b' } }, $inc: { version: 1 } })
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      assert.ok(await databases.compareAndBump('w', 'legacy', 2, session))
      assert.ok(await records.updateProperties('w', 'legacy', 'B', 1, { group: 'a' }, session))
    })
  } finally { await session.endSession() }
  const beforeFinalize = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(beforeFinalize?.version, 3)
  assert.equal(beforeFinalize?.queryTokenBuildSafeVersion, 1)
  gate.release(0)
  await eventually(async () => (databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.size === 0)
  const afterFinalize = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(afterFinalize?.queryTokenReadyVersion, undefined)
  assert.equal(afterFinalize?.version, 3)
  assert.equal(afterFinalize?.updatedAt?.toISOString(), beforeFinalize?.updatedAt?.toISOString())
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 3), false)
  const properties = [
    { id: 'title', workspaceId: 'w', databaseId: 'legacy', name: 'Title', type: 'title' as const, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'group', workspaceId: 'w', databaseId: 'legacy', name: 'Group', type: 'select' as const, options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
  for (const [optionId, expected] of [['a', 'B'], ['b', 'A']] as const) {
    const rows = await records.readManualWindow({ workspaceId: 'w', databaseId: 'legacy', scopeId: 'unused', manualActive: false,
      properties, filters: [], direction: 'after', take: 2, group: { propertyId: 'group', optionIds: ['a', 'b'], group: { kind: 'option', optionId } }, queryTokensReady: false })
    assert.deepEqual(rows.map(row => row.id), [expected])
  }
})

test('an expired lease can be taken over without the previous worker certifying or clearing its successor', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseQueryTokenFinalizations> | undefined
  let directTask: Promise<void> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection, directTask ? [directTask] : []) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'r', workspaceId: 'w', databaseId: 'legacy', pageId: 'p', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  const raw = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.ok(raw)
  const target = { _id: raw._id, workspaceId: 'w', id: 'legacy', version: 1 }
  const worker = databases as unknown as { backfillQueryTokens(input: typeof target): Promise<void>; queryTokenBackfills: Map<string, Promise<void>> }
  gate = pauseQueryTokenFinalizations(databaseModel, 2)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  await gate.entered(0)
  const first = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.ok(first?.queryTokenBuildId)
  assert.equal(first.queryTokenBuildSafeVersion, 1)
  assert.ok(first.queryTokenBuildLeaseUntil! > now)
  await worker.backfillQueryTokens(target)
  assert.equal((await databaseModel.collection.findOne({ id: 'legacy' }))?.queryTokenBuildId, first.queryTokenBuildId)
  await databaseModel.collection.updateOne({ id: 'legacy' }, { $set: { queryTokenBuildLeaseUntil: new Date(0) } })
  const secondTask = worker.backfillQueryTokens(target)
  directTask = secondTask
  await gate.entered(1)
  const second = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.ok(second?.queryTokenBuildId && second.queryTokenBuildId !== first.queryTokenBuildId)
  gate.release(0)
  await eventually(async () => worker.queryTokenBackfills.size === 0)
  const afterOld = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(afterOld?.queryTokenBuildId, second.queryTokenBuildId)
  assert.equal(afterOld?.queryTokenReadyVersion, undefined)
  gate.release(1)
  await secondTask
  const afterNew = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(afterNew?.queryTokenReadyVersion, 1)
  assert.equal(afterNew?.queryTokenBuildId, undefined)
  assert.equal(afterNew?.version, 1)
  assert.equal(afterNew?.updatedAt?.toISOString(), now.toISOString())
})

test('a slow in-flight write batch cannot start another batch after its lease is taken over', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let gate: ReturnType<typeof pauseFirstQueryTokenWriteBatch> | undefined
  t.after(async () => { gate?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertMany(Array.from({ length: 101 }, (_, index) => ({ id: `r${String(index).padStart(3, '0')}`,
    workspaceId: 'w', databaseId: 'legacy', pageId: `p${index}`, properties: { group: 'a' }, version: 1,
    creationOrdinal: index + 1, createdAt: now, updatedAt: now })))
  const raw = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.ok(raw)
  const target = { _id: raw._id, workspaceId: 'w', id: 'legacy', version: 1 }
  const worker = databases as unknown as { backfillQueryTokens(input: typeof target): Promise<void>; queryTokenBackfills: Map<string, Promise<void>> }
  gate = pauseFirstQueryTokenWriteBatch(recordModel)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const oldTask = [...worker.queryTokenBackfills.values()][0]
  assert.ok(oldTask)
  await gate.entered
  await databaseModel.collection.updateOne({ id: 'legacy' }, { $set: { queryTokenBuildLeaseUntil: new Date(0) } })
  await worker.backfillQueryTokens(target)
  assert.equal((await databaseModel.collection.findOne({ id: 'legacy' }))?.queryTokenReadyVersion, 1)
  gate.release()
  await oldTask
  assert.equal(gate.calls(), 4, 'the old worker issued only its one already in-flight batch')
  assert.equal(await recordModel.collection.countDocuments({ workspaceId: 'w', databaseId: 'legacy', queryTokens: { $elemMatch: { p: 'group', v: 'a' } } }), 101)
})

test('new writers with increasing IDs do not extend the original build beyond its upper ID', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let hook: ReturnType<typeof beforeQueryTokenScan> | undefined
  t.after(async () => { hook?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertMany(Array.from({ length: 501 }, (_, index) => ({ id: `r${String(index).padStart(3, '0')}`,
    workspaceId: 'w', databaseId: 'legacy', pageId: `p${index}`, properties: { group: 'a' }, version: 1,
    creationOrdinal: index + 1, createdAt: now, updatedAt: now })))
  hook = beforeQueryTokenScan(recordModel, async number => {
    if (number > 6) return
    const current = await databases.findInWorkspace('w', 'legacy')
    assert.ok(current)
    const session = await connection.startSession()
    try {
      await session.withTransaction(async () => {
        assert.ok(await databases.compareAndBump('w', 'legacy', current.version, session))
        await records.create({ id: `r${String(500 + number).padStart(3, '0')}`, workspaceId: 'w', databaseId: 'legacy',
          pageId: `new-p${number}`, properties: { group: 'a' }, version: 1, creationOrdinal: 501 + number }, session)
      })
    } finally { await session.endSession() }
  })
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await originalBuild
  const finished = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(hook.scans(), 3, '500 + 1 initial rows require two bounded pages and one empty page')
  assert.equal(finished?.version, 4)
  assert.equal(finished?.queryTokenReadyVersion, 4, 'the original build certifies after continuous new writes')
  assert.equal(await recordModel.collection.countDocuments({ workspaceId: 'w', databaseId: 'legacy', queryTokens: { $elemMatch: { p: 'group', v: 'a' } } }), 504)
})

test('complete new records cannot fill the bounded pending-token scan window', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let hook: ReturnType<typeof beforeQueryTokenScan> | undefined
  t.after(async () => { hook?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const records = app.get(DatabaseRecordRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  await Promise.all([databaseModel.init(), recordModel.init()])
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertMany([
    ...Array.from({ length: 500 }, (_, index) => ({ id: `a${String(index).padStart(3, '0')}`, workspaceId: 'w', databaseId: 'legacy',
      pageId: `p${index}`, properties: { group: 'a' }, version: 1, creationOrdinal: index + 1, createdAt: now, updatedAt: now })),
    { id: 'z', workspaceId: 'w', databaseId: 'legacy', pageId: 'pz', properties: { group: 'a' }, version: 1,
      creationOrdinal: 501, createdAt: now, updatedAt: now },
  ])
  hook = beforeQueryTokenScan(recordModel, async number => {
    if (number !== 2 && number !== 3) return
    const prefix = number === 2 ? 'm' : 'n'
    const current = await databases.findInWorkspace('w', 'legacy')
    assert.ok(current)
    const session = await connection.startSession()
    try {
      await session.withTransaction(async () => {
        assert.ok(await databases.compareAndBump('w', 'legacy', current.version, session))
        for (let index = 0; index < 500; index++) await records.create({ id: `${prefix}${String(index).padStart(3, '0')}`,
          workspaceId: 'w', databaseId: 'legacy', pageId: `${prefix}-p${index}`, properties: { group: 'a' }, version: 1,
          creationOrdinal: 502 + (number - 2) * 500 + index }, session)
      })
    } finally { await session.endSession() }
  })
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await originalBuild
  assert.equal(hook.scans(), 3, 'complete new rows never occupy the pending-token limit')
  const finished = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(finished?.version, 3)
  assert.equal(finished?.queryTokenReadyVersion, 3)
  assert.equal(await recordModel.collection.countDocuments({ workspaceId: 'w', databaseId: 'legacy', queryTokens: { $elemMatch: { p: 'group', v: 'a' } } }), 1501)
  const filter = { workspaceId: 'w', databaseId: 'legacy', id: { $gt: 'a499', $lte: 'z' }, $or: [
    { queryTokenSourceVersion: { $exists: false } }, { $expr: { $ne: ['$queryTokenSourceVersion', '$version'] } },
  ] }
  const explain = await recordModel.collection.find(filter, { projection: { id: 1 }, collation: { locale: 'simple' } })
    .sort({ id: 1 }).limit(500).explain('executionStats')
  const indexes: string[] = []
  const stages: string[] = []
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if (typeof node.stage === 'string') stages.push(node.stage)
    if (typeof node.indexName === 'string') indexes.push(node.indexName)
    for (const child of Object.values(node)) if (child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(explain.queryPlanner.winningPlan)
  assert.ok(stages.includes('IXSCAN'), JSON.stringify(stages))
  assert.ok(indexes.includes('workspaceId_1_databaseId_1_id_1'), JSON.stringify(indexes))
  assert.equal(stages.includes('SORT'), false, JSON.stringify(stages))
})

test('an old writer inserting above the fixed upper ID invalidates the original build', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  let hook: ReturnType<typeof beforeQueryTokenScan> | undefined
  t.after(async () => { hook?.restore(); await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const recordModel = app.get<Model<DatabaseRecordEntity>>(getModelToken(DatabaseRecordEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'legacy', workspaceId: 'w', name: 'Legacy', version: 1, createdAt: now, updatedAt: now })
  await recordModel.collection.insertOne({ id: 'r0', workspaceId: 'w', databaseId: 'legacy', pageId: 'p0', properties: { group: 'a' },
    version: 1, creationOrdinal: 1, createdAt: now, updatedAt: now })
  hook = beforeQueryTokenScan(recordModel, async number => {
    if (number !== 1) return
    await databaseModel.collection.updateOne({ id: 'legacy', version: 1 }, { $inc: { version: 1 } })
    await recordModel.collection.insertOne({ id: 'r1', workspaceId: 'w', databaseId: 'legacy', pageId: 'p1', properties: { group: 'a' },
      version: 1, creationOrdinal: 2, createdAt: now, updatedAt: now })
  })
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await originalBuild
  const finished = await databaseModel.collection.findOne({ id: 'legacy' })
  assert.equal(finished?.version, 2)
  assert.equal(finished?.queryTokenReadyVersion, undefined)
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'legacy', 2), false)
  assert.equal(await recordModel.collection.countDocuments({ workspaceId: 'w', databaseId: 'legacy', 'properties.group': 'a' }), 2)
})

test('an empty legacy database can certify without scanning a record window', async t => {
  const app = await createIsolatedApp()
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => { await cleanupIsolatedApp(app, connection) })
  const databases = app.get(DatabaseRepository)
  const databaseModel = app.get<Model<DatabaseEntity>>(getModelToken(DatabaseEntity.name))
  const now = new Date()
  await databaseModel.collection.insertOne({ id: 'empty', workspaceId: 'w', name: 'Empty', version: 1, createdAt: now, updatedAt: now })
  assert.equal(await databases.queryTokensReadyOrSchedule('w', 'empty', 1), false)
  const originalBuild = [...(databases as unknown as { queryTokenBackfills: Map<string, Promise<void>> }).queryTokenBackfills.values()][0]
  assert.ok(originalBuild)
  await originalBuild
  assert.equal((await databaseModel.collection.findOne({ id: 'empty' }))?.queryTokenReadyVersion, 1)
})

test('HTTP record create and cell update accept empty Text without storing an empty token', async t => {
  const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
  assert.equal(uri.port, '55778', 'this test must use the isolated MongoDB instance')
  uri.pathname = `/eotion_query_token_${randomUUID().replaceAll('-', '')}`
  @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri.toString()), HttpApiModule] })
  class QueryTokenHttpModule {}
  const previousMongo = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  const app = await NestFactory.create(QueryTokenHttpModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  await app.listen(0, '127.0.0.1')
  const address = app.getHttpServer().address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => {
    try { await cleanupIsolatedApp(app, connection) } finally {
      if (previousMongo === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousMongo
      if (previousOrigin === undefined) delete process.env.WEB_ORIGIN
      else process.env.WEB_ORIGIN = previousOrigin
    }
  })
  const request = async (path: string, method = 'GET', body?: unknown, cookie?: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: {
      ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, headers: response.headers, body: await response.json() as Record<string, any> }
  }
  const suffix = randomUUID().replaceAll('-', '')
  const owner = { email: `empty-token-${suffix}@example.test`, password: 'correct horse battery staple' }
  assert.equal((await request('/api/auth/register', 'POST', owner)).status, 201)
  const login = await request('/api/auth/login', 'POST', owner)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const workspaceId = `ws-${suffix}`
  const rootId = `root-${suffix}`
  const databaseId = `db-${suffix}`
  const textId = `text-${suffix}`
  const recordId = `record-${suffix}`
  const ws = `/api/workspaces/${workspaceId}`
  const db = `${ws}/databases/${databaseId}`
  assert.equal((await request('/api/workspaces', 'POST', { id: workspaceId, name: 'Empty token' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages`, 'POST', { id: rootId, parentPageId: null, title: 'Root', orderKey: 'a' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages/${rootId}/databases`, 'POST', { id: databaseId, name: 'DB', titlePropertyId: `title-${suffix}`,
    viewId: `view-${suffix}`, blockId: `block-${suffix}`, orderKey: 'a', parentBlockId: null }, cookie)).status, 201)
  const property = await request(`${db}/properties`, 'POST', { id: textId, name: 'Text', type: 'text', expectedDatabaseVersion: 1 }, cookie)
  assert.equal(property.status, 201, JSON.stringify(property.body))
  const created = await request(`${db}/records`, 'POST', { id: recordId, pageId: `page-${suffix}`, title: 'Row', orderKey: 'b',
    properties: { [textId]: '' } }, cookie)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal(created.body.record.properties[textId], '')
  let raw = await connection.db!.collection('database_records').findOne({ id: recordId })
  assert.deepEqual(raw?.queryTokens, [])
  const current = await request(`${db}/views/view-${suffix}/records?limit=10`, 'GET', undefined, cookie)
  assert.equal(current.status, 200, JSON.stringify(current.body))
  const updated = await request(`${db}/records/${recordId}/cells/${textId}`, 'PATCH', { value: 'filled',
    expectedDatabaseVersion: current.body.database.version, expectedRecordVersion: created.body.record.version }, cookie)
  assert.equal(updated.status, 200, JSON.stringify(updated.body))
  raw = await connection.db!.collection('database_records').findOne({ id: recordId })
  assert.deepEqual(raw?.queryTokens, [{ p: textId, v: 'filled' }])
  const emptied = await request(`${db}/records/${recordId}/cells/${textId}`, 'PATCH', { value: '',
    expectedDatabaseVersion: updated.body.database.version, expectedRecordVersion: updated.body.record.version }, cookie)
  assert.equal(emptied.status, 200, JSON.stringify(emptied.body))
  assert.equal(emptied.body.record.properties[textId], '')
  raw = await connection.db!.collection('database_records').findOne({ id: recordId })
  assert.deepEqual(raw?.queryTokens, [])
})
