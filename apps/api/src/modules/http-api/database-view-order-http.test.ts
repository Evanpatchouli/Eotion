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
import { HttpApiModule } from './http-api.module'
import { UserRepository } from '../server-domain/repositories/user.repository'
import { DatabaseService } from '../server-domain/services/database.service'

type HttpResult = { status: number; headers: Headers; body: Record<string, any> }

async function request(base: string, route: string, method = 'GET', options: { cookie?: string; body?: unknown } = {}): Promise<HttpResult> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const text = await response.text()
  let body: Record<string, any> = {}
  if (text) {
    try { body = JSON.parse(text) as Record<string, any> } catch { body = { raw: text } }
  }
  return { status: response.status, headers: response.headers, body }
}

function cookieFrom(response: HttpResult): string {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'expected Set-Cookie response header')
  return value.split(';', 1)[0]!
}

// Each test owns a unique database on the configured isolated test replica set.
function isolatedMongoUri(): string {
  const source = process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017'
  const uri = new URL(source)
  uri.pathname = `/eotion_view_order_http_${randomUUID().replaceAll('-', '')}`
  return uri.toString()
}

test('generic View record ordering is isolated, versioned, paginated, and durable over HTTP/Mongo', async t => {
  const previousMongoUri = process.env.MONGODB_URI
  const previousWebOrigin = process.env.WEB_ORIGIN
  const previousNodeEnv = process.env.NODE_ENV
  process.env.MONGODB_URI = isolatedMongoUri()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  delete process.env.NODE_ENV

  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let connection: Connection | undefined
  try {
    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(process.env.MONGODB_URI!), HttpApiModule] })
    class DatabaseViewOrderHttpTestModule {}
    app = await NestFactory.create(DatabaseViewOrderHttpTestModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    connection = app.get<Connection>(getConnectionToken())

    t.after(async () => {
      try {
        // This connection owns exactly the randomly named database from isolatedMongoUri().
        await connection?.dropDatabase()
      } finally {
        await app?.close()
        if (previousMongoUri === undefined) delete process.env.MONGODB_URI
        else process.env.MONGODB_URI = previousMongoUri
        if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN
        else process.env.WEB_ORIGIN = previousWebOrigin
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = previousNodeEnv
      }
    })

    const suffix = randomUUID().replaceAll('-', '')
    const owner = { email: `view-order-${suffix}@example.test`, password: 'correct horse battery staple' }
    assert.equal((await request(base, '/api/auth/register', 'POST', { body: owner })).status, 201)
    const login = await request(base, '/api/auth/login', 'POST', { body: owner })
    assert.equal(login.status, 201)
    const cookie = cookieFrom(login)
    const workspaceId = `vo-ws-${suffix}`
    const homeId = `vo-home-${suffix}`
    assert.equal((await request(base, '/api/workspaces', 'POST', { cookie, body: { id: workspaceId, name: 'View ordering' } })).status, 201)
    assert.equal((await request(base, `/api/workspaces/${workspaceId}/pages`, 'POST', { cookie, body: { id: homeId, parentPageId: null, title: 'Home', orderKey: 'a' } })).status, 201)

    const databaseRoute = (databaseId: string) => `/api/workspaces/${workspaceId}/databases/${databaseId}`
    const recordsRoute = (databaseId: string, viewId: string, query = '') => `${databaseRoute(databaseId)}/views/${viewId}/records${query}`
    const orderRoute = (databaseId: string, viewId: string) => `${databaseRoute(databaseId)}/views/${viewId}/record-order`
    const createDatabase = async (label: string) => {
      const databaseId = `vo-db-${label}-${suffix}`
      const titleId = `vo-title-${label}-${suffix}`
      const initialViewId = `vo-view-${label}-${suffix}`
      const created = await request(base, `/api/workspaces/${workspaceId}/pages/${homeId}/databases`, 'POST', {
        cookie,
        body: { id: databaseId, name: `Ordering ${label}`, titlePropertyId: titleId, viewId: initialViewId, blockId: `vo-block-${label}-${suffix}`, orderKey: label, parentBlockId: null },
      })
      assert.equal(created.status, 201, JSON.stringify(created.body))
      return { databaseId, titleId, initialViewId, route: databaseRoute(databaseId) }
    }
    const createRecord = async (route: string, id: string, title = id, properties?: Record<string, unknown>) => {
      const response = await request(base, `${route}/records`, 'POST', { cookie, body: {
        id, pageId: `${id}-page`, title, orderKey: `key-${id.split('').reverse().join('')}`,
        ...(properties ? { properties } : {}),
      } })
      assert.equal(response.status, 201, `${id}: ${JSON.stringify(response.body)}`)
      return response.body.record
    }
    const createView = async (route: string, id: string, expectedDatabaseVersion: number, config?: Record<string, unknown>) => request(base, `${route}/views`, 'POST', { cookie, body: {
      id, name: `View ${id}`, type: 'table', ...(config ? { config } : {}), expectedDatabaseVersion,
    } })
    const readWindow = async (databaseId: string, viewId: string, query = '') => {
      const response = await request(base, recordsRoute(databaseId, viewId, query), 'GET', { cookie })
      assert.equal(response.status, 200, JSON.stringify(response.body))
      return response.body
    }
    const readAll = async (databaseId: string, viewId: string, limit = 25): Promise<any> => {
      const first = await readWindow(databaseId, viewId, `?limit=${limit}`)
      assert.deepEqual(Object.keys(first).sort(), ['database', 'nextCursor', 'properties', 'records', 'view'], 'records GET keeps its established response shape')
      const all = [...first.records]
      let cursor = first.nextCursor
      while (cursor) {
        const page = await readWindow(databaseId, viewId, `?limit=${limit}&cursor=${encodeURIComponent(cursor)}`)
        all.push(...page.records)
        cursor = page.nextCursor
      }
      assert.equal(new Set(all.map((record: any) => record.id)).size, all.length, `limit=${limit} pagination has no duplicate records`)
      return { ...first, records: all, nextCursor: null }
    }
    const ids = (data: any) => data.records.map((record: any) => record.id)
    const move = async (databaseId: string, viewId: string, recordId: string, anchorRecordId: string, placement: 'before' | 'after', state?: any) => {
      const current = state ?? await readWindow(databaseId, viewId)
      const response = await request(base, orderRoute(databaseId, viewId), 'POST', { cookie, body: {
        recordId, anchorRecordId, placement,
        expectedDatabaseVersion: current.database.version,
        expectedViewVersion: current.view.version,
      } })
      assert.equal(response.status, 200, JSON.stringify(response.body))
      assert.deepEqual(Object.keys(response.body).sort(), ['database', 'view'])
      return response.body
    }
    const patchView = async (route: string, viewId: string, state: any, config: Record<string, unknown>) => request(base, `${route}/views/${viewId}`, 'PATCH', { cookie, body: {
      config, expectedDatabaseVersion: state.database.version, expectedViewVersion: state.view.version,
    } })

    // Create records in an order deliberately unrelated to their IDs and orderKey values.
    const basic = await createDatabase('basic')
    for (const id of ['rec-zulu', 'rec-alpha', 'rec-mango', 'rec-bravo']) await createRecord(basic.route, `${id}-${suffix}`)
    let basicState = await readAll(basic.databaseId, basic.initialViewId)
    const basicIds = ids(basicState)
    assert.deepEqual(basicIds, ['rec-zulu', 'rec-alpha', 'rec-mango', 'rec-bravo'].map(id => `${id}-${suffix}`), 'append order follows record creation, not ID/orderKey ordering')

    // A View created after existing records gets its own scope; changing it leaves the other View untouched.
    const viewBId = `vo-view-b-${suffix}`
    const createdB = await createView(basic.route, viewBId, basicState.database.version)
    assert.equal(createdB.status, 201, JSON.stringify(createdB.body))
    const beforeA = ids(await readAll(basic.databaseId, basic.initialViewId))
    const beforeB = ids(await readAll(basic.databaseId, viewBId))
    assert.deepEqual(beforeB, basicIds, 'a View created after records starts with the existing record order')
    await move(basic.databaseId, basic.initialViewId, basicIds[0]!, basicIds[2]!, 'after')
    assert.deepEqual(ids(await readAll(basic.databaseId, basic.initialViewId)), [basicIds[1], basicIds[2], basicIds[0], basicIds[3]])
    assert.deepEqual(ids(await readAll(basic.databaseId, viewBId)), beforeB, 'each View maintains an independent order')
    assert.deepEqual(beforeA, basicIds)

    // Filtered no-op and a true move across hidden rows preserve their relative order.
    const filtered = await createDatabase('filtered')
    const flagId = `vo-flag-${suffix}`
    let filteredState = await readWindow(filtered.databaseId, filtered.initialViewId)
    const flag = await request(base, `${filtered.route}/properties`, 'POST', { cookie, body: {
      id: flagId, name: 'Visibility', type: 'text', expectedDatabaseVersion: filteredState.database.version,
    } })
    assert.equal(flag.status, 201, JSON.stringify(flag.body))
    const filteredIds = [`visible-source-${suffix}`, `hidden-one-${suffix}`, `hidden-two-${suffix}`, `visible-anchor-${suffix}`]
    for (const [index, id] of filteredIds.entries()) await createRecord(filtered.route, id, id, { [flagId]: index === 0 || index === 3 ? 'show' : 'hide' })
    filteredState = await readAll(filtered.databaseId, filtered.initialViewId)
    const filteredConfig = { filters: [{ propertyId: flagId, operator: 'is', value: 'show' }], sorts: [], visibleProperties: null, propertyOrder: null }
    const configured = await patchView(filtered.route, filtered.initialViewId, filteredState, filteredConfig)
    assert.equal(configured.status, 200, JSON.stringify(configured.body))
    let visibleState = await readAll(filtered.databaseId, filtered.initialViewId)
    assert.deepEqual(ids(visibleState), [filteredIds[0], filteredIds[3]])
    const filterOwner = await app.get(UserRepository).findAuthenticationByEmail(owner.email)
    assert.ok(filterOwner)
    const mixedFilters = [
      { propertyId: flagId, operator: 'is' as const, value: 'show' },
      { propertyId: filtered.titleId, operator: 'contains' as const, value: 'visible-' },
    ]
    const mixedRows = await app.get(DatabaseService).getViewRecords(filterOwner.user.id, workspaceId, filtered.databaseId, filtered.initialViewId, { limit: 1, filters: mixedFilters })
    assert.deepEqual(mixedRows.records.map(row => row.id), [filteredIds[0]])
    assert.ok(mixedRows.nextCursor)
    const mixedNext = await app.get(DatabaseService).getViewRecords(filterOwner.user.id, workspaceId, filtered.databaseId, filtered.initialViewId, { limit: 1, filters: mixedFilters, cursor: mixedRows.nextCursor })
    assert.deepEqual(mixedNext.records.map(row => row.id), [filteredIds[3]])
    const noOp = await request(base, orderRoute(filtered.databaseId, filtered.initialViewId), 'POST', { cookie, body: {
      recordId: filteredIds[0], anchorRecordId: filteredIds[3], placement: 'before',
      expectedDatabaseVersion: visibleState.database.version, expectedViewVersion: visibleState.view.version,
    } })
    assert.equal(noOp.status, 200, JSON.stringify(noOp.body))
    assert.equal(noOp.body.database.version, visibleState.database.version, 'already-adjacent visible move is a no-op for Database version')
    assert.equal(noOp.body.view.version, visibleState.view.version, 'already-adjacent visible move is a no-op for View version')
    assert.deepEqual(ids(await readAll(filtered.databaseId, filtered.initialViewId)), [filteredIds[0], filteredIds[3]])
    const unfilteredConfig = { ...filteredConfig, filters: [] }
    let afterNoOp = await readAll(filtered.databaseId, filtered.initialViewId)
    const unfiltered = await patchView(filtered.route, filtered.initialViewId, afterNoOp, unfilteredConfig)
    assert.equal(unfiltered.status, 200, JSON.stringify(unfiltered.body))
    assert.deepEqual(ids(await readAll(filtered.databaseId, filtered.initialViewId)), filteredIds, 'no-op preserves the complete unfiltered order')

    const reapplyFilter = await patchView(filtered.route, filtered.initialViewId, await readAll(filtered.databaseId, filtered.initialViewId), filteredConfig)
    assert.equal(reapplyFilter.status, 200, JSON.stringify(reapplyFilter.body))
    visibleState = await readAll(filtered.databaseId, filtered.initialViewId)
    await move(filtered.databaseId, filtered.initialViewId, filteredIds[0]!, filteredIds[3]!, 'after', visibleState)
    visibleState = await readAll(filtered.databaseId, filtered.initialViewId)
    assert.deepEqual(ids(visibleState), [filteredIds[3], filteredIds[0]], 'visible order follows the requested move')
    afterNoOp = await readAll(filtered.databaseId, filtered.initialViewId)
    const unfilterAfterMove = await patchView(filtered.route, filtered.initialViewId, afterNoOp, unfilteredConfig)
    assert.equal(unfilterAfterMove.status, 200, JSON.stringify(unfilterAfterMove.body))
    const fullFilteredOrder = ids(await readAll(filtered.databaseId, filtered.initialViewId))
    assert.deepEqual(fullFilteredOrder.slice().sort(), filteredIds.slice().sort(), 'filtered move retains hidden records')
    assert.ok(fullFilteredOrder.indexOf(filteredIds[3]!) < fullFilteredOrder.indexOf(filteredIds[0]!))
    const hiddenOrder = fullFilteredOrder.filter((id: string) => id.startsWith('hidden-'))
    assert.deepEqual(hiddenOrder, [filteredIds[1], filteredIds[2]], 'moving across hidden records does not change their relative order')

    // Explicit sorting owns presentation order; reject manual moves without any observable write, then restore manual ordering.
    const sorted = await createDatabase('sorted')
    const scoreId = `vo-score-${suffix}`
    let sortedState = await readWindow(sorted.databaseId, sorted.initialViewId)
    assert.equal((await request(base, `${sorted.route}/properties`, 'POST', { cookie, body: {
      id: scoreId, name: 'Score', type: 'text', expectedDatabaseVersion: sortedState.database.version,
    } })).status, 201)
    const sortedIds = [`sort-c-${suffix}`, `sort-a-${suffix}`, `sort-b-${suffix}`]
    for (const [index, id] of sortedIds.entries()) await createRecord(sorted.route, id, id, { [scoreId]: ['c', 'a', 'b'][index] })
    sortedState = await readAll(sorted.databaseId, sorted.initialViewId)
    const sortConfig = { filters: [], sorts: [{ propertyId: scoreId, direction: 'asc' }], visibleProperties: null, propertyOrder: null }
    const sortedConfig = await patchView(sorted.route, sorted.initialViewId, sortedState, sortConfig)
    assert.equal(sortedConfig.status, 200, JSON.stringify(sortedConfig.body))
    sortedState = await readAll(sorted.databaseId, sorted.initialViewId)
    assert.deepEqual(ids(sortedState), [sortedIds[1], sortedIds[2], sortedIds[0]])
    const sortedBeforeReject = await readAll(sorted.databaseId, sorted.initialViewId)
    const rejectedSortMove = await request(base, orderRoute(sorted.databaseId, sorted.initialViewId), 'POST', { cookie, body: {
      recordId: sortedIds[0], anchorRecordId: sortedIds[1], placement: 'before',
      expectedDatabaseVersion: sortedBeforeReject.database.version, expectedViewVersion: sortedBeforeReject.view.version,
    } })
    assert.equal(rejectedSortMove.status, 409)
    const sortedAfterReject = await readAll(sorted.databaseId, sorted.initialViewId)
    assert.equal(sortedAfterReject.database.version, sortedBeforeReject.database.version)
    assert.equal(sortedAfterReject.view.version, sortedBeforeReject.view.version)
    assert.deepEqual(sortedAfterReject.records, sortedBeforeReject.records, 'explicit Sort rejection makes no record/order writes')
    const cleared = await patchView(sorted.route, sorted.initialViewId, sortedAfterReject, { ...sortConfig, sorts: [] })
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
    const afterClear = await readAll(sorted.databaseId, sorted.initialViewId)
    assert.deepEqual(ids(afterClear), sortedIds, 'clearing Sort restores the saved manual order')
    await move(sorted.databaseId, sorted.initialViewId, sortedIds[2]!, sortedIds[0]!, 'before')
    assert.deepEqual(ids(await readAll(sorted.databaseId, sorted.initialViewId)), [sortedIds[2], sortedIds[0], sortedIds[1]])

    // Rebuild complete order from both 25- and 100-row cursor pages while moving within, across, and into the tail page.
    const paged = await createDatabase('paged')
    const pagedIds = Array.from({ length: 130 }, (_, index) => `page-row-${String(index).padStart(3, '0')}-${suffix}`)
    for (const id of pagedIds) await createRecord(paged.route, id)
    for (const limit of [25, 100]) assert.deepEqual(ids(await readAll(paged.databaseId, paged.initialViewId, limit)), pagedIds, `initial limit=${limit} cursor walk`)
    let pagedState = await readAll(paged.databaseId, paged.initialViewId, 25)
    const firstCursor = (await readWindow(paged.databaseId, paged.initialViewId, '?limit=25')).nextCursor
    assert.ok(firstCursor)
    await move(paged.databaseId, paged.initialViewId, pagedIds[0]!, pagedIds[60]!, 'after', pagedState)
    let pagedOrder = ids(await readAll(paged.databaseId, paged.initialViewId, 25))
    assert.deepEqual(pagedOrder.slice(59, 62), [pagedIds[60], pagedIds[0], pagedIds[61]])
    const staleAfterReorder = await request(base, recordsRoute(paged.databaseId, paged.initialViewId, `?limit=25&cursor=${encodeURIComponent(firstCursor)}`), 'GET', { cookie })
    assert.equal(staleAfterReorder.status, 409, 'a cursor captured before reordering is fenced')

    pagedState = await readAll(paged.databaseId, paged.initialViewId, 100)
    await move(paged.databaseId, paged.initialViewId, pagedIds[1]!, pagedIds[60]!, 'after', pagedState)
    pagedOrder = ids(await readAll(paged.databaseId, paged.initialViewId, 100))
    assert.deepEqual(pagedOrder.slice(pagedOrder.indexOf(pagedIds[60]!), pagedOrder.indexOf(pagedIds[60]!) + 3), [pagedIds[60], pagedIds[1], pagedIds[0]], 'consecutive moves into the same slot have stable adjacency')
    await move(paged.databaseId, paged.initialViewId, pagedIds[129]!, pagedIds[99]!, 'before')
    pagedOrder = ids(await readAll(paged.databaseId, paged.initialViewId, 25))
    assert.equal(pagedOrder.indexOf(pagedIds[129]!), pagedOrder.indexOf(pagedIds[99]!) - 1, 'tail row can move to a non-tail page')
    for (const limit of [25, 100]) {
      const walked = ids(await readAll(paged.databaseId, paged.initialViewId, limit))
      assert.equal(walked.length, pagedIds.length)
      assert.deepEqual(walked.slice().sort(), pagedIds.slice().sort(), `limit=${limit} preserves every ID exactly once`)
    }

    // Creation appends after manual order; deletion of a referenced anchor never drops any remaining row.
    pagedState = await readAll(paged.databaseId, paged.initialViewId)
    const appendedId = `new-tail-${suffix}`
    await createRecord(paged.route, appendedId)
    let afterAppend = await readAll(paged.databaseId, paged.initialViewId)
    assert.equal(ids(afterAppend).at(-1), appendedId, 'new records append to the active View order')
    const anchorId = pagedIds[25]!
    const ownerUser = await app.get(UserRepository).findAuthenticationByEmail(owner.email)
    assert.ok(ownerUser)
    const deleteAnchor = await app.get(DatabaseService).deleteRecord(ownerUser.user.id, workspaceId, paged.databaseId, anchorId, {
      expectedDatabaseVersion: afterAppend.database.version,
      expectedRecordVersion: afterAppend.records.find((record: any) => record.id === anchorId).version,
    })
    assert.equal(deleteAnchor.database.version, afterAppend.database.version + 1)
    afterAppend = await readAll(paged.databaseId, paged.initialViewId, 100)
    assert.equal(afterAppend.records.length, pagedIds.length)
    assert.equal(afterAppend.records.some((record: any) => record.id === anchorId), false)
    assert.equal(afterAppend.records.some((record: any) => record.id === appendedId), true)
    assert.deepEqual(ids(afterAppend).slice().sort(), [...pagedIds.filter(id => id !== anchorId), appendedId].sort(), 'anchor deletion preserves all other rows')

    // A stale cursor is fenced by ordinary record creation too.
    const cursorBeforeCreate = (await readWindow(paged.databaseId, paged.initialViewId, '?limit=25')).nextCursor
    assert.ok(cursorBeforeCreate)
    await createRecord(paged.route, `cursor-new-${suffix}`)
    const staleAfterCreate = await request(base, recordsRoute(paged.databaseId, paged.initialViewId, `?limit=25&cursor=${encodeURIComponent(cursorBeforeCreate)}`), 'GET', { cookie })
    assert.equal(staleAfterCreate.status, 409, 'a cursor captured before record creation is fenced')

    // Strict body, missing/cross-Database IDs, auth, ownership, and same-record moves fail closed.
    const currentPaged = await readAll(paged.databaseId, paged.initialViewId)
    const firstPaged = ids(currentPaged)[0]!
    const secondPaged = ids(currentPaged)[1]!
    const invalidBodies = [
      { recordId: firstPaged, anchorRecordId: secondPaged, placement: 'sideways', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version },
      { recordId: firstPaged, anchorRecordId: secondPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version, extra: true },
      { recordId: firstPaged, anchorRecordId: firstPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version },
      { recordId: 'missing-record', anchorRecordId: secondPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version },
      { recordId: firstPaged, anchorRecordId: 'missing-anchor', placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version },
    ]
    for (const [index, body] of invalidBodies.entries()) {
      const rejected = await request(base, orderRoute(paged.databaseId, paged.initialViewId), 'POST', { cookie, body })
      assert.equal(rejected.status, index < 3 ? 400 : 404, JSON.stringify(rejected.body))
    }
    assert.equal((await request(base, orderRoute(paged.databaseId, paged.initialViewId), 'POST', { body: {
      recordId: firstPaged, anchorRecordId: secondPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version,
    } })).status, 401)
    const foreignDb = await createDatabase('foreign')
    const foreignRecord = `foreign-row-${suffix}`
    await createRecord(foreignDb.route, foreignRecord)
    assert.equal((await request(base, orderRoute(paged.databaseId, paged.initialViewId), 'POST', { cookie, body: {
      recordId: foreignRecord, anchorRecordId: secondPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version,
    } })).status, 404)
    const outsider = { email: `view-order-outsider-${suffix}@example.test`, password: 'correct horse battery staple' }
    assert.equal((await request(base, '/api/auth/register', 'POST', { body: outsider })).status, 201)
    const outsiderLogin = await request(base, '/api/auth/login', 'POST', { body: outsider })
    const outsiderCookie = cookieFrom(outsiderLogin)
    assert.equal((await request(base, orderRoute(paged.databaseId, paged.initialViewId), 'POST', { cookie: outsiderCookie, body: {
      recordId: firstPaged, anchorRecordId: secondPaged, placement: 'before', expectedDatabaseVersion: currentPaged.database.version, expectedViewVersion: currentPaged.view.version,
    } })).status, 404)

    // Two requests carrying the same Database and View versions race: exactly one commits.
    const raceState = await readAll(basic.databaseId, basic.initialViewId)
    const raceIds = ids(raceState)
    const race = await Promise.all([
      ['after', raceIds[0]!, raceIds[2]!],
      ['after', raceIds[3]!, raceIds[1]!],
    ].map(([placement, recordId, anchorRecordId]) => request(base, orderRoute(basic.databaseId, basic.initialViewId), 'POST', { cookie, body: {
      recordId, anchorRecordId, placement,
      expectedDatabaseVersion: raceState.database.version, expectedViewVersion: raceState.view.version,
    } })))
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409])
    const afterRace = await readAll(basic.databaseId, basic.initialViewId)
    assert.equal(afterRace.database.version, raceState.database.version + 1)
    assert.equal(afterRace.view.version, raceState.view.version + 1)
    assert.deepEqual(ids(afterRace).slice().sort(), raceIds.slice().sort())

    // Delete and recreate the same View ID; its order scope must be fresh and independent of the removed incarnation.
    const reincarnatedId = `vo-recreated-${suffix}`
    const createdOldView = await createView(basic.route, reincarnatedId, afterRace.database.version)
    assert.equal(createdOldView.status, 201, JSON.stringify(createdOldView.body))
    const beforeOldMove = await readAll(basic.databaseId, reincarnatedId)
    const oldOrder = ids(beforeOldMove)
    await move(basic.databaseId, reincarnatedId, oldOrder[0]!, oldOrder[2]!, 'after')
    let oldView = (await request(base, `${basic.route}/views`, 'GET', { cookie })).body.find((view: any) => view.id === reincarnatedId)
    const deleteOld = await request(base, `${basic.route}/views/${reincarnatedId}`, 'DELETE', { cookie, body: {
      expectedDatabaseVersion: (await readWindow(basic.databaseId, basic.initialViewId)).database.version,
      expectedViewVersion: oldView.version,
    } })
    assert.equal(deleteOld.status, 200, JSON.stringify(deleteOld.body))
    const createdNewView = await createView(basic.route, reincarnatedId, deleteOld.body.database.version)
    assert.equal(createdNewView.status, 201, JSON.stringify(createdNewView.body))
    const newOrder = ids(await readAll(basic.databaseId, reincarnatedId))
    assert.deepEqual(newOrder, basicIds, 'recreated View ID starts from the fresh record creation order')
    await move(basic.databaseId, reincarnatedId, newOrder[0]!, newOrder[2]!, 'after')
    assert.notDeepEqual(ids(await readAll(basic.databaseId, reincarnatedId)), ids(await readAll(basic.databaseId, basic.initialViewId)))

    const unicode = await createDatabase('unicode')
    const unicodeIds = ['中-record', 'é-record', 'a-record'].map(id => `${id}-${suffix}`)
    for (const id of unicodeIds) await createRecord(unicode.route, id, '同标题')
    const unicodeConfig = { filters: [{ propertyId: unicode.titleId, operator: 'contains', value: '同' }], sorts: [], visibleProperties: null, propertyOrder: null }
    const unicodeInitial = await readAll(unicode.databaseId, unicode.initialViewId)
    assert.equal((await patchView(unicode.route, unicode.initialViewId, unicodeInitial, unicodeConfig)).status, 200)
    assert.deepEqual(ids(await readAll(unicode.databaseId, unicode.initialViewId, 1)), unicodeIds, 'non-ASCII IDs preserve creation order through Title filtering and cursor pages')
    const unicodeSorted = { ...unicodeConfig, sorts: [{ propertyId: unicode.titleId, direction: 'asc' }] }
    assert.equal((await patchView(unicode.route, unicode.initialViewId, await readAll(unicode.databaseId, unicode.initialViewId), unicodeSorted)).status, 200)
    assert.deepEqual(ids(await readAll(unicode.databaseId, unicode.initialViewId, 1)), [unicodeIds[2], unicodeIds[1], unicodeIds[0]], 'simple collation decides equal-title ID ties')
  } finally {
    if (!app) {
      if (previousMongoUri === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousMongoUri
      if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN
      else process.env.WEB_ORIGIN = previousWebOrigin
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  }
})
