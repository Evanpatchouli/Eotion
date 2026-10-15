'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseCellBatchMutationReceiptSchema,
  DatabaseCellBatchMutationRequestSchema,
  DatabaseCellBatchMutationResponseSchema,
} = require('../dist/index.js')

const timestamp = '2026-10-16T00:00:00.000Z'
const baseRequest = {
  mutationId: 'mutation-1',
  expectedDatabaseVersion: 2,
  records: [{
    recordId: 'record-1',
    expectedRecordVersion: 4,
    cells: [
      { propertyId: 'due', value: { start: '2026-10-16T09:30:00.000Z', end: '2026-10-17T09:30:00.000Z', timeZone: 'Asia/Tokyo' } },
      { propertyId: 'blocked-by', value: ['record-2', 'record-3'] },
    ],
  }],
  context: { viewId: 'view-1', expectedViewVersion: 3 },
}

test('batch mutation request preserves supported values and accepts optional strict context', () => {
  assert.deepEqual(DatabaseCellBatchMutationRequestSchema.parse(baseRequest), baseRequest)
  assert.deepEqual(DatabaseCellBatchMutationRequestSchema.parse({ ...baseRequest, context: undefined }), { ...baseRequest, context: undefined })
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, unexpected: true }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, context: { ...baseRequest.context, extra: true } }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [{ ...baseRequest.records[0], extra: true }] }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [{ ...baseRequest.records[0], cells: [{ ...baseRequest.records[0].cells[0], extra: true }] }] }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [{ ...baseRequest.records[0], cells: [{ propertyId: 'due', value: { start: '2026-10-16', unknown: true } }] }] }).success, false)
})

test('batch mutation request enforces individual and total bounds', () => {
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [] }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: Array.from({ length: 501 }, (_, index) => ({ ...baseRequest.records[0], recordId: `r-${index}` })) }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [{ ...baseRequest.records[0], cells: [] }] }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [{ ...baseRequest.records[0], cells: Array.from({ length: 101 }, (_, index) => ({ propertyId: `p-${index}`, value: null })) }] }).success, false)

  const atLimit = {
    ...baseRequest,
    records: Array.from({ length: 10 }, (_, recordIndex) => ({
      recordId: `r-${recordIndex}`,
      expectedRecordVersion: 1,
      cells: Array.from({ length: 100 }, (_, cellIndex) => ({ propertyId: `p-${cellIndex}`, value: null })),
    })),
  }
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse(atLimit).success, true)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({
    ...atLimit,
    records: [...atLimit.records, { recordId: 'r-extra', expectedRecordVersion: 1, cells: [{ propertyId: 'p-extra', value: null }] }],
  }).success, false)
})

test('batch mutation request rejects duplicate record ids and per-record cell ids', () => {
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({ ...baseRequest, records: [baseRequest.records[0], { ...baseRequest.records[0] }] }).success, false)
  assert.equal(DatabaseCellBatchMutationRequestSchema.safeParse({
    ...baseRequest,
    records: [{ ...baseRequest.records[0], cells: [{ propertyId: 'due', value: null }, { propertyId: 'due', value: 'later' }] }],
  }).success, false)
})

test('batch mutation response and receipt are strict and bounded', () => {
  const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 3, createdAt: timestamp, updatedAt: timestamp }
  const record = {
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { due: baseRequest.records[0].cells[0].value },
    version: 5, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp,
  }
  assert.deepEqual(DatabaseCellBatchMutationResponseSchema.parse({ mutationId: 'mutation-1', database, records: [record] }), { mutationId: 'mutation-1', database, records: [record] })
  assert.equal(DatabaseCellBatchMutationResponseSchema.safeParse({ mutationId: 'mutation-1', database, records: [record], extra: true }).success, false)
  assert.equal(DatabaseCellBatchMutationResponseSchema.safeParse({ mutationId: 'mutation-1', database, records: [{ ...record, extra: true }] }).success, false)
  for (const status of ['committed', 'not_committed', 'uncertain']) {
    assert.deepEqual(DatabaseCellBatchMutationReceiptSchema.parse({ mutationId: 'mutation-1', status }), { mutationId: 'mutation-1', status })
  }
  assert.equal(DatabaseCellBatchMutationReceiptSchema.safeParse({ mutationId: 'mutation-1', status: 'pending' }).success, false)
  assert.equal(DatabaseCellBatchMutationReceiptSchema.safeParse({ mutationId: 'mutation-1', status: 'uncertain', extra: true }).success, false)
})
