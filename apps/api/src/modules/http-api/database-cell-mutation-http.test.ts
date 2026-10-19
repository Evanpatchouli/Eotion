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
import { DatabaseRecordRepository } from '../server-domain/repositories/database.repository'
import { UserRepository } from '../server-domain/repositories/user.repository'
import { DatabaseService } from '../server-domain/services/database.service'

type Result = { status: number; body: Record<string, any>; headers: Headers }

async function request(base: string, route: string, method = 'GET', cookie?: string, body?: unknown): Promise<Result> {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const payload = await response.text()
  return { status: response.status, body: payload ? JSON.parse(payload) as Record<string, any> : {}, headers: response.headers }
}

test('generic cell batch is atomic, versioned, scoped, and has durable receipts', async t => {
  const source = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!source) return t.skip('P4_TEST_MONGODB_URI must name an isolated replica set')
  const previousUri = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  const uri = new URL(source)
  uri.pathname = `/eotion_cell_batch_${randomUUID().replaceAll('-', '')}`
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let connection: Connection | undefined
  try {
    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(process.env.MONGODB_URI), HttpApiModule] })
    class TestModule {}
    app = await NestFactory.create(TestModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    connection = app.get<Connection>(getConnectionToken())
    const owner = { email: 'batch-owner@example.test', password: 'correct horse battery staple' }
    assert.equal((await request(base, '/api/auth/register', 'POST', undefined, owner)).status, 201)
    const login = await request(base, '/api/auth/login', 'POST', undefined, owner)
    const cookie = login.headers.get('set-cookie')!.split(';', 1)[0]!
    assert.equal((await request(base, '/api/workspaces', 'POST', cookie, { id: 'batch-ws', name: 'Batch' })).status, 201)
    assert.equal((await request(base, '/api/workspaces/batch-ws/pages', 'POST', cookie, { id: 'batch-home', parentPageId: null, title: 'Home', orderKey: 'a' })).status, 201)
    const route = '/api/workspaces/batch-ws/databases/batch-db'
    assert.equal((await request(base, '/api/workspaces/batch-ws/pages/batch-home/databases', 'POST', cookie,
      { id: 'batch-db', name: 'Tasks', titlePropertyId: 'batch-title', viewId: 'batch-view', blockId: 'batch-block', orderKey: 'a', parentBlockId: null })).status, 201)
    for (const [id, title] of [['batch-a', 'A'], ['batch-b', 'B']]) {
      assert.equal((await request(base, `${route}/records`, 'POST', cookie, { id, pageId: `${id}-page`, title, orderKey: id })).status, 201)
    }
    const snapshot = async () => {
      const result = await request(base, `${route}/views/batch-view/records`, 'GET', cookie)
      assert.equal(result.status, 200)
      return result.body
    }
    for (const [id, type] of [['batch-text', 'text'], ['batch-date', 'date']]) {
      const before = await snapshot()
      assert.equal((await request(base, `${route}/properties`, 'POST', cookie, { id, name: id, type, expectedDatabaseVersion: before.database.version })).status, 201)
    }
    const initial = await snapshot()
    const row = (data: any, id: string) => data.records.find((record: any) => record.id === id)
    const mutation = (data: any, id: string, records: unknown[]) => ({ mutationId: id, expectedDatabaseVersion: data.database.version, records })
    const update = (data: any, id: string, value: string) => ({ recordId: id, expectedRecordVersion: row(data, id).version, cells: [{ propertyId: 'batch-text', value }] })
    const first = mutation(initial, 'batch-mutation-1', [
      { recordId: 'batch-a', expectedRecordVersion: row(initial, 'batch-a').version, cells: [{ propertyId: 'batch-text', value: 'changed' }, { propertyId: 'batch-date', value: { start: '2026-10-16' } }] },
      update(initial, 'batch-b', 'second'),
    ])
    const committed = await request(base, `${route}/cell-mutations`, 'POST', cookie, first)
    assert.equal(committed.status, 201, JSON.stringify(committed.body))
    assert.equal(committed.body.database.version, initial.database.version + 1)
    assert.equal(committed.body.records.length, 2)
    assert.equal(committed.body.records.find((record: any) => record.id === 'batch-a').properties['batch-title'], 'A')
    assert.equal((await request(base, `${route}/cell-mutations/batch-mutation-1`, 'GET', cookie)).body.status, 'committed')
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie, first)).status, 409)
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie, { ...first, expectedDatabaseVersion: 999 })).status, 409)
    const after = await snapshot()
    assert.equal(row(after, 'batch-a').version, row(initial, 'batch-a').version + 1)
    assert.equal(row(after, 'batch-b').version, row(initial, 'batch-b').version + 1)

    const noop = await request(base, `${route}/cell-mutations`, 'POST', cookie, mutation(after, 'batch-mutation-noop', [update(after, 'batch-b', 'second')]))
    assert.equal(noop.status, 201, JSON.stringify(noop.body))
    assert.equal(noop.body.database.version, after.database.version)
    assert.equal(noop.body.records[0].version, row(after, 'batch-b').version)

    const invalid = await request(base, `${route}/cell-mutations`, 'POST', cookie, mutation(after, 'batch-mutation-invalid', [
      update(after, 'batch-a', 'must rollback'),
      { recordId: 'batch-b', expectedRecordVersion: row(after, 'batch-b').version, cells: [{ propertyId: 'batch-date', value: 'invalid-date' }] },
    ]))
    assert.equal(invalid.status, 400, JSON.stringify(invalid.body))
    assert.equal((await request(base, `${route}/cell-mutations/batch-mutation-invalid`, 'GET', cookie)).body.status, 'not_committed')
    const rolledBack = await snapshot()
    assert.equal(row(rolledBack, 'batch-a').properties['batch-text'], 'changed')
    assert.equal(rolledBack.database.version, after.database.version)

    const stale = await request(base, `${route}/cell-mutations`, 'POST', cookie, mutation(after, 'batch-mutation-stale', [
      update(after, 'batch-a', 'must rollback'),
      { recordId: 'batch-b', expectedRecordVersion: row(after, 'batch-b').version - 1, cells: [{ propertyId: 'batch-text', value: 'stale' }] },
    ]))
    assert.equal(stale.status, 409)
    assert.equal((await request(base, `${route}/cell-mutations/batch-mutation-stale`, 'GET', cookie)).body.status, 'not_committed')
    assert.equal((await request(base, `${route}/cell-mutations/missing-id`, 'GET', cookie)).body.status, 'uncertain')
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', undefined, first)).status, 401)

    const staleDb = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(after, 'batch-stale-database', [update(after, 'batch-a', 'stale')]), expectedDatabaseVersion: after.database.version - 1 })
    assert.equal(staleDb.status, 409)
    for (const [id, index] of [['batch-stale-first', 0], ['batch-stale-last', 1]] as const) {
      const requests = [update(after, 'batch-a', 'first'), update(after, 'batch-b', 'last')]
      requests[index]!.expectedRecordVersion--
      const result = await request(base, `${route}/cell-mutations`, 'POST', cookie, mutation(after, id, requests))
      assert.equal(result.status, 409)
    }
    const invalidProperty = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(after, 'batch-invalid-property', [{ recordId: 'batch-a', expectedRecordVersion: row(after, 'batch-a').version,
        cells: [{ propertyId: 'batch-missing', value: 'x' }] }]))
    assert.equal(invalidProperty.status, 404)
    const forbiddenTitle = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(after, 'batch-forbidden-title', [{ recordId: 'batch-a', expectedRecordVersion: row(after, 'batch-a').version,
        cells: [{ propertyId: 'batch-title', value: 'No' }] }]))
    assert.equal(forbiddenTitle.status, 400)
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(after, 'batch-duplicate', [update(after, 'batch-a', 'x'), update(after, 'batch-a', 'y')]))).status, 400)
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(after, 'batch-duplicate-cell', [{ recordId: 'batch-a', expectedRecordVersion: row(after, 'batch-a').version,
        cells: [{ propertyId: 'batch-text', value: 'x' }, { propertyId: 'batch-text', value: 'y' }] }]))).status, 400)

    const repository = app.get(DatabaseRecordRepository)
    const originalUpdate = repository.updateProperties.bind(repository)
    let applied = 0
    repository.updateProperties = async (...args) => {
      applied++
      return applied === 2 ? null : originalUpdate(...args)
    }
    try {
      const injectedFailure = await request(base, `${route}/cell-mutations`, 'POST', cookie,
        mutation(after, 'batch-injected-last-cas-failure', [update(after, 'batch-a', 'first applied'), update(after, 'batch-b', 'then fail')]))
      assert.equal(injectedFailure.status, 409, JSON.stringify(injectedFailure.body))
      assert.equal(applied, 2)
    } finally {
      repository.updateProperties = originalUpdate
    }
    const afterInjectedFailure = await snapshot()
    assert.equal(afterInjectedFailure.database.version, after.database.version)
    assert.equal(row(afterInjectedFailure, 'batch-a').version, row(after, 'batch-a').version)
    assert.equal(row(afterInjectedFailure, 'batch-a').properties['batch-text'], 'changed')
    assert.equal((await request(base, `${route}/cell-mutations/batch-injected-last-cas-failure`, 'GET', cookie)).body.status, 'not_committed')
    applied = 0
    repository.updateProperties = async (...args) => {
      applied++
      if (applied === 2) throw new Error('injected transaction abort after first write')
      return originalUpdate(...args)
    }
    try {
      const aborted = await request(base, `${route}/cell-mutations`, 'POST', cookie,
        mutation(after, 'batch-injected-error-abort', [update(after, 'batch-a', 'first applied'), update(after, 'batch-b', 'then error')]))
      assert.equal(aborted.status, 500)
      assert.equal(applied, 2)
    } finally {
      repository.updateProperties = originalUpdate
    }
    assert.equal((await request(base, `${route}/cell-mutations/batch-injected-error-abort`, 'GET', cookie)).body.status, 'not_committed')
    assert.equal((await snapshot()).database.version, after.database.version)

    const beforeRelation = await snapshot()
    assert.equal((await request(base, `${route}/properties`, 'POST', cookie,
      { id: 'batch-links', name: 'Blocks', type: 'relation', config: { targetDatabaseId: 'batch-db' }, expectedDatabaseVersion: beforeRelation.database.version })).status, 201)
    const withRelation = await snapshot()
    const seeded = await request(base, `${route}/cell-mutations`, 'POST', cookie, mutation(withRelation, 'batch-seed-dates', [
      { recordId: 'batch-a', expectedRecordVersion: row(withRelation, 'batch-a').version, cells: [{ propertyId: 'batch-date', value: { start: '2026-10-20' } }] },
      { recordId: 'batch-b', expectedRecordVersion: row(withRelation, 'batch-b').version, cells: [{ propertyId: 'batch-date', value: { start: '2026-10-17' } }] },
    ]))
    assert.equal(seeded.status, 201, JSON.stringify(seeded.body))
    const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
      options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'batch-date' },
        dependency: { propertyId: 'batch-links', direction: 'blocks', shiftMode: 'shift_when_overlapping', avoidWeekends: false } } } }
    const timeline = await request(base, `${route}/views`, 'POST', cookie,
      { id: 'batch-timeline', name: 'Timeline', type: 'timeline', config, expectedDatabaseVersion: seeded.body.database.version })
    assert.equal(timeline.status, 201, JSON.stringify(timeline.body))
    const beforeLink = await snapshot()
    const linked = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeLink, 'batch-link-and-shift', [{ recordId: 'batch-a', expectedRecordVersion: row(beforeLink, 'batch-a').version,
        cells: [{ propertyId: 'batch-links', value: ['batch-b'] }] }]),
        context: { viewId: 'batch-timeline', expectedViewVersion: timeline.body.view.version } })
    assert.equal(linked.status, 201, JSON.stringify(linked.body))
    assert.equal(linked.body.records.length, 2, 'root relation and cascaded Date commit together')
    const shifted = await snapshot()
    assert.deepEqual(row(shifted, 'batch-a').properties['batch-links'], ['batch-b'])
    assert.ok(row(shifted, 'batch-b').properties['batch-date'].start >= '2026-10-20')

    const contenders = await Promise.all(['one', 'two'].map(label => request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(shifted, `batch-concurrent-${label}`, [update(shifted, 'batch-b', label)]))))
    assert.deepEqual(contenders.map(result => result.status).sort(), [201, 409])
    const winner = contenders.find(result => result.status === 201)!
    const afterRace = await snapshot()
    assert.equal(afterRace.database.version, shifted.database.version + 1)
    assert.equal(row(afterRace, 'batch-b').version, row(shifted, 'batch-b').version + 1)
    assert.equal(row(afterRace, 'batch-b').properties['batch-text'], winner.body.records[0].properties['batch-text'])
    const invalidRelation = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(afterRace, 'batch-invalid-relation', [
        update(afterRace, 'batch-b', 'must rollback'),
        { recordId: 'batch-a', expectedRecordVersion: row(afterRace, 'batch-a').version,
          cells: [{ propertyId: 'batch-links', value: ['missing-record'] }] },
      ]))
    assert.equal(invalidRelation.status, 400)
    assert.equal((await snapshot()).database.version, afterRace.database.version)

    for (const id of ['batch-c', 'batch-d', 'batch-external']) {
      assert.equal((await request(base, `${route}/records`, 'POST', cookie,
        { id, pageId: `${id}-page`, title: id, orderKey: id })).status, 201)
    }
    const beforeChain = await snapshot()
    const chainSeed = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeChain, 'batch-chain-seed', [
        { recordId: 'batch-b', expectedRecordVersion: row(beforeChain, 'batch-b').version,
          cells: [{ propertyId: 'batch-links', value: ['batch-c'] }, { propertyId: 'batch-date', value: { start: '2026-10-18' } }] },
        { recordId: 'batch-c', expectedRecordVersion: row(beforeChain, 'batch-c').version,
          cells: [{ propertyId: 'batch-links', value: ['batch-d'] }, { propertyId: 'batch-date', value: { start: '2026-10-19' } }] },
        { recordId: 'batch-d', expectedRecordVersion: row(beforeChain, 'batch-d').version,
          cells: [{ propertyId: 'batch-date', value: { start: '2026-10-19' } }] },
        { recordId: 'batch-external', expectedRecordVersion: row(beforeChain, 'batch-external').version,
          cells: [{ propertyId: 'batch-links', value: ['batch-c'] }, { propertyId: 'batch-date', value: { start: '2026-10-29' } }] },
      ]))
    assert.equal(chainSeed.status, 201, JSON.stringify(chainSeed.body))
    const filteredConfig = { ...config, filters: [{ propertyId: 'batch-title', operator: 'is', value: 'A' }] }
    const filtered = await request(base, `${route}/views/batch-timeline`, 'PATCH', cookie,
      { config: filteredConfig, expectedDatabaseVersion: chainSeed.body.database.version, expectedViewVersion: timeline.body.view.version })
    assert.equal(filtered.status, 200, JSON.stringify(filtered.body))
    const beforeCascade = await snapshot()
    const cascade = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeCascade, 'batch-filtered-canonical-chain', [
        { recordId: 'batch-a', expectedRecordVersion: row(beforeCascade, 'batch-a').version,
          cells: [{ propertyId: 'batch-date', value: { start: '2026-10-26' } }] },
      ]), context: { viewId: 'batch-timeline', expectedViewVersion: filtered.body.view.version } })
    assert.equal(cascade.status, 201, JSON.stringify(cascade.body))
    assert.deepEqual(cascade.body.records.map((record: any) => record.id), ['batch-a', 'batch-b', 'batch-c', 'batch-d'])
    const afterCascade = await snapshot()
    assert.ok(row(afterCascade, 'batch-c').properties['batch-date'].start >= '2026-10-29', 'external predecessor remains an incoming constraint')
    assert.ok(row(afterCascade, 'batch-d').properties['batch-date'].start >= row(afterCascade, 'batch-c').properties['batch-date'].start)
    assert.equal(row(afterCascade, 'batch-external').version, row(beforeCascade, 'batch-external').version)

    const staleView = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(afterCascade, 'batch-stale-view', [{ recordId: 'batch-a', expectedRecordVersion: row(afterCascade, 'batch-a').version,
        cells: [{ propertyId: 'batch-date', value: { start: '2026-10-30' } }] }]),
        context: { viewId: 'batch-timeline', expectedViewVersion: filtered.body.view.version - 1 } })
    assert.equal(staleView.status, 409)
    const cycle = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(afterCascade, 'batch-cycle-rollback', [{ recordId: 'batch-d', expectedRecordVersion: row(afterCascade, 'batch-d').version,
        cells: [{ propertyId: 'batch-links', value: ['batch-a'] }] }]),
        context: { viewId: 'batch-timeline', expectedViewVersion: filtered.body.view.version } })
    assert.equal(cycle.status, 400, JSON.stringify(cycle.body))
    const afterCycle = await snapshot()
    assert.equal(afterCycle.database.version, afterCascade.database.version)
    assert.equal(row(afterCycle, 'batch-d').properties['batch-links'], undefined)
    assert.equal(row(afterCycle, 'batch-d').version, row(afterCascade, 'batch-d').version)

    for (const id of ['batch-u', 'batch-v']) assert.equal((await request(base, `${route}/records`, 'POST', cookie,
      { id, pageId: `${id}-page`, title: id, orderKey: id })).status, 201)
    const beforeUnrelated = await snapshot()
    const unrelatedCycle = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeUnrelated, 'batch-unrelated-cycle-seed', ['batch-u', 'batch-v'].map((id, index) => ({
        recordId: id, expectedRecordVersion: row(beforeUnrelated, id).version,
        cells: [{ propertyId: 'batch-date', value: { start: '2026-10-20' } },
          { propertyId: 'batch-links', value: [index === 0 ? 'batch-v' : 'batch-u'] }],
      }))))
    assert.equal(unrelatedCycle.status, 201, JSON.stringify(unrelatedCycle.body))
    const beforeUnrelatedMove = await snapshot()
    const unrelatedMove = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeUnrelatedMove, 'batch-unrelated-cycle-ignored', [{ recordId: 'batch-a', expectedRecordVersion: row(beforeUnrelatedMove, 'batch-a').version,
        cells: [{ propertyId: 'batch-date', value: { start: '2026-11-02' } }] }]),
        context: { viewId: 'batch-timeline', expectedViewVersion: filtered.body.view.version } })
    assert.equal(unrelatedMove.status, 201, JSON.stringify(unrelatedMove.body))

    let beforeStartEnd = await snapshot()
    for (const id of ['batch-start', 'batch-end']) {
      const created = await request(base, `${route}/properties`, 'POST', cookie,
        { id, name: id, type: 'date', expectedDatabaseVersion: beforeStartEnd.database.version })
      assert.equal(created.status, 201)
      beforeStartEnd = await snapshot()
    }
    const startEnd = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeStartEnd, 'batch-start-end-atomic', [{ recordId: 'batch-a', expectedRecordVersion: row(beforeStartEnd, 'batch-a').version,
        cells: [{ propertyId: 'batch-start', value: { start: '2026-11-03' } }, { propertyId: 'batch-end', value: { start: '2026-11-05' } }] }]))
    assert.equal(startEnd.status, 201, JSON.stringify(startEnd.body))
    assert.equal(startEnd.body.database.version, beforeStartEnd.database.version + 1)
    assert.equal(startEnd.body.records[0].version, row(beforeStartEnd, 'batch-a').version + 1)
    assert.equal(startEnd.body.records[0].properties['batch-start'].start, '2026-11-03')
    assert.equal(startEnd.body.records[0].properties['batch-end'].start, '2026-11-05')

    const outsider = { email: 'batch-outsider@example.test', password: 'correct horse battery staple' }
    assert.equal((await request(base, '/api/auth/register', 'POST', undefined, outsider)).status, 201)
    const outsiderLogin = await request(base, '/api/auth/login', 'POST', undefined, outsider)
    const outsiderCookie = outsiderLogin.headers.get('set-cookie')!.split(';', 1)[0]!
    assert.equal((await request(base, `${route}/cell-mutations/batch-start-end-atomic`, 'GET', outsiderCookie)).status, 404)
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', outsiderCookie,
      mutation(await snapshot(), 'batch-outsider-mutation', [update(await snapshot(), 'batch-a', 'forbidden')]))).status, 404)
    assert.equal((await request(base, '/api/workspaces/batch-ws/databases/missing-db/cell-mutations/batch-start-end-atomic', 'GET', cookie)).status, 404)

    assert.equal((await request(base, `${route}/records`, 'POST', cookie,
      { id: 'batch-future', pageId: 'batch-future-page', title: 'Future', orderKey: 'batch-future' })).status, 201)
    const beforeFuture = await snapshot()
    const futureDate = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeFuture, 'batch-future-date', [{ recordId: 'batch-future', expectedRecordVersion: row(beforeFuture, 'batch-future').version,
        cells: [{ propertyId: 'batch-date', value: { start: '2026-12-01' } }] }]))
    assert.equal(futureDate.status, 201)
    const dependsConfig = { ...config, options: { timeline: { ...config.options.timeline,
      dependency: { ...config.options.timeline.dependency, direction: 'depends-on' } } } }
    const dependsView = await request(base, `${route}/views`, 'POST', cookie,
      { id: 'batch-depends-view', name: 'Depends', type: 'timeline', config: dependsConfig, expectedDatabaseVersion: futureDate.body.database.version })
    assert.equal(dependsView.status, 201, JSON.stringify(dependsView.body))
    const beforeDepends = await snapshot()
    const depends = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeDepends, 'batch-depends-relation-and-date', [{ recordId: 'batch-d', expectedRecordVersion: row(beforeDepends, 'batch-d').version,
        cells: [{ propertyId: 'batch-links', value: ['batch-future'] }] }]),
        context: { viewId: 'batch-depends-view', expectedViewVersion: dependsView.body.view.version } })
    assert.equal(depends.status, 201, JSON.stringify(depends.body))
    const afterDepends = await snapshot()
    assert.deepEqual(row(afterDepends, 'batch-d').properties['batch-links'], ['batch-future'], 'relation owner retains the newly created edge')
    assert.ok(row(afterDepends, 'batch-d').properties['batch-date'].start >= '2026-12-01')

    for (const id of ['batch-blank', 'batch-after-blank']) assert.equal((await request(base, `${route}/records`, 'POST', cookie,
      { id, pageId: `${id}-page`, title: id, orderKey: id })).status, 201)
    const beforeBlank = await snapshot()
    const blankSeed = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeBlank, 'batch-blank-path-seed', [
        { recordId: 'batch-blank', expectedRecordVersion: row(beforeBlank, 'batch-blank').version,
          cells: [{ propertyId: 'batch-links', value: ['batch-after-blank'] }] },
        { recordId: 'batch-after-blank', expectedRecordVersion: row(beforeBlank, 'batch-after-blank').version,
          cells: [{ propertyId: 'batch-date', value: { start: '2026-10-01' } }] },
      ]))
    assert.equal(blankSeed.status, 201)
    const beforeBlankLink = await snapshot()
    const blankLink = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeBlankLink, 'batch-unscheduled-stop', [{ recordId: 'batch-d', expectedRecordVersion: row(beforeBlankLink, 'batch-d').version,
        cells: [{ propertyId: 'batch-links', value: ['batch-future', 'batch-blank'] }] }]),
        context: { viewId: 'batch-timeline', expectedViewVersion: filtered.body.view.version } })
    assert.equal(blankLink.status, 201, JSON.stringify(blankLink.body))
    const afterBlankLink = await snapshot()
    assert.equal(row(afterBlankLink, 'batch-after-blank').properties['batch-date'].start, '2026-10-01')

    const formula = await request(base, `${route}/properties`, 'POST', cookie,
      { id: 'batch-derived', name: 'Derived', type: 'formula',
        config: { expression: { kind: 'property', propertyId: 'batch-date' }, resultType: 'date' },
        expectedDatabaseVersion: afterBlankLink.database.version })
    assert.equal(formula.status, 201, JSON.stringify(formula.body))
    const beforeDerivedWrite = await snapshot()
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeDerivedWrite, 'batch-derived-rejected', [{ recordId: 'batch-a', expectedRecordVersion: row(beforeDerivedWrite, 'batch-a').version,
        cells: [{ propertyId: 'batch-derived', value: { start: '2026-12-03' } }] }]))).status, 400)
    const tooManyRecords = Array.from({ length: 501 }, (_, index) => ({ recordId: `batch-bound-${index}`, expectedRecordVersion: 1,
      cells: [{ propertyId: 'batch-text', value: 'x' }] }))
    assert.equal((await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeDerivedWrite, 'batch-too-many-records', tooManyRecords))).status, 400)
    const noShiftConfig = { ...config, options: { timeline: { ...config.options.timeline,
      dependency: { ...config.options.timeline.dependency, shiftMode: 'no_auto_shift' } } } }
    const noShiftView = await request(base, `${route}/views`, 'POST', cookie,
      { id: 'batch-no-shift-view', name: 'No shift', type: 'timeline', config: noShiftConfig,
        expectedDatabaseVersion: (await snapshot()).database.version })
    assert.equal(noShiftView.status, 201)
    const beforeNoShift = await snapshot()
    const noShiftCycle = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      { ...mutation(beforeNoShift, 'batch-no-shift-cycle-allowed', [{ recordId: 'batch-d', expectedRecordVersion: row(beforeNoShift, 'batch-d').version,
        cells: [{ propertyId: 'batch-links', value: ['batch-future', 'batch-blank', 'batch-a'] }] }]),
        context: { viewId: 'batch-no-shift-view', expectedViewVersion: noShiftView.body.view.version } })
    assert.equal(noShiftCycle.status, 201, JSON.stringify(noShiftCycle.body))
    assert.equal(noShiftCycle.body.records.length, 1)
  } finally {
    try { await connection?.dropDatabase() } finally {
      await app?.close()
      if (previousUri === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousUri
      if (previousOrigin === undefined) delete process.env.WEB_ORIGIN
      else process.env.WEB_ORIGIN = previousOrigin
    }
  }
})

