'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  isValidDateOnly,
  isValidCanonicalUtcInstant,
  isValidIanaTimeZone,
  isValidDatabaseDateRangeValue,
  isValidDatabaseDateValue,
  normalizeDatabaseDateValue,
} = require('../dist/date.js')

test('date-only validation is strict and handles leap years', () => {
  for (const value of ['2024-02-29', '2000-02-29', '0000-01-01']) assert.equal(isValidDateOnly(value), true, value)
  for (const value of ['2023-02-29', '1900-02-29', '2024-02-30', '2024-2-09', '2024-01-01T00:00:00.000Z', '', null, 1]) {
    assert.equal(isValidDateOnly(value), false, String(value))
  }
})

test('canonical UTC instant and IANA timezone validators reject ambiguous encodings', () => {
  assert.equal(isValidCanonicalUtcInstant('2026-02-28T09:30:00.000Z'), true)
  for (const value of [
    '2026-02-28T09:30:00Z',
    '2026-02-28T17:30:00.000+08:00',
    '2026-02-30T09:30:00.000Z',
    '2026-02-28T24:00:00.000Z',
    '2026-02-28T09:30:00.000',
  ]) assert.equal(isValidCanonicalUtcInstant(value), false, value)

  for (const value of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) assert.equal(isValidIanaTimeZone(value), true, value)
  for (const value of ['', 'Not/AZone', '+08:00', null, 8]) assert.equal(isValidIanaTimeZone(value), false, String(value))
})

test('date range validation enforces shape, matching kinds, and order', () => {
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-05' }), true)
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-05', end: '2026-01-10' }), true)
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-05', end: '2026-01-05' }), true)
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-10', end: '2026-01-05' }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-05', end: '2026-01-10', timeZone: 'UTC' }), false)

  const datetime = { start: '2026-01-05T09:00:00.000Z', end: '2026-01-05T10:00:00.000Z', timeZone: 'Asia/Shanghai' }
  assert.equal(isValidDatabaseDateRangeValue(datetime), true)
  assert.equal(isValidDatabaseDateRangeValue({ ...datetime, end: datetime.start }), true)
  assert.equal(isValidDatabaseDateRangeValue({ ...datetime, end: '2026-01-05T08:00:00.000Z' }), false)
  assert.equal(isValidDatabaseDateRangeValue({ ...datetime, timeZone: undefined }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: datetime.start, timeZone: 'Asia/Shanghai', extra: true }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: '2026-01-05', end: datetime.end, timeZone: 'Asia/Shanghai' }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: datetime.start, end: '2026-01-05', timeZone: 'Asia/Shanghai' }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: datetime.start }), false)
  assert.equal(isValidDatabaseDateRangeValue({ start: datetime.start, timeZone: 'Asia/Shanghai', end: undefined }), false)
})

test('legacy strings remain valid and normalize to the shared date-only start shape', () => {
  assert.equal(isValidDatabaseDateValue('2026-02-28'), true)
  assert.equal(isValidDatabaseDateValue('2026-02-30'), false)
  assert.deepEqual(normalizeDatabaseDateValue('2026-02-28'), { kind: 'date-only', start: '2026-02-28' })
  assert.deepEqual(normalizeDatabaseDateValue({ start: '2026-02-28', end: '2026-03-01' }), {
    kind: 'date-only', start: '2026-02-28', end: '2026-03-01',
  })
})

test('datetime normalization preserves canonical instant, range, and timezone without adding end', () => {
  const value = { start: '2026-01-05T09:00:00.000Z', timeZone: 'Asia/Shanghai' }
  assert.deepEqual(normalizeDatabaseDateValue(value), { kind: 'datetime', ...value })
  assert.deepEqual(normalizeDatabaseDateValue({ ...value, end: '2026-01-05T10:00:00.000Z' }), {
    kind: 'datetime', ...value, end: '2026-01-05T10:00:00.000Z',
  })
  assert.equal(normalizeDatabaseDateValue({ start: '2026-01-05', timeZone: 'Asia/Shanghai' }), null)
  assert.equal(normalizeDatabaseDateValue({ start: '2026-01-05T09:00:00.000Z', timeZone: 'Asia/Shanghai', end: '2026-01-04T09:00:00.000Z' }), null)
})
