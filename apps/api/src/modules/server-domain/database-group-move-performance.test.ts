import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'
import { HttpApiModule } from '../http-api/http-api.module'
import { DatabaseRepository } from './repositories/database.repository'

test('grouped reorder and unanchored group move use ready Select tokens and retain exact fallback', async t => {
  const configured = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!configured) throw new Error('P4_TEST_MONGODB_URI must explicitly name the isolated MongoDB')
  const uri = new URL(configured)
  uri.pathname = `/eotion_group_move_probe_${randomUUID().replaceAll('-', '')}`
  @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri.toString()), HttpApiModule] })
  class GroupMovePerformanceModule {}
  const previousMongo = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  const app = await NestFactory.create(GroupMovePerformanceModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  await app.listen(0, '127.0.0.1')
  const address = app.getHttpServer().address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => {
    try {
      await app.get(DatabaseRepository).onModuleDestroy()
      await connection.dropDatabase()
    } finally {
      await app.close()
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
  const owner = { email: `group-move-${suffix}@example.test`, password: 'correct horse battery staple' }
  assert.equal((await request('/api/auth/register', 'POST', owner)).status, 201)
  const login = await request('/api/auth/login', 'POST', owner)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const workspaceId = `ws-${suffix}`
  const rootId = `root-${suffix}`
  const databaseId = `db-${suffix}`
  const statusId = `status-${suffix}`
  const viewId = `board-${suffix}`
  const ws = `/api/workspaces/${workspaceId}`
  const db = `${ws}/databases/${databaseId}`
  const now = new Date()
  assert.equal((await request('/api/workspaces', 'POST', { id: workspaceId, name: 'Group move probe' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages`, 'POST', { id: rootId, parentPageId: null, title: 'Root', orderKey: 'a' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages/${rootId}/databases`, 'POST', { id: databaseId, name: 'DB', titlePropertyId: `title-${suffix}`,
    viewId: `table-${suffix}`, blockId: `block-${suffix}`, orderKey: 'a', parentBlockId: null }, cookie)).status, 201)
  const property = await request(`${db}/properties`, 'POST', { id: statusId, name: 'Status', type: 'select',
    options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'empty', name: 'Empty' }], expectedDatabaseVersion: 1 }, cookie)
  assert.equal(property.status, 201, JSON.stringify(property.body))
  const board = await request(`${db}/views`, 'POST', { id: viewId, name: 'Board', type: 'board',
    config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: statusId } },
    expectedDatabaseVersion: property.body.database.version }, cookie)
  assert.equal(board.status, 201, JSON.stringify(board.body))
  const recordCollection = connection.db!.collection('database_records')
  const pageCollection = connection.db!.collection('pages')
  const count = 2_000
  const id = (index: number) => `record-${String(index).padStart(5, '0')}`
  for (let baseIndex = 0; baseIndex < count; baseIndex += 500) {
    const indexes = Array.from({ length: Math.min(500, count - baseIndex) }, (_, offset) => baseIndex + offset)
    await pageCollection.insertMany(indexes.map(index => ({ id: `page-${index}`, workspaceId, title: `Row ${index}`,
      createdAt: now, updatedAt: now })))
    await recordCollection.insertMany(indexes.map(index => {
      const option = index === 10 || index === 1_000 ? 'a' : index === 1_999 ? undefined : 'b'
      return { id: id(index), workspaceId, databaseId, pageId: `page-${index}`,
        properties: option ? { [statusId]: option } : {},
        queryTokens: option ? [{ p: statusId, v: option }] : [], queryTokenSourceVersion: 1,
        version: 1, creationOrdinal: index + 1, createdAt: now, updatedAt: now }
    }))
  }
  const databaseCollection = connection.db!.collection('databases')
  const initialDatabase = await databaseCollection.findOne({ id: databaseId })
  assert.ok(initialDatabase)
  assert.equal(initialDatabase?.queryTokenReadyVersion, initialDatabase?.version)
  const reorderBody = (databaseVersion: number, viewVersion: number) => ({ recordId: id(1_000), anchorRecordId: id(10),
    placement: 'after', expectedDatabaseVersion: databaseVersion, expectedViewVersion: viewVersion })
  const reorderPath = `${db}/views/${viewId}/record-order`
  const measure = async (name: string, path: string, body: unknown) => {
    await connection.db!.command({ profile: 2, slowms: 0 })
    const started = new Date()
    const timer = performance.now()
    let response: Awaited<ReturnType<typeof request>>
    try { response = await request(path, 'POST', body, cookie) } finally { await connection.db!.command({ profile: 0 }) }
    const elapsedMs = Number((performance.now() - timer).toFixed(2))
    assert.equal(response.status, 200, `${name}: ${JSON.stringify(response.body)}`)
    const profile = await connection.db!.collection('system.profile').find({ ts: { $gte: started },
      ns: `${connection.db!.databaseName}.database_records`, 'command.aggregate': 'database_records' }).toArray()
    const candidateQueries = profile.filter(entry => Array.isArray(entry.command?.pipeline)
      && entry.command.pipeline.some((stage: Record<string, unknown>) => stage.$limit === 257))
    const tokenQueries = candidateQueries.filter(entry => entry.command.pipeline.some((stage: Record<string, any>) => stage.$match?.queryTokens?.$elemMatch))
    return { response, elapsedMs, candidateQueries, tokenQueries,
      candidateDocs: candidateQueries.reduce((sum, entry) => sum + (entry.docsExamined ?? 0), 0),
      candidateKeys: candidateQueries.reduce((sum, entry) => sum + (entry.keysExamined ?? 0), 0) }
  }
  const ready = await measure('ready sparse reorder', reorderPath, reorderBody(initialDatabase.version, board.body.view.version))
  assert.ok(ready.tokenQueries.length > 0, 'ready source group uses Select token candidate query')
  assert.ok(ready.tokenQueries.some(entry => String(entry.planSummary).includes('queryTokens.p')), 'Mongo selects the token index')
  assert.equal(ready.response.body.database.version, initialDatabase.version, 'adjacent visible reorder is a no-op')
  assert.equal(ready.response.body.view.version, board.body.view.version)
  const groupRead = async (optionId: string) => request(`${db}/views/${viewId}/group-records?groupKind=option&optionId=${optionId}&limit=10`, 'GET', undefined, cookie)
  assert.deepEqual((await groupRead('a')).body.records.map((row: { id: string }) => row.id), [id(10), id(1_000)])
  const source = await recordCollection.findOne({ id: id(1_999) })
  const move = await measure('ready empty target tail', `${db}/views/${viewId}/record-group`, { recordId: id(1_999),
    sourceGroup: { kind: 'ungrouped' }, targetGroup: { kind: 'option', optionId: 'empty' },
    expectedDatabaseVersion: initialDatabase.version, expectedViewVersion: board.body.view.version,
    expectedRecordVersion: source!.version })
  assert.ok(move.tokenQueries.length > 0, 'empty target tail uses the Select token candidate query')
  assert.ok(move.tokenQueries.some(entry => (entry.docsExamined ?? 0) === 0), 'empty indexed option examines no Records')
  assert.equal(move.response.body.database.version, initialDatabase.version + 1)
  assert.equal(move.response.body.view.version, board.body.view.version + 1)
  assert.equal(move.response.body.record.version, source!.version + 1)
  assert.deepEqual((await groupRead('empty')).body.records.map((row: { id: string }) => row.id), [id(1_999)])
  assert.deepEqual((await recordCollection.findOne({ id: id(1_999) }))?.queryTokens, [{ p: statusId, v: 'empty' }])
  const beforeConflict = await recordCollection.findOne({ id: id(1_999) })
  const conflict = await request(`${db}/views/${viewId}/record-group`, 'POST', { recordId: id(1_999),
    sourceGroup: { kind: 'ungrouped' }, targetGroup: { kind: 'option', optionId: 'a' },
    expectedDatabaseVersion: initialDatabase.version, expectedViewVersion: board.body.view.version,
    expectedRecordVersion: source!.version }, cookie)
  assert.equal(conflict.status, 409)
  assert.deepEqual(await recordCollection.findOne({ id: id(1_999) }), beforeConflict, 'failed CAS leaves Record and token unchanged')
  const currentDatabase = await databaseCollection.findOne({ id: databaseId })
  await databaseCollection.updateOne({ id: databaseId }, { $unset: { queryTokenReadyVersion: '' } })
  await recordCollection.updateMany({ workspaceId, databaseId }, { $unset: { queryTokens: '', queryTokenSourceVersion: '' } })
  const fallback = await measure('missing marker sparse reorder', reorderPath,
    reorderBody(currentDatabase!.version, move.response.body.view.version))
  assert.equal(fallback.tokenQueries.length, 0, 'missing marker must use the exact legacy predicate')
  assert.equal(fallback.response.body.database.version, currentDatabase!.version)
  assert.equal(fallback.response.body.view.version, move.response.body.view.version)
  const fallbackGroup = await recordCollection.find({ workspaceId, databaseId, [`properties.${statusId}`]: 'a' },
    { projection: { _id: 0, id: 1 } }).sort({ creationOrdinal: 1 }).toArray()
  assert.deepEqual(fallbackGroup.map(row => row.id), [id(10), id(1_000)], 'missing marker keeps the canonical Select values')
  assert.ok(fallback.candidateDocs > ready.candidateDocs * 5, `fallback ${fallback.candidateDocs} vs ready ${ready.candidateDocs}`)
  await databaseCollection.updateOne({ id: databaseId }, { $set: { queryTokenReadyVersion: currentDatabase!.version - 1 } })
  await recordCollection.updateMany({ workspaceId, databaseId }, { $unset: { queryTokens: '', queryTokenSourceVersion: '' } })
  const stale = await measure('stale marker sparse reorder', reorderPath,
    reorderBody(currentDatabase!.version, move.response.body.view.version))
  assert.equal(stale.tokenQueries.length, 0, 'stale marker must use the exact legacy predicate')
  assert.equal(stale.response.body.database.version, currentDatabase!.version)
  assert.equal(stale.response.body.view.version, move.response.body.view.version)
  const staleGroup = await groupRead('a')
  assert.equal(staleGroup.status, 200, JSON.stringify(staleGroup.body))
  assert.deepEqual(staleGroup.body.records.map((row: { id: string }) => row.id), [id(10), id(1_000)])
  assert.ok(stale.candidateDocs > ready.candidateDocs * 5, `stale ${stale.candidateDocs} vs ready ${ready.candidateDocs}`)
  console.log(JSON.stringify({ groupMovePerformance: { count,
    ready: { elapsedMs: ready.elapsedMs, candidateDocs: ready.candidateDocs, candidateKeys: ready.candidateKeys },
    emptyTarget: { elapsedMs: move.elapsedMs, candidateDocs: move.candidateDocs, candidateKeys: move.candidateKeys },
    missingMarker: { elapsedMs: fallback.elapsedMs, candidateDocs: fallback.candidateDocs, candidateKeys: fallback.candidateKeys },
    staleMarker: { elapsedMs: stale.elapsedMs, candidateDocs: stale.candidateDocs, candidateKeys: stale.candidateKeys },
    note: 'Local request timings are not latency SLOs; candidate scans are isolated from the full transactional request.' } }))
})
