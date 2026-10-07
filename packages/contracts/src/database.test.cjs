'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseCreateInPageRequestSchema,
  DatabasePropertyCreateRequestSchema,
  DatabaseRecordCreateRequestSchema,
  DatabaseViewCreateRequestSchema,
  DatabaseSchema,
  DatabasePropertySchema,
  DatabaseViewSchema,
  databaseRecordSchema,
} = require('../dist/index.js')

const timestamp = '2026-01-02T03:04:05.000Z'
const property = { id: 'title-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 1, createdAt: timestamp, updatedAt: timestamp }
const view = { id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'All tasks', type: 'table', version: 1, createdAt: timestamp, updatedAt: timestamp }

test('database entity schemas reuse the strict domain validators', () => {
  assert.deepEqual(DatabaseSchema.parse(database), database)
  assert.deepEqual(DatabasePropertySchema.parse(property), property)
  assert.deepEqual(DatabaseViewSchema.parse(view), view)
  assert.deepEqual(databaseRecordSchema([property]).parse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' },
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).properties, { 'title-1': 'A task' })
  assert.equal(DatabaseSchema.safeParse({ ...database, extra: true }).success, false)
  assert.equal(DatabasePropertySchema.safeParse({ ...property, options: [] }).success, false)
  assert.equal(databaseRecordSchema([property]).safeParse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: {},
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).success, false)
})

test('database create request schemas enforce exact request shapes', () => {
  const createInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  assert.deepEqual(DatabaseCreateInPageRequestSchema.parse(createInPage), createInPage)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...createInPage, extra: true }).success, false)

  const select = { id: 'status-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }] }
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
})

test('database create request schemas reject unstable or oversized ids and names without trimming input', () => {
  const invalidId = (schema, value) => assert.equal(schema.safeParse(value).success, false)
  const validCreateInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, id: ' db-1' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, viewId: 'view-1 ' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, parentBlockId: `x${'x'.repeat(256)}` })
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: ' Tasks' }).success, false)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: 'n'.repeat(201) }).success, false)

  const property = { id: 'prop-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }] }
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
