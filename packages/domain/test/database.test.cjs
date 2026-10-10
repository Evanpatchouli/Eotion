'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  isValidDatabase,
  isValidDatabaseProperty,
  isValidDatabaseRecord,
  isValidDatabaseView,
  isValidDatabaseViewConfigShape,
  validateDatabaseRecordValues,
  validateDatabaseViewConfig,
  validateStoredDatabaseRecordValues,
  isValidFormulaExpression,
  validateDatabasePropertyDependencies,
  evaluateDatabaseFormula,
  evaluateDatabaseRollup,
  DATABASE_FORMULA_MAX_DEPTH,
  DATABASE_FORMULA_MAX_NODES,
  DATABASE_FORMULA_MAX_STRING_LENGTH,
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

test('view config shape and property-aware validation enforce strict operators and scopes', () => {
  const base = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }
  assert.equal(validateDatabaseViewConfig(base, properties), true)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: [{ propertyId: 'prop-checkbox', operator: 'checked' }] }, properties), true)
  assert.equal(isValidDatabaseViewConfigShape({ ...base, filters: [{ propertyId: 'prop-checkbox', operator: 'unchecked', value: false }] }), false)
  assert.equal(isValidDatabaseViewConfigShape({ ...base, filters: [{ propertyId: 'prop-text', operator: 'is_empty', value: '' }] }), false)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: [{ propertyId: 'prop-number', operator: 'gt', value: 2 }] }, properties), true)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: [{ propertyId: 'prop-number', operator: 'contains', value: 'x' }] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: [{ propertyId: 'prop-select', operator: 'is', value: 'Open' }] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: [{ propertyId: 'missing', operator: 'is_empty' }] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, visibleProperties: ['prop-text'] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, visibleProperties: ['prop-title', 'prop-title'] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, propertyOrder: ['prop-text'] }, properties), true)
  assert.equal(validateDatabaseViewConfig({ ...base, sorts: [{ propertyId: 'prop-text', direction: 'asc' }, { propertyId: 'prop-text', direction: 'desc' }] }, properties), false)
  assert.equal(validateDatabaseViewConfig({ ...base, filters: Array(21).fill({ propertyId: 'prop-text', operator: 'is_empty' }) }, properties), false)
})

test('advanced property configs, relation bounds and read-only projections', () => {
  const relation = { ...properties[1], id: 'rel', type: 'relation', config: { targetDatabaseId: 'db-2' } }
  const rollup = { ...properties[1], id: 'roll', type: 'rollup', config: { relationPropertyId: 'rel', targetPropertyId: 'num-2', aggregation: 'sum' } }
  const formula = { ...properties[1], id: 'calc', type: 'formula', config: { expression: { kind: 'binary', operator: '+', left: { kind: 'property', propertyId: 'prop-number' }, right: { kind: 'literal', value: 2 } }, resultType: 'number' } }
  const all = [...properties, relation, rollup, formula]
  const target = { ...properties[2], id: 'num-2', databaseId: 'db-2' }
  assert.equal(all.every(isValidDatabaseProperty), true)
  assert.equal(validateDatabasePropertyDependencies(all, () => [target]), true)
  assert.equal(validateDatabasePropertyDependencies([...all, { ...formula, id: 'has-links', config: { expression: { kind: 'call', name: 'empty', args: [{ kind: 'property', propertyId: 'rel' }] }, resultType: 'boolean' } }], () => [target]), true)
  assert.equal(validateDatabasePropertyDependencies(all, () => [{ ...target, type: 'text' }]), false)
  assert.equal(validateDatabasePropertyDependencies(all, () => [{ ...target, type: 'formula' }]), false)
  assert.equal(isValidDatabaseProperty({ ...relation, config: { targetDatabaseId: 'db-2', extra: true } }), false)
  const projected = { 'prop-title': 'Task', rel: ['r1', 'r2'], roll: 4, calc: 3 }
  assert.equal(validateDatabaseRecordValues(projected, all), true)
  assert.equal(validateDatabaseRecordValues({ ...projected, rel: ['r1', 'r1'] }, all), false)
  assert.equal(validateDatabaseRecordValues({ ...projected, rel: Array.from({ length: 51 }, (_, i) => `r${i}`) }, all), false)
  assert.equal(validateStoredDatabaseRecordValues({ rel: ['r1'], roll: 4 }, all), false)
  assert.equal(validateStoredDatabaseRecordValues({ rel: ['r1'], calc: 3 }, all), false)
  assert.equal(validateStoredDatabaseRecordValues({ rel: ['r1'] }, all), true)
  const view = { filters: [{ propertyId: 'rel', operator: 'is_empty' }], sorts: [], visibleProperties: null, propertyOrder: null }
  assert.equal(validateDatabaseViewConfig(view, all), true)
  assert.equal(validateDatabaseViewConfig({ ...view, sorts: [{ propertyId: 'rel', direction: 'asc' }] }, all), false)
  assert.equal(validateDatabaseViewConfig({ ...view, filters: [{ propertyId: 'calc', operator: 'is_empty' }] }, all), false)
})

