import { expect, test } from '@playwright/test'
import { addCalendar, calendarBoundary, resolveWallTimeCandidates, screenXToTime, timeToScreenX, timeToX, xToTime, zonedFields, timelineInstantBounds, TIMELINE_MAX_INSTANT, TIMELINE_MIN_INSTANT } from '../src/components/editor/timeline/coordinates'
import { generateTimelineTicks, timelineTickBucket } from '../src/components/editor/timeline/ruler'
import { getTimelineScale, getWeekStart, pxPerMs } from '../src/components/editor/timeline/scale'
import { alignViewportScroll, canvasWidth, centerViewport, createViewport, deriveViewport, rebaseViewport, stepViewport, updateViewport, viewportTransform } from '../src/components/editor/timeline/viewport'
import type { TimelineScaleId, Transform } from '../src/components/editor/timeline/types'

const instant = (value: string) => Date.parse(value)
const wall = (year: number, month: number, day: number, hour: number, minute = 0) => ({ year, month, day, hour, minute, second: 0 })

test('native scroll rounding preserves the logical center and every screen position', () => {
  const centerMs = instant('2024-03-10T05:00:00Z')
  for (const scale of ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'] as TimelineScaleId[]) {
    const before = createViewport({ width: 801, centerMs, scale, displayTimeZone: 'America/New_York' })!
    const after = alignViewportScroll(before, Math.round(before.scrollLeft))
    expect(after.scrollLeft).toBe(Math.round(before.scrollLeft))
    expect((after.visibleStartMs + after.visibleEndMs) / 2).toBeCloseTo(centerMs, 2)
    expect(after.generation).toBe(before.generation + 1)
    for (const at of [centerMs - 86_400_000, centerMs, centerMs + 86_400_000]) {
      expect(timeToScreenX(at, viewportTransform(after))).toBeCloseTo(timeToScreenX(at, viewportTransform(before)), 5)
    }
    expect(alignViewportScroll(after, after.scrollLeft)).toBe(after)
  }
})

test('all frozen scales expose their exact densities and reversible instant transforms', () => {
  const expected: Record<TimelineScaleId, number> = { hour: 48, day: 16, week: 4, biweek: 8 / 3, month: 1.5, quarter: 0.5, year: 1 / 12 }
  const originMs = instant('2041-03-10T09:23:45.678Z')
  for (const scale of Object.keys(expected) as TimelineScaleId[]) {
    expect(getTimelineScale(scale).pxPerHour).toBe(expected[scale])
    const transform: Transform = { originMs, pxPerMs: pxPerMs(scale), scrollLeft: 137.25, width: 777, scale, generation: 4, displayTimeZone: 'America/New_York' }
    for (const delta of [-86_400_000, -1, 0, 1, 123_456_789]) {
      const at = originMs + delta
      expect(xToTime(timeToX(at, transform), transform)).toBeCloseTo(at, 5)
      expect(screenXToTime(timeToScreenX(at, transform), transform)).toBeCloseTo(at, 5)
    }
  }
  expect(getTimelineScale('biweek').majorUnit).toEqual({ unit: 'week', amount: 1 })
  expect(getTimelineScale('biweek').navigationUnit).toEqual({ unit: 'week', amount: 2 })
})

test('Gregorian formatter handles year zero and avoids Date UTC 0–99 remapping', () => {
  expect(zonedFields(instant('0000-01-01T00:00:00.000Z'), 'UTC')).toMatchObject({ year: 0, month: 1, day: 1 })
  expect(calendarBoundary('0000-01-01', 'UTC').instantMs).toBe(instant('0000-01-01T00:00:00.000Z'))
  expect(calendarBoundary('0099-02-03', 'UTC').instantMs).toBe(instant('0099-02-03T00:00:00.000Z'))
  expect(calendarBoundary('9999-12-31', 'UTC').instantMs).toBe(instant('9999-12-31T00:00:00.000Z'))
  expect(() => calendarBoundary('10000-01-01', 'UTC')).toThrow()
  expect(() => calendarBoundary('0000-02-30', 'UTC')).toThrow()
})

