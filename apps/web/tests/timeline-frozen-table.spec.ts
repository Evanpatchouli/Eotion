import { expect, test } from '@playwright/test'
import type { DatabaseProperty, DatabaseRecord, DatabaseTimelineViewConfig } from '@eotion/domain/database'
import { projectFrozenTableDisplay, resolveFrozenTableProperties } from '../src/components/editor/timeline/frozenTable'
import { projectTimelineRecords, type TimelineRecordInput } from '../src/components/editor/timeline/projection'
import { resolveTimelineTemporalGeometry } from '../src/components/editor/timeline/geometry'
import { layoutTimelineItems, timelineRowWindow, TIMELINE_ROW_HEIGHT } from '../src/components/editor/timeline/layout'
import type { Transform } from '../src/components/editor/timeline/types'

const properties: DatabaseProperty[] = [
  { id: 'title-id', databaseId: 'db', workspaceId: 'ws', name: 'Renamed title', type: 'title', version: 1, createdAt: '', updatedAt: '' },
  { id: 'select-id', databaseId: 'db', workspaceId: 'ws', name: 'Status', type: 'select', options: [], version: 1, createdAt: '', updatedAt: '' },
  { id: 'relation-id', databaseId: 'db', workspaceId: 'ws', name: 'Related', type: 'relation', config: { targetDatabaseId: 'target' }, version: 1, createdAt: '', updatedAt: '' },
  { id: 'formula-id', databaseId: 'db', workspaceId: 'ws', name: 'Formula', type: 'formula', config: { expression: { kind: 'literal', value: 'derived' }, resultType: 'string' }, version: 1, createdAt: '', updatedAt: '' },
  { id: 'date-id', databaseId: 'db', workspaceId: 'ws', name: 'Date', type: 'date', version: 1, createdAt: '', updatedAt: '' },
  { id: 'text-id', databaseId: 'db', workspaceId: 'ws', name: 'Text', type: 'text', version: 1, createdAt: '', updatedAt: '' },
]

function config(frozenTable?: unknown): DatabaseTimelineViewConfig {
  return {
    filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
    options: { other: { preserve: true }, timeline: { scale: 'month', ...(frozenTable === undefined ? {} : { frozenTable }) } },
  } as DatabaseTimelineViewConfig
}

function frozen(visibleProperties: string[] | null, propertyOrder: string[] | null, visible = true) {
  return { visible, visibleProperties, propertyOrder }
}

function record(id: string, values: Record<string, unknown> = {}): TimelineRecordInput {
  return { id, pageId: `page-${id}`, properties: { 'title-id': `Title ${id}`, ...values } } as unknown as Pick<DatabaseRecord, 'id' | 'pageId' | 'properties'>
}

test('Frozen Table is opt-in and independently orders, filters, deduplicates, and always retains the actual Title property', () => {
  expect(resolveFrozenTableProperties(properties, config())).toEqual([])
  expect(resolveFrozenTableProperties(properties, config(frozen(null, null, false)))).toEqual([])

  const frozenConfig = config(frozen(null, ['date-id', 'date-id', 'missing', 'formula-id']))
  const originalConfig = structuredClone(frozenConfig)
  expect(resolveFrozenTableProperties(properties, frozenConfig).map(property => property.id))
    .toEqual(['date-id', 'formula-id', 'title-id', 'select-id', 'relation-id', 'text-id'])
  expect(frozenConfig).toEqual(originalConfig)
  expect(frozenConfig.options?.other).toEqual({ preserve: true })
  expect(resolveFrozenTableProperties(properties, config(frozen([], ['text-id']))).map(property => property.id))
    .toEqual(['title-id'])
  expect(resolveFrozenTableProperties(properties, config(frozen(['text-id'], ['date-id', 'title-id', 'text-id', 'text-id', 'deleted-id']))).map(property => property.id))
    .toEqual(['title-id', 'text-id'])
})

test('deleted property references are ignored while repaired configs resolve from current schema', () => {
  const currentProperties = properties.filter(property => property.id !== 'relation-id')
  const staleConfig = config(frozen(['relation-id', 'text-id'], ['relation-id', 'text-id', 'title-id']))
  const repairedConfig = config(frozen(['text-id'], ['text-id', 'title-id']))
  expect(resolveFrozenTableProperties(currentProperties, staleConfig).map(property => property.id))
    .toEqual(['text-id', 'title-id'])
  expect(resolveFrozenTableProperties(currentProperties, repairedConfig).map(property => property.id))
    .toEqual(resolveFrozenTableProperties(currentProperties, staleConfig).map(property => property.id))
  expect(repairedConfig.options?.other).toEqual({ preserve: true })
  expect(repairedConfig.options?.timeline).toMatchObject({ scale: 'month', frozenTable: { visible: true, visibleProperties: ['text-id'], propertyOrder: ['text-id', 'title-id'] } })
})

