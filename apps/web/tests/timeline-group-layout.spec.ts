import { expect, test } from '@playwright/test'
import { layoutTimelineGroupSections } from '../src/components/editor/timeline/groupLayout'
import { layoutTimelineItems, timelineRowWindow, TIMELINE_ROW_HEIGHT } from '../src/components/editor/timeline/layout'
import type { TimelineItemProjection } from '../src/components/editor/timeline/projection'
import type { Transform } from '../src/components/editor/timeline/types'

const option = (optionId: string) => ({ kind: 'option' as const, optionId })
const ungrouped = { kind: 'ungrouped' as const }
const item = (recordId: string, rowIndex = 0): TimelineItemProjection => ({
  recordId, pageId: `page-${recordId}`, title: recordId, dateLabel: 'date', rowIndex,
  visibleProperties: [{ propertyId: 'status', propertyType: 'select', displayText: 'Open' }],
  kind: 'point', start: { kind: 'datetime', instantMs: 10, sourceTimeZone: 'UTC' }, end: null,
})
const transform: Transform = { originMs: 0, pxPerMs: 1, scrollLeft: 0, width: 100, scale: 'day', generation: 0, displayTimeZone: 'UTC' }

test('empty, collapsed, and populated groups share a visual row axis without changing inputs', () => {
  const first = Object.freeze(item('first', 99))
  const hidden = Object.freeze(item('hidden', 88))
  const last = Object.freeze(item('last', 77))
  const sections = Object.freeze([
    Object.freeze({ key: option('empty'), label: 'Empty', collapsed: false, items: Object.freeze([]) }),
    Object.freeze({ key: option('closed'), label: 'Closed', collapsed: true, items: Object.freeze([hidden]) }),
    Object.freeze({ key: option('open'), label: 'Open', collapsed: false, items: Object.freeze([first, last]) }),
    Object.freeze({ key: ungrouped, label: 'No status', collapsed: false, items: Object.freeze([]) }),
  ])
  const result = layoutTimelineGroupSections(sections)
  expect(result.headers.map(header => [header.label, header.rowIndex, header.top, header.height, header.collapsed])).toEqual([
    ['Empty', 0, 0, 48, false], ['Closed', 1, 48, 48, true], ['Open', 2, 96, 48, false], ['No status', 5, 240, 48, false],
  ])
  expect(result.items).toEqual([{ ...first, rowIndex: 3 }, { ...last, rowIndex: 4 }])
  expect(result.rowCount).toBe(6)
  expect(first.rowIndex).toBe(99)
  expect(hidden.rowIndex).toBe(88)
  expect(last.rowIndex).toBe(77)
  expect(result.items[0]).not.toBe(first)
})

test('group identities preserve special option ids and reject duplicate groups or records', () => {
  const sections = [
    { key: option('x|y:/?"'), label: 'Special', collapsed: false, items: [item('one')] },
    { key: option('x|y:/?"0'), label: 'Other', collapsed: false, items: [item('two')] },
    { key: ungrouped, label: 'Missing', collapsed: false, items: [] },
  ]
  expect(layoutTimelineGroupSections(sections).headers.map(header => header.key)).toEqual(sections.map(section => section.key))
  expect(() => layoutTimelineGroupSections([...sections, { key: option('x|y:/?"'), label: 'Duplicate', collapsed: false, items: [] }])).toThrow(/Duplicate Timeline group key/)
  expect(() => layoutTimelineGroupSections([...sections, { key: ungrouped, label: 'Duplicate', collapsed: false, items: [] }])).toThrow(/Duplicate Timeline group key/)
  expect(() => layoutTimelineGroupSections([...sections, { key: option('third'), label: 'Third', collapsed: true, items: [item('one')] }])).toThrow(/Duplicate Timeline record id/)
})

test('virtual windows use sparse visual row indices and retain only an existing focused record', () => {
  const sections = [
    { key: option('first'), label: 'First', collapsed: false, items: Array.from({ length: 210 }, (_, index) => item(`a-${index}`)) },
    { key: option('second'), label: 'Second', collapsed: false, items: [item('b-0'), item('b-1'), item('b-2')] },
  ]
  const result = layoutTimelineGroupSections(sections)
  expect(result.rowCount).toBe(215)
  expect(result.headers.map(header => header.rowIndex)).toEqual([0, 211])
  expect(result.items.at(-1)?.rowIndex).toBe(214)
  const temporal = new Map(result.items.map(value => [value.recordId, { recordId: value.recordId, startMs: 10, visualEndMs: null }]))
  const window = timelineRowWindow({ count: result.rowCount, visibleTop: 211 * TIMELINE_ROW_HEIGHT,
    visibleBottom: 213 * TIMELINE_ROW_HEIGHT, focusedRowIndex: 2 })
  const rows = layoutTimelineItems(result.items, temporal, transform, window)
  expect(rows.map(row => row.rowIndex)).toEqual([2, 206, 207, 208, 209, 210, 212, 213, 214])
  expect(rows.find(row => row.rowIndex === 212)?.geometry?.rowTop).toBe(212 * TIMELINE_ROW_HEIGHT)
  expect(rows.every(row => row.top === row.item.rowIndex * TIMELINE_ROW_HEIGHT)).toBe(true)
  const headerFocus = { ...window, focusedRowIndex: 0 }
  expect(layoutTimelineItems(result.items, temporal, transform, headerFocus).map(row => row.rowIndex)).toEqual([206, 207, 208, 209, 210, 212, 213, 214])
  const secondHeaderFocus = { ...window, focusedRowIndex: 211 }
  expect(layoutTimelineItems(result.items, temporal, transform, secondHeaderFocus).map(row => row.rowIndex)).toEqual([206, 207, 208, 209, 210, 212, 213, 214])
})

test('large virtual windows locate items without scanning the whole list', () => {
  const source = Array.from({ length: 10_000 }, (_, index) => item(`r-${index}`, index + 1))
  let reads = 0
  const items = new Proxy(source, { get(target, property, receiver) {
    if (typeof property === 'string' && /^\d+$/u.test(property)) reads++
    return Reflect.get(target, property, receiver)
  } })
  const window = timelineRowWindow({ count: 10_001, visibleTop: 9_000 * TIMELINE_ROW_HEIGHT, visibleBottom: 9_002 * TIMELINE_ROW_HEIGHT })
  const rows = layoutTimelineItems(items, new Map(), transform, window)
  expect(rows.map(row => row.rowIndex)).toEqual(Array.from({ length: 12 }, (_, index) => 8_995 + index))
  expect(reads).toBeLessThan(100)
})
