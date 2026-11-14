'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseViewRecordReorderRequestSchema,
  DatabaseViewRecordReorderResponseSchema,
} = require('../dist/index.js')

const timestamp = '2026-11-15T00:00:00.000Z'
const baseRequest = {
  recordId: 'record-1',
  anchorRecordId: 'record-2',
  placement: 'before',
  expectedDatabaseVersion: 3,
  expectedViewVersion: 2,
}

test('view record reorder request accepts strict before and after placements', () => {
  assert.deepEqual(DatabaseViewRecordReorderRequestSchema.parse(baseRequest), baseRequest)
  const after = { ...baseRequest, placement: 'after' }
  assert.deepEqual(DatabaseViewRecordReorderRequestSchema.parse(after), after)
})

test('view record reorder request rejects identical ids, invalid versions, and unknown fields', () => {
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, anchorRecordId: baseRequest.recordId }).success, false)
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, expectedDatabaseVersion: 0 }).success, false)
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, expectedViewVersion: 1.5 }).success, false)
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, expectedViewVersion: Number.MAX_SAFE_INTEGER + 1 }).success, false)
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, order: ['record-1', 'record-2'] }).success, false)
  assert.equal(DatabaseViewRecordReorderRequestSchema.safeParse({ ...baseRequest, extra: true }).success, false)
})

test('view record reorder response is strict and accepts current entity versions', () => {
  const response = {
    database: { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 3, createdAt: timestamp, updatedAt: timestamp },
    view: {
      id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'All tasks', type: 'table',
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
      version: 2, createdAt: timestamp, updatedAt: timestamp,
    },
  }
  assert.deepEqual(DatabaseViewRecordReorderResponseSchema.parse(response), response)
  assert.equal(DatabaseViewRecordReorderResponseSchema.safeParse({ ...response, extra: true }).success, false)
  assert.equal(DatabaseViewRecordReorderResponseSchema.safeParse({ ...response, view: { ...response.view, extra: true } }).success, false)
})
