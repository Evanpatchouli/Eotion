'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabasePropertyTypeChangeRequestSchema,
  DatabasePropertyTypeChangeResponseSchema,
} = require('../dist/index.js')

const versions = { expectedDatabaseVersion: 2, expectedPropertyVersion: 3 }

test('property type change request is strict, excludes title, and initializes select options', () => {
  assert.deepEqual(DatabasePropertyTypeChangeRequestSchema.parse({ ...versions, targetType: 'text' }), { ...versions, targetType: 'text' })
  assert.deepEqual(DatabasePropertyTypeChangeRequestSchema.parse({ ...versions, targetType: 'select' }), { ...versions, targetType: 'select' })
  for (const targetType of ['title', 'unknown']) {
    assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, targetType }).success, false)
  }
  assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, targetType: 'select', options: [] }).success, false)
  assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, targetType: 'text', config: {} }).success, false)
  assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, targetType: 'number', unexpected: true }).success, false)
})

test('property type change request requires matching valid advanced config', () => {
  const relation = { ...versions, targetType: 'relation', config: { targetDatabaseId: 'target-db' } }
  assert.deepEqual(DatabasePropertyTypeChangeRequestSchema.parse(relation), relation)
  assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, targetType: 'relation' }).success, false)
  assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...relation, config: { relationPropertyId: 'relation', targetPropertyId: 'title', aggregation: 'sum' } }).success, false)

  const rollup = { ...versions, targetType: 'rollup', config: { relationPropertyId: 'relation', targetPropertyId: 'amount', aggregation: 'sum' } }
  assert.deepEqual(DatabasePropertyTypeChangeRequestSchema.parse(rollup), rollup)
  const formula = { ...versions, targetType: 'formula', config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } }
  assert.deepEqual(DatabasePropertyTypeChangeRequestSchema.parse(formula), formula)
})

test('property type change request requires positive safe expected versions', () => {
  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, expectedDatabaseVersion: invalid, targetType: 'text' }).success, false)
    assert.equal(DatabasePropertyTypeChangeRequestSchema.safeParse({ ...versions, expectedPropertyVersion: invalid, targetType: 'text' }).success, false)
  }
})

test('property type change response validates a full database property', () => {
  const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 5, createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-01-02T03:04:05.000Z' }
  const property = {
    id: 'property-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Notes', type: 'text', version: 4,
    createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-01-02T03:04:05.000Z',
  }
  const response = { database, property, convertedRecordCount: 0, clearedRecordCount: 12, repairedViewCount: 1 }
  assert.deepEqual(DatabasePropertyTypeChangeResponseSchema.parse(response), response)
  assert.equal(DatabasePropertyTypeChangeResponseSchema.safeParse({ ...response, unexpected: true }).success, false)
  assert.equal(DatabasePropertyTypeChangeResponseSchema.safeParse({ ...response, property: { ...property, version: 0 } }).success, false)
  assert.equal(DatabasePropertyTypeChangeResponseSchema.safeParse({ ...response, convertedRecordCount: -1 }).success, false)
  assert.equal(DatabasePropertyTypeChangeResponseSchema.safeParse({ ...response, clearedRecordCount: 1.5 }).success, false)
  assert.equal(DatabasePropertyTypeChangeResponseSchema.safeParse({ ...response, repairedViewCount: Number.MAX_SAFE_INTEGER + 1 }).success, false)
})
