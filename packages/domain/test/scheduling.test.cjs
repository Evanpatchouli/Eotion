'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { performance } = require('node:perf_hooks')
const {
  planDatabaseSchedule, SchedulingError, MAX_SCHEDULE_RECORDS, MAX_SCHEDULE_EDGES,
  MAX_SCHEDULE_SCAN_RECORDS, MAX_SCHEDULE_SCAN_EDGES,
} = require('../dist/index.js')

const dateSource = { mode: 'date-property', propertyId: 'date' }
const startEnd = { mode: 'start-end', startPropertyId: 'start', endPropertyId: 'end' }
const record = (id, date, extra = {}) => ({ id, properties: { date, ...extra } })
const edge = (from, to) => ({ predecessorRecordId: from, successorRecordId: to })
const run = (records, edges, options = {}) => planDatabaseSchedule({
  records, edges, dateSource, rootRecordId: 'a', shiftMode: 'shift_when_overlapping',
  avoidWeekends: false, ...options,
})
const dates = result => Object.fromEntries(result.mutations.map(({ recordId, properties }) => [recordId, properties.date]))
const failure = (fn, code) => assert.throws(fn, error => error instanceof SchedulingError && error.code === code)

test('overlap shifts only later successors and emits only date-cell patches', () => {
  const result = run([record('a', { start: '2026-01-05', end: '2026-01-07' }), record('b', '2026-01-06', { title: 'B' })], [edge('a', 'b')])
  assert.deepEqual(dates(result), { b: '2026-01-08' })
  assert.deepEqual(result.mutations[0].properties, { date: '2026-01-08' })
  assert.deepEqual([result.nodeCount, result.edgeCount], [2, 1])
})

test('date-only point finish is start; inclusive range end finishes the next day', () => {
  assert.deepEqual(dates(run([record('a', '2026-01-05'), record('b', '2026-01-04')], [edge('a', 'b')])), { b: '2026-01-05' })
  assert.deepEqual(dates(run([record('a', { start: '2026-01-05', end: '2026-01-05' }), record('b', '2026-01-05')], [edge('a', 'b')])), { b: '2026-01-06' })
})

test('datetime finish is exact, including explicit zero-length range', () => {
  const dt = (start, end) => ({ start, ...(end ? { end } : {}), timeZone: 'UTC' })
  assert.deepEqual(dates(run([record('a', dt('2026-01-05T10:00:00.000Z', '2026-01-05T10:00:00.000Z')), record('b', dt('2026-01-05T09:00:00.000Z'))], [edge('a', 'b')])), {
    b: dt('2026-01-05T10:00:00.000Z'),
  })
})

test('already late successor never moves backward or merely to fill gap', () => {
  for (const shiftMode of ['shift_when_overlapping', 'shift_and_keep_gap']) {
    assert.deepEqual(run([record('a', '2026-01-05'), record('b', '2026-01-20')], [edge('a', 'b')], { shiftMode }).mutations, [])
  }
})

test('keep-gap uses original predecessor finish and clamps an overlapping old gap to zero', () => {
  const base = [record('a', '2026-01-05'), record('b', '2026-01-08')]
  assert.deepEqual(dates(run(base, [edge('a', 'b')], { rootProperties: { date: '2026-01-10' }, shiftMode: 'shift_and_keep_gap' })), { b: '2026-01-13' })
  assert.deepEqual(dates(run([record('a', { start: '2026-01-05', end: '2026-01-09' }), record('b', '2026-01-07')], [edge('a', 'b')], {
    rootProperties: { date: { start: '2026-01-10', end: '2026-01-14' } }, shiftMode: 'shift_and_keep_gap',
  })), { b: '2026-01-15' })
})

test('rootProperties are planned while old root date supplies the gap', () => {
  const result = run([record('a', '2026-01-05', { title: 'A' }), record('b', '2026-01-07')], [edge('a', 'b')], {
    rootProperties: { date: '2026-01-09', title: 'updated' }, shiftMode: 'shift_and_keep_gap',
  })
  assert.deepEqual(dates(result), { b: '2026-01-11' })
  assert.equal(result.mutations.some(item => item.recordId === 'a'), false)
})

test('no-auto-shift produces no cascade', () => {
  assert.deepEqual(run([record('a', '2026-01-10'), record('b', '2026-01-01')], [edge('a', 'b')], { shiftMode: 'no_auto_shift' }), {
    mutations: [], nodeCount: 0, edgeCount: 0,
  })
})