test('date-only boundaries follow ordinary zones and New York 23-hour / 25-hour days', () => {
  expect(calendarBoundary('2024-02-15', 'Asia/Shanghai').instantMs).toBe(instant('2024-02-14T16:00:00.000Z'))
  const spring = calendarBoundary('2024-03-10', 'America/New_York').instantMs
  const nextSpring = calendarBoundary('2024-03-11', 'America/New_York').instantMs
  const autumn = calendarBoundary('2024-11-03', 'America/New_York').instantMs
  const nextAutumn = calendarBoundary('2024-11-04', 'America/New_York').instantMs
  expect(nextSpring - spring).toBe(23 * 3_600_000)
  expect(nextAutumn - autumn).toBe(25 * 3_600_000)
})

test('midnight gaps, folds, half-hour DST and skipped Apia date resolve within bounds', () => {
  expect(resolveWallTimeCandidates(wall(2018, 11, 4, 0), 'America/Sao_Paulo').nextValidMs).toBe(instant('2018-11-04T03:00:00.000Z'))
  expect(calendarBoundary('2018-11-04', 'America/Sao_Paulo').instantMs).toBe(instant('2018-11-04T03:00:00.000Z'))
  const havana = resolveWallTimeCandidates(wall(2020, 11, 1, 0), 'America/Havana').candidates
  expect(havana).toEqual([instant('2020-11-01T04:00:00.000Z'), instant('2020-11-01T05:00:00.000Z')])
  const lordHowe = calendarBoundary('2020-10-04', 'Australia/Lord_Howe').instantMs
  expect(calendarBoundary('2020-10-05', 'Australia/Lord_Howe').instantMs - lordHowe).toBe(23.5 * 3_600_000)
  const apia = calendarBoundary('2011-12-30', 'Pacific/Apia')
  expect(apia).toEqual({ instantMs: instant('2011-12-30T10:00:00.000Z'), calendarDaySkipped: true })
})

test('calendar addition preserves wall clock, clamps month ends, and uses elapsed sub-day steps', () => {
  expect(addCalendar(instant('2023-01-31T12:00:00Z'), { unit: 'month', amount: 1 }, 'UTC')).toBe(instant('2023-02-28T12:00:00Z'))
  expect(addCalendar(instant('2024-01-31T12:00:00Z'), { unit: 'month', amount: 1 }, 'UTC')).toBe(instant('2024-02-29T12:00:00Z'))
  expect(addCalendar(instant('2024-03-09T17:00:00Z'), { unit: 'day', amount: 1 }, 'America/New_York')).toBe(instant('2024-03-10T16:00:00Z'))
  expect(addCalendar(instant('2024-03-09T17:00:00Z'), { unit: 'hour', amount: 24 }, 'America/New_York')).toBe(instant('2024-03-10T17:00:00Z'))
})

test('hour ticks represent both fall-back folds and never invent spring-gap hours', () => {
  const make = (date: string): Transform => ({ originMs: instant(date), pxPerMs: pxPerMs('hour'), scrollLeft: 0, width: 300, scale: 'hour', generation: 0, displayTimeZone: 'America/New_York' })
  const fallTransform = make('2024-11-03T04:00:00Z')
  const fall = generateTimelineTicks({ transform: fallTransform, overscanStartMs: instant('2024-11-03T04:00:00Z'), overscanEndMs: instant('2024-11-03T08:00:00Z'), locale: 'en-US', weekStart: 0 })
  const repeated = fall.minor.filter(tick => tick.boundaryMs === instant('2024-11-03T05:00:00Z') || tick.boundaryMs === instant('2024-11-03T06:00:00Z'))
  expect(repeated).toHaveLength(2)
  expect(repeated[0].key).not.toBe(repeated[1].key)
  expect(repeated[0].label).not.toBe(repeated[1].label)
  const springTransform = make('2024-03-10T05:00:00Z')
  const spring = generateTimelineTicks({ transform: springTransform, overscanStartMs: instant('2024-03-10T05:00:00Z'), overscanEndMs: instant('2024-03-10T09:00:00Z'), locale: 'en-US', weekStart: 0 })
  expect(spring.minor.some(tick => tick.label.startsWith('2 AM'))).toBe(false)
  const lordHowe = generateTimelineTicks({
    transform: { ...fallTransform, displayTimeZone: 'Australia/Lord_Howe' },
    overscanStartMs: instant('2020-10-03T14:00:00Z'), overscanEndMs: instant('2020-10-03T17:00:00Z'), locale: 'en-AU', weekStart: 1,
  })
  const oneAm = lordHowe.minor.find(tick => tick.boundaryMs === instant('2020-10-03T14:30:00Z'))
  expect(oneAm?.spanEndMs).toBe(instant('2020-10-03T16:00:00Z'))
})