test('formula shape, types, cycles and evaluator guards', () => {
  const literal = { kind: 'literal', value: 1 }
  let deep = literal
  for (let i = 1; i < DATABASE_FORMULA_MAX_DEPTH; i++) deep = { kind: 'unary', operator: 'not', operand: deep }
  assert.equal(isValidFormulaExpression(deep), true)
  assert.equal(isValidFormulaExpression({ kind: 'unary', operator: 'not', operand: deep }), false)
  assert.equal(isValidFormulaExpression({ kind: 'literal', value: Infinity }), false)
  assert.equal(isValidFormulaExpression({ kind: 'literal', value: 'x'.repeat(DATABASE_FORMULA_MAX_STRING_LENGTH + 1) }), false)
  const wide = { kind: 'call', name: 'concat', args: Array.from({ length: 20 }, () => ({ kind: 'literal', value: 'a' })) }
  assert.equal(isValidFormulaExpression(wide), true)
  assert.equal(isValidFormulaExpression({ kind: 'call', name: 'concat', args: Array.from({ length: 7 }, () => structuredClone(wide)) }), false)
  const formula = { ...properties[1], id: 'f1', type: 'formula', config: { expression: { kind: 'property', propertyId: 'prop-number' }, resultType: 'number' } }
  assert.equal(validateDatabasePropertyDependencies([...properties, formula]), true)
  assert.equal(validateDatabasePropertyDependencies([...properties, { ...formula, config: { ...formula.config, resultType: 'string' } }]), false)
  const circular = { ...formula, config: { expression: { kind: 'property', propertyId: 'f1' }, resultType: 'number' } }
  assert.equal(validateDatabasePropertyDependencies([...properties, circular]), false)
  const chain = Array.from({ length: 16 }, (_, index) => ({ ...formula, id: `chain-${index}`, config: { expression: { kind: 'property', propertyId: index ? `chain-${index - 1}` : 'prop-number' }, resultType: 'number' } }))
  assert.equal(validateDatabasePropertyDependencies([...properties, ...chain.slice(0, 15)]), true)
  assert.equal(validateDatabasePropertyDependencies([...properties, ...chain]), false)
  assert.equal(validateDatabasePropertyDependencies([...chain].reverse().concat(properties)), false)
  assert.equal(validateDatabasePropertyDependencies([...properties, { ...formula, id: 'f2', config: { expression: { kind: 'property', propertyId: 'f3' }, resultType: 'number' } }, { ...formula, id: 'f3', config: { expression: { kind: 'property', propertyId: 'f2' }, resultType: 'number' } }]), false)
  assert.equal(evaluateDatabaseFormula({ kind: 'binary', operator: '/', left: literal, right: { kind: 'literal', value: 0 } }, () => null), null)
  assert.equal(evaluateDatabaseFormula({ kind: 'binary', operator: '*', left: { kind: 'literal', value: 1e308 }, right: { kind: 'literal', value: 1e308 } }, () => null), null)
  assert.equal(evaluateDatabaseFormula({ kind: 'if', condition: { kind: 'literal', value: true }, then: { kind: 'property', propertyId: 'prop-number' }, else: literal }, () => 7), 7)
  assert.equal(evaluateDatabaseFormula({ kind: 'call', name: 'concat', args: [{ kind: 'literal', value: 'a' }, { kind: 'literal', value: null }] }, () => null), 'a')
  assert.equal(evaluateDatabaseFormula({ kind: 'property', propertyId: 'p' }, () => 'x'.repeat(DATABASE_FORMULA_MAX_STRING_LENGTH + 1)), null)
  assert.equal(evaluateDatabaseFormula({ kind: 'call', name: 'concat', args: [{ kind: 'property', propertyId: 'p' }, { kind: 'property', propertyId: 'p' }] }, () => 'x'.repeat(DATABASE_FORMULA_MAX_STRING_LENGTH)), null)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'avg'), 2)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'count_values'), 2)
  assert.equal(evaluateDatabaseRollup([1, 'x'], 'sum'), null)
})

