import { expect, test } from '@playwright/test'
import type { DatabaseDateValue } from '@eotion/domain/date'
import { offsetTimelineDateValue, temporalOffsetFromX } from '../src/components/editor/timeline/mutation'
import { calendarBoundary, timeToX } from '../src/components/editor/timeline/coordinates'
import { pxPerMs } from '../src/components/editor/timeline/scale'
import type { TimelineScaleId, Transform } from '../src/components/editor/timeline/types'

const at = (value: string) => Date.parse(value)
const transform = (scale: TimelineScaleId, originMs = at('2024-03-01T00:00:00.000Z')): Transform => ({
  originMs, pxPerMs: pxPerMs(scale), scrollLeft: 0, width: 800, scale, generation: 0, displayTimeZone: 'UTC',
})

test('datetime drag offsets use shared coordinates at all seven scales and preserve signed milliseconds', () => {
  const start = '2024-03-10T06:30:00.123Z'
  const startMs = at(start)
  for (const scale of ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'] as TimelineScaleId[]) {
    const view = transform(scale)
    for (const delta of [-3_600_001, 0, 987_654]) {
      const target = startMs + delta
      const deltaX = timeToX(target, view) - timeToX(startMs, view)
      expect(temporalOffsetFromX({ start, timeZone: 'America/New_York' }, deltaX, view, 'UTC'))
        .toEqual({ kind: 'datetime', milliseconds: delta })
    }
  }
})

test('date-only offset snaps to the nearest zoned calendar boundary with ties forward', () => {
  const start = '2024-02-29'
  const view = transform('day')
  const source = calendarBoundary(start, 'UTC').instantMs
  const dragTo = (targetMs: number) => temporalOffsetFromX(start, timeToX(targetMs, view) - timeToX(source, view), view, 'UTC')
  expect(dragTo(at('2024-02-29T11:59:59.999Z'))).toEqual({ kind: 'date-only', days: 0 })
  expect(dragTo(at('2024-02-29T12:00:00.000Z'))).toEqual({ kind: 'date-only', days: 1 })
  expect(dragTo(at('2024-03-01T11:59:59.999Z'))).toEqual({ kind: 'date-only', days: 1 })
  expect(dragTo(at('2024-03-01T12:00:00.000Z'))).toEqual({ kind: 'date-only', days: 2 })
})

test('date-only offsets use Gregorian days across leap years, year bounds, DST, and inclusive ranges', () => {
  expect(offsetTimelineDateValue('2024-02-28', { kind: 'date-only', days: 1 })).toBe('2024-02-29')
  expect(offsetTimelineDateValue('2024-02-29', { kind: 'date-only', days: 1 })).toBe('2024-03-01')
  expect(offsetTimelineDateValue('2024-12-31', { kind: 'date-only', days: 1 })).toBe('2025-01-01')
  expect(offsetTimelineDateValue('9999-12-31', { kind: 'date-only', days: 1 })).toBeNull()
  expect(offsetTimelineDateValue('0000-01-01', { kind: 'date-only', days: -1 })).toBeNull()

  const range: DatabaseDateValue = { start: '2024-03-09', end: '2024-03-10' }
  const moved = offsetTimelineDateValue(range, { kind: 'date-only', days: 1 })
  expect(moved).toEqual({ start: '2024-03-10', end: '2024-03-11' })
  const before = at('2024-03-10T00:00:00.000Z') - at('2024-03-09T00:00:00.000Z')
  const after = at('2024-03-11T00:00:00.000Z') - at('2024-03-10T00:00:00.000Z')
  expect(before).toBe(24 * 3_600_000)
  expect(after).toBe(24 * 3_600_000)

  const spring = offsetTimelineDateValue({ start: '2024-03-09', end: '2024-03-10' }, { kind: 'date-only', days: 1 }) as { start: string; end: string }
  const fall = offsetTimelineDateValue({ start: '2024-11-02', end: '2024-11-03' }, { kind: 'date-only', days: 1 }) as { start: string; end: string }
  expect(spring).toEqual({ start: '2024-03-10', end: '2024-03-11' })
  expect(fall).toEqual({ start: '2024-11-03', end: '2024-11-04' })
  expect(calendarBoundary(spring.end, 'America/New_York').instantMs - calendarBoundary(spring.start, 'America/New_York').instantMs)
    .toBe(23 * 3_600_000)
  expect(calendarBoundary(fall.end, 'America/New_York').instantMs - calendarBoundary(fall.start, 'America/New_York').instantMs)
    .toBe(25 * 3_600_000)
})