test('midnight gap does not drift following daily major boundaries', () => {
  const transform: Transform = { originMs: instant('2018-11-04T03:00:00Z'), pxPerMs: pxPerMs('day'), scrollLeft: 0, width: 500, scale: 'day', generation: 0, displayTimeZone: 'America/Sao_Paulo' }
  const ticks = generateTimelineTicks({ transform, overscanStartMs: instant('2018-11-04T03:00:00Z'), overscanEndMs: instant('2018-11-07T03:00:00Z'), locale: 'pt-BR', weekStart: 1 })
  const localDates = ticks.major.map(tick => ({ ...zonedFields(tick.boundaryMs, transform.displayTimeZone), tick }))
  expect(localDates.find(value => value.day === 4)?.hour).toBe(1)
  expect(localDates.find(value => value.day === 5)?.hour).toBe(0)
  expect(localDates.find(value => value.day === 6)?.hour).toBe(0)
})

test('week starts follow Intl locale data with deterministic fallback', () => {
  expect(getWeekStart('zh-CN')).toBe(1)
  expect(getWeekStart('en-US')).toBe(0)
  expect(getWeekStart('unknown-ZZ')).toBe(1)
  const transform: Transform = { originMs: instant('2024-01-03T00:00:00Z'), pxPerMs: pxPerMs('week'), scrollLeft: 0, width: 200, scale: 'week', generation: 0, displayTimeZone: 'UTC' }
  const args = { transform, overscanStartMs: instant('2024-01-03T00:00:00Z'), overscanEndMs: instant('2024-01-20T00:00:00Z'), locale: 'en-US' }
  const mon = generateTimelineTicks({ ...args, weekStart: 1 }).major[0]
  const sun = generateTimelineTicks({ ...args, weekStart: 0 }).major[0]
  expect(mon.boundaryMs).toBe(instant('2024-01-01T00:00:00Z'))
  expect(sun.boundaryMs).toBe(instant('2023-12-31T00:00:00Z'))
})

test('ticks stay within budget, keys are stable, and buckets change at major periods', () => {
  const transform: Transform = { originMs: instant('2020-01-01T00:00:00Z'), pxPerMs: pxPerMs('day'), scrollLeft: 0, width: 200_000, scale: 'day', generation: 0, displayTimeZone: 'UTC' }
  const args = { transform, overscanStartMs: instant('2019-01-01T00:00:00Z'), overscanEndMs: instant('2022-01-01T00:00:00Z'), locale: 'en-US', weekStart: 1 }
  const ticks = generateTimelineTicks(args)
  expect(ticks.major.length + ticks.minor.length).toBeLessThanOrEqual(256)
  expect(generateTimelineTicks(args).major.map(tick => tick.key)).toEqual(ticks.major.map(tick => tick.key))
  expect(timelineTickBucket(args)).toBe(ticks.bucketKey)
  const sameBucketBase = { ...args, overscanStartMs: instant('2019-01-01T00:00:00Z'), overscanEndMs: instant('2019-01-01T05:00:00Z') }
  const sameBucket = { ...sameBucketBase, overscanStartMs: instant('2019-01-01T00:30:00Z'), overscanEndMs: instant('2019-01-01T05:30:00Z') }
  const firstBucketTicks = generateTimelineTicks(sameBucketBase)
  expect(timelineTickBucket(sameBucket)).toBe(firstBucketTicks.bucketKey)
  expect(generateTimelineTicks(sameBucket).minor.map(tick => tick.key)).toEqual(firstBucketTicks.minor.map(tick => tick.key))
  expect(timelineTickBucket({ ...args, overscanStartMs: instant('2022-02-01T00:00:00Z'), overscanEndMs: instant('2022-02-02T00:00:00Z') })).not.toBe(ticks.bucketKey)
})

