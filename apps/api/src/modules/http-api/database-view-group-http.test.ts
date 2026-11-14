import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'
import { DatabaseViewGroupRecordsResponseSchema, DatabaseViewRecordGroupMoveResponseSchema } from '@eotion/contracts'
import { HttpApiModule } from './http-api.module'
import { DatabaseService } from '../server-domain/services/database.service'
import { DatabaseViewOrderRepository } from '../server-domain/repositories/database-view-order.repository'
import { UserRepository } from '../server-domain/repositories/user.repository'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
uri.pathname = `/eotion_view_group_http_${randomUUID().replaceAll('-', '')}`
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri.toString()), HttpApiModule] })
class GroupHttpTestModule {}

test('generic grouped View windows and atomic Select moves use real HTTP and Mongo', async t => {
  const previousMongo = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  const app = await NestFactory.create(GroupHttpTestModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  await app.listen(0, '127.0.0.1')
  const address = app.getHttpServer().address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const connection = app.get<Connection>(getConnectionToken())
  t.after(async () => {
    try { await connection.dropDatabase() } finally {
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
  const owner = { email: `group-${suffix}@example.test`, password: 'correct horse battery staple' }
  assert.equal((await request('/api/auth/register', 'POST', owner)).status, 201)
  const login = await request('/api/auth/login', 'POST', owner)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const workspaceId = `group-ws-${suffix}`
  const rootId = `group-root-${suffix}`
  const databaseId = `group-db-${suffix}`
  const titleId = `group-title-${suffix}`
  const viewId = `group-view-${suffix}`
  const flagId = `group-flag-${suffix}`
  const ws = `/api/workspaces/${workspaceId}`
  const db = `${ws}/databases/${databaseId}`
  assert.equal((await request('/api/workspaces', 'POST', { id: workspaceId, name: 'Groups' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages`, 'POST', { id: rootId, parentPageId: null, title: 'Root', orderKey: 'a' }, cookie)).status, 201)
  assert.equal((await request(`${ws}/pages/${rootId}/databases`, 'POST', { id: databaseId, name: 'DB', titlePropertyId: titleId, viewId, blockId: `group-block-${suffix}`, orderKey: 'a', parentBlockId: null }, cookie)).status, 201)
  const read = async (groupKind: 'option' | 'ungrouped', optionId?: string, cursor?: string, view = viewId, limit = 1) => {
    const query = new URLSearchParams({ groupKind, limit: String(limit), ...(optionId ? { optionId } : {}), ...(cursor ? { cursor } : {}) })
    return request(`${db}/views/${view}/group-records?${query}`, 'GET', undefined, cookie)
  }
  const records = async () => request(`${db}/views/${viewId}/records?limit=100`, 'GET', undefined, cookie)
  let state = await records()
  const flag = await request(`${db}/properties`, 'POST', { id: flagId, name: 'Status', type: 'select', options: [
    { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'empty', name: 'Empty' },
  ], expectedDatabaseVersion: state.body.database.version }, cookie)
  assert.equal(flag.status, 201, JSON.stringify(flag.body))
  const createdView = await request(`${db}/views`, 'POST', { id: `board-${suffix}`, name: 'Board', type: 'board',
    config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: flagId } },
    expectedDatabaseVersion: flag.body.database.version }, cookie)
  assert.equal(createdView.status, 201, JSON.stringify(createdView.body))
  const boardId = createdView.body.view.id as string
  const ids = ['a-first', 'b-first', 'a-second', 'ungrouped', 'b-second'].map(id => `${id}-${suffix}`)
  for (const [index, id] of ids.entries()) {
    const value = index === 0 || index === 2 ? 'a' : index === 1 || index === 4 ? 'b' : null
    const created = await request(`${db}/records`, 'POST', { id, pageId: `${id}-page`, title: id, orderKey: id,
      ...(value ? { properties: { [flagId]: value } } : {}) }, cookie)
    assert.equal(created.status, 201, JSON.stringify(created.body))
  }
  const firstA = await read('option', 'a', undefined, boardId)
  assert.equal(firstA.status, 200, JSON.stringify(firstA.body))
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse(firstA.body).success, true)
  assert.deepEqual(firstA.body.records.map((row: any) => row.id), [ids[0]])
  const secondA = await read('option', 'a', firstA.body.nextCursor, boardId)
  assert.deepEqual(secondA.body.records.map((row: any) => row.id), [ids[2]])
  assert.equal(secondA.body.nextCursor, null)
  assert.deepEqual((await read('option', 'empty', undefined, boardId)).body.records, [])
  const crossed = await read('option', 'b', firstA.body.nextCursor, boardId)
  assert.equal(crossed.status, 409)
  assert.deepEqual((await read('ungrouped', undefined, undefined, boardId)).body.records.map((row: any) => row.id), [ids[3]])
  const filteredView = await request(`${db}/views`, 'POST', { id: `filtered-${suffix}`, name: 'Filtered', type: 'board',
    config: { filters: [{ propertyId: titleId, operator: 'contains', value: 'first' }], sorts: [{ propertyId: titleId, direction: 'desc' }],
      visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: flagId } },
    expectedDatabaseVersion: firstA.body.database.version }, cookie)
  assert.equal(filteredView.status, 201, JSON.stringify(filteredView.body))
  assert.deepEqual((await read('option', 'a', undefined, filteredView.body.view.id, 10)).body.records.map((row: any) => row.id), [ids[0]])
  assert.deepEqual((await read('option', 'b', undefined, filteredView.body.view.id, 10)).body.records.map((row: any) => row.id), [ids[1]])
  const ownerUser = await app.get(UserRepository).findAuthenticationByEmail(owner.email)
  assert.ok(ownerUser)
  const temporary = await app.get(DatabaseService).getViewGroupRecords(ownerUser.user.id, workspaceId, databaseId, boardId,
    { groupKind: 'option', optionId: 'a', limit: 10 }, { filters: [{ propertyId: titleId, operator: 'contains', value: 'second' }] })
  assert.deepEqual(temporary.records.map(row => row.id), [ids[2]], 'temporary filters apply before the grouped limit')
  assert.equal((await request(`${db}/views/${filteredView.body.view.id}/record-group`, 'POST', {
    recordId: ids[2], sourceGroup: { kind: 'option', optionId: 'a' }, targetGroup: { kind: 'option', optionId: 'b' },
    expectedDatabaseVersion: filteredView.body.database.version, expectedViewVersion: filteredView.body.view.version,
    expectedRecordVersion: (await records()).body.records.find((row: any) => row.id === ids[2]).version,
  }, cookie)).status, 409, 'hidden source cannot be moved through a filtered view')
  // A corrupt historical Select value must remain queryable as ungrouped and validate as a public response.
  await connection.db!.collection('database_records').updateOne({ id: ids[3] }, { $set: { [`properties.${flagId}`]: 'retired-option' } })
  const invalidGroup = await read('ungrouped', undefined, undefined, boardId)
  assert.equal(invalidGroup.status, 200, JSON.stringify(invalidGroup.body))
  assert.equal(invalidGroup.body.records[0].properties[flagId], null)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse(invalidGroup.body).success, true)
  const stableGroupVersion = (await read('option', 'a', undefined, boardId, 10)).body
  for (const invalidValue of [42, ['a']]) {
    await connection.db!.collection('database_records').updateOne({ id: ids[3] }, { $set: { [`properties.${flagId}`]: invalidValue } })
    const rejected = await read('ungrouped', undefined, undefined, boardId)
    assert.equal(rejected.status, 409, `invalid Select ${JSON.stringify(invalidValue)} must fail closed instead of returning an invalid 200 response`)
    const unchanged = (await read('option', 'a', undefined, boardId, 10)).body
    assert.equal(unchanged.database.version, stableGroupVersion.database.version)
    assert.equal(unchanged.view.version, stableGroupVersion.view.version)
  }
  await connection.db!.collection('database_records').updateOne({ id: ids[3] }, { $set: { [`properties.${flagId}`]: 'retired-option' } })
  const repairedProjection = await read('ungrouped', undefined, undefined, boardId)
  assert.equal(repairedProjection.status, 200)
  assert.equal(repairedProjection.body.records[0].properties[flagId], null)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse(repairedProjection.body).success, true)
  const boardState = await read('option', 'a', undefined, boardId, 10)
  const moveBody = { recordId: ids[3], sourceGroup: { kind: 'ungrouped' }, targetGroup: { kind: 'option', optionId: 'a' },
    anchorRecordId: ids[2], placement: 'before', expectedDatabaseVersion: boardState.body.database.version,
    expectedViewVersion: boardState.body.view.version, expectedRecordVersion: invalidGroup.body.records[0].version }
  const moved = await request(`${db}/views/${boardId}/record-group`, 'POST', moveBody, cookie)
  assert.equal(moved.status, 200, JSON.stringify(moved.body))
  assert.equal(DatabaseViewRecordGroupMoveResponseSchema.safeParse(moved.body).success, true)
  assert.deepEqual((await read('option', 'a', undefined, boardId, 10)).body.records.map((row: any) => row.id), [ids[0], ids[3], ids[2]])
  const pagedGroup: string[] = []
  let groupCursor: string | null = null
  do {
    const page = await read('option', 'a', groupCursor ?? undefined, boardId, 1)
    assert.equal(page.status, 200, JSON.stringify(page.body))
    pagedGroup.push(...page.body.records.map((row: any) => row.id))
    groupCursor = page.body.nextCursor
  } while (groupCursor)
  assert.deepEqual(pagedGroup, [ids[0], ids[3], ids[2]], 'group cursor crosses a manually inserted same-slot position')
  assert.equal((await read('option', 'b', firstA.body.nextCursor, boardId)).status, 409)
  assert.equal((await read('ungrouped', undefined, undefined, boardId)).body.records.length, 0)
  const aAfterMove = await read('option', 'a', undefined, boardId, 10)
  const adjacentNoOp = await request(`${db}/views/${boardId}/record-order`, 'POST', { recordId: ids[0], anchorRecordId: ids[3], placement: 'before',
    expectedDatabaseVersion: aAfterMove.body.database.version, expectedViewVersion: aAfterMove.body.view.version }, cookie)
  assert.equal(adjacentNoOp.status, 200)
  assert.equal(adjacentNoOp.body.database.version, aAfterMove.body.database.version)
  assert.equal(adjacentNoOp.body.view.version, aAfterMove.body.view.version)
  assert.equal((await request(`${db}/views/${boardId}/record-group`, 'POST', moveBody, cookie)).status, 409)
  const otherGroup = await request(`${db}/views/${boardId}/record-order`, 'POST', { recordId: ids[0], anchorRecordId: ids[1], placement: 'before',
    expectedDatabaseVersion: moved.body.database.version, expectedViewVersion: moved.body.view.version }, cookie)
  assert.equal(otherGroup.status, 409, 'same-group order endpoint rejects a cross-group anchor')
  const orders = app.get(DatabaseViewOrderRepository)
  const put = orders.putOverride.bind(orders)
  orders.putOverride = async () => { throw new Error('injected group order failure') }
  try {
    const stateBeforeFailure = await read('option', 'b', undefined, boardId, 10)
    const source = stateBeforeFailure.body.records[0]
    await assert.rejects(app.get(DatabaseService).moveViewRecordGroup((await app.get(UserRepository).findAuthenticationByEmail(owner.email))!.user.id,
      workspaceId, databaseId, boardId, { recordId: source.id, sourceGroup: { kind: 'option', optionId: 'b' }, targetGroup: { kind: 'option', optionId: 'a' },
        anchorRecordId: ids[0], placement: 'before', expectedDatabaseVersion: stateBeforeFailure.body.database.version,
        expectedViewVersion: stateBeforeFailure.body.view.version, expectedRecordVersion: source.version }), /injected group order failure/)
    const unchanged = await read('option', 'b', undefined, boardId, 10)
    assert.equal(unchanged.body.database.version, stateBeforeFailure.body.database.version)
    assert.equal(unchanged.body.view.version, stateBeforeFailure.body.view.version)
    assert.equal(unchanged.body.records[0].id, source.id)
  } finally { orders.putOverride = put }
  const bBeforeEmpty = await read('option', 'b', undefined, boardId, 10)
  const bLast = bBeforeEmpty.body.records[1]
  const toEmpty = await request(`${db}/views/${boardId}/record-group`, 'POST', { recordId: bLast.id,
    sourceGroup: { kind: 'option', optionId: 'b' }, targetGroup: { kind: 'option', optionId: 'empty' },
    expectedDatabaseVersion: bBeforeEmpty.body.database.version, expectedViewVersion: bBeforeEmpty.body.view.version,
    expectedRecordVersion: bLast.version }, cookie)
  assert.equal(toEmpty.status, 200, JSON.stringify(toEmpty.body))
  assert.deepEqual((await read('option', 'empty', undefined, boardId, 10)).body.records.map((row: any) => row.id), [bLast.id])
  assert.equal((await request(`${db}/views/${boardId}/record-group`, 'POST', {
    recordId: ids[0], sourceGroup: { kind: 'option', optionId: 'a' }, targetGroup: { kind: 'option', optionId: 'missing' },
    expectedDatabaseVersion: toEmpty.body.database.version, expectedViewVersion: toEmpty.body.view.version,
    expectedRecordVersion: (await read('option', 'a', undefined, boardId, 10)).body.records[0].version,
  }, cookie)).status, 400)
  assert.equal((await request(`${db}/views/${boardId}/record-group`, 'POST', {
    recordId: ids[0], sourceGroup: { kind: 'option', optionId: 'a' }, targetGroup: { kind: 'option', optionId: 'b' },
    expectedDatabaseVersion: toEmpty.body.database.version, expectedViewVersion: toEmpty.body.view.version,
    expectedRecordVersion: (await read('option', 'a', undefined, boardId, 10)).body.records[0].version,
  })).status, 401)
  const raceState = await read('option', 'a', undefined, boardId, 10)
  const raceSource = raceState.body.records[0]
  const race = await Promise.all(['b', 'empty'].map(optionId => request(`${db}/views/${boardId}/record-group`, 'POST', {
    recordId: raceSource.id, sourceGroup: { kind: 'option', optionId: 'a' }, targetGroup: { kind: 'option', optionId },
    expectedDatabaseVersion: raceState.body.database.version, expectedViewVersion: raceState.body.view.version,
    expectedRecordVersion: raceSource.version,
  }, cookie)))
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409], 'concurrent cross-group moves cannot both commit')
  const sortedBefore = await read('option', 'b', undefined, filteredView.body.view.id, 10)
  const sortedSource = sortedBefore.body.records.find((row: any) => row.id === ids[1])
  assert.ok(sortedSource)
  const sortedAnchored = await request(`${db}/views/${filteredView.body.view.id}/record-group`, 'POST', {
    recordId: sortedSource.id, sourceGroup: { kind: 'option', optionId: 'b' }, targetGroup: { kind: 'option', optionId: 'a' },
    anchorRecordId: ids[3], placement: 'before', expectedDatabaseVersion: sortedBefore.body.database.version,
    expectedViewVersion: sortedBefore.body.view.version, expectedRecordVersion: sortedSource.version,
  }, cookie)
  assert.equal(sortedAnchored.status, 409, 'Sort rejects a requested exact anchor placement')
  const afterSortedRejection = await read('option', 'b', undefined, filteredView.body.view.id, 10)
  assert.equal(afterSortedRejection.body.database.version, sortedBefore.body.database.version)
  assert.equal(afterSortedRejection.body.view.version, sortedBefore.body.view.version)
  assert.equal(afterSortedRejection.body.records.find((row: any) => row.id === sortedSource.id)?.version, sortedSource.version)
  assert.equal(afterSortedRejection.body.records.find((row: any) => row.id === sortedSource.id)?.properties[flagId], 'b')
  const sortedMove = await request(`${db}/views/${filteredView.body.view.id}/record-group`, 'POST', {
    recordId: sortedSource.id, sourceGroup: { kind: 'option', optionId: 'b' }, targetGroup: { kind: 'option', optionId: 'a' },
    expectedDatabaseVersion: sortedBefore.body.database.version,
    expectedViewVersion: sortedBefore.body.view.version, expectedRecordVersion: sortedSource.version,
  }, cookie)
  assert.equal(sortedMove.status, 200, JSON.stringify(sortedMove.body))
  assert.equal(sortedMove.body.view.version, sortedBefore.body.view.version, 'explicit Sort writes Select but not manual View order')
  assert.deepEqual((await read('option', 'a', undefined, filteredView.body.view.id, 10)).body.records.map((row: any) => row.id), [ids[1]])
  const timeline = await request(`${db}/views`, 'POST', { id: `timeline-${suffix}`, name: 'Timeline', type: 'timeline',
    config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: flagId, timeline: {} } },
    expectedDatabaseVersion: sortedMove.body.database.version }, cookie)
  assert.equal(timeline.status, 201, JSON.stringify(timeline.body))
  assert.equal((await read('option', 'a', undefined, timeline.body.view.id, 10)).status, 200)
  const latestBoard = await read('option', 'a', undefined, boardId, 10)
  const boardUngrouped = await request(`${db}/views/${boardId}`, 'PATCH', { config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
    expectedDatabaseVersion: timeline.body.database.version, expectedViewVersion: latestBoard.body.view.version }, cookie)
  assert.equal(boardUngrouped.status, 200, JSON.stringify(boardUngrouped.body))
  const filteredUngrouped = await request(`${db}/views/${filteredView.body.view.id}`, 'PATCH', { config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
    expectedDatabaseVersion: boardUngrouped.body.database.version, expectedViewVersion: filteredView.body.view.version }, cookie)
  assert.equal(filteredUngrouped.status, 200, JSON.stringify(filteredUngrouped.body))
  const blockedDelete = await request(`${db}/properties/${flagId}`, 'DELETE', {
    expectedDatabaseVersion: filteredUngrouped.body.database.version, expectedPropertyVersion: flag.body.property.version }, cookie)
  assert.equal(blockedDelete.status, 409, 'Timeline grouping alone protects its Select property')
})