test('rollup aggregations keep bounded numeric and empty-value semantics', () => {
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'count'), 3)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'sum'), 4)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'avg'), 2)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'min'), 1)
  assert.equal(evaluateDatabaseRollup([1, null, 3], 'max'), 3)
  assert.equal(evaluateDatabaseRollup([null, '', 0, false], 'count_values'), 2)
  assert.equal(evaluateDatabaseRollup([], 'count'), 0)
  assert.equal(evaluateDatabaseRollup([], 'count_values'), 0)
  for (const aggregation of ['sum', 'avg', 'min', 'max']) {
    assert.equal(evaluateDatabaseRollup([], aggregation), null)
    assert.equal(evaluateDatabaseRollup([null, null], aggregation), null)
    assert.equal(evaluateDatabaseRollup([1, '2'], aggregation), null)
  }
  assert.equal(evaluateDatabaseRollup([1e308, 1e308], 'sum'), null)
  assert.equal(evaluateDatabaseRollup(Array(51).fill(1), 'count'), null)
})

test('formula and rollup dependency schemas reject invalid static types', () => {
  const makeFormula = (id, expression, resultType) => ({ ...properties[1], id, type: 'formula', config: { expression, resultType } })
  const literal = value => ({ kind: 'literal', value })
  const property = propertyId => ({ kind: 'property', propertyId })
  const binary = (operator, left, right) => ({ kind: 'binary', operator, left, right })
  const valid = [
    makeFormula('string', literal('abc'), 'string'),
    makeFormula('date', { kind: 'literal', value: '2026-02-28', valueType: 'date' }, 'date'),
    makeFormula('null', literal(null), 'null'),
    makeFormula('formula-ref', property('string'), 'string'),
  ]
  assert.equal(validateDatabasePropertyDependencies([...properties, ...valid]), true)
  assert.equal(validateDatabasePropertyDependencies([...properties, makeFormula('bad', binary('-', literal('abc'), literal(1)), 'number')]), false)
  assert.equal(validateDatabasePropertyDependencies([...properties, makeFormula('bad', binary('+', property('prop-checkbox'), literal(10)), 'number')]), false)
  assert.equal(validateDatabasePropertyDependencies([...properties, makeFormula('bad', { kind: 'if', condition: literal(true), then: literal(1), else: literal('x') }, 'number')]), false)
  const relation = { ...properties[1], id: 'rel', type: 'relation', config: { targetDatabaseId: 'db-2' } }
  const numberTarget = { ...properties[2], id: 'target-number', databaseId: 'db-2' }
  const dateTarget = { ...properties[5], id: 'target-date', databaseId: 'db-2' }
  const rollup = { ...properties[1], id: 'roll', type: 'rollup', config: { relationPropertyId: 'rel', targetPropertyId: 'target-number', aggregation: 'sum' } }
  assert.equal(validateDatabasePropertyDependencies([...properties, relation, rollup, makeFormula('rollup-ref', property('roll'), 'number')], () => [numberTarget]), true)
  assert.equal(validateDatabasePropertyDependencies([...properties, relation, { ...rollup, config: { ...rollup.config, targetPropertyId: 'target-date', aggregation: 'min' } }], () => [dateTarget]), false)
  assert.equal(validateDatabasePropertyDependencies([...properties, relation, makeFormula('bad', binary('>', property('rel'), { kind: 'literal', value: '2026-02-28', valueType: 'date' }), 'boolean')]), false)
})