test('viewport delays zero width, preserves center on resize/zoom/zone change, and recenters navigation', () => {
  expect(createViewport({ width: 0, centerMs: 0, scale: 'month', displayTimeZone: 'UTC' })).toBeNull()
  const initial = createViewport({ width: 800, centerMs: instant('2024-03-10T12:00:00Z'), scale: 'day', displayTimeZone: 'America/New_York' })!
  const resized = updateViewport(initial, { width: 1000 })!
  const zoomed = updateViewport(resized, { scale: 'week' })!
  const zoned = updateViewport(zoomed, { displayTimeZone: 'UTC' })!
  expect((resized.visibleStartMs + resized.visibleEndMs) / 2).toBeCloseTo((initial.visibleStartMs + initial.visibleEndMs) / 2, 3)
  expect((zoomed.visibleStartMs + zoomed.visibleEndMs) / 2).toBeCloseTo((initial.visibleStartMs + initial.visibleEndMs) / 2, 3)
  expect((zoned.visibleStartMs + zoned.visibleEndMs) / 2).toBeCloseTo((initial.visibleStartMs + initial.visibleEndMs) / 2, 3)
  expect(zoned.generation).toBe(initial.generation + 3)
  expect((centerViewport(zoned, instant('2025-05-01T00:00:00Z'))!.visibleStartMs + centerViewport(zoned, instant('2025-05-01T00:00:00Z'))!.visibleEndMs) / 2).toBeCloseTo(instant('2025-05-01T00:00:00Z'), 2)
  const next = stepViewport(initial, 1)!
  expect(next.generation).toBe(initial.generation + 1)
  expect((next.visibleStartMs + next.visibleEndMs) / 2).toBeCloseTo(addCalendar(instant('2024-03-10T12:00:00Z'), { unit: 'day', amount: 1 }, 'America/New_York'), 2)
})

test('scroll derives the visible instant window and edge rebases preserve every screen coordinate', () => {
  const start = createViewport({ width: 900, centerMs: instant('2024-01-01T00:00:00Z'), scale: 'month', displayTimeZone: 'UTC' })!
  const scrolled = updateViewport(start, { scrollLeft: 0 })!
  expect(scrolled.generation).toBe(start.generation + 1)
  const before = viewportTransform(deriveViewport({ ...start, scrollLeft: 12 }))
  const afterState = rebaseViewport({ ...start, scrollLeft: 12 })
  const after = viewportTransform(afterState)
  for (const x of [-120, 0, 450, 1020]) {
    const time = xToTime(x, before)
    expect(timeToScreenX(time, before)).toBeCloseTo(timeToScreenX(time, after), 6)
  }
  expect(canvasWidth(900)).toBe(16_384)
  expect(canvasWidth(20_000)).toBe(262_144)
})

