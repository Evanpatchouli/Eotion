import { expect, test } from '@playwright/test'
import type { DatabaseDateValue } from '@eotion/domain/date'
import { isWritableTimelineDateSource, offsetTimelineDateValue, resizeTimelineDateValueFromX, temporalOffsetFromX } from '../src/components/editor/timeline/mutation'
import { addCalendar, calendarBoundary, nextCalendarBoundary, timeToX } from '../src/components/editor/timeline/coordinates'
import type { TimelineDateSource } from '@eotion/domain/database'
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

test('resize preserves endpoint shape, supports point-to-range upgrade, and leaves zero delta untouched', () => {
  const view = transform('day')
  const resize = (value: DatabaseDateValue, endpoint: 'start' | 'end', origin: number, target: number) =>
    resizeTimelineDateValueFromX(value, endpoint, timeToX(target, view) - timeToX(origin, view), view, 'UTC')

  expect(resize('2024-01-10', 'start', at('2024-01-10T00:00:00.000Z'), at('2024-01-12T00:00:00.000Z'))).toBeNull()
  expect(resize({ start: '2024-01-10' }, 'start', at('2024-01-10T00:00:00.000Z'), at('2024-01-12T00:00:00.000Z'))).toBeNull()
  expect(resize({ start: '2024-01-10T06:30:00.123Z', end: '2024-01-15T06:30:00.123Z', timeZone: 'America/New_York' }, 'start', at('2024-01-10T06:30:00.123Z'), at('2024-01-12T06:30:00.123Z')))
    .toEqual({ start: '2024-01-12T06:30:00.123Z', end: '2024-01-15T06:30:00.123Z', timeZone: 'America/New_York' })
  expect(resize({ start: '2024-01-10', end: '2024-01-15' }, 'end', nextCalendarBoundary('2024-01-15', 'UTC').instantMs, at('2024-01-18T00:00:00.000Z')))
    .toEqual({ start: '2024-01-10', end: '2024-01-17' })

  const legacyPoint: DatabaseDateValue = '2024-01-10'
  expect(resize(legacyPoint, 'start', at('2024-01-10T00:00:00.000Z'), at('2024-01-11T00:00:00.000Z'))).toBeNull()
  expect(resize(legacyPoint, 'end', at('2024-01-10T00:00:00.000Z'), at('2024-01-11T00:00:00.000Z'))).toEqual({ start: legacyPoint, end: legacyPoint })
  expect(resize({ start: '2024-01-10T06:30:00.123Z', timeZone: 'America/New_York' }, 'end', at('2024-01-10T06:30:00.123Z'), at('2024-01-10T07:30:00.123Z')))
    .toEqual({ start: '2024-01-10T06:30:00.123Z', end: '2024-01-10T07:30:00.123Z', timeZone: 'America/New_York' })

  const original = { start: '2024-01-10', end: '2024-01-10' }
  expect(resizeTimelineDateValueFromX(original, 'end', 0, view, 'UTC')).toBe(original)
})

test('resize clamps without swapping and preserves explicit equal ends', () => {
  const view = transform('day')
  const resizeDate = (value: DatabaseDateValue, endpoint: 'start' | 'end', target: string) => {
    const source = endpoint === 'start' ? (value as { start: string }).start : (value as { end: string }).end
    const origin = calendarBoundary(source, 'UTC').instantMs
    return resizeTimelineDateValueFromX(value, endpoint, timeToX(at(`${target}T00:00:00.000Z`), view) - timeToX(origin, view), view, 'UTC')
  }
  expect(resizeDate({ start: '2024-01-10', end: '2024-01-12' }, 'start', '2024-01-15')).toEqual({ start: '2024-01-12', end: '2024-01-12' })
  expect(resizeDate({ start: '2024-01-10', end: '2024-01-12' }, 'end', '2024-01-08')).toEqual({ start: '2024-01-10', end: '2024-01-10' })
  expect(resizeTimelineDateValueFromX({ start: '2024-01-10T10:00:00.000Z', end: '2024-01-12T10:00:00.000Z', timeZone: 'UTC' }, 'start', -48, view, 'UTC'))
    .toEqual({ start: '2024-01-10T07:00:00.000Z', end: '2024-01-12T10:00:00.000Z', timeZone: 'UTC' })
})

test('resize uses all seven future snap units with nearest ties forward', () => {
  const origin = at('2024-01-15T10:00:00.000Z')
  const cases: [TimelineScaleId, number][] = [
    ['hour', 15 * 60_000], ['day', 3_600_000], ['week', 86_400_000], ['biweek', 86_400_000],
    ['month', 86_400_000], ['quarter', 86_400_000], ['year', 31 * 86_400_000],
  ]
  for (const [scale, step] of cases) {
    const view = transform(scale)
    let next: number
    if (scale === 'hour' || scale === 'day') next = origin + step
    else if (scale === 'year') next = addCalendar(origin, { unit: 'month', amount: 1 }, 'UTC')
    else next = addCalendar(origin, { unit: 'day', amount: 1 }, 'UTC')
    const target = origin + (next - origin) / 2
    const result = resizeTimelineDateValueFromX({ start: new Date(origin).toISOString(), end: new Date(origin).toISOString(), timeZone: 'UTC' }, 'end',
      timeToX(target, view) - timeToX(origin, view), view, 'UTC') as { end: string }
    expect(Date.parse(result.end), `${scale} midpoint tie chooses forward candidate`).toBe(next)
  }
})

