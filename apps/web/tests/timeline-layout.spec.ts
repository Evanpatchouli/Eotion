import { expect, test } from '@playwright/test'
import { calendarBoundary, nextCalendarBoundary, timeToScreenX } from '../src/components/editor/timeline/coordinates'
import { resolveTimelineTemporalGeometry } from '../src/components/editor/timeline/geometry'
import { layoutTimelineItems, timelineRowWindow, TIMELINE_BAR_HEIGHT, TIMELINE_ROW_HEIGHT, type TimelineRowWindow } from '../src/components/editor/timeline/layout'
import type { TimelineItemProjection } from '../src/components/editor/timeline/projection'
import type { Transform } from '../src/components/editor/timeline/types'
import { createViewport, deriveViewport, rebaseViewport, viewportTransform } from '../src/components/editor/timeline/viewport'

function item(recordId: string, rowIndex: number, start: TimelineItemProjection['start'] = { kind: 'datetime', instantMs: 10, sourceTimeZone: 'UTC' }, end: TimelineItemProjection['end'] = null): TimelineItemProjection {
  const base = { recordId, pageId: `page-${recordId}`, title: recordId, dateLabel: '', rowIndex, visibleProperties: [] }
  return end === null ? { ...base, kind: 'point', start, end } : { ...base, kind: 'range', start, end, precision: start.kind, explicitZeroDuration: false }
}

const transform = (patch: Partial<Transform> = {}): Transform => ({ originMs: 0, pxPerMs: 1, scrollLeft: 0, width: 100, scale: 'day', generation: 0, displayTimeZone: 'UTC', ...patch })

test('date geometry uses local next-day boundaries through DST, skipped dates and year 9999', () => {
  const dst = item('dst', 0, { kind: 'date-only', date: '2024-03-10' }, { kind: 'date-only', date: '2024-03-10' })
  const apia = item('apia', 1, { kind: 'date-only', date: '2011-12-30' }, { kind: 'date-only', date: '2011-12-30' })
  const skippedEnd = item('skipped-end', 2, { kind: 'date-only', date: '2011-12-29' }, { kind: 'date-only', date: '2011-12-30' })
  const max = item('max-year', 2, { kind: 'date-only', date: '9999-12-31' }, { kind: 'date-only', date: '9999-12-31' })
  const map = resolveTimelineTemporalGeometry([dst, apia, skippedEnd, max], 'America/New_York')
  const dstStart = calendarBoundary('2024-03-10', 'America/New_York').instantMs
  expect(map.get('dst')?.visualEndMs! - dstStart).toBe(23 * 3_600_000)
  const skipped = resolveTimelineTemporalGeometry([apia], 'Pacific/Apia').get('apia')!
  expect(skipped.startMs).toBe(calendarBoundary('2011-12-30', 'Pacific/Apia').instantMs)
  expect(skipped.visualEndMs).toBe(nextCalendarBoundary('2011-12-30', 'Pacific/Apia').instantMs)
  expect(skipped.visualEndMs).toBe(skipped.startMs)
  expect(skipped.diagnostic).toBe('calendar-day-skipped')
  expect(resolveTimelineTemporalGeometry([skippedEnd], 'Pacific/Apia').get('skipped-end')?.diagnostic).toBe('calendar-day-skipped')
  const utcMax = resolveTimelineTemporalGeometry([max], 'UTC').get('max-year')!
  const endYear10000 = new Date(0)
  endYear10000.setUTCHours(0, 0, 0, 0)
  endYear10000.setUTCFullYear(10000, 0, 1)
  expect(utcMax.visualEndMs).toBe(endYear10000.getTime())
})

test('datetime geometry keeps exact instants and omits unscheduled rows', () => {
  const range = item('range', 0, { kind: 'datetime', instantMs: 10, sourceTimeZone: 'America/New_York' }, { kind: 'datetime', instantMs: 10, sourceTimeZone: 'UTC' })
  const unscheduled = { recordId: 'none', pageId: 'none-page', title: 'none', dateLabel: '', rowIndex: 1, visibleProperties: [], kind: 'unscheduled', start: null, end: null, reason: 'missing-start' } as TimelineItemProjection
  const map = resolveTimelineTemporalGeometry([range, unscheduled], 'Asia/Tokyo')
  expect(map.get('range')).toEqual({ recordId: 'range', startMs: 10, visualEndMs: 10 })
  expect(map.has('none')).toBe(false)
})

