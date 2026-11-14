import { expect, test } from '@playwright/test'
import { TIMELINE_MAX_INSTANT, TIMELINE_MIN_INSTANT } from '../src/components/editor/timeline/coordinates'
import { scheduleDropToDateValue } from '../src/components/editor/timeline/scheduleDrop'
import { pxPerMs } from '../src/components/editor/timeline/scale'
import type { TimelineScaleId, Transform } from '../src/components/editor/timeline/types'

const at = (value: string) => Date.parse(value)

function dropTransform(scale: TimelineScaleId, origin: string, zone = 'UTC', scrollLeft = 0): Transform {
  return {
    originMs: at(origin), pxPerMs: pxPerMs(scale), scrollLeft, width: 400,
    scale, generation: 1, displayTimeZone: zone,
  }
}

function dropAt(transform: Transform, time: string, viewportLeft = 120, viewportWidth = 400) {
  const clientX = viewportLeft + (at(time) - transform.originMs) * transform.pxPerMs - transform.scrollLeft
  return scheduleDropToDateValue({
    clientX, viewportLeft, viewportWidth, transform, displayTimeZone: transform.displayTimeZone,
  })
}

test('client offset and native scroll map to the correct logical instant', () => {
  const transform = dropTransform('hour', '2024-01-01T00:00:00Z', 'UTC', 60)
  const value = dropAt(transform, '2024-01-01T03:22:00Z')
  expect(value).toEqual({ start: '2024-01-01T03:15:00.000Z', timeZone: 'UTC' })
})

test('fractional client coordinates and scroll offsets resolve to a millisecond snap', () => {
  const transform = dropTransform('hour', '2024-01-01T00:00:00.125Z', 'UTC', 0.251)
  transform.pxPerMs = 1 / 60_000
  const value = scheduleDropToDateValue({
    clientX: 100.248, viewportLeft: 100, viewportWidth: 200, transform, displayTimeZone: 'UTC',
  })
  expect(value).toEqual({ start: '2024-01-01T00:00:00.000Z', timeZone: 'UTC' })
})

test('rejects drops outside the half-open viewport', () => {
  const transform = dropTransform('hour', '2024-01-01T00:00:00Z')
  const args = { viewportLeft: 100, viewportWidth: 200, transform, displayTimeZone: 'UTC' }
  expect(scheduleDropToDateValue({ ...args, clientX: 99 })).toBeNull()
  expect(scheduleDropToDateValue({ ...args, clientX: 300 })).toBeNull()
})

test('coarse scales return the display-zone date across a UTC day boundary', () => {
  const transform = dropTransform('week', '2024-04-14T15:00:00Z', 'Asia/Shanghai')
  expect(dropAt(transform, '2024-04-14T16:30:00Z')).toBe('2024-04-15')
})

test('hour and day snapping retain valid wall times through New York DST changes', () => {
  const spring = dropTransform('day', '2024-03-10T06:00:00Z', 'America/New_York')
  expect(dropAt(spring, '2024-03-10T07:45:00Z')).toEqual({ start: '2024-03-10T07:00:00.000Z', timeZone: 'America/New_York' })

  const firstFold = dropTransform('day', '2024-11-03T04:00:00Z', 'America/New_York')
  const secondFold = { ...firstFold, originMs: at('2024-11-03T05:00:00Z') }
  expect(dropAt(firstFold, '2024-11-03T05:45:00Z')).toEqual({ start: '2024-11-03T05:00:00.000Z', timeZone: 'America/New_York' })
  expect(dropAt(secondFold, '2024-11-03T06:45:00Z')).toEqual({ start: '2024-11-03T06:00:00.000Z', timeZone: 'America/New_York' })
})

test('rejects invalid parameters, mismatched zones, and instants outside the date domain', () => {
  const valid = dropTransform('hour', '2024-01-01T00:00:00Z')
  expect(scheduleDropToDateValue({ clientX: Number.NaN, viewportLeft: 0, viewportWidth: 100, transform: valid, displayTimeZone: 'UTC' })).toBeNull()
  expect(scheduleDropToDateValue({ clientX: 10, viewportLeft: 0, viewportWidth: 100, transform: { ...valid, pxPerMs: 0 }, displayTimeZone: 'UTC' })).toBeNull()
  expect(scheduleDropToDateValue({ clientX: 10, viewportLeft: 0, viewportWidth: 100, transform: null as unknown as Transform, displayTimeZone: 'UTC' })).toBeNull()
  expect(scheduleDropToDateValue({ clientX: 10, viewportLeft: 0, viewportWidth: 100, transform: valid, displayTimeZone: 'Not/AZone' })).toBeNull()
  expect(scheduleDropToDateValue({ clientX: 10, viewportLeft: 0, viewportWidth: 100, transform: valid, displayTimeZone: 'Asia/Shanghai' })).toBeNull()

  const lower = dropTransform('hour', new Date(TIMELINE_MIN_INSTANT - 3_600_000).toISOString())
  const atMinimum = dropTransform('hour', new Date(TIMELINE_MIN_INSTANT).toISOString())
  const upper = dropTransform('hour', new Date(TIMELINE_MAX_INSTANT).toISOString())
  expect(dropAt(atMinimum, new Date(TIMELINE_MIN_INSTANT).toISOString())).toEqual({ start: new Date(TIMELINE_MIN_INSTANT).toISOString(), timeZone: 'UTC' })
  expect(dropAt(lower, new Date(TIMELINE_MIN_INSTANT - 3_600_000).toISOString())).toBeNull()
  expect(dropAt(upper, new Date(TIMELINE_MAX_INSTANT).toISOString())).toBeNull()
})