test('null cell clears preserve stored explicit nulls and only bump changed records', async t => {
  const source = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!source) return t.skip('P4_TEST_MONGODB_URI must name an isolated replica set')
  const previousUri = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  const uri = new URL(source)
  uri.pathname = `/eotion_cell_null_${randomUUID().replaceAll('-', '')}`
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let connection: Connection | undefined
  try {
    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(process.env.MONGODB_URI), HttpApiModule] })
    class TestModule {}
    app = await NestFactory.create(TestModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    connection = app.get<Connection>(getConnectionToken())
    const owner = { email: 'null-cell-owner@example.test', password: 'correct horse battery staple' }
    assert.equal((await request(base, '/api/auth/register', 'POST', undefined, owner)).status, 201)
    const login = await request(base, '/api/auth/login', 'POST', undefined, owner)
    const cookie = login.headers.get('set-cookie')!.split(';', 1)[0]!
    assert.equal((await request(base, '/api/workspaces', 'POST', cookie, { id: 'null-ws', name: 'Nulls' })).status, 201)
    assert.equal((await request(base, '/api/workspaces/null-ws/pages', 'POST', cookie,
      { id: 'null-home', parentPageId: null, title: 'Home', orderKey: 'a' })).status, 201)
    const route = '/api/workspaces/null-ws/databases/null-db'
    assert.equal((await request(base, '/api/workspaces/null-ws/pages/null-home/databases', 'POST', cookie,
      { id: 'null-db', name: 'Nulls', titlePropertyId: 'null-title', viewId: 'null-view', blockId: 'null-block', orderKey: 'a', parentBlockId: null })).status, 201)
    const snapshot = async () => {
      const result = await request(base, `${route}/views/null-view/records`, 'GET', cookie)
      assert.equal(result.status, 200)
      return result.body
    }
    const rows = (data: any) => data.records as any[]
    const row = (data: any, id: string) => rows(data).find(record => record.id === id)
    let state = await snapshot()
    const property = await request(base, `${route}/properties`, 'POST', cookie,
      { id: 'null-value', name: 'Value', type: 'text', expectedDatabaseVersion: state.database.version })
    assert.equal(property.status, 201, JSON.stringify(property.body))
    state = await snapshot()

    assert.equal((await request(base, '/api/workspaces/null-ws/pages', 'POST', cookie,
      { id: 'null-record-page', parentPageId: null, title: 'Explicit null', orderKey: 'b' })).status, 201)
    const user = await app.get(UserRepository).findAuthenticationByEmail(owner.email)
    assert.ok(user)
    await app.get(DatabaseService).createRecord(user.user.id, 'null-ws', 'null-db', {
      id: 'null-record', pageId: 'null-record-page', properties: { 'null-title': 'Explicit null', 'null-value': null },
    })
    const repository = app.get(DatabaseRecordRepository)
    const storedNull = await repository.findInDatabase('null-ws', 'null-db', 'null-record')
    assert.ok(storedNull && Object.hasOwn(storedNull.properties, 'null-value'))
    assert.equal(storedNull.properties['null-value'], null, 'the legitimate record create path stored an explicit null')

    assert.equal((await request(base, `${route}/records`, 'POST', cookie,
      { id: 'value-record', pageId: 'value-record-page', title: 'Value record', orderKey: 'c', properties: { 'null-value': 'present' } })).status, 201)
    state = await snapshot()
    const mutation = (data: any, id: string, records: unknown[]) => ({ mutationId: id, expectedDatabaseVersion: data.database.version, records })
    const clear = (data: any, id: string) => ({ recordId: id, expectedRecordVersion: row(data, id).version,
      cells: [{ propertyId: 'null-value', value: null }] })

    const nullClear = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(state, 'null-clear-noop', [clear(state, 'null-record')]))
    assert.equal(nullClear.status, 201, JSON.stringify(nullClear.body))
    assert.equal(nullClear.body.database.version, state.database.version)
    assert.equal(nullClear.body.records[0].version, row(state, 'null-record').version)
    assert.equal((await request(base, `${route}/cell-mutations/null-clear-noop`, 'GET', cookie)).body.status, 'committed')
    const afterNullClear = await repository.findInDatabase('null-ws', 'null-db', 'null-record')
    assert.equal(afterNullClear?.properties['null-value'], null)
    assert.equal(afterNullClear?.version, row(state, 'null-record').version)

    const beforeMixed = await snapshot()
    const mixed = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeMixed, 'null-clear-mixed-change', [clear(beforeMixed, 'null-record'),
        { recordId: 'value-record', expectedRecordVersion: row(beforeMixed, 'value-record').version,
          cells: [{ propertyId: 'null-value', value: 'changed' }] }]))
    assert.equal(mixed.status, 201, JSON.stringify(mixed.body))
    assert.equal(mixed.body.database.version, beforeMixed.database.version + 1)
    assert.equal(mixed.body.records.find((record: any) => record.id === 'null-record').version, row(beforeMixed, 'null-record').version)
    assert.equal(mixed.body.records.find((record: any) => record.id === 'value-record').version, row(beforeMixed, 'value-record').version + 1)
    assert.equal((await request(base, `${route}/cell-mutations/null-clear-mixed-change`, 'GET', cookie)).body.status, 'committed')
    const afterMixedNull = await repository.findInDatabase('null-ws', 'null-db', 'null-record')
    assert.equal(afterMixedNull?.properties['null-value'], null)
    assert.equal(afterMixedNull?.version, row(beforeMixed, 'null-record').version)

    const beforeClear = await snapshot()
    const valueClear = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(beforeClear, 'nonempty-clear', [clear(beforeClear, 'value-record')]))
    assert.equal(valueClear.status, 201, JSON.stringify(valueClear.body))
    assert.equal(valueClear.body.database.version, beforeClear.database.version + 1)
    assert.equal(valueClear.body.records[0].version, row(beforeClear, 'value-record').version + 1)
    assert.equal(valueClear.body.records[0].properties['null-value'], undefined)
    assert.equal((await request(base, `${route}/cell-mutations/nonempty-clear`, 'GET', cookie)).body.status, 'committed')
    const afterClear = await snapshot()
    const repeatedClear = await request(base, `${route}/cell-mutations`, 'POST', cookie,
      mutation(afterClear, 'nonempty-clear-repeat', [clear(afterClear, 'value-record')]))
    assert.equal(repeatedClear.status, 201, JSON.stringify(repeatedClear.body))
    assert.equal(repeatedClear.body.database.version, afterClear.database.version)
    assert.equal(repeatedClear.body.records[0].version, row(afterClear, 'value-record').version)
    assert.equal((await request(base, `${route}/cell-mutations/nonempty-clear-repeat`, 'GET', cookie)).body.status, 'committed')
  } finally {
    try { await connection?.dropDatabase() } finally {
      await app?.close()
      if (previousUri === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousUri
      if (previousOrigin === undefined) delete process.env.WEB_ORIGIN
      else process.env.WEB_ORIGIN = previousOrigin
    }
  }
})

