'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseViewGroupKeySchema, DatabaseViewGroupRecordsQuerySchema, DatabaseViewGroupRecordsResponseSchema,
  DatabaseViewRecordGroupMoveRequestSchema, DatabaseViewRecordGroupMoveResponseSchema,
} = require('../dist/index.js')

const timestamp = '2026-11-15T00:00:00.000Z'
const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 3, createdAt: timestamp, updatedAt: timestamp }
const view = { id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Timeline', type: 'timeline',
  config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status' } },
  version: 2, createdAt: timestamp, updatedAt: timestamp }
const title = { id: 'title', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const select = { id: 'status', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], version: 1, createdAt: timestamp, updatedAt: timestamp }
const record = { id: 'row-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { title: 'Task', status: 'open' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }

test('group keys and group window query are strict and pair option ids', () => {
  assert.deepEqual(DatabaseViewGroupKeySchema.parse({ kind: 'option', optionId: 'open' }), { kind: 'option', optionId: 'open' })
  assert.deepEqual(DatabaseViewGroupKeySchema.parse({ kind: 'ungrouped' }), { kind: 'ungrouped' })
  for (const key of [{ kind: 'option' }, { kind: 'option', optionId: '' }, { kind: 'option', optionId: ' open' },
    { kind: 'ungrouped', optionId: 'open' }, { kind: 'option', optionId: 'open', extra: true }, { kind: 'all' }]) {
    assert.equal(DatabaseViewGroupKeySchema.safeParse(key).success, false)
  }
  assert.deepEqual(DatabaseViewGroupRecordsQuerySchema.parse({ groupKind: 'option', optionId: 'open', limit: '25', cursor: 'a/b' }),
    { groupKind: 'option', optionId: 'open', limit: 25, cursor: 'a/b' })
  assert.deepEqual(DatabaseViewGroupRecordsQuerySchema.parse({ groupKind: 'ungrouped' }), { groupKind: 'ungrouped', limit: 50 })
  for (const query of [{ groupKind: 'option' }, { groupKind: 'ungrouped', optionId: 'open' }, { groupKind: 'all' },
    { groupKind: 'option', optionId: 'open', limit: 101 }, { groupKind: 'option', optionId: 'open', cursor: ' next' },
    { groupKind: 'option', optionId: 'open', extra: true }]) {
    assert.equal(DatabaseViewGroupRecordsQuerySchema.safeParse(query).success, false)
  }
})

test('group records response preserves strict base validation and checks membership', () => {
  const response = { database, view, properties: [title, select], records: [record], nextCursor: null, group: { kind: 'option', optionId: 'open' } }
  assert.deepEqual(DatabaseViewGroupRecordsResponseSchema.parse(response), response)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, group: { kind: 'ungrouped' } }).success, false)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, group: { kind: 'option', optionId: 'missing' } }).success, false)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, records: [{ ...record, properties: { title: 'Task', status: null } }], group: { kind: 'ungrouped' } }).success, true)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, records: [{ ...record, properties: { title: 'Task', status: 'invalid' } }], group: { kind: 'ungrouped' } }).success, false)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, extra: true }).success, false)
  assert.equal(DatabaseViewGroupRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'board' } }).success, true)
})

test('cross-group move enforces different groups, paired anchors, versions and exact response', () => {
  const request = { recordId: 'row-1', sourceGroup: { kind: 'option', optionId: 'open' }, targetGroup: { kind: 'ungrouped' },
    expectedDatabaseVersion: 3, expectedViewVersion: 2, expectedRecordVersion: 1 }
  assert.deepEqual(DatabaseViewRecordGroupMoveRequestSchema.parse(request), request)
  assert.equal(DatabaseViewRecordGroupMoveRequestSchema.safeParse({ ...request, anchorRecordId: 'row-2', placement: 'before' }).success, true)
  for (const invalid of [{ ...request, sourceGroup: request.targetGroup }, { ...request, targetGroup: request.sourceGroup },
    { ...request, anchorRecordId: 'row-2' }, { ...request, placement: 'after' },
    { ...request, anchorRecordId: 'row-1', placement: 'after' }, { ...request, expectedRecordVersion: 0 },
    { ...request, expectedViewVersion: 1.5 }, { ...request, unexpected: true }]) {
    assert.equal(DatabaseViewRecordGroupMoveRequestSchema.safeParse(invalid).success, false)
  }
  const response = { database, view, record: { ...record, properties: { title: 'Task', status: null } } }
  assert.deepEqual(DatabaseViewRecordGroupMoveResponseSchema.parse(response), response)
  assert.equal(DatabaseViewRecordGroupMoveResponseSchema.safeParse({ ...response, record: { ...response.record, databaseId: 'foreign' } }).success, false)
  assert.equal(DatabaseViewRecordGroupMoveResponseSchema.safeParse({ ...response, extra: true }).success, false)
})
