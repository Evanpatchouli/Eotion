'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  isValidDatabase,
  isValidDatabaseProperty,
  isValidDatabaseRecord,
  isValidDatabaseView,
  validateDatabaseRecordValues,
  validateStoredDatabaseRecordValues,
} = require('../dist/database.js')

const timestamp = '2026-01-02T03:04:05.000Z'
const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 1, createdAt: timestamp, updatedAt: timestamp }
const title = { id: 'prop-title', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const properties = [
  title,
  { id: 'prop-text', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Notes', type: 'text', version: 1, createdAt: timestamp, updatedAt: timestamp },
  { id: 'prop-number', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Count', type: 'number', version: 1, createdAt: timestamp, updatedAt: timestamp },
  { id: 'prop-checkbox', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Done', type: 'checkbox', version: 1, createdAt: timestamp, updatedAt: timestamp },
  { id: 'prop-select', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Status', type: 'select', options: [{ id: 'opt-open', name: 'Open' }, { id: 'opt-done', name: 'Done' }], version: 1, createdAt: timestamp, updatedAt: timestamp },
  { id: 'prop-date', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Due', type: 'date', version: 1, createdAt: timestamp, updatedAt: timestamp },
]

test('database entities require exact fields and valid stable metadata', () => {
  assert.equal(isValidDatabase(database), true)
  assert.equal(isValidDatabase({ ...database, unexpected: true }), false)
  assert.equal(isValidDatabase({ ...database, id: ' db-1' }), false)
  assert.equal(isValidDatabase({ ...database, version: 0 }), false)
  assert.equal(isValidDatabase({ ...database, createdAt: '2026-02-30T00:00:00.000Z' }), false)

  for (const property of properties) assert.equal(isValidDatabaseProperty(property), true)
  assert.equal(isValidDatabaseProperty({ ...properties[4], options: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] }), false)
  assert.equal(isValidDatabaseProperty({ ...properties[4], options: [{ id: 'a', name: 'Same' }, { id: 'b', name: 'Same' }] }), false)
  assert.equal(isValidDatabaseProperty({ ...properties[1], options: [] }), false)
  assert.equal(isValidDatabaseProperty({ ...properties[4], options: undefined }), false)
  assert.equal(isValidDatabaseView({ id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'All', type: 'table', version: 1, createdAt: timestamp, updatedAt: timestamp }), true)
})

test('record values strictly follow definitions and require the unique non-empty title', () => {
  const values = {
    'prop-title': 'Ship P8.1',
    'prop-text': '',
    'prop-number': 0,
    'prop-checkbox': false,
    'prop-select': 'opt-open',
    'prop-date': '2026-02-28',
  }
  assert.equal(validateDatabaseRecordValues(values, properties), true)
  assert.equal(validateDatabaseRecordValues({ ...values, unknown: 'x' }, properties), false)
  assert.equal(validateDatabaseRecordValues({ ...values, 'prop-title': '  ' }, properties), false)
  assert.equal(validateDatabaseRecordValues({ ...values, 'prop-number': Infinity }, properties), false)
  assert.equal(validateDatabaseRecordValues({ ...values, 'prop-checkbox': 1 }, properties), false)
  assert.equal(validateDatabaseRecordValues({ ...values, 'prop-select': 'Open' }, properties), false)
  assert.equal(validateDatabaseRecordValues({ ...values, 'prop-date': '2026-02-30' }, properties), false)
  assert.equal(validateDatabaseRecordValues({ 'prop-title': null }, properties), false)
  assert.equal(validateDatabaseRecordValues({}, properties), false)
  assert.equal(validateDatabaseRecordValues(values, properties.slice(1)), false)
  assert.equal(validateDatabaseRecordValues(values, [...properties, { ...title, id: 'second-title' }]), false)
  assert.equal(validateDatabaseRecordValues(values, [{ ...title, workspaceId: 'other' }, ...properties.slice(1)]), false)

  const storedValues = Object.fromEntries(Object.entries(values).filter(([id]) => id !== 'prop-title'))
  assert.equal(validateStoredDatabaseRecordValues(storedValues, properties), true)
  assert.equal(validateStoredDatabaseRecordValues(values, properties), false)
  assert.equal(validateStoredDatabaseRecordValues({ ...storedValues, 'prop-select': 'unknown-option' }, properties), false)
  const dangerousProperty = { ...properties[1], id: '__proto__' }
  const dangerousStoredValues = Object.fromEntries([['__proto__', 'kept as data']])
  assert.equal(validateStoredDatabaseRecordValues(dangerousStoredValues, [title, dangerousProperty]), true)

  const record = {
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: storedValues,
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }
  assert.equal(isValidDatabaseRecord(record, properties), true)
  assert.equal(isValidDatabaseRecord({ ...record, workspaceId: 'other' }, properties), false)
  assert.equal(isValidDatabaseRecord({ ...record, unknown: true }, properties), false)
})
