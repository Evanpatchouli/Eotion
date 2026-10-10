'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseCreateInPageRequestSchema,
  DatabasePropertyCreateRequestSchema,
  DatabaseRecordCreateRequestSchema,
  DatabaseViewCreateRequestSchema,
  DatabaseViewHttpCreateRequestSchema,
  DatabaseViewUpdateRequestSchema,
  DatabaseViewDeleteRequestSchema,
  DatabaseViewConfigSchema,
  DatabaseLinkInPageRequestSchema,
  DatabaseRecordPageCreateRequestSchema,
  DatabaseListQuerySchema,
  DatabaseViewListQuerySchema,
  DatabaseTableQuerySchema,
  DatabaseTableResponseSchema,
  DatabaseSchema,
  DatabasePropertySchema,
  DatabaseViewSchema,
  databaseRecordSchema,
  DatabaseRecordCellUpdateRequestSchema,
  DatabaseRelationCandidatesQuerySchema,
  DatabaseRelationCandidatesResponseSchema,
  DatabaseRelationTitlesRequestSchema,
  DatabaseRelationTitlesResponseSchema,
} = require('../dist/index.js')

const timestamp = '2026-01-02T03:04:05.000Z'
const property = { id: 'title-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 1, createdAt: timestamp, updatedAt: timestamp }
const view = { id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'All tasks', type: 'table', config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }, version: 1, createdAt: timestamp, updatedAt: timestamp }

test('database entity schemas reuse the strict domain validators', () => {
  assert.deepEqual(DatabaseSchema.parse(database), database)
  assert.deepEqual(DatabasePropertySchema.parse(property), property)
  assert.deepEqual(DatabaseViewSchema.parse(view), view)
  assert.deepEqual(databaseRecordSchema([property]).parse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: {},
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).properties, {})
  assert.equal(DatabaseSchema.safeParse({ ...database, extra: true }).success, false)
  assert.equal(DatabasePropertySchema.safeParse({ ...property, options: [] }).success, false)
  assert.equal(databaseRecordSchema([property]).safeParse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' },
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).success, false)
})

test('database create request schemas enforce exact request shapes', () => {
  const createInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  assert.deepEqual(DatabaseCreateInPageRequestSchema.parse(createInPage), createInPage)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...createInPage, extra: true }).success, false)

  const select = { id: 'status-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: 1 }
  assert.deepEqual(DatabasePropertyCreateRequestSchema.parse(select), select)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'status-1', name: 'Status', type: 'select' }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'text-1', name: 'Notes', type: 'text', options: [] }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...select, options: [{ id: 'open', name: 'Open' }, { id: 'open', name: 'Other' }] }).success, false)

  const createRecord = { id: 'record-1', pageId: 'page-1', properties: { 'title-1': 'A task', count: 2, done: false, due: null } }
  assert.deepEqual(DatabaseRecordCreateRequestSchema.parse(createRecord), createRecord)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, extra: true }).success, false)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, properties: { invalid: Infinity } }).success, false)

  const createView = { id: 'view-1', name: 'All tasks', type: 'table' }
  assert.deepEqual(DatabaseViewCreateRequestSchema.parse(createView), createView)
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...createView, type: 'board' }).success, false)
  assert.equal(DatabaseViewHttpCreateRequestSchema.safeParse(createView).success, false)
  assert.deepEqual(DatabaseViewHttpCreateRequestSchema.parse({ ...createView, expectedDatabaseVersion: 1 }), { ...createView, expectedDatabaseVersion: 1 })
  assert.equal(DatabaseViewUpdateRequestSchema.safeParse({ expectedDatabaseVersion: 1, expectedViewVersion: 1 }).success, false)
  assert.deepEqual(DatabaseViewDeleteRequestSchema.parse({ expectedDatabaseVersion: 1, expectedViewVersion: 1 }), { expectedDatabaseVersion: 1, expectedViewVersion: 1 })
  assert.equal(DatabaseViewConfigSchema.safeParse({ filters: [{ propertyId: 'p', operator: 'checked' }], sorts: [], visibleProperties: null, propertyOrder: null }).success, true)
  assert.equal(DatabaseViewConfigSchema.safeParse({ filters: [{ propertyId: 'p', operator: 'checked', value: true }], sorts: [], visibleProperties: null, propertyOrder: null }).success, false)
})

test('database create request schemas reject unstable or oversized ids and names without trimming input', () => {
  const invalidId = (schema, value) => assert.equal(schema.safeParse(value).success, false)
  const validCreateInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, id: ' db-1' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, viewId: 'view-1 ' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, parentBlockId: `x${'x'.repeat(256)}` })
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: ' Tasks' }).success, false)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: 'n'.repeat(201) }).success, false)

  const property = { id: 'prop-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: 1 }
  invalidId(DatabasePropertyCreateRequestSchema, { ...property, id: 'prop-1 ' })
  invalidId(DatabasePropertyCreateRequestSchema, { ...property, options: [{ id: ' open', name: 'Open' }] })
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...property, name: ' Status' }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...property, options: [{ id: 'open', name: 'O'.repeat(201) }] }).success, false)

  const record = { id: 'record-1', pageId: 'page-1', properties: { 'prop-1': 'open' } }
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, pageId: ' page-1' })
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, properties: { [`${'x'.repeat(257)}`]: 'value' } })
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, id: 'r'.repeat(257) })

  const view = { id: 'view-1', name: 'All tasks', type: 'table' }
  invalidId(DatabaseViewCreateRequestSchema, { ...view, id: ' view-1' })
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...view, name: 'All tasks ' }).success, false)
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...view, name: 'V'.repeat(201) }).success, false)
})