test('navigation and native scroll center stay inside years 0000–9999', () => {
  const lower = createViewport({ width: 800, centerMs: instant('0000-01-01T00:00:00Z'), scale: 'year', displayTimeZone: 'UTC' })!
  const upper = createViewport({ width: 800, centerMs: instant('9999-12-31T23:59:59.999Z'), scale: 'year', displayTimeZone: 'UTC' })!
  const center = (state: NonNullable<typeof lower>) => (state.visibleStartMs + state.visibleEndMs) / 2
  expect(center(stepViewport(lower, -1)!)).toBeGreaterThanOrEqual(TIMELINE_MIN_INSTANT)
  expect(center(stepViewport(upper, 1)!)).toBeLessThan(TIMELINE_MAX_INSTANT)
  expect(center(updateViewport(lower, { scrollLeft: -1_000_000_000 })!)).toBe(TIMELINE_MIN_INSTANT)
  expect(center(updateViewport(upper, { scrollLeft: 1_000_000_000 })!)).toBe(TIMELINE_MAX_INSTANT - 1)
  const outside = rebaseViewport({ ...lower, scrollLeft: 1_000_000_000 })
  expect(center(outside)).toBeLessThan(TIMELINE_MAX_INSTANT)
  for (const [start, end] of [[TIMELINE_MIN_INSTANT - 100_000, TIMELINE_MIN_INSTANT + 100_000], [TIMELINE_MAX_INSTANT - 100_000, TIMELINE_MAX_INSTANT + 100_000]]) {
    const boundedTicks = generateTimelineTicks({
      transform: viewportTransform(lower), overscanStartMs: start!, overscanEndMs: end!, locale: 'en-US', weekStart: 1,
    })
    for (const tick of [...boundedTicks.major, ...boundedTicks.minor]) {
      expect(tick.boundaryMs).toBeGreaterThanOrEqual(TIMELINE_MIN_INSTANT)
      expect(tick.boundaryMs).toBeLessThan(TIMELINE_MAX_INSTANT)
    }
  }
})

test('visible bounds include UTC instants and local date-only endpoints for each display zone', () => {
  const shanghai = calendarBoundary('0000-01-01', 'Asia/Shanghai').instantMs
  const shanghaiBounds = timelineInstantBounds('Asia/Shanghai')
  expect(shanghai).toBeLessThan(TIMELINE_MIN_INSTANT)
  expect(shanghaiBounds.minMs).toBe(shanghai)
  const shViewport = createViewport({ width: 800, centerMs: shanghai, scale: 'year', displayTimeZone: 'Asia/Shanghai' })!
  expect((shViewport.visibleStartMs + shViewport.visibleEndMs) / 2).toBeCloseTo(shanghai, 2)
  const shTicks = generateTimelineTicks({ transform: viewportTransform(shViewport), overscanStartMs: shanghai, overscanEndMs: shanghai + 10 * 86_400_000, locale: 'zh-CN', weekStart: 1 })
  expect(shTicks.major.some(tick => tick.boundaryMs === shanghai && zonedFields(tick.boundaryMs, 'Asia/Shanghai').year === 0)).toBe(true)

  const newYorkBounds = timelineInstantBounds('America/New_York')
  expect(newYorkBounds.maxMsExclusive).toBeGreaterThan(TIMELINE_MAX_INSTANT)
  const localLastDayInstant = newYorkBounds.maxMsExclusive - 1
  const nyViewport = createViewport({ width: 800, centerMs: localLastDayInstant, scale: 'year', displayTimeZone: 'America/New_York' })!
  expect((nyViewport.visibleStartMs + nyViewport.visibleEndMs) / 2).toBeCloseTo(localLastDayInstant, 2)
  expect(zonedFields(localLastDayInstant, 'America/New_York').year).toBe(9999)

  for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
    const lower = createViewport({ width: 800, centerMs: TIMELINE_MIN_INSTANT, scale: 'year', displayTimeZone: zone })!
    const upper = createViewport({ width: 800, centerMs: TIMELINE_MAX_INSTANT - 1, scale: 'year', displayTimeZone: zone })!
    expect((lower.visibleStartMs + lower.visibleEndMs) / 2).toBeCloseTo(TIMELINE_MIN_INSTANT, 2)
    expect((upper.visibleStartMs + upper.visibleEndMs) / 2).toBeCloseTo(TIMELINE_MAX_INSTANT - 1, 2)
  }
})
