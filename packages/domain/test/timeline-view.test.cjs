'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DATABASE_MAX_PROPERTIES,
  DATABASE_VIEW_TYPES,
  DEFAULT_TIMELINE_VIEW_SCALE,
  TIMELINE_VIEW_SCALES,
  isValidDatabaseViewConfigShape,
  isValidTimelineViewOptions,
  validateDatabaseViewConfig,
} = require('../dist/database.js')

const timestamp = '2026-01-02T03:04:05.000Z'
const title = { id: 'title-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const date = { id: 'date-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Date', type: 'date', version: 1, createdAt: timestamp, updatedAt: timestamp }
const endDate = { ...date, id: 'date-2', name: 'End' }
const relation = { id: 'relation-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Depends on', type: 'relation', config: { targetDatabaseId: 'db-1' }, version: 1, createdAt: timestamp, updatedAt: timestamp }
const base = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }
const properties = [title, date, endDate, relation]
const config = timeline => ({ ...base, options: { timeline } })

test('timeline view type and month fallback are available without storing a date source', () => {
  assert.deepEqual(DATABASE_VIEW_TYPES, ['table', 'list', 'board', 'timeline'])
  assert.equal(DEFAULT_TIMELINE_VIEW_SCALE, 'month')
  assert.deepEqual(TIMELINE_VIEW_SCALES, ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'])
  assert.equal(isValidDatabaseViewConfigShape(config({})), true)
  assert.equal(validateDatabaseViewConfig(config({}), properties, 'timeline'), true)
})

test('timeline options accept exact date-source, scale, frozen-table, and dependency shapes', () => {
  const values = [
    { dateSource: { mode: 'date-property', propertyId: 'date-1' } },
    { dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'date-2' } },
    ...TIMELINE_VIEW_SCALES.map(scale => ({ scale })),
    { frozenTable: { visible: false, visibleProperties: ['title-1'], propertyOrder: null } },
    { dependency: { propertyId: 'relation-1', direction: 'depends-on', shiftMode: 'shift_when_overlapping', avoidWeekends: true } },
    { dependency: { propertyId: 'relation-1', direction: 'blocks', shiftMode: 'shift_and_keep_gap', avoidWeekends: false } },
    { dependency: { propertyId: 'relation-1', direction: 'blocks', shiftMode: 'no_auto_shift', avoidWeekends: false } },
  ]
  for (const value of values) assert.equal(isValidTimelineViewOptions(value), true, JSON.stringify(value))
  assert.equal(isValidTimelineViewOptions({}), true)
  assert.equal(isValidDatabaseViewConfigShape({ ...config({ scale: 'week' }), options: { timeline: { scale: 'week' }, futureOption: { keep: true } } }), true)
})

test('timeline options reject unknown fields, undefined, null, coercion, and malformed unions', () => {
  const invalid = [
    { unknown: true }, { scale: undefined }, { scale: null }, { scale: 'decade' },
    { dateSource: null }, { dateSource: { mode: 'date-property', propertyId: 'date-1', extra: true } },
    { dateSource: { mode: 'date-property', propertyId: undefined } },
    { dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'date-1' } },
    { dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'date-2', extra: 1 } },
    { frozenTable: { visible: true, visibleProperties: null, propertyOrder: null, extra: true } },
    { frozenTable: { visible: true, visibleProperties: null, propertyOrder: undefined } },
    { frozenTable: { visible: 1, visibleProperties: null, propertyOrder: null } },
    { dependency: { propertyId: 'r', direction: 'depends-on', shiftMode: 'unknown', avoidWeekends: true } },
    { dependency: { propertyId: 'r', direction: 'depends-on', shiftMode: 'no_auto_shift', avoidWeekends: undefined } },
    { dependency: { propertyId: 'r', direction: 'depends-on', shiftMode: 'no_auto_shift', avoidWeekends: 1 } },
    { dependency: { propertyId: 'r', direction: 'sideways', shiftMode: 'no_auto_shift', avoidWeekends: true } },
    ...['preserve-duration', 'preserve-offset', 'set-same-date'].map(shiftMode => ({ dependency: { propertyId: 'r', direction: 'depends-on', shiftMode, avoidWeekends: true } })),
    { dateSource: { mode: 'date-property', propertyId: ' date-1' } },
    { dateSource: { mode: 'date-property', propertyId: 'x'.repeat(257) } },
  ]
  for (const value of invalid) assert.equal(isValidTimelineViewOptions(value), false, JSON.stringify(value))
  assert.equal(isValidDatabaseViewConfigShape(config({ scale: 'month', extra: true })), false)
  assert.equal(isValidDatabaseViewConfigShape(config({ scale: undefined })), false)
  assert.equal(isValidDatabaseViewConfigShape({ ...base, options: null }), false)
})