test('formula operators evaluate with strict types and null propagation', () => {
  const literal = value => ({ kind: 'literal', value })
  const binary = (operator, left, right) => ({ kind: 'binary', operator, left: literal(left), right: literal(right) })
  const evaluate = expression => evaluateDatabaseFormula(expression, () => null)
  assert.equal(evaluate(binary('+', 2, 3)), 5)
  assert.equal(evaluate(binary('-', 3, 2)), 1)
  assert.equal(evaluate(binary('*', 3, 2)), 6)
  assert.equal(evaluate(binary('/', 6, 2)), 3)
  assert.equal(evaluate(binary('==', 2, 2)), true)
  assert.equal(evaluate(binary('!=', 2, 3)), true)
  assert.equal(evaluate(binary('>', 3, 2)), true)
  assert.equal(evaluate(binary('>=', 2, 2)), true)
  assert.equal(evaluate(binary('<', 2, 3)), true)
  assert.equal(evaluate(binary('<=', 2, 2)), true)
  assert.equal(evaluate(binary('and', true, false)), false)
  assert.equal(evaluate(binary('or', true, false)), true)
  assert.equal(evaluate({ kind: 'unary', operator: 'not', operand: literal(false) }), true)
  assert.equal(evaluate({ kind: 'call', name: 'empty', args: [literal(null)] }), true)
  assert.equal(evaluate(binary('+', null, 2)), null)
  assert.equal(evaluate(binary('+', '2', 2)), null)
  assert.equal(evaluate(binary('and', 1, true)), null)
  assert.equal(evaluate(binary('==', '2', 2)), null)
  assert.equal(evaluate({ kind: 'property', propertyId: 'p' }), null)
  assert.equal(evaluate({ kind: 'literal', value: '2026-02-30', valueType: 'date' }), null)
  assert.equal(evaluate({ kind: 'literal', value: '2026-02-28', valueType: 'date' }), '2026-02-28')
})

test('advanced enums reject JSON coercion and do not invoke conversion hooks', () => {
  const binary = operator => ({ kind: 'binary', operator, left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } })
  for (const operator of [['+'], { toString: '+' }, 1, null]) {
    assert.equal(isValidFormulaExpression(binary(operator)), false)
    assert.equal(evaluateDatabaseFormula(binary(operator), () => null), null)
  }
  let invoked = false
  const hook = { toString() { invoked = true; return '+' } }
  assert.equal(isValidFormulaExpression(binary(hook)), false)
  assert.equal(invoked, false)
  assert.equal(isValidDatabaseProperty({ ...properties[1], type: ['text'] }), false)
  assert.equal(isValidDatabaseProperty({ ...properties[1], type: 'rollup', config: { relationPropertyId: 'r', targetPropertyId: 'p', aggregation: ['sum'] } }), false)
  assert.equal(isValidDatabaseProperty({ ...properties[1], type: 'formula', config: { expression: { kind: 'literal', value: 2 }, resultType: ['number'] } }), false)
})