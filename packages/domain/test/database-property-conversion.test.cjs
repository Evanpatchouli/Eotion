'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { convertDatabasePropertyValueForTypeChange } = require('../dist/database.js')

test('property value conversion keeps unchanged values and handles supported scalar conversions', () => {
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('checkbox', 'checkbox', false), { action: 'keep', value: false })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('text', 'number', '  -12.5  '), { action: 'keep', value: -12.5 })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('number', 'text', 0), { action: 'keep', value: '0' })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('number', 'text', 1e+21), { action: 'keep', value: '1e+21' })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'text', '2024-02-29'), { action: 'keep', value: '2024-02-29' })
  const dateRange = { start: '2024-02-29', end: '2024-03-02', timeZone: 'UTC' }
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'date', dateRange), { action: 'keep', value: dateRange })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'text', dateRange), { action: 'clear' })
  const datetime = { start: '2024-02-29T09:00:00.000Z', end: '2024-02-29T10:00:00.000Z', timeZone: 'UTC' }
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'date', datetime), { action: 'keep', value: datetime })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'text', datetime), { action: 'clear' })
})

test('property value conversion clears invalid, lossy, and unsupported values', () => {
  for (const value of ['', '  ', 'Infinity', '-Infinity', 'NaN', '1e309']) {
    assert.deepEqual(convertDatabasePropertyValueForTypeChange('text', 'number', value), { action: 'clear' })
  }
  for (const value of ['2023-02-29', '2024-2-09', 'not-a-date']) {
    assert.deepEqual(convertDatabasePropertyValueForTypeChange('date', 'text', value), { action: 'clear' })
  }
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('number', 'text', Infinity), { action: 'clear' })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('checkbox', 'text', true), { action: 'clear' })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('relation', 'text', ['record-1']), { action: 'clear' })
  assert.deepEqual(convertDatabasePropertyValueForTypeChange('text', 'number', null), { action: 'clear' })
})

test('property type conversion rejects changes to or from title', () => {
  assert.throws(() => convertDatabasePropertyValueForTypeChange('title', 'text', 'Task'), /Title property type changes are not supported/u)
  assert.throws(() => convertDatabasePropertyValueForTypeChange('text', 'title', 'Task'), /Title property type changes are not supported/u)
})

test('every unsupported cross-type conversion clears the property key', () => {
  const samples = { text: '12.5', number: 12.5, checkbox: true, select: 'option-id', date: '2026-10-12', relation: ['record-id'], rollup: 12.5, formula: 12.5 }
  for (const [sourceType, value] of Object.entries(samples)) {
    for (const targetType of Object.keys(samples)) {
      const result = convertDatabasePropertyValueForTypeChange(sourceType, targetType, value)
      if (sourceType === targetType) assert.deepEqual(result, { action: 'keep', value })
      else if (sourceType === 'text' && targetType === 'number') assert.deepEqual(result, { action: 'keep', value: 12.5 })
      else if (sourceType === 'number' && targetType === 'text') assert.deepEqual(result, { action: 'keep', value: '12.5' })
      else if (sourceType === 'date' && targetType === 'text') assert.deepEqual(result, { action: 'keep', value })
      else assert.deepEqual(result, { action: 'clear' }, `${sourceType} -> ${targetType}`)
    }
  }
})
