import { expect, test } from '@playwright/test'
import type { DatabaseProperty, DatabaseRecord, DatabaseTimelineViewConfig } from '@eotion/domain/database'
import { projectTimelineRecords, type TimelineRecordInput } from '../src/components/editor/timeline/projection'

const properties: DatabaseProperty[] = [
  { id: 'title', databaseId: 'db', workspaceId: 'ws', name: 'Title', type: 'title', version: 1, createdAt: '', updatedAt: '' },
  { id: 'date', databaseId: 'db', workspaceId: 'ws', name: 'Date', type: 'date', version: 1, createdAt: '', updatedAt: '' },
  { id: 'start', databaseId: 'db', workspaceId: 'ws', name: 'Start', type: 'date', version: 1, createdAt: '', updatedAt: '' },
  { id: 'end', databaseId: 'db', workspaceId: 'ws', name: 'End', type: 'date', version: 1, createdAt: '', updatedAt: '' },
  { id: 'hidden', databaseId: 'db', workspaceId: 'ws', name: 'Hidden', type: 'text', version: 1, createdAt: '', updatedAt: '' },
]

function record(id: string, values: Record<string, unknown>): TimelineRecordInput {
  return { id, pageId: `page-${id}`, properties: { title: `Page ${id}`, ...values } } as unknown as Pick<DatabaseRecord, 'id' | 'pageId' | 'properties'>
}

function project(records: TimelineRecordInput[], source?: unknown) {
  const config = { filters: [], sorts: [], visibleProperties: ['date'], propertyOrder: ['hidden', 'title', 'date'], ...(source === undefined ? {} : { options: { timeline: { dateSource: source } } }) } as DatabaseTimelineViewConfig
  return projectTimelineRecords({ records, properties, config, formatValue: value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value) })
}

test('Date source preserves same-order generic rows, point/range precision and explicit zero duration', () => {
  const items = project([
    record('legacy', { date: '2024-02-03' }),
    record('range', { date: { start: '2024-02-03', end: '2024-02-04' } }),
    record('zero-date', { date: { start: '2024-02-03', end: '2024-02-03' } }),
    record('datetime', { date: { start: '2024-02-03T10:00:00.000Z', end: '2024-02-03T10:00:00.000Z', timeZone: 'Asia/Tokyo' } }),
  ], { mode: 'date-property', propertyId: 'date' })
  expect(items.map(item => item.recordId)).toEqual(['legacy', 'range', 'zero-date', 'datetime'])
  expect(items.map(item => item.kind)).toEqual(['point', 'range', 'range', 'range'])
  expect(items[0]).toMatchObject({ start: { kind: 'date-only', date: '2024-02-03' }, end: null })
  expect(items[2]).toMatchObject({ precision: 'date-only', explicitZeroDuration: true, end: { date: '2024-02-03' } })
  expect(items[3]).toMatchObject({ precision: 'datetime', explicitZeroDuration: true, start: { sourceTimeZone: 'Asia/Tokyo' } })
  expect(items.map(item => item.rowIndex)).toEqual([0, 1, 2, 3])
  expect(items[0]?.title).toBe('Page legacy')
  expect(items[0]?.dateLabel).toBe('2024-02-03')
  expect(items[0]?.visibleProperties.map(property => property.propertyId)).toEqual(['date'])
})

test('independent Start/End uses only normalized starts and retains unscheduled diagnostics', () => {
  const items = project([
    record('internal-end-ignored', { start: { start: '2024-03-01', end: '2024-03-10' }, end: { start: '2024-03-04', end: '2024-03-05' } }),
    record('start-only', { start: { start: '2024-03-01', end: '2024-03-10' } }),
    record('missing', { end: '2024-03-02' }),
    record('invalid', { start: 'not-a-date', end: '2024-03-02' }),
    record('mixed', { start: '2024-03-01', end: { start: '2024-03-02T00:00:00.000Z', timeZone: 'UTC' } }),
    record('reversed', { start: '2024-03-04', end: '2024-03-02' }),
    record('empty-end', { start: '2024-03-01', end: '' }),
    record('invalid-internal-end', { start: { start: '2024-03-01', end: '2024-02-28' }, end: '2024-03-04' }),
    record('unknown-date-field', { start: { start: '2024-03-01', future: true }, end: '2024-03-04' }),
    record('different-zones', { start: { start: '2024-03-01T00:00:00.000Z', timeZone: 'America/Los_Angeles' }, end: { start: '2024-03-01T01:00:00.000Z', timeZone: 'UTC' } }),
  ], { mode: 'start-end', startPropertyId: 'start', endPropertyId: 'end' })
  expect(items.map(item => item.kind === 'unscheduled' ? item.reason : item.kind)).toEqual([
    'range', 'point', 'missing-start', 'invalid-date', 'incompatible-kinds', 'end-before-start', 'point', 'invalid-date', 'invalid-date', 'range',
  ])
  expect(items[0]).toMatchObject({ kind: 'range', start: { date: '2024-03-01' }, end: { date: '2024-03-04' } })
  expect(items[0]?.dateLabel).toBe('2024-03-01 – 2024-03-04')
  expect(items[1]).toMatchObject({ kind: 'point', start: { date: '2024-03-01' } })
  expect(items[9]).toMatchObject({ kind: 'range', start: { sourceTimeZone: 'America/Los_Angeles' }, end: { sourceTimeZone: 'UTC' } })
})

test('missing source and invalid or reversed single Date ranges keep records as unscheduled', () => {
  const noSource = project([record('unconfigured', { date: '2024-01-01' })])
  expect(noSource[0]).toMatchObject({ kind: 'unscheduled', reason: 'unconfigured-source', start: null, end: null })
  const values = project([
    record('missing', { date: null }),
    record('invalid', { date: { start: 'bad', end: '2024-01-01' } }),
    record('reverse', { date: { start: '2024-01-02', end: '2024-01-01' } }),
  ], { mode: 'date-property', propertyId: 'date' })
  expect(values.map(item => item.kind === 'unscheduled' ? item.reason : item.kind)).toEqual(['missing-start', 'invalid-date', 'invalid-date'])
})