test('row windows virtualize at 200 rows, keep focus as an isolated row and preserve input order', () => {
  expect(timelineRowWindow({ count: 199, visibleTop: 500, visibleBottom: 600 })).toMatchObject({ first: 0, last: 199, top: 0, totalHeight: 199 * TIMELINE_ROW_HEIGHT })
  const window = timelineRowWindow({ count: 500, visibleTop: 4800, visibleBottom: 4896, focusedRowIndex: 3 })
  expect(window).toMatchObject({ first: 95, last: 107, top: 95 * 48, totalHeight: 500 * 48, focusedRowIndex: 3 })
  const items = Array.from({ length: 500 }, (_, index) => item(`r${index}`, index))
  const temporal = new Map(items.map(value => [value.recordId, { recordId: value.recordId, startMs: 10, visualEndMs: null }]))
  const laidOut = layoutTimelineItems(items, temporal, transform(), window)
  expect(laidOut.map(row => row.rowIndex)).toEqual([3, ...Array.from({ length: 12 }, (_, index) => index + 95)])
  expect(laidOut.find(row => row.rowIndex === 3)?.top).toBe(3 * 48)
  expect(laidOut[0]?.geometry?.rowTop).toBe(3 * 48)
  expect(laidOut[0]?.geometry?.top).toBe(3 * 48 + (TIMELINE_ROW_HEIGHT - TIMELINE_BAR_HEIGHT) / 2)
})

test('range clipping retains raw coordinates and zero-width markers remain genuine points', () => {
  const rows = [
    item('left-clipped', 0, { kind: 'datetime', instantMs: -20, sourceTimeZone: 'UTC' }, { kind: 'datetime', instantMs: 30, sourceTimeZone: 'UTC' }),
    item('right-clipped', 1, { kind: 'datetime', instantMs: 80, sourceTimeZone: 'UTC' }, { kind: 'datetime', instantMs: 130, sourceTimeZone: 'UTC' }),
    item('zero-range', 2, { kind: 'datetime', instantMs: 35, sourceTimeZone: 'UTC' }, { kind: 'datetime', instantMs: 35, sourceTimeZone: 'UTC' }),
    item('point-outside', 3, { kind: 'datetime', instantMs: 120, sourceTimeZone: 'UTC' }),
  ]
  const temporal = new Map([
    ['left-clipped', { recordId: 'left-clipped', startMs: -20, visualEndMs: 30 }],
    ['right-clipped', { recordId: 'right-clipped', startMs: 80, visualEndMs: 130 }],
    ['zero-range', { recordId: 'zero-range', startMs: 35, visualEndMs: 35 }],
    ['point-outside', { recordId: 'point-outside', startMs: 120, visualEndMs: null }],
  ])
  const window: TimelineRowWindow = { first: 0, last: 4, top: 0, height: 192, totalHeight: 192, focusedRowIndex: null }
  const geometry = layoutTimelineItems(rows, temporal, transform({ scrollLeft: 20 }), window).map(row => row.geometry!)
  expect(geometry[0]).toMatchObject({ rawX: -20, rawWidth: 50, x: 20, width: 10, clippedLeft: true, clippedRight: false })
  expect(geometry[1]).toMatchObject({ rawX: 80, rawWidth: 50, x: 80, width: 40, clippedLeft: false, clippedRight: true })
  expect(geometry[2]).toMatchObject({ kind: 'range', rawX: 35, rawWidth: 0, x: 35, width: 0, marker: true })
  expect(geometry[3]).toMatchObject({ kind: 'point', rawX: 120, rawWidth: 0, x: 120, width: 0, marker: true, offscreen: 'right' })
})

test('rebasing keeps bar screen coordinates stable', () => {
  const initial = createViewport({ width: 800, centerMs: Date.parse('2024-01-01T00:00:00Z'), scale: 'day', displayTimeZone: 'UTC' })!
  const scrolled = { ...initial, scrollLeft: 12 }
  const before = viewportTransform(deriveViewport(scrolled))
  const after = viewportTransform(rebaseViewport(scrolled))
  const at = Date.parse('2024-01-02T00:00:00Z')
  expect(timeToScreenX(at, after)).toBeCloseTo(timeToScreenX(at, before), 5)
})