type TimelineSchedulingScenario = {
  name: string
  shiftMode: 'shift_when_overlapping' | 'shift_and_keep_gap'
  avoidWeekends: boolean
  records: { id: string; date: Record<string, string> }[]
  edges: [string, string][]
  rootId: string
  rootDate: Record<string, string>
  expectedDates: Record<string, Record<string, string>>
}

const timelineSchedulingScenarios: TimelineSchedulingScenario[] = [
  {
    name: 'keep-gap chain preserves each link gap', shiftMode: 'shift_and_keep_gap', avoidWeekends: false,
    records: [['a', '2026-10-01'], ['b', '2026-10-03'], ['c', '2026-10-05'], ['d', '2026-10-10']]
      .map(([id, start]) => ({ id: id!, date: { start: start! } })),
    edges: [['a', 'b'], ['b', 'c'], ['c', 'd']], rootId: 'a', rootDate: { start: '2026-10-04' },
    expectedDates: { a: { start: '2026-10-04' }, b: { start: '2026-10-06' }, c: { start: '2026-10-08' }, d: { start: '2026-10-13' } },
  },
  {
    name: 'keep-gap diamond plans shared successor once', shiftMode: 'shift_and_keep_gap', avoidWeekends: false,
    records: [['a', '2026-10-01'], ['b', '2026-10-03'], ['c', '2026-10-05'], ['d', '2026-10-10']]
      .map(([id, start]) => ({ id: id!, date: { start: start! } })),
    edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], rootId: 'a', rootDate: { start: '2026-10-04' },
    expectedDates: { a: { start: '2026-10-04' }, b: { start: '2026-10-06' }, c: { start: '2026-10-08' }, d: { start: '2026-10-13' } },
  },
  {
    name: 'overlap diamond honors an external incoming predecessor', shiftMode: 'shift_when_overlapping', avoidWeekends: false,
    records: [
      { id: 'a', date: { start: '2026-10-01', end: '2026-10-02' } },
      { id: 'b', date: { start: '2026-10-03' } },
      { id: 'c', date: { start: '2026-10-03', end: '2026-10-04' } },
      { id: 'd', date: { start: '2026-10-05' } },
      { id: 'x', date: { start: '2026-10-11' } },
    ],
    edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['x', 'd']], rootId: 'a',
    rootDate: { start: '2026-10-06', end: '2026-10-07' },
    expectedDates: {
      a: { start: '2026-10-06', end: '2026-10-07' }, b: { start: '2026-10-08' },
      c: { start: '2026-10-08', end: '2026-10-09' }, d: { start: '2026-10-11' },
    },
  },
  {
    name: 'spring DST weekend roll preserves wall time and range duration', shiftMode: 'shift_when_overlapping', avoidWeekends: true,
    records: [
      { id: 'a', date: { start: '2026-03-06T17:30:00.123Z', timeZone: 'America/Los_Angeles' } },
      { id: 'b', date: { start: '2026-03-06T20:30:00.123Z', end: '2026-03-06T22:00:00.123Z', timeZone: 'America/Los_Angeles' } },
    ],
    edges: [['a', 'b']], rootId: 'a', rootDate: { start: '2026-03-07T17:30:00.123Z', timeZone: 'America/Los_Angeles' },
    expectedDates: {
      a: { start: '2026-03-07T17:30:00.123Z', timeZone: 'America/Los_Angeles' },
      b: { start: '2026-03-09T16:30:00.123Z', end: '2026-03-09T18:00:00.123Z', timeZone: 'America/Los_Angeles' },
    },
  },
  {
    name: 'spring DST without weekend avoidance preserves elapsed shift', shiftMode: 'shift_when_overlapping', avoidWeekends: false,
    records: [
      { id: 'a', date: { start: '2026-03-06T17:30:00.123Z', timeZone: 'America/Los_Angeles' } },
      { id: 'b', date: { start: '2026-03-06T20:30:00.123Z', end: '2026-03-06T22:00:00.123Z', timeZone: 'America/Los_Angeles' } },
    ],
    edges: [['a', 'b']], rootId: 'a', rootDate: { start: '2026-03-07T17:30:00.123Z', timeZone: 'America/Los_Angeles' },
    expectedDates: {
      a: { start: '2026-03-07T17:30:00.123Z', timeZone: 'America/Los_Angeles' },
      b: { start: '2026-03-07T17:30:00.123Z', end: '2026-03-07T19:00:00.123Z', timeZone: 'America/Los_Angeles' },
    },
  },
  {
    name: 'fall DST weekend roll preserves wall time and range duration', shiftMode: 'shift_when_overlapping', avoidWeekends: true,
    records: [
      { id: 'a', date: { start: '2026-10-30T16:30:00.456Z', timeZone: 'America/Los_Angeles' } },
      { id: 'b', date: { start: '2026-10-30T17:30:00.456Z', end: '2026-10-30T18:00:00.456Z', timeZone: 'America/Los_Angeles' } },
    ],
    edges: [['a', 'b']], rootId: 'a', rootDate: { start: '2026-10-31T16:30:00.456Z', timeZone: 'America/Los_Angeles' },
    expectedDates: {
      a: { start: '2026-10-31T16:30:00.456Z', timeZone: 'America/Los_Angeles' },
      b: { start: '2026-11-02T17:30:00.456Z', end: '2026-11-02T18:00:00.456Z', timeZone: 'America/Los_Angeles' },
    },
  },
  ...(['2026-10-17', '2026-10-18'] as const).map((rootDate, index): TimelineSchedulingScenario => ({
    name: index === 0 ? 'date-only Saturday root rolls successor to Monday without an end' : 'date-only Sunday root rolls successor to Monday without an end',
    shiftMode: 'shift_when_overlapping', avoidWeekends: true,
    records: [{ id: 'a', date: { start: '2026-10-16' } }, { id: 'b', date: { start: '2026-10-16' } }],
    edges: [['a', 'b']], rootId: 'a', rootDate: { start: rootDate },
    expectedDates: { a: { start: rootDate }, b: { start: '2026-10-19' } },
  })),
]

