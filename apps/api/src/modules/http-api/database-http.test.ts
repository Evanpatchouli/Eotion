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

type JsonResponse = { status: number; headers: Headers; body: Record<string, any> }

async function request(baseUrl: string, route: string, method = 'GET', options: { cookie?: string; body?: unknown; origin?: string } = {}): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
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

function cookieFrom(response: JsonResponse): string {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'expected Set-Cookie response header')
  return value.split(';', 1)[0]!
}

function testMongoUri(): string {
  const base = process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017'
  const uri = new URL(base)
  uri.pathname = `/eotion_database_http_test_${randomUUID().replaceAll('-', '')}`
  return uri.toString()
}

test('database HTTP mutations validate values, versions, ownership, and Page title projection', async (t) => {
  const previousMongoUri = process.env.MONGODB_URI
  const previousWebOrigin = process.env.WEB_ORIGIN
  const previousNodeEnv = process.env.NODE_ENV
  process.env.MONGODB_URI = testMongoUri()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  delete process.env.NODE_ENV

  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let connection: Connection | undefined
  try {
    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(process.env.MONGODB_URI!), HttpApiModule] })
    class DatabaseHttpTestModule {}
    app = await NestFactory.create(DatabaseHttpTestModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    connection = app.get<Connection>(getConnectionToken())

    t.after(async () => {
      try {
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

    const credentials = { email: 'database-owner@example.test', password: 'correct horse battery staple' }
    const registered = await request(baseUrl, '/api/auth/register', 'POST', { body: credentials })
    assert.equal(registered.status, 201)
    const login = await request(baseUrl, '/api/auth/login', 'POST', { body: credentials })
    assert.equal(login.status, 201)
    const cookie = cookieFrom(login)
    assert.equal((await request(baseUrl, '/api/workspaces', 'POST', { cookie, body: { id: 'db-http-ws', name: 'Database workspace' } })).status, 201)
    assert.equal((await request(baseUrl, '/api/workspaces/db-http-ws/pages', 'POST', { cookie, body: { id: 'db-http-home', parentPageId: null, title: 'Database home', orderKey: 'a' } })).status, 201)

    const workspace = 'db-http-ws'
    const databaseId = 'db-http-main'
    const titlePropertyId = 'db-http-title'
    const viewId = 'db-http-view'
    const databaseRoute = `/api/workspaces/${workspace}/databases/${databaseId}`
    const tableRoute = `${databaseRoute}/views/${viewId}/table`
    const createdDb = await request(baseUrl, `/api/workspaces/${workspace}/pages/db-http-home/databases`, 'POST', {
      cookie,
      body: { id: databaseId, name: 'Tasks', titlePropertyId, viewId, blockId: 'db-http-block', orderKey: 'b', parentBlockId: null },
    })
    assert.equal(createdDb.status, 201)

    const recordId = 'db-http-record'
    const pageId = 'db-http-record-page'
    const createdRecord = await request(baseUrl, `${databaseRoute}/records`, 'POST', {
      cookie,
      body: { id: recordId, pageId, title: 'Initial title', orderKey: 'a' },
    })
    assert.equal(createdRecord.status, 201)
    assert.equal(createdRecord.body.page.role, 'database-record')
    const navigationRoute = `/api/workspaces/${workspace}/database-navigation`
    const navigation = await request(baseUrl, navigationRoute, 'GET', { cookie })
    assert.equal(navigation.status, 200)
    assert.deepEqual(navigation.body.items, [{ id: databaseId, workspaceId: workspace, name: 'Tasks', parentPageId: 'db-http-home', orderKey: 'b', viewId }])
    assert.equal((await request(baseUrl, navigationRoute)).status, 401)
    const pageTree = await request(baseUrl, `/api/workspaces/${workspace}/pages`, 'GET', { cookie })
    assert.deepEqual(pageTree.body.map((page: { id: string }) => page.id), ['db-http-home'])
    assert.equal((await request(baseUrl, `/api/workspaces/${workspace}/pages/${pageId}`, 'GET', { cookie })).body.role, 'database-record')
    assert.equal((await request(baseUrl, `/api/workspaces/${workspace}/pages`, 'POST', { cookie, body: { id: 'forged-record', parentPageId: null, title: 'Forged', orderKey: 'z', role: 'database-record' } })).status, 400)

    const table = async () => {
      const response = await request(baseUrl, tableRoute, 'GET', { cookie })
      assert.equal(response.status, 200)
      return response.body
    }
    const routeForProperty = (propertyId: string) => `${databaseRoute}/properties/${propertyId}`
    const createProperty = async (input: Record<string, unknown>) => request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: input })

    assert.equal((await request(baseUrl, `${databaseRoute}/properties`, 'POST', { body: { id: 'no-auth', name: 'Status', type: 'text', expectedDatabaseVersion: 1 } })).status, 401)

    let current = await table()
    assert.equal(current.records[0].properties[titlePropertyId], 'Initial title')
    assert.equal(current.records[0].pageVersion, (await request(baseUrl, `/api/workspaces/${workspace}/pages/${pageId}`, 'GET', { cookie })).body.updatedAt)
    const recordCollection = connection!.db!.collection('database_records')
    assert.deepEqual((await recordCollection.findOne({ id: recordId }))?.properties ?? {}, {}, 'the Page title must not be persisted in record properties')

    const selectId = 'db-http-status'
    const selectCreate = await createProperty({ id: selectId, name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }, { id: 'done', name: 'Done' }], expectedDatabaseVersion: current.database.version })
    assert.equal(selectCreate.status, 201)
    assert.equal(selectCreate.body.property.version, 1)

    current = await table()
    const textCreate = await createProperty({ id: 'db-http-notes', name: 'Notes', type: 'text', expectedDatabaseVersion: current.database.version })
    assert.equal(textCreate.status, 201)
    current = await table()
    const numberCreate = await createProperty({ id: 'db-http-estimate', name: 'Estimate', type: 'number', expectedDatabaseVersion: current.database.version })
    assert.equal(numberCreate.status, 201)
    current = await table()
    const checkboxCreate = await createProperty({ id: 'db-http-done', name: 'Done', type: 'checkbox', expectedDatabaseVersion: current.database.version })
    assert.equal(checkboxCreate.status, 201)

    current = await table()
    const selectRoute = routeForProperty(selectId)
    const opaqueViewOptions = { grouping: { propertyId: selectId, future: { nested: ['keep', { value: 7 }] } } }
    const initialViewConfig = await request(baseUrl, `${databaseRoute}/views/${viewId}`, 'PATCH', {
      cookie,
      body: {
        config: {
          filters: [{ propertyId: selectId, operator: 'is', value: 'open' }],
          sorts: [{ propertyId: 'db-http-estimate', direction: 'asc' }],
          visibleProperties: [titlePropertyId, 'db-http-notes'],
          propertyOrder: ['db-http-notes'],
          options: opaqueViewOptions,
        },
        expectedDatabaseVersion: current.database.version,
        expectedViewVersion: current.view.version,
      },
    })
    assert.equal(initialViewConfig.status, 200)
    current = await table()
    const rename = await request(baseUrl, selectRoute, 'PATCH', { cookie, body: { name: 'State', expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === selectId).version } })
    assert.equal(rename.status, 200)
    assert.equal(rename.body.property.name, 'State')

    current = await table()
    const updateOptions = await request(baseUrl, selectRoute, 'PATCH', {
      cookie,
      body: { options: [{ id: 'todo', name: 'To do' }, { id: 'done', name: 'Done' }], expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === selectId).version },
    })
    assert.equal(updateOptions.status, 200)
    assert.deepEqual(updateOptions.body.property.options.map((option: any) => option.id), ['todo', 'done'])
    assert.deepEqual((await table()).view.config.options, opaqueViewOptions, 'select option cleanup preserves opaque view options')

    current = await table()
    const getCell = (data: any, propertyId: string) => ({ expectedDatabaseVersion: data.database.version, expectedRecordVersion: data.records[0].version })
    const cellRoute = (propertyId: string) => `${databaseRoute}/records/${recordId}/cells/${propertyId}`
    const validSelect = await request(baseUrl, cellRoute(selectId), 'PATCH', { cookie, body: { ...getCell(current, selectId), value: 'todo' } })
    assert.equal(validSelect.status, 200)
    assert.equal(validSelect.body.record.properties[selectId], 'todo')

    current = await table()
    const beforeInvalid = await recordCollection.findOne({ id: recordId })
    for (const [propertyId, value] of [['db-http-estimate', 'not-a-number'], ['db-http-done', 'true'], [selectId, 'missing-option']] as const) {
      const invalid = await request(baseUrl, cellRoute(propertyId), 'PATCH', { cookie, body: { ...getCell(current, propertyId), value } })
      assert.equal(invalid.status, 400, `invalid value must be rejected for ${propertyId}`)
      assert.deepEqual((await recordCollection.findOne({ id: recordId }))?.properties, beforeInvalid?.properties)
      current = await table()
    }

    current = await table()
    const validTyped = await request(baseUrl, cellRoute('db-http-estimate'), 'PATCH', { cookie, body: { ...getCell(current, 'db-http-estimate'), value: 3.5 } })
    assert.equal(validTyped.status, 200)
    current = await table()
    const validCheckbox = await request(baseUrl, cellRoute('db-http-done'), 'PATCH', { cookie, body: { ...getCell(current, 'db-http-done'), value: true } })
    assert.equal(validCheckbox.status, 200)

    current = await table()
    const titleCellRoute = cellRoute(titlePropertyId)
    const titlePageVersion = current.records[0].pageVersion
    const missingPageVersion = await request(baseUrl, titleCellRoute, 'PATCH', { cookie, body: { ...getCell(current, titlePropertyId), value: 'Renamed without version' } })
    assert.equal(missingPageVersion.status, 400)
    const refreshed = await table()
    const renamedTitle = await request(baseUrl, titleCellRoute, 'PATCH', { cookie, body: { ...getCell(refreshed, titlePropertyId), value: '  Renamed row  ', expectedPageUpdatedAt: titlePageVersion } })
    assert.equal(renamedTitle.status, 200)
    assert.equal(renamedTitle.body.page.title, 'Renamed row')
    assert.equal(renamedTitle.body.record.properties[titlePropertyId], 'Renamed row')
    assert.equal(Object.hasOwn(renamedTitle.body.record.properties, titlePropertyId), true)
    assert.equal(Object.hasOwn((await recordCollection.findOne({ id: recordId }))?.properties ?? {}, titlePropertyId), false)
    const freshTitleProjection = await table()
    assert.equal(freshTitleProjection.records[0].properties[titlePropertyId], 'Renamed row')
    assert.equal(freshTitleProjection.records[0].pageVersion, renamedTitle.body.page.updatedAt)

    const deleteRoute = routeForProperty('db-http-notes')
    current = await table()
    const notesProperty = current.properties.find((property: any) => property.id === 'db-http-notes')
    const staleDb = await request(baseUrl, deleteRoute, 'DELETE', { cookie, body: { expectedDatabaseVersion: current.database.version - 1, expectedPropertyVersion: notesProperty.version } })
    assert.equal(staleDb.status, 409)
    const staleRecord = await request(baseUrl, cellRoute('db-http-notes'), 'PATCH', { cookie, body: { value: 'stale', expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version - 1 } })
    assert.equal(staleRecord.status, 409)
    const stalePage = await request(baseUrl, titleCellRoute, 'PATCH', { cookie, body: { value: 'stale page', expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version, expectedPageUpdatedAt: '2000-01-01T00:00:00.000Z' } })
    assert.equal(stalePage.status, 409)

    current = await table()
    const missingVersion = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-invalid-version', name: 'Bad', type: 'text' } })
    assert.equal(missingVersion.status, 400)
    const unknownField = await request(baseUrl, cellRoute('db-http-estimate'), 'PATCH', { cookie, body: { value: 4, expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version, extra: true } })
    assert.equal(unknownField.status, 400)
    const conversion = await request(baseUrl, cellRoute('db-http-estimate'), 'PATCH', { cookie, body: { value: 4, expectedDatabaseVersion: String(current.database.version), expectedRecordVersion: current.records[0].version } })
    assert.equal(conversion.status, 400)

    const outsiderCredentials = { email: 'database-outsider@example.test', password: 'another correct horse battery staple' }
    assert.equal((await request(baseUrl, '/api/auth/register', 'POST', { body: outsiderCredentials })).status, 201)
    const outsiderLogin = await request(baseUrl, '/api/auth/login', 'POST', { body: outsiderCredentials })
    assert.equal(outsiderLogin.status, 201)
    const outsiderCookie = cookieFrom(outsiderLogin)
    for (const [route, method, body] of [
      [selectRoute, 'PATCH', { name: 'Stolen', expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === selectId).version }],
      [cellRoute('db-http-estimate'), 'PATCH', { value: 9, expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version }],
      [`${databaseRoute}/properties/db-http-estimate`, 'DELETE', { expectedDatabaseVersion: current.database.version, expectedPropertyVersion: 1 }],
    ] as const) {
      assert.equal((await request(baseUrl, route, method, { cookie: outsiderCookie, body })).status, 404)
    }

    const secondDbId = 'db-http-second'
    const secondCreated = await request(baseUrl, `/api/workspaces/${workspace}/pages/db-http-home/databases`, 'POST', { cookie, body: { id: secondDbId, name: 'Other database', titlePropertyId: 'db-http-second-title', viewId: 'db-http-second-view', blockId: 'db-http-second-block', orderKey: 'c', parentBlockId: null } })
    assert.equal(secondCreated.status, 201)
    const secondRecord = await request(baseUrl, `/api/workspaces/${workspace}/databases/${secondDbId}/records`, 'POST', { cookie, body: { id: 'db-http-second-record', pageId: 'db-http-second-page', title: 'Other row', orderKey: 'a' } })
    assert.equal(secondRecord.status, 201)
    const optionsRoute = `/api/workspaces/${workspace}/databases/${secondDbId}/record-options`
    const options = await request(baseUrl, `${optionsRoute}?search=Other&limit=1`, 'GET', { cookie })
    assert.equal(options.status, 200)
    assert.deepEqual(options.body.items, [{ recordId: 'db-http-second-record', pageId: 'db-http-second-page', title: 'Other row' }])
    assert.equal(options.body.nextCursor, null)
    const titles = await request(baseUrl, `${optionsRoute}/resolve`, 'POST', { cookie, body: { recordIds: ['db-http-second-record', 'missing-record'] } })
    assert.equal(titles.status, 201)
    assert.deepEqual(titles.body.items, options.body.items)
    assert.equal((await request(baseUrl, `${optionsRoute}?limit=51`, 'GET', { cookie })).status, 400)
    assert.equal((await request(baseUrl, `${optionsRoute}/resolve`, 'POST', { cookie, body: { recordIds: ['db-http-second-record', 'db-http-second-record'] } })).status, 400)
    const secondProperty = await request(baseUrl, `/api/workspaces/${workspace}/databases/${secondDbId}/properties`, 'POST', { cookie, body: { id: 'db-http-second-property', name: 'Other text', type: 'text', expectedDatabaseVersion: 2 } })
    assert.equal(secondProperty.status, 201)
    const wrongProperty = await request(baseUrl, cellRoute('db-http-second-property'), 'PATCH', { cookie, body: { value: 'cross database', expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version } })
    assert.equal(wrongProperty.status, 404)
    const wrongRecord = await request(baseUrl, `${databaseRoute}/records/db-http-second-record/cells/${titlePropertyId}`, 'PATCH', { cookie, body: { value: 'cross database', expectedDatabaseVersion: current.database.version, expectedRecordVersion: 1, expectedPageUpdatedAt: '2026-01-01T00:00:00.000Z' } })
    assert.equal(wrongRecord.status, 404)
    const wrongWorkspace = await request(baseUrl, `/api/workspaces/db-http-other/databases/${databaseId}/properties`, 'POST', { cookie, body: { id: 'db-http-wrong-workspace-property', name: 'Wrong workspace', type: 'text', expectedDatabaseVersion: 1 } })
    assert.equal(wrongWorkspace.status, 404)

    current = await table()
    const relation = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-links', name: 'Links', type: 'relation', config: { targetDatabaseId: secondDbId }, expectedDatabaseVersion: current.database.version } })
    assert.equal(relation.status, 201)
    const rollup = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-link-count', name: 'Link count', type: 'rollup', config: { relationPropertyId: 'db-http-links', targetPropertyId: 'db-http-second-title', aggregation: 'count' }, expectedDatabaseVersion: relation.body.database.version } })
    assert.equal(rollup.status, 201)
    const formula = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-count-plus-one', name: 'Count plus one', type: 'formula', config: { expression: { kind: 'binary', operator: '+', left: { kind: 'property', propertyId: 'db-http-link-count' }, right: { kind: 'literal', value: 1 } }, resultType: 'number' }, expectedDatabaseVersion: rollup.body.database.version } })
    assert.equal(formula.status, 201)
    const malformedRollup = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-invalid-rollup', name: 'Invalid rollup', type: 'rollup', config: { relationPropertyId: 'db-http-links', targetPropertyId: 'db-http-second-title', aggregation: ['count'] }, expectedDatabaseVersion: formula.body.database.version } })
    assert.equal(malformedRollup.status, 400)
    const malformedFormula = await request(baseUrl, `${databaseRoute}/properties`, 'POST', { cookie, body: { id: 'db-http-invalid-formula', name: 'Invalid formula', type: 'formula', config: { expression: { kind: 'binary', operator: ['+'], left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } }, resultType: 'boolean' }, expectedDatabaseVersion: formula.body.database.version } })
    assert.equal(malformedFormula.status, 400)
    current = await table()
    assert.equal(current.database.version, formula.body.database.version, 'invalid advanced enums make no schema mutation')
    const linkCell = await request(baseUrl, cellRoute('db-http-links'), 'PATCH', { cookie, body: { value: ['db-http-second-record'], expectedDatabaseVersion: current.database.version, expectedRecordVersion: current.records[0].version } })
    assert.equal(linkCell.status, 200)
    assert.equal(linkCell.body.record.properties['db-http-count-plus-one'], 2)
    assert.equal((await table()).records[0].properties['db-http-count-plus-one'], 2)
    const genericDerived = await request(baseUrl, `${databaseRoute}/views/${viewId}/records`, 'GET', { cookie })
    assert.equal(genericDerived.status, 200)
    assert.deepEqual(genericDerived.body, await table(), 'generic read preserves title, Relation, Rollup and Formula projections')
    const derivedCell = await request(baseUrl, cellRoute('db-http-link-count'), 'PATCH', { cookie, body: { value: 9, expectedDatabaseVersion: linkCell.body.database.version, expectedRecordVersion: linkCell.body.record.version } })
    assert.equal(derivedCell.status, 400)
    const oversizedRelation = await request(baseUrl, cellRoute('db-http-links'), 'PATCH', { cookie, body: { value: Array.from({ length: 51 }, (_, index) => `record-${index}`), expectedDatabaseVersion: linkCell.body.database.version, expectedRecordVersion: linkCell.body.record.version } })
    assert.equal(oversizedRelation.status, 400)
    current = await table()
    const derivedView = await request(baseUrl, `${databaseRoute}/views/${viewId}`, 'PATCH', { cookie, body: { config: { filters: [], sorts: [{ propertyId: 'db-http-count-plus-one', direction: 'asc' }], visibleProperties: null, propertyOrder: null }, expectedDatabaseVersion: current.database.version, expectedViewVersion: current.view.version } })
    assert.equal(derivedView.status, 400)
    assert.equal((await request(baseUrl, optionsRoute, 'GET', { cookie: outsiderCookie })).status, 404)
    assert.equal((await request(baseUrl, `${optionsRoute}/resolve`, 'POST', { cookie: outsiderCookie, body: { recordIds: ['db-http-second-record'] } })).status, 404)

    const sameOriginCell = await request(baseUrl, cellRoute('db-http-estimate'), 'PATCH', { cookie, origin: 'https://trusted.example.test', body: { value: 5, expectedDatabaseVersion: (await table()).database.version, expectedRecordVersion: (await table()).records[0].version } })
    assert.equal(sameOriginCell.status, 200)
    const attackerOriginCell = await request(baseUrl, cellRoute('db-http-estimate'), 'PATCH', { cookie, origin: 'https://attacker.example.test', body: { value: 6, expectedDatabaseVersion: sameOriginCell.body.database.version, expectedRecordVersion: sameOriginCell.body.record.version } })
    assert.equal(attackerOriginCell.status, 403)

    current = await table()
    const beforeTypeViewConfig = await request(baseUrl, `${databaseRoute}/views/${viewId}`, 'PATCH', {
      cookie,
      body: {
        config: {
          filters: [{ propertyId: 'db-http-estimate', operator: 'gt', value: 2 }],
          sorts: [{ propertyId: 'db-http-estimate', direction: 'asc' }],
          visibleProperties: [titlePropertyId, 'db-http-notes'],
          propertyOrder: ['db-http-notes'],
          options: opaqueViewOptions,
        },
        expectedDatabaseVersion: current.database.version,
        expectedViewVersion: current.view.version,
      },
    })
    assert.equal(beforeTypeViewConfig.status, 200)
    current = await table()
    const mutationRoute = `${routeForProperty('db-http-estimate')}/type`
    const mutationBody = (data: any, targetType: string) => ({ targetType, expectedDatabaseVersion: data.database.version, expectedPropertyVersion: data.properties.find((p: any) => p.id === 'db-http-estimate').version })
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { body: mutationBody(current, 'text') })).status, 401)
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { cookie: outsiderCookie, body: mutationBody(current, 'text') })).status, 404)
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { cookie, origin: 'https://attacker.example.test', body: mutationBody(current, 'text') })).status, 403)
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { cookie, body: { ...mutationBody(current, 'text'), options: [] } })).status, 400)
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { cookie, body: mutationBody(current, 'title') })).status, 400)
    assert.equal((await request(baseUrl, `${routeForProperty(titlePropertyId)}/type`, 'PATCH', { cookie, body: { targetType: 'text', expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === titlePropertyId).version } })).status, 400)
    const typeNoop = await request(baseUrl, mutationRoute, 'PATCH', { cookie, body: mutationBody(current, 'number') })
    assert.equal(typeNoop.status, 200)
    assert.equal(typeNoop.body.database.version, current.database.version)
    assert.deepEqual([typeNoop.body.convertedRecordCount, typeNoop.body.clearedRecordCount, typeNoop.body.repairedViewCount], [0, 0, 0])
    const typeChanged = await request(baseUrl, mutationRoute, 'PATCH', { cookie, origin: 'https://trusted.example.test', body: mutationBody(current, 'text') })
    assert.equal(typeChanged.status, 200)
    assert.equal(typeChanged.body.property.id, 'db-http-estimate')
    assert.equal(typeChanged.body.property.type, 'text')
    assert.equal(typeChanged.body.database.version, current.database.version + 1)
    assert.equal(typeChanged.body.convertedRecordCount, 1)
    assert.equal((await recordCollection.findOne({ id: recordId }))?.properties['db-http-estimate'], '5')
    assert.deepEqual((await table()).view.config.options, opaqueViewOptions, 'property type repair preserves opaque view options')
    assert.equal((await request(baseUrl, mutationRoute, 'PATCH', { cookie, body: mutationBody(current, 'number') })).status, 409)
    current = await table()
    const notesDelete = await request(baseUrl, deleteRoute, 'DELETE', { cookie, body: { expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === 'db-http-notes').version } })
    assert.equal(notesDelete.status, 200)
    const afterNotesDelete = await table()
    assert.equal(afterNotesDelete.properties.some((property: any) => property.id === 'db-http-notes'), false)
    assert.deepEqual(afterNotesDelete.view.config.options, opaqueViewOptions, 'property deletion repair preserves opaque view options')

    await t.test('generic records and legacy table share pagination, filters, multi-sort and cursor fences', async () => {
      const id = 'generic-db'
      const titleId = 'generic-title'
      const view = 'generic-view'
      const route = `/api/workspaces/${workspace}/databases/${id}`
      const viewRoute = `${route}/views/${view}`
      const created = await request(baseUrl, `/api/workspaces/${workspace}/pages/db-http-home/databases`, 'POST', {
        cookie, body: { id, name: 'Generic reads', titlePropertyId: titleId, viewId: view, blockId: 'generic-block', orderKey: 'd', parentBlockId: null },
      })
      assert.equal(created.status, 201)
      const read = async (kind = 'records', query = '') => {
        const result = await request(baseUrl, `${viewRoute}/${kind}${query}`, 'GET', { cookie })
        assert.equal(result.status, 200)
        return result.body
      }
      const scoreId = 'generic-score'
      const score = await request(baseUrl, `${route}/properties`, 'POST', {
        cookie, body: { id: scoreId, name: 'Score', type: 'number', expectedDatabaseVersion: created.body.database.version },
      })
      assert.equal(score.status, 201)
      const textId = 'generic-text'
      const textProperty = await request(baseUrl, `${route}/properties`, 'POST', {
        cookie, body: { id: textId, name: 'Text', type: 'text', expectedDatabaseVersion: (await read()).database.version },
      })
      assert.equal(textProperty.status, 201)
      const viewsRoute = `${route}/views`
      const opaqueOptions = { layout: { futureFlag: true, nested: { keep: ['unknown', 3] } } }
      const groupId = 'generic-group'
      const group = await request(baseUrl, `${route}/properties`, 'POST', {
        cookie, body: { id: groupId, name: 'Group', type: 'select', options: [{ id: 'open', name: 'Open' }, { id: 'done', name: 'Done' }], expectedDatabaseVersion: (await read()).database.version },
      })
      assert.equal(group.status, 201)
      const createView = async (id: string, type: string) => request(baseUrl, viewsRoute, 'POST', {
        cookie,
        body: { id, name: `${type} view`, type, config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: opaqueOptions }, expectedDatabaseVersion: (await read()).database.version },
      })
      for (const type of ['list', 'board']) {
        const response = await createView(`generic-${type}-view`, type)
        assert.equal(response.status, 201)
        const viewRecords = await request(baseUrl, `${route}/views/generic-${type}-view/records`, 'GET', { cookie })
        assert.equal(viewRecords.status, 200)
        assert.equal(viewRecords.body.view.type, type)
        assert.deepEqual(viewRecords.body.view.config.options, opaqueOptions)
      }
      const boardConfig = {
        filters: [{ propertyId: groupId, operator: 'is' as const, value: 'open' }],
        sorts: [{ propertyId: groupId, direction: 'asc' as const }],
        visibleProperties: [titleId, groupId], propertyOrder: [groupId],
        options: { groupByPropertyId: groupId, keepUnknown: true },
      }
      const createBoard = async (id: string, config: any) => request(baseUrl, viewsRoute, 'POST', {
        cookie, body: { id, name: 'Board view', type: 'board', config, expectedDatabaseVersion: (await read()).database.version },
      })
      const viewsCollection = connection!.db!.collection('database_views')
      const groupedBoardId = 'generic-grouped-board-view'
      const board = await createBoard(groupedBoardId, boardConfig)
      assert.equal(board.status, 201)
      assert.equal(board.body.view.type, 'board')
      assert.deepEqual(board.body.view.config.options, boardConfig.options)
      const boardRead = await request(baseUrl, `${route}/views/${groupedBoardId}/records`, 'GET', { cookie })
      assert.equal(boardRead.status, 200)
      assert.equal(boardRead.body.view.type, 'board')
      assert.deepEqual(boardRead.body.view.config.options, boardConfig.options)
      assert.equal((await createBoard('generic-board-no-group', { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { future: true } })).status, 201)
      const invalidBoardCount = await viewsCollection.countDocuments({ databaseId: id })
      const invalidBoardDbVersion = (await read()).database.version
      const foreign = await createBoard('generic-board-foreign', { ...boardConfig, options: { groupByPropertyId: 'db-http-status' } })
      assert.equal(foreign.status, 400)
      assert.equal(await viewsCollection.countDocuments({ databaseId: id }), invalidBoardCount)
      assert.equal((await read()).database.version, invalidBoardDbVersion)
      for (const [invalidViewId, invalidGroup] of [
        ['generic-board-number', scoreId],
        ['generic-board-text', textId],
        ['generic-board-missing', 'missing-group'],
        ['generic-board-bad-id', ' bad-id'],
      ] as const) {
        const before = (await read()).database.version
        const countBefore = await viewsCollection.countDocuments({ databaseId: id })
        const invalid = await createBoard(invalidViewId, { ...boardConfig, options: { groupByPropertyId: invalidGroup } })
        assert.equal(invalid.status, 400)
        assert.equal(await viewsCollection.countDocuments({ databaseId: id }), countBefore)
        assert.equal((await read()).database.version, before, 'invalid Board config must not advance database version')
      }
      const invalidBoardPatch = await request(baseUrl, `${route}/views/${groupedBoardId}`, 'PATCH', {
        cookie, body: { config: { ...boardConfig, options: { groupByPropertyId: scoreId } }, expectedDatabaseVersion: (await read()).database.version, expectedViewVersion: board.body.view.version },
      })
      assert.equal(invalidBoardPatch.status, 400, 'PATCH validates using the persisted Board type')
      const validBoardPatch = await request(baseUrl, `${route}/views/${groupedBoardId}`, 'PATCH', {
        cookie, body: { config: { ...boardConfig, options: { ...boardConfig.options, patched: true } }, expectedDatabaseVersion: (await read()).database.version, expectedViewVersion: board.body.view.version },
      })
      assert.equal(validBoardPatch.status, 200)
      assert.equal(validBoardPatch.body.view.type, 'board')
      assert.deepEqual(validBoardPatch.body.view.config.options, { ...boardConfig.options, patched: true })

      // P9.4A preserves groupByPropertyId through property repairs; dangling group repair is deferred to P9.4B.
      const configuredBoard = validBoardPatch.body.view
      const clearOptions = await request(baseUrl, `${route}/properties/${groupId}`, 'PATCH', {
        cookie, body: { options: [], expectedDatabaseVersion: (await read()).database.version, expectedPropertyVersion: group.body.property.version },
      })
      assert.equal(clearOptions.status, 200)
      let repairedBoard = (await request(baseUrl, `${route}/views`, 'GET', { cookie })).body.find((item: any) => item.id === configuredBoard.id)
      assert.equal(repairedBoard.version, configuredBoard.version + 1)
      assert.deepEqual(repairedBoard.config.filters, [])
      assert.deepEqual(repairedBoard.config.options, configuredBoard.config.options)
      assert.deepEqual(repairedBoard.config.sorts, configuredBoard.config.sorts)
      assert.deepEqual(repairedBoard.config.visibleProperties, configuredBoard.config.visibleProperties)
      assert.deepEqual(repairedBoard.config.propertyOrder, configuredBoard.config.propertyOrder)
      const groupEmptyFilter = await request(baseUrl, `${route}/views/${configuredBoard.id}`, 'PATCH', {
        cookie, body: {
          config: { ...repairedBoard.config, filters: [{ propertyId: groupId, operator: 'is_empty' }] },
          expectedDatabaseVersion: (await read()).database.version, expectedViewVersion: repairedBoard.version,
        },
      })
      assert.equal(groupEmptyFilter.status, 200)
      repairedBoard = groupEmptyFilter.body.view
      const afterCleanup = await read()
      const changedGroupType = await request(baseUrl, `${route}/properties/${groupId}/type`, 'PATCH', {
        cookie, body: { targetType: 'text', expectedDatabaseVersion: afterCleanup.database.version, expectedPropertyVersion: clearOptions.body.property.version },
      })
      assert.equal(changedGroupType.status, 200)
      let typeRepairedBoard = (await request(baseUrl, `${route}/views`, 'GET', { cookie })).body.find((item: any) => item.id === configuredBoard.id)
      assert.equal(typeRepairedBoard.version, repairedBoard.version + 1)
      assert.deepEqual(typeRepairedBoard.config.filters, [])
      assert.deepEqual(typeRepairedBoard.config.options, configuredBoard.config.options)
      assert.deepEqual(typeRepairedBoard.config.sorts, configuredBoard.config.sorts)
      assert.deepEqual(typeRepairedBoard.config.visibleProperties, configuredBoard.config.visibleProperties)
      assert.deepEqual(typeRepairedBoard.config.propertyOrder, configuredBoard.config.propertyOrder)
      const afterTypeChange = await read()
      const deletedGroup = await request(baseUrl, `${route}/properties/${groupId}`, 'DELETE', {
        cookie, body: { expectedDatabaseVersion: afterTypeChange.database.version, expectedPropertyVersion: changedGroupType.body.property.version },
      })
      assert.equal(deletedGroup.status, 200)
      const boardAfterDelete = (await request(baseUrl, `${route}/views`, 'GET', { cookie })).body.find((item: any) => item.id === configuredBoard.id)
      assert.equal(boardAfterDelete.version, typeRepairedBoard.version + 1)
      assert.deepEqual(boardAfterDelete.config.options, configuredBoard.config.options)
      assert.deepEqual(boardAfterDelete.config.sorts, [])
      assert.deepEqual(boardAfterDelete.config.visibleProperties, [titleId])
      assert.deepEqual(boardAfterDelete.config.propertyOrder, [])
      assert.equal((await request(baseUrl, `${route}/views/${configuredBoard.id}/records`, 'GET', { cookie })).status, 409)
      const listedViews = await request(baseUrl, viewsRoute, 'GET', { cookie })
      assert.equal(listedViews.status, 200)
      for (const type of ['list', 'board']) {
        const listedView = listedViews.body.find((item: any) => item.id === `generic-${type}-view`)
        assert.equal(listedView.type, type)
        assert.deepEqual(listedView.config.options, opaqueOptions)
      }
      const viewsBeforeInvalid = await viewsCollection.countDocuments({ databaseId: id })
      const invalidType = await request(baseUrl, viewsRoute, 'POST', {
        cookie,
        body: { id: 'generic-invalid-view', name: 'Invalid view', type: 'calendar', expectedDatabaseVersion: (await read()).database.version },
      })
      assert.equal(invalidType.status, 400)
      assert.equal(await viewsCollection.countDocuments({ databaseId: id }), viewsBeforeInvalid, 'invalid view type must not create a record')

      for (const [suffix, title, value] of [['a', 'Zulu', 2], ['b', 'Alpha', 1], ['c', 'Beta', 1], ['d', 'Skip', 0]] as const) {
        const record = await request(baseUrl, `${route}/records`, 'POST', {
          cookie, body: { id: `generic-${suffix}`, pageId: `generic-page-${suffix}`, title, orderKey: suffix },
        })
        assert.equal(record.status, 201)
        const data = await read()
        const updated = await request(baseUrl, `${route}/records/generic-${suffix}/cells/${scoreId}`, 'PATCH', {
          cookie, body: { value, expectedDatabaseVersion: data.database.version, expectedRecordVersion: record.body.record.version },
        })
        assert.equal(updated.status, 200)
      }

      const first = await read('records', '?limit=2')
      assert.deepEqual(first, await read('table', '?limit=2'))
      assert.equal(first.view.type, 'table')
      assert.equal(Object.hasOwn(first.view.config, 'options'), false, 'legacy config without options remains readable')
      assert.deepEqual(first.records.map((row: any) => row.id), ['generic-a', 'generic-b'])
      assert.ok(first.nextCursor)
      const nextQuery = `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`
      const second = await read('records', nextQuery)
      assert.deepEqual(second, await read('table', nextQuery), 'cursors work across both endpoints')
      assert.deepEqual(second.records.map((row: any) => row.id), ['generic-c', 'generic-d'])
      assert.equal(second.nextCursor, null)
      assert.equal((await request(baseUrl, `${viewRoute}/records`)).status, 401)
      assert.equal((await request(baseUrl, `${viewRoute}/records`, 'GET', { cookie: outsiderCookie })).status, 404)
      for (const query of ['?limit=101', '?cursor=bad', '?extra=true']) {
        assert.equal((await request(baseUrl, `${viewRoute}/records${query}`, 'GET', { cookie })).status, 400)
      }

      const config = { filters: [{ propertyId: scoreId, operator: 'gt', value: 0 }], sorts: [{ propertyId: scoreId, direction: 'asc' }, { propertyId: titleId, direction: 'desc' }], visibleProperties: null, propertyOrder: null }
      const configure = await request(baseUrl, viewRoute, 'PATCH', {
        cookie, body: { config, expectedDatabaseVersion: first.database.version, expectedViewVersion: first.view.version },
      })
      assert.equal(configure.status, 200)
      const sorted = await read()
      assert.deepEqual(sorted, await read('table'))
      assert.deepEqual(sorted.records.map((row: any) => row.id), ['generic-c', 'generic-b', 'generic-a'], 'filter applies before paging and secondary sort breaks score ties')
      const sortedFirst = await read('records', '?limit=1')
      const sortedSecondQuery = `?limit=1&cursor=${encodeURIComponent(sortedFirst.nextCursor)}`
      const sortedSecond = await read('records', sortedSecondQuery)
      assert.deepEqual(sortedSecond, await read('table', sortedSecondQuery))
      assert.deepEqual(sortedSecond.records.map((row: any) => row.id), ['generic-b'])
      const sortedThird = await read('records', `?limit=1&cursor=${encodeURIComponent(sortedSecond.nextCursor)}`)
      assert.deepEqual(sortedThird.records.map((row: any) => row.id), ['generic-a'])
      assert.equal(sortedThird.nextCursor, null)

      // Change each scope independently while keeping a valid cursor envelope.
      const cursor = JSON.parse(Buffer.from(sortedFirst.nextCursor, 'base64url').toString('utf8'))
      for (const field of ['w', 'd', 'v']) {
        const scopedCursor = Buffer.from(JSON.stringify({ ...cursor, [field]: `other-${field}` })).toString('base64url')
        const rejected = await request(baseUrl, `${viewRoute}/records?cursor=${encodeURIComponent(scopedCursor)}`, 'GET', { cookie })
        assert.equal(rejected.status, 400)
        assert.match(rejected.body.message, /different workspace, database, or view/)
      }
      assert.equal((await request(baseUrl, `/api/workspaces/${workspace}/databases/${secondDbId}/views/db-http-second-view/records${sortedSecondQuery}`, 'GET', { cookie })).status, 400)

      const expectFence = async (query: string) => {
        for (const kind of ['records', 'table']) {
          const rejected = await request(baseUrl, `${viewRoute}/${kind}${query}`, 'GET', { cookie })
          assert.equal(rejected.status, 409)
          assert.match(rejected.body.message, /Database or view changed/)
        }
      }
      await expectFence(nextQuery) // Config/version mutation invalidated the old default cursor.
      const schemaChange = await request(baseUrl, `${route}/properties`, 'POST', {
        cookie, body: { id: 'generic-notes', name: 'Notes', type: 'text', expectedDatabaseVersion: sortedFirst.database.version },
      })
      assert.equal(schemaChange.status, 201)
      await expectFence(sortedSecondQuery)

      const versionFirst = await read('records', '?limit=1')
      // Isolate view-version and config-hash fences from the Database version.
      const views = connection!.db!.collection('database_views')
      await views.updateOne({ id: view }, { $inc: { version: 1 } })
      await expectFence(`?cursor=${encodeURIComponent(versionFirst.nextCursor)}`)
      const configFirst = await read('records', '?limit=1')
      await views.updateOne({ id: view }, { $set: { 'config.sorts': [{ propertyId: titleId, direction: 'asc' }] } })
      await expectFence(`?cursor=${encodeURIComponent(configFirst.nextCursor)}`)
      assert.deepEqual(await read(), await read('table'), 'both endpoints can restart after config changes')
    })
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