test('projection delegates every non-title value to the shared formatter and maps values by record and property ID', () => {
  const columns = resolveFrozenTableProperties(properties, config(frozen(['select-id', 'relation-id', 'formula-id', 'date-id'], ['title-id', 'select-id', 'relation-id', 'formula-id', 'date-id'])))
  const records = [
    record('first', { 'select-id': { id: 'open', name: 'Open' }, 'relation-id': ['target-record'], 'formula-id': 'computed', 'date-id': '2026-10-13' }),
    record('second', { 'select-id': null, 'relation-id': [], 'formula-id': 0, 'date-id': { start: '2026-10-14' } }),
  ]
  const delegated: Array<{ value: unknown; property: DatabaseProperty }> = []
  const projection = projectFrozenTableDisplay(records, columns, (value, property) => {
    delegated.push({ value, property })
    return `${property.type}:${String(value)}`
  })

  expect(delegated.map(({ property }) => property.type)).toEqual(['select', 'relation', 'formula', 'date', 'select', 'relation', 'formula', 'date'])
  expect(projection.get('first')?.get('select-id')).toBe('select:[object Object]')
  expect(projection.get('first')?.get('relation-id')).toBe('relation:target-record')
  expect(projection.get('first')?.get('formula-id')).toBe('formula:computed')
  expect(projection.get('first')?.get('date-id')).toBe('date:2026-10-13')
  expect(projection.get('second')?.get('formula-id')).toBe('formula:0')
  expect([...projection.keys()]).toEqual(['first', 'second'])
  expect(projection.get('first')?.has('title-id')).toBe(false)
})

test('500 record display projection formats once per value column and can be read repeatedly without invoking formatting again', () => {
  const columns = resolveFrozenTableProperties(properties, config(frozen(['text-id'], null)))
  const records = Array.from({ length: 500 }, (_, index) => record(`record-${index}`, { 'text-id': `value-${index}` }))
  let formatCount = 0
  const projection = projectFrozenTableDisplay(records, columns, value => { formatCount += 1; return String(value) })

  expect(formatCount).toBe(500)
  for (const item of records) expect(projection.get(item.id)?.get('text-id')).toBe(item.properties['text-id'])
  expect(formatCount).toBe(500)
})

test('Frozen display follows the same projected layout rows, including an unscheduled row and focused row island', () => {
  const frozenTable = frozen(['text-id'], ['title-id', 'text-id'])
  const viewConfig = {
    ...config(frozenTable),
    options: { other: { preserve: true }, timeline: { scale: 'day', dateSource: { mode: 'date-property', propertyId: 'date-id' }, frozenTable } },
  } as DatabaseTimelineViewConfig
  const records = Array.from({ length: 205 }, (_, index) => record(`layout-${index}`, {
    'text-id': `display-${index}`,
    ...(index === 101 ? {} : { 'date-id': '2026-10-13' }),
  }))
  const items = projectTimelineRecords({ records, properties, config: viewConfig, formatValue: value => value == null ? '' : String(value) })
  const frozenColumns = resolveFrozenTableProperties(properties, viewConfig)
  const frozenDisplay = projectFrozenTableDisplay(records, frozenColumns, value => value == null ? '' : String(value))
  const temporal = resolveTimelineTemporalGeometry(items, 'UTC')
  const window = timelineRowWindow({ count: items.length, visibleTop: 4800, visibleBottom: 4896, focusedRowIndex: 0 })
  const transform: Transform = { originMs: 0, pxPerMs: 1, scrollLeft: 0, width: 100, scale: 'day', generation: 0, displayTimeZone: 'UTC' }
  const rows = layoutTimelineItems(items, temporal, transform, window)

  expect(rows.map(row => row.rowIndex)).toEqual([0, ...Array.from({ length: 12 }, (_, index) => index + 95)])
  for (const row of rows) {
    const recordId = row.item.recordId
    expect(frozenDisplay.get(recordId)?.get('text-id')).toBe(`display-${row.rowIndex}`)
    expect(row.top).toBe(row.rowIndex * TIMELINE_ROW_HEIGHT)
    expect(row.height).toBe(TIMELINE_ROW_HEIGHT)
    expect(row.item.rowIndex).toBe(row.rowIndex)
    if (row.item.kind === 'unscheduled') expect(row.geometry).toBeNull()
    else expect(row.geometry?.rowTop).toBe(row.top)
  }
  expect(rows.find(row => row.rowIndex === 0)?.item.kind).toBe('point')
  expect(rows.find(row => row.rowIndex === 101)?.item.kind).toBe('unscheduled')
  expect(frozenDisplay.has('layout-101')).toBe(true)
})