test('timeline date sources require existing native date properties in scope', () => {
  const valid = [
    { mode: 'date-property', propertyId: 'date-1' },
    { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'date-2' },
  ]
  for (const dateSource of valid) assert.equal(validateDatabaseViewConfig(config({ dateSource }), properties, 'timeline'), true)
  const formula = { ...date, id: 'formula-1', type: 'formula', config: { expression: { kind: 'literal', value: '2026-01-02', valueType: 'date' }, resultType: 'date' } }
  const rollup = { ...date, id: 'rollup-1', type: 'rollup', config: { relationPropertyId: 'relation-1', targetPropertyId: 'date-1', aggregation: 'min' } }
  const text = { ...date, id: 'text-1', type: 'text' }
  const number = { ...date, id: 'number-1', type: 'number' }
  const otherDb = { ...date, id: 'foreign-date', databaseId: 'db-2' }
  const otherWorkspace = { ...date, id: 'foreign-workspace-date', workspaceId: 'ws-2' }
  for (const dateSource of [
    { mode: 'date-property', propertyId: 'missing' },
    { mode: 'date-property', propertyId: 'formula-1' },
    { mode: 'date-property', propertyId: 'rollup-1' },
    { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'missing' },
    { mode: 'date-property', propertyId: 'title-1' },
    { mode: 'date-property', propertyId: 'text-1' },
    { mode: 'date-property', propertyId: 'number-1' },
    { mode: 'start-end', startPropertyId: 'text-1', endPropertyId: 'date-1' },
    { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'text-1' },
    { mode: 'start-end', startPropertyId: 'number-1', endPropertyId: 'date-1' },
    { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'number-1' },
  ]) assert.equal(validateDatabaseViewConfig(config({ dateSource }), properties, 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'date-property', propertyId: 'foreign-date' } }), [title, date, otherDb], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'date-property', propertyId: 'foreign-workspace-date' } }), [title, date, otherWorkspace], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'date-property', propertyId: 'formula-1' } }), [title, formula], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'date-property', propertyId: 'rollup-1' } }), [title, relation, rollup], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'formula-1' } }), [title, date, formula], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: 'rollup-1' } }), [title, date, relation, rollup], 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'start-end', startPropertyId: 'text-1', endPropertyId: 'date-1' } }), [title, text, date], 'timeline'), false)
  for (const property of [title, text, number]) {
    const scoped = property.type === 'title' ? [title, date] : [title, property, date]
    assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'date-property', propertyId: property.id } }), scoped, 'timeline'), false)
    assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'start-end', startPropertyId: property.id, endPropertyId: 'date-1' } }), scoped, 'timeline'), false)
    assert.equal(validateDatabaseViewConfig(config({ dateSource: { mode: 'start-end', startPropertyId: 'date-1', endPropertyId: property.id } }), scoped, 'timeline'), false)
  }
})

test('frozen table validates independent columns, title retention, limits, and hidden retention', () => {
  const frozenTable = { visible: false, visibleProperties: ['title-1', 'date-1'], propertyOrder: ['date-1'] }
  assert.equal(validateDatabaseViewConfig(config({ frozenTable }), properties, 'timeline'), true)
  assert.equal(validateDatabaseViewConfig({ ...base, visibleProperties: ['title-1'], options: { timeline: { frozenTable } } }, properties, 'timeline'), true)
  assert.equal(validateDatabaseViewConfig(config({ frozenTable: { ...frozenTable, visibleProperties: ['date-1'] } }), properties, 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ frozenTable: { ...frozenTable, visibleProperties: ['title-1', 'missing'] } }), properties, 'timeline'), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: false, visibleProperties: null, propertyOrder: ['x', 'x'] } }), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: Array(DATABASE_MAX_PROPERTIES + 1).fill('p'), propertyOrder: null } }), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: null, propertyOrder: Array(DATABASE_MAX_PROPERTIES + 1).fill('p') } }), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: ['title-1', 'title-1'], propertyOrder: null } }), false)
  const exactLimitIds = Array.from({ length: DATABASE_MAX_PROPERTIES }, (_, index) => `prop-${index}`)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: exactLimitIds, propertyOrder: exactLimitIds } }), true)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: [...exactLimitIds, 'prop-extra'], propertyOrder: null } }), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: null, propertyOrder: [' prop-1'] } }), false)
  assert.equal(isValidTimelineViewOptions({ frozenTable: { visible: true, visibleProperties: null, propertyOrder: ['x'.repeat(257)] } }), false)
})

test('timeline dependencies require same-database relation properties', () => {
  const dependency = { propertyId: 'relation-1', direction: 'blocks', shiftMode: 'no_auto_shift', avoidWeekends: true }
  assert.equal(validateDatabaseViewConfig(config({ dependency }), properties, 'timeline'), true)
  assert.equal(validateDatabaseViewConfig(config({ dependency: { ...dependency, propertyId: 'missing' } }), properties, 'timeline'), false)
  assert.equal(validateDatabaseViewConfig(config({ dependency: { ...dependency, propertyId: 'date-1' } }), properties, 'timeline'), false)
  const foreignRelation = { ...relation, id: 'foreign-relation', config: { targetDatabaseId: 'db-2' } }
  assert.equal(validateDatabaseViewConfig(config({ dependency: { ...dependency, propertyId: 'foreign-relation' } }), [title, foreignRelation], 'timeline'), false)
})

test('timeline semantic references do not change table, list, or board validation', () => {
  const configWithUnresolvedSemantics = config({
    dateSource: { mode: 'date-property', propertyId: 'missing' },
    dependency: { propertyId: 'missing', direction: 'depends-on', shiftMode: 'shift_when_overlapping', avoidWeekends: false },
  })
  for (const type of ['table', 'list', 'board']) assert.equal(validateDatabaseViewConfig(configWithUnresolvedSemantics, properties, type), true)
  assert.equal(validateDatabaseViewConfig(configWithUnresolvedSemantics, properties, 'timeline'), false)
  const boardOptions = { ...base, options: { groupByPropertyId: 'missing' } }
  assert.equal(validateDatabaseViewConfig(boardOptions, properties, 'board'), false)
  assert.equal(validateDatabaseViewConfig(boardOptions, properties, 'timeline'), true)
})
