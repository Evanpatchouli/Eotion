import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { getConnectionToken } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'

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
    const { AppModule } = await import('../../app.module')
    app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
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
    const notesDelete = await request(baseUrl, deleteRoute, 'DELETE', { cookie, body: { expectedDatabaseVersion: current.database.version, expectedPropertyVersion: current.properties.find((p: any) => p.id === 'db-http-notes').version } })
    assert.equal(notesDelete.status, 200)
    assert.equal((await table()).properties.some((property: any) => property.id === 'db-http-notes'), false)
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