test('canonical Timeline scheduling HTTP integration matrix (8 scenarios)', async t => {
  const source = process.env.P4_TEST_MONGODB_URI?.trim()
  if (!source) return t.skip('P4_TEST_MONGODB_URI must name an isolated replica set')
  const previousUri = process.env.MONGODB_URI
  const previousOrigin = process.env.WEB_ORIGIN
  const uri = new URL(source)
  uri.pathname = `/eotion_timeline_http_matrix_${randomUUID().replaceAll('-', '')}`
  process.env.MONGODB_URI = uri.toString()
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let connection: Connection | undefined
  try {
    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(process.env.MONGODB_URI), HttpApiModule] })
    class TestModule {}
    app = await NestFactory.create(TestModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    connection = app.get<Connection>(getConnectionToken())

    for (const scenario of timelineSchedulingScenarios) await t.test(scenario.name, async () => {
      const suffix = randomUUID().replaceAll('-', '')
      const owner = { email: `timeline-${suffix}@example.test`, password: 'correct horse battery staple' }
      assert.equal((await request(base, '/api/auth/register', 'POST', undefined, owner)).status, 201)
      const login = await request(base, '/api/auth/login', 'POST', undefined, owner)
      const cookie = login.headers.get('set-cookie')!.split(';', 1)[0]!
      const workspaceId = `ws-${suffix}`
      const homeId = `home-${suffix}`
      const databaseId = `db-${suffix}`
      const tableViewId = `table-${suffix}`
      const timelineViewId = `timeline-${suffix}`
      const titlePropertyId = `title-${suffix}`
      const datePropertyId = `date-${suffix}`
      const relationPropertyId = `links-${suffix}`
      assert.equal((await request(base, '/api/workspaces', 'POST', cookie, { id: workspaceId, name: 'Scheduling matrix' })).status, 201)
      assert.equal((await request(base, `/api/workspaces/${workspaceId}/pages`, 'POST', cookie,
        { id: homeId, parentPageId: null, title: 'Home', orderKey: 'a' })).status, 201)
      const route = `/api/workspaces/${workspaceId}/databases/${databaseId}`
      const createDatabase = await request(base, `/api/workspaces/${workspaceId}/pages/${homeId}/databases`, 'POST', cookie,
        { id: databaseId, name: 'Scheduling', titlePropertyId, viewId: tableViewId,
          blockId: `block-${suffix}`, orderKey: 'a', parentBlockId: null })
      assert.equal(createDatabase.status, 201, JSON.stringify(createDatabase.body))
      const snapshot = async (viewId: string) => {
        const response = await request(base, `${route}/views/${viewId}/records`, 'GET', cookie)
        assert.equal(response.status, 200, JSON.stringify(response.body))
        return response.body
      }
      const row = (data: any, id: string) => data.records.find((record: any) => record.id === id)
      let state = await snapshot(tableViewId)
      const dateProperty = await request(base, `${route}/properties`, 'POST', cookie,
        { id: datePropertyId, name: 'Schedule', type: 'date', expectedDatabaseVersion: state.database.version })
      assert.equal(dateProperty.status, 201, JSON.stringify(dateProperty.body))
      state = await snapshot(tableViewId)
      const relationProperty = await request(base, `${route}/properties`, 'POST', cookie,
        { id: relationPropertyId, name: 'Blocks', type: 'relation', config: { targetDatabaseId: databaseId },
          expectedDatabaseVersion: state.database.version })
      assert.equal(relationProperty.status, 201, JSON.stringify(relationProperty.body))

      const recordIds = new Map<string, string>()
      for (const record of scenario.records) {
        const recordId = `${record.id}-${suffix}`
        recordIds.set(record.id, recordId)
        const created = await request(base, `${route}/records`, 'POST', cookie,
          { id: recordId, pageId: `page-${record.id}-${suffix}`, title: record.id.toUpperCase(), orderKey: record.id,
            properties: { [datePropertyId]: record.date } })
        assert.equal(created.status, 201, JSON.stringify(created.body))
      }

      state = await snapshot(tableViewId)
      const linksByOwner = new Map<string, string[]>()
      for (const [from, to] of scenario.edges) {
        const outgoing = linksByOwner.get(from) ?? []
        outgoing.push(recordIds.get(to)!)
        linksByOwner.set(from, outgoing)
      }
      const graphMutationId = `graph-${suffix}`
      const graphMutation = await request(base, `${route}/cell-mutations`, 'POST', cookie, {
        mutationId: graphMutationId,
        expectedDatabaseVersion: state.database.version,
        records: [...linksByOwner].map(([from, links]) => ({ recordId: recordIds.get(from)!,
          expectedRecordVersion: row(state, recordIds.get(from)!).version,
          cells: [{ propertyId: relationPropertyId, value: links }] })),
      })
      assert.equal(graphMutation.status, 201, JSON.stringify(graphMutation.body))
      assert.equal((await request(base, `${route}/cell-mutations/${graphMutationId}`, 'GET', cookie)).body.status, 'committed')

      state = await snapshot(tableViewId)
      const config = {
        filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
        options: { timeline: { dateSource: { mode: 'date-property', propertyId: datePropertyId },
          dependency: { propertyId: relationPropertyId, direction: 'blocks', shiftMode: scenario.shiftMode,
            avoidWeekends: scenario.avoidWeekends } } },
      }
      const timelineView = await request(base, `${route}/views`, 'POST', cookie,
        { id: timelineViewId, name: 'Timeline', type: 'timeline', config, expectedDatabaseVersion: state.database.version })
      assert.equal(timelineView.status, 201, JSON.stringify(timelineView.body))
      const before = await snapshot(timelineViewId)
      const rootRecordId = recordIds.get(scenario.rootId)!
      const rootMutationId = `root-${suffix}`
      const rootMutation = await request(base, `${route}/cell-mutations`, 'POST', cookie, {
        mutationId: rootMutationId,
        expectedDatabaseVersion: before.database.version,
        records: [{ recordId: rootRecordId, expectedRecordVersion: row(before, rootRecordId).version,
          cells: [{ propertyId: datePropertyId, value: scenario.rootDate }] }],
        context: { viewId: timelineViewId, expectedViewVersion: timelineView.body.view.version },
      })
      assert.equal(rootMutation.status, 201, JSON.stringify(rootMutation.body))
      assert.equal(rootMutation.body.database.version, before.database.version + 1)
      assert.equal((await request(base, `${route}/cell-mutations/${rootMutationId}`, 'GET', cookie)).body.status, 'committed')

      const after = await snapshot(timelineViewId)
      assert.equal(after.database.version, before.database.version + 1, 'reload observes exactly one Database bump')
      for (const [key, expectedDate] of Object.entries(scenario.expectedDates)) {
        const id = recordIds.get(key)!
        assert.deepEqual(row(rootMutation.body, id).properties[datePropertyId], expectedDate, `${key} committed Date wire value`)
        assert.deepEqual(row(after, id).properties[datePropertyId], expectedDate, `${key} reloaded Date wire value`)
        assert.equal(row(after, id).version, row(before, id).version + 1, `${key} changes once`)
      }
      for (const record of scenario.records.filter(item => !Object.hasOwn(scenario.expectedDates, item.id))) {
        const id = recordIds.get(record.id)!
        assert.deepEqual(row(after, id).properties[datePropertyId], record.date, `${record.id} remains unchanged after reload`)
        assert.equal(row(after, id).version, row(before, id).version, `${record.id} version stays unchanged`)
      }
    })
  } finally {
    try { await connection?.dropDatabase() } finally {
      await app?.close()
      if (previousUri === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousUri
      if (previousOrigin === undefined) delete process.env.WEB_ORIGIN
      else process.env.WEB_ORIGIN = previousOrigin
    }
  }
})