test('multi-incoming diamond plans each successor once using the strongest constraint', () => {
  const result = run([record('a', '2026-01-10'), record('b', '2026-01-01'), record('c', { start: '2026-01-01', end: '2026-01-03' }), record('d', '2026-01-01')], [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')])
  assert.deepEqual(dates(result), { b: '2026-01-10', c: { start: '2026-01-10', end: '2026-01-12' }, d: '2026-01-13' })
  assert.deepEqual([result.nodeCount, result.edgeCount], [4, 4])
})

test('stable topological ordering follows input record order among ready nodes', () => {
  const result = run([record('a', '2026-01-10'), record('c', '2026-01-01'), record('b', '2026-01-01')], [edge('a', 'b'), edge('a', 'c')])
  assert.deepEqual(result.mutations.map(item => item.recordId), ['b', 'c'])
})

test('record and edge input order do not change mutation order or values', () => {
  const records = [record('a', '2026-01-10'), record('d', '2026-01-01'), record('c', '2026-01-01'), record('b', '2026-01-01')]
  const edges = [edge('a', 'd'), edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
  const expected = run(records, edges)
  assert.deepEqual(expected.mutations.map(item => item.recordId), ['b', 'c', 'd'])
  assert.deepEqual(run([records[2], records[0], records[3], records[1]], [...edges].reverse()), expected)
})

test('duplicate edges do not produce duplicate mutations', () => {
  const result = run([record('a', '2026-01-10'), record('b', '2026-01-01')], [edge('a', 'b'), edge('a', 'b')])
  assert.deepEqual(dates(result), { b: '2026-01-10' })
  assert.equal(result.mutations.length, 1)
})

test('external incoming predecessor constrains an affected successor and counts toward edge budget', () => {
  const result = run([
    record('a', '2026-01-10'), record('b', '2026-01-01'), record('external', '2026-01-12'),
  ], [edge('a', 'b'), edge('external', 'b')])
  assert.deepEqual(dates(result), { b: '2026-01-12' })
  assert.deepEqual([result.nodeCount, result.edgeCount], [2, 2])
})

test('external incoming constraints over 10000 fail closed despite a tiny affected subgraph', () => {
  const externals = Array.from({ length: MAX_SCHEDULE_EDGES / 2 }, (_, i) => record(`e${i}`, '2026-01-01'))
  const edges = [edge('a', 'b'), edge('a', 'c'), ...externals.flatMap(item => [edge(item.id, 'b'), edge(item.id, 'c')])]
  failure(() => run([record('a', '2026-01-10'), record('b', '2026-01-01'), record('c', '2026-01-01'), ...externals], edges), 'limit')
})

test('unrelated cycles do not block the affected subgraph', () => {
  const result = run([record('a', '2026-01-10'), record('b', '2026-01-01'), record('x', '2026-01-01'), record('y', '2026-01-01')], [edge('a', 'b'), edge('x', 'y'), edge('y', 'x')])
  assert.deepEqual(dates(result), { b: '2026-01-10' })
})

test('affected cycle and self edge fail closed with no returned partial plan', () => {
  const records = [record('a', '2026-01-10'), record('b', '2026-01-01')]
  failure(() => run(records, [edge('a', 'b'), edge('b', 'a')]), 'cycle')
  failure(() => run(records, [edge('a', 'a')]), 'cycle')
})

test('unscheduled records stop traversal without synthesizing dates', () => {
  const result = run([record('a', '2026-01-10'), record('b', null), record('c', '2026-01-01')], [edge('a', 'b'), edge('b', 'c')])
  assert.deepEqual(result, { mutations: [], nodeCount: 1, edgeCount: 0 })
})

test('an unscheduled branch cycle does not affect scheduled descendants reached another way', () => {
  const result = run([record('a', '2026-01-10'), record('b', null), record('c', '2026-01-01')], [edge('a', 'b'), edge('b', 'c'), edge('c', 'b'), edge('a', 'c')])
  assert.deepEqual(dates(result), { c: '2026-01-10' })
})

test('date-only successor rounds mixed datetime requirement up to next UTC calendar boundary', () => {
  const result = run([record('a', { start: '2026-01-05T12:30:00.000Z', timeZone: 'Asia/Shanghai' }), record('b', '2026-01-05')], [edge('a', 'b')])
  assert.deepEqual(dates(result), { b: '2026-01-06' })
})

test('datetime successor compares date-only predecessor at UTC midnight', () => {
  const result = run([record('a', '2026-01-05'), record('b', { start: '2026-01-04T23:00:00.000Z', timeZone: 'UTC' })], [edge('a', 'b')])
  assert.deepEqual(dates(result), { b: { start: '2026-01-05T00:00:00.000Z', timeZone: 'UTC' } })
})

test('legacy string and object wire shape remain intact after moving', () => {
  const result = run([record('a', '2026-01-10'), record('b', { start: '2026-01-01' })], [edge('a', 'b')])
  assert.deepEqual(dates(result), { b: { start: '2026-01-10' } })
})

test('start-end reads each cell start and shifts both complete cell wires', () => {
  const records = [
    { id: 'a', properties: { start: '2026-01-10', end: '2026-01-11' } },
    { id: 'b', properties: { start: { start: '2026-01-01', end: '2026-01-02' }, end: { start: '2026-01-03', end: '2026-01-04' }, title: 'B' } },
  ]
  const result = run(records, [edge('a', 'b')], { dateSource: startEnd })
  assert.deepEqual(result.mutations[0].properties, {
    start: { start: '2026-01-12', end: '2026-01-13' }, end: { start: '2026-01-14', end: '2026-01-15' },
  })
})

test('start-end without End is a point and moves only its existing Start cell', () => {
  const result = run([
    { id: 'a', properties: { start: '2026-01-10' } },
    { id: 'b', properties: { start: { start: '2026-01-01', end: '2026-01-02' }, end: null, title: 'B' } },
  ], [edge('a', 'b')], { dateSource: startEnd })
  assert.deepEqual(result.mutations[0].properties, {
    start: { start: '2026-01-10', end: '2026-01-11' },
  })
  assert.deepEqual(run([
    { id: 'a', properties: { start: '2026-01-10' } },
    { id: 'b', properties: { start: null, end: '2026-01-01' } },
  ], [edge('a', 'b')], { dateSource: startEnd }).mutations, [])
})

test('start-end point ignores Start cell inner end for predecessor finish', () => {
  const result = run([
    { id: 'a', properties: { start: { start: '2026-01-10', end: '2026-01-15' }, end: null } },
    { id: 'b', properties: { start: '2026-01-01', end: null } },
  ], [edge('a', 'b')], { dateSource: startEnd })
  assert.deepEqual(result.mutations, [{ recordId: 'b', properties: { start: '2026-01-10' } }])
})

test('start-end datetime point ignores Start cell inner end for predecessor finish', () => {
  const result = run([
    { id: 'a', properties: { start: { start: '2026-01-10T10:00:00.123Z', end: '2026-01-15T12:00:00.123Z', timeZone: 'UTC' }, end: null } },
    { id: 'b', properties: { start: { start: '2026-01-01T00:00:00.000Z', timeZone: 'UTC' }, end: null } },
  ], [edge('a', 'b')], { dateSource: startEnd })
  assert.deepEqual(result.mutations, [{ recordId: 'b', properties: { start: { start: '2026-01-10T10:00:00.123Z', timeZone: 'UTC' } } }])
})

test('start-end rejects mixed date kinds and reversed boundaries', () => {
  const root = { id: 'a', properties: { start: '2026-01-10', end: '2026-01-11' } }
  failure(() => run([root, { id: 'b', properties: { start: '2026-01-01', end: { start: '2026-01-02T00:00:00.000Z', timeZone: 'UTC' } } }], [edge('a', 'b')], { dateSource: startEnd }), 'invalid-date')
  failure(() => run([root, { id: 'b', properties: { start: '2026-01-03', end: '2026-01-02' } }], [edge('a', 'b')], { dateSource: startEnd }), 'invalid-date')
})

test('avoid weekends moves Saturday and Sunday date-only starts to Monday', () => {
  for (const [candidate, expected] of [['2026-01-10', '2026-01-12'], ['2026-01-11', '2026-01-12']]) {
    assert.deepEqual(dates(run([record('a', candidate), record('b', '2026-01-01')], [edge('a', 'b')], { avoidWeekends: true })), { b: expected })
  }
})

test('avoid weekends applies only when a successor needs movement', () => {
  assert.deepEqual(run([record('a', '2026-01-01'), record('b', '2026-01-10')], [edge('a', 'b')], { avoidWeekends: true }).mutations, [])
})

test('datetime weekend uses its own IANA zone and keeps wall clock and milliseconds across spring DST', () => {
  const result = run([
    record('a', { start: '2026-03-07T18:30:00.123Z', timeZone: 'UTC' }),
    record('b', { start: '2026-03-06T18:30:00.123Z', end: '2026-03-06T20:30:00.123Z', timeZone: 'America/Los_Angeles' }),
  ], [edge('a', 'b')], { avoidWeekends: true })
  assert.deepEqual(dates(result), { b: {
    start: '2026-03-09T17:30:00.123Z', end: '2026-03-09T19:30:00.123Z', timeZone: 'America/Los_Angeles',
  } })
})

test('datetime weekend uses own zone even when UTC date is a weekday', () => {
  const result = run([
    record('a', { start: '2026-01-12T01:00:00.000Z', timeZone: 'UTC' }),
    record('b', { start: '2026-01-01T00:00:00.000Z', timeZone: 'America/Los_Angeles' }),
  ], [edge('a', 'b')], { avoidWeekends: true })
  assert.deepEqual(dates(result), { b: { start: '2026-01-13T01:00:00.000Z', timeZone: 'America/Los_Angeles' } })
})

test('historical IANA second-level offset is accepted when moving weekend to Monday', () => {
  const result = run([
    record('a', { start: '1900-01-06T12:00:00.000Z', timeZone: 'UTC' }),
    record('b', { start: '1900-01-01T12:00:00.000Z', timeZone: 'Asia/Kolkata' }),
  ], [edge('a', 'b')], { avoidWeekends: true })
  assert.deepEqual(dates(result), { b: { start: '1900-01-08T12:00:00.000Z', timeZone: 'Asia/Kolkata' } })
})

test('invalid reachable dates fail closed', () => {
  failure(() => run([record('a', '2026-01-10'), record('b', '2026-02-30')], [edge('a', 'b')]), 'invalid-date')
  failure(() => run([record('a', { start: '2026-01-10T00:00:00.000Z', timeZone: '+08:00' }), record('b', '2026-01-01')], [edge('a', 'b')]), 'invalid-date')
})

test('unrelated invalid dates are ignored', () => {
  assert.deepEqual(dates(run([record('a', '2026-01-10'), record('b', '2026-01-01'), record('x', 'bad')], [edge('a', 'b')])), { b: '2026-01-10' })
})

test('calendar range overflow fails closed', () => {
  failure(() => run([record('a', { start: '9999-12-31', end: '9999-12-31' }), record('b', '9999-12-30')], [edge('a', 'b')]), 'invalid-date')
})

test('record and edge limits reject oversized graphs', () => {
  const tooManyAffected = Array.from({ length: MAX_SCHEDULE_RECORDS + 1 }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01'))
  failure(() => run(tooManyAffected, tooManyAffected.slice(1).map(item => edge('a', item.id))), 'limit')
  failure(() => run([record('a', '2026-01-01'), record('b', '2026-01-01')], Array.from({ length: MAX_SCHEDULE_EDGES + 1 }, () => edge('a', 'b'))), 'limit')
  failure(() => run(Array.from({ length: MAX_SCHEDULE_SCAN_RECORDS + 1 }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01')), []), 'limit')
  failure(() => run([record('a', '2026-01-01'), record('b', '2026-01-01')], Array.from({ length: MAX_SCHEDULE_SCAN_EDGES + 1 }, () => edge('a', 'b'))), 'limit')
})

test('large unrelated scan component does not consume affected limits, and no-auto-shift bypasses planning bounds', () => {
  const records = Array.from({ length: MAX_SCHEDULE_RECORDS + 1 }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01'))
  const result = run(records, [edge('a', 'r1')], { rootProperties: { date: '2026-01-10' } })
  assert.deepEqual([result.nodeCount, result.edgeCount, result.mutations.length], [2, 1, 1])
  const oversized = Array.from({ length: MAX_SCHEDULE_SCAN_RECORDS + 1 }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01'))
  assert.deepEqual(run(oversized, [], { shiftMode: 'no_auto_shift' }), { mutations: [], nodeCount: 0, edgeCount: 0 })
})

test('unknown canonical graph endpoints are ignored without changing the result', () => {
  assert.deepEqual(dates(run([record('a', '2026-01-10'), record('b', '2026-01-01')], [edge('a', 'missing'), edge('missing', 'b'), edge('a', 'b')])), { b: '2026-01-10' })
})

test('10, 100, and 500-record chains stay bounded and report timing', t => {
  for (const count of [10, 100, 500]) {
    const records = Array.from({ length: count }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01'))
    const edges = Array.from({ length: count - 1 }, (_, i) => edge(i ? `r${i}` : 'a', `r${i + 1}`))
    const started = performance.now()
    const result = run(records, edges, { rootProperties: { date: '2026-01-10' } })
    t.diagnostic(`chain ${count}: ${(performance.now() - started).toFixed(2)} ms`)
    assert.equal(result.mutations.length, count - 1)
    assert.deepEqual([result.nodeCount, result.edgeCount], [count, count - 1])
  }
})

test('sparse and dense 500-record DAGs report timing without duplicate plans', t => {
  const records = Array.from({ length: 500 }, (_, i) => record(i ? `r${i}` : 'a', '2026-01-01'))
  for (const density of ['sparse', 'dense']) {
    const edges = []
    for (let i = 0; i < 499; i++) {
      edges.push(edge(i ? `r${i}` : 'a', `r${i + 1}`))
      if (density === 'dense') for (let j = i + 2; j < Math.min(500, i + 21); j++) edges.push(edge(i ? `r${i}` : 'a', `r${j}`))
    }
    const started = performance.now()
    const result = run(records, edges, { rootProperties: { date: '2026-01-10' } })
    t.diagnostic(`${density} 500/${edges.length}: ${(performance.now() - started).toFixed(2)} ms`)
    assert.equal(result.mutations.length, 499)
    assert.deepEqual([result.nodeCount, result.edgeCount], [500, edges.length])
  }
})