test('date-only conversion measures calendar duration across New York 23-hour and 25-hour days', () => {
  const view = { ...transform('day'), displayTimeZone: 'America/New_York' }
  const drag = (start: string, target: string) => {
    const sourceMs = calendarBoundary(start, 'America/New_York').instantMs
    const targetMs = at(target)
    return temporalOffsetFromX(start, timeToX(targetMs, view) - timeToX(sourceMs, view), view, 'America/New_York')
  }
  expect(drag('2024-03-09', '2024-03-10T16:00:00.000Z')).toEqual({ kind: 'date-only', days: 1 })
  expect(drag('2024-11-02', '2024-11-03T04:00:00.000Z')).toEqual({ kind: 'date-only', days: 1 })
})

test('date-only zero drag is valid at year endpoints and Apia can cross a skipped date', () => {
  expect(temporalOffsetFromX('0000-01-01', 0, transform('day'), 'UTC')).toEqual({ kind: 'date-only', days: 0 })
  expect(temporalOffsetFromX('9999-12-31', 0, transform('day'), 'UTC')).toEqual({ kind: 'date-only', days: 0 })

  const view = { ...transform('day'), displayTimeZone: 'Pacific/Apia' }
  const startMs = calendarBoundary('2011-12-29', 'Pacific/Apia').instantMs
  const targetMs = at('2011-12-30T12:00:00.000Z')
  expect(temporalOffsetFromX('2011-12-29', 0, view, 'Pacific/Apia')).toEqual({ kind: 'date-only', days: 0 })
  expect(temporalOffsetFromX('2011-12-29', timeToX(targetMs, view) - timeToX(startMs, view), view, 'Pacific/Apia'))
    .toEqual({ kind: 'date-only', days: 2 })
  expect(temporalOffsetFromX('2011-12-30', 0, view, 'Pacific/Apia')).toBeNull()
  expect(temporalOffsetFromX('0000-01-01', -Number.MAX_VALUE, view, 'Pacific/Apia')).toBeNull()
})

test('offset application retains string/object shape, absent/equal end, and source timeZone', () => {
  expect(offsetTimelineDateValue('2024-01-01', { kind: 'date-only', days: 2 })).toBe('2024-01-03')
  expect(offsetTimelineDateValue({ start: '2024-01-01' }, { kind: 'date-only', days: 2 })).toEqual({ start: '2024-01-03' })
  expect(offsetTimelineDateValue({ start: '2024-01-01', end: '2024-01-01' }, { kind: 'date-only', days: 2 }))
    .toEqual({ start: '2024-01-03', end: '2024-01-03' })
  expect(offsetTimelineDateValue({ start: '2024-01-01T00:00:00.000Z', timeZone: 'Europe/Paris' }, { kind: 'datetime', milliseconds: 1 }))
    .toEqual({ start: '2024-01-01T00:00:00.001Z', timeZone: 'Europe/Paris' })
})

test('datetime ranges shift both instants by elapsed milliseconds and reject domain overflow', () => {
  const original = { start: '2024-03-10T06:30:00.123Z', end: '2024-03-10T08:00:00.123Z', timeZone: 'America/New_York' }
  const moved = offsetTimelineDateValue(original, { kind: 'datetime', milliseconds: -1_234 }) as typeof original
  expect(moved).toEqual({ start: '2024-03-10T06:29:58.889Z', end: '2024-03-10T07:59:58.889Z', timeZone: 'America/New_York' })
  expect(at(moved.end) - at(moved.start)).toBe(at(original.end) - at(original.start))
  expect(offsetTimelineDateValue({ start: '9999-12-31T23:59:59.999Z', timeZone: 'UTC' }, { kind: 'datetime', milliseconds: 1 })).toBeNull()
  expect(offsetTimelineDateValue(original, { kind: 'date-only', days: 1 })).toBeNull()
  expect(offsetTimelineDateValue(original, { kind: 'datetime', milliseconds: Number.MAX_SAFE_INTEGER })).toBeNull()
})