test('date-only resize keeps at least day precision while Year uses its configured month step', () => {
  for (const scale of ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'] as TimelineScaleId[]) {
    const view = transform(scale)
    const originDate = '2024-01-15'
    const origin = nextCalendarBoundary(originDate, 'UTC').instantMs
    const next = scale === 'year'
      ? addCalendar(origin, { unit: 'month', amount: 1 }, 'UTC')
      : addCalendar(origin, { unit: 'day', amount: 1 }, 'UTC')
    const target = origin + (next - origin) / 2
    const value = { start: '2024-01-01', end: originDate }
    const result = resizeTimelineDateValueFromX(value, 'end', timeToX(target, view) - timeToX(origin, view), view, 'UTC')
    expect(result).toEqual({ start: value.start, end: scale === 'year' ? '2024-02-15' : '2024-01-16' })
  }
})

test('all-day resize uses inclusive ends across DST and Gregorian bounds', () => {
  const zone = 'America/New_York'
  const view = { ...transform('day'), displayTimeZone: zone }
  const range = { start: '2024-03-09', end: '2024-03-10' }
  const origin = nextCalendarBoundary(range.end, zone).instantMs
  const target = calendarBoundary('2024-03-12', zone).instantMs
  expect(resizeTimelineDateValueFromX(range, 'end', timeToX(target, view) - timeToX(origin, view), view, zone))
    .toEqual({ start: '2024-03-09', end: '2024-03-11' })
  const max = { start: '9999-12-29', end: '9999-12-30' }
  const maxOrigin = nextCalendarBoundary(max.end, 'UTC').instantMs
  expect(maxOrigin).toBe(Date.parse('9999-12-31T00:00:00.000Z'))
  expect(resizeTimelineDateValueFromX(max, 'end', 1, { ...transform('day'), pxPerMs: 1 / 86_400_000 }, 'UTC'))
    .toEqual({ start: '9999-12-29', end: '9999-12-31' })
  expect(inclusiveBoundaryValue(transform('day'))).toBe('9999-12-31')
})

test('all-day point resize and skipped-day endpoints fail closed at the correct boundaries', () => {
  const zone = 'Pacific/Apia'
  const view = { ...transform('day'), displayTimeZone: zone }
  const pointStart = calendarBoundary('2011-12-29', zone).instantMs
  const nextValidBoundary = nextCalendarBoundary('2011-12-29', zone).instantMs
  expect(resizeTimelineDateValueFromX('2011-12-29', 'end', timeToX(nextValidBoundary, view) - timeToX(pointStart, view), view, zone))
    .toEqual({ start: '2011-12-29', end: '2011-12-29' })
  expect(resizeTimelineDateValueFromX({ start: '2011-12-28', end: '2011-12-29' }, 'end', 1, { ...view, pxPerMs: 1 / 86_400_000 }, zone))
    .not.toBeNull()
  expect(resizeTimelineDateValueFromX({ start: '2011-12-28', end: '2011-12-30' }, 'end', 86_400_000 * 16, { ...view, pxPerMs: 1 / 86_400_000 }, zone)).toBeNull()

  const sources: (TimelineDateSource | undefined)[] = [undefined, { mode: 'date-property', propertyId: 'date' }, { mode: 'start-end', startPropertyId: 'start', endPropertyId: 'end' }]
  expect(sources.map(isWritableTimelineDateSource)).toEqual([false, true, false])
})

test('calendar snapping preserves a second DST-fold instant and date-only midnight-gap boundaries', () => {
  const fold = '2024-11-03T06:30:00.123Z'
  const week = transform('week')
  const foldRange = { start: fold, end: '2024-11-04T06:30:00.123Z', timeZone: 'America/New_York' }
  expect(resizeTimelineDateValueFromX(foldRange, 'start', 1e-8, week, 'America/New_York')).toEqual(foldRange)

  const gapZone = 'America/Sao_Paulo'
  const gapDate = '2018-11-04'
  const gapStart = calendarBoundary(gapDate, gapZone).instantMs
  expect(new Date(gapStart).toISOString()).toBe('2018-11-04T03:00:00.000Z')
  const allDay = { start: gapDate, end: '2018-11-06' }
  expect(resizeTimelineDateValueFromX(allDay, 'start', 1e-8, week, gapZone)).toEqual(allDay)
  const dayAfter = addCalendar(gapStart, { unit: 'day', amount: 1 }, gapZone)
  const gapView = { ...week, pxPerMs: pxPerMs('week') }
  expect(resizeTimelineDateValueFromX(allDay, 'start', timeToX(dayAfter, gapView) - timeToX(gapStart, gapView), gapView, gapZone))
    .toEqual({ start: '2018-11-05', end: allDay.end })
})

test('resize fails closed for unresolvable zones, overflowing deltas, and invalid Date instants', () => {
  const range = { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z', timeZone: 'UTC' }
  const view = transform('week')
  expect(resizeTimelineDateValueFromX(range, 'end', 1, view, 'Not/AZone')).toBeNull()
  expect(resizeTimelineDateValueFromX(range, 'end', Number.MAX_VALUE, view, 'UTC')).toBeNull()
  const yearEdge = { start: '9999-12-30T23:59:59.999Z', end: '9999-12-31T23:59:59.999Z', timeZone: 'UTC' }
  const hourView = transform('hour')
  expect(resizeTimelineDateValueFromX(yearEdge, 'end', 1e20, hourView, 'UTC')).toBeNull()
})

function inclusiveBoundaryValue(view: Transform): string | null {
  const range = { start: '9999-12-30', end: '9999-12-31' }
  const origin = nextCalendarBoundary(range.end, 'UTC').instantMs
  const dense = { ...view, pxPerMs: 1 / 86_400_000 }
  const result = resizeTimelineDateValueFromX(range, 'end', -0.1, dense, 'UTC') as { end: string } | null
  return result?.end ?? null
}