test('database HTTP contracts strictly validate page creation, links, and bounded windows', () => {
  const link = { databaseId: 'db-1', viewId: 'view-1', blockId: 'block-2', orderKey: 'b', parentBlockId: null }
  assert.deepEqual(DatabaseLinkInPageRequestSchema.parse(link), link)
  assert.equal(DatabaseLinkInPageRequestSchema.safeParse({ ...link, viewId: ' view-1' }).success, false)
  const recordPage = { id: 'record-1', pageId: 'page-2', title: 'A task', orderKey: 'a' }
  assert.deepEqual(DatabaseRecordPageCreateRequestSchema.parse(recordPage), recordPage)
  assert.equal(DatabaseRecordPageCreateRequestSchema.safeParse({ ...recordPage, parentPageId: null }).success, false)
  assert.deepEqual(DatabaseListQuerySchema.parse({}), { limit: 50 })
  assert.deepEqual(DatabaseListQuerySchema.parse({ limit: '12', cursor: 'db-1' }), { limit: 12, cursor: 'db-1' })
  assert.equal(DatabaseListQuerySchema.safeParse({ limit: '101' }).success, false)
  assert.equal(DatabaseListQuerySchema.safeParse({ cursor: ' db-1' }).success, false)
  assert.deepEqual(DatabaseViewListQuerySchema.parse({}), { limit: 100 })
  assert.equal(DatabaseTableQuerySchema.safeParse({ cursor: 'x'.repeat(256) }).success, true)
  assert.equal(DatabaseTableQuerySchema.safeParse({ cursor: 'x'.repeat(16_385) }).success, false)
})

test('database table response validates scope, property values, and the property cap', () => {
  const record = { id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }
  const table = { database, view, properties: [property], records: [record], nextCursor: null }
  assert.deepEqual(DatabaseTableResponseSchema.parse(table), table)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, view: { ...view, workspaceId: 'ws-2' } }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...record, properties: { 'title-1': 4 } }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...record, databaseId: 'db-2' }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, properties: [{ ...property, workspaceId: 'ws-2' }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, properties: Array(101).fill(property) }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, extra: true }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: Array(101).fill(record) }).success, false)
})

test('advanced requests and projected values keep derived fields read-only', () => {
  const relation = { ...property, id: 'rel', name: 'Links', type: 'relation', config: { targetDatabaseId: 'db-2' } }
  const formula = { ...property, id: 'calc', name: 'Score', type: 'formula', config: { expression: { kind: 'literal', value: 2 }, resultType: 'number' } }
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'rel', name: 'Links', type: 'relation', config: relation.config, expectedDatabaseVersion: 1 }).success, true)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'rel', name: 'Links', type: 'relation', expectedDatabaseVersion: 1 }).success, false)
  assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value: ['r1', 'r2'], expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, true)
  assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value: ['r1', 'r1'], expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, false)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ id: 'r1', pageId: 'p1', properties: { rel: Array.from({ length: 51 }, (_, i) => `r${i}`) } }).success, false)
  const table = { database, view, properties: [property, relation, formula], records: [{ id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task', rel: ['r1'], calc: 2 }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }], nextCursor: null }
  assert.equal(DatabaseTableResponseSchema.safeParse(table).success, true)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...table.records[0], properties: { ...table.records[0].properties, calc: '2' } }] }).success, false)
  const { pageVersion: _pageVersion, ...storedShape } = table.records[0]
  assert.equal(databaseRecordSchema(table.properties).safeParse({ ...storedShape, properties: { rel: ['r1'], calc: 2 } }).success, false)
})

test('relation picker contracts bound searches and title resolution', () => {
  assert.deepEqual(DatabaseRelationCandidatesQuerySchema.parse({ search: 'task' }), { search: 'task', limit: 50 })
  assert.equal(DatabaseRelationCandidatesQuerySchema.safeParse({ search: 'x'.repeat(201) }).success, false)
  assert.equal(DatabaseRelationCandidatesQuerySchema.safeParse({ limit: 51 }).success, false)
  const item = { recordId: 'r1', pageId: 'p1', title: 'Task' }
  assert.equal(DatabaseRelationCandidatesResponseSchema.safeParse({ items: [item], nextCursor: null }).success, true)
  assert.equal(DatabaseRelationTitlesRequestSchema.safeParse({ recordIds: ['r1', 'r1'] }).success, false)
  assert.equal(DatabaseRelationTitlesRequestSchema.safeParse({ recordIds: Array.from({ length: 51 }, (_, i) => `r${i}`) }).success, false)
  assert.equal(DatabaseRelationTitlesResponseSchema.safeParse({ items: [item] }).success, true)
})

test('advanced configs reject array or object enum values without coercion', () => {
  const { DatabasePropertyUpdateRequestSchema } = require('../dist/index.js')
  const version = { expectedDatabaseVersion: 1, expectedPropertyVersion: 1 }
  const configs = [
    { relationPropertyId: 'r', targetPropertyId: 'p', aggregation: ['sum'] },
    { relationPropertyId: 'r', targetPropertyId: 'p', aggregation: { toString: 'sum' } },
    { expression: { kind: 'literal', value: 2 }, resultType: ['number'] },
    { expression: { kind: 'binary', operator: ['+'], left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } }, resultType: 'boolean' },
    { expression: { kind: 'binary', operator: { toString: '+' }, left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } }, resultType: 'boolean' },
  ]
  for (const config of configs) {
    const result = DatabasePropertyUpdateRequestSchema.safeParse({ ...version, config })
    assert.equal(result.success, false)
    assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'bad', name: 'Bad', type: Object.hasOwn(config, 'aggregation') ? 'rollup' : 'formula', config, expectedDatabaseVersion: 1 }).success, false)
  }
})