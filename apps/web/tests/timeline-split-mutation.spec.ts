import { expect, test } from '@playwright/test'
import type { TimelineDateSource } from '@eotion/domain/database'
import { timeToX } from '../src/components/editor/timeline/coordinates'
import {
  captureSplitTimelineDateSource,
  createSplitTimelineDateValue,
  isDraggableTimelineDateSource,
  isWritableTimelineDateSource,
  offsetTimelineDateValue,
  resizeTimelineDateValueFromX,
  splitTimelineDateWrites,
  type TimelineSplitDateSource,
} from '../src/components/editor/timeline/mutation'
import { pxPerMs } from '../src/components/editor/timeline/scale'
import type { Transform } from '../src/components/editor/timeline/types'

const transform: Transform = {
  originMs: Date.parse('2024-03-01T00:00:00.000Z'), pxPerMs: pxPerMs('day'),
  scrollLeft: 0, width: 800, scale: 'day', generation: 0, displayTimeZone: 'UTC',
}

test('split source guards leave the single Date guard intact', () => {
  const single: TimelineDateSource = { mode: 'date-property', propertyId: 'date' }
  const split: TimelineDateSource = { mode: 'start-end', startPropertyId: 'start', endPropertyId: 'end' }
  expect(isWritableTimelineDateSource(split)).toBe(false)
  expect(isWritableTimelineDateSource(single)).toBe(true)
  expect(isDraggableTimelineDateSource(split)).toBe(true)
})

test('move offsets both complete cells without losing independent ranges or zones', () => {
  const source: TimelineSplitDateSource = {
    startPropertyId: 'start', endPropertyId: 'end',
    startValue: { start: '2024-03-10T06:30:00.000Z', end: '2024-03-10T07:30:00.000Z', timeZone: 'America/New_York' },
    endValue: { start: '2024-03-12T09:00:00.000Z', end: '2024-03-13T09:00:00.000Z', timeZone: 'Europe/Paris' },
  }
  const original = createSplitTimelineDateValue(source)!
  expect(original).toEqual({ start: '2024-03-10T06:30:00.000Z', end: '2024-03-12T09:00:00.000Z', timeZone: 'America/New_York' })
  const moved = offsetTimelineDateValue(original, { kind: 'datetime', milliseconds: 3_600_000 })!
  expect(splitTimelineDateWrites(source, original, moved)).toEqual([
    { propertyId: 'start', value: { start: '2024-03-10T07:30:00.000Z', end: '2024-03-10T08:30:00.000Z', timeZone: 'America/New_York' } },
    { propertyId: 'end', value: { start: '2024-03-12T10:00:00.000Z', end: '2024-03-13T10:00:00.000Z', timeZone: 'Europe/Paris' } },
  ])
  expect(splitTimelineDateWrites(source, original, { ...original, start: '2024-03-10T07:30:00.000Z' })).toEqual([
    { propertyId: 'start', value: { start: '2024-03-10T07:30:00.000Z', end: '2024-03-10T08:30:00.000Z', timeZone: 'America/New_York' } },
  ])
  expect(splitTimelineDateWrites(source, original, { ...original, end: '2024-03-12T10:00:00.000Z' })).toEqual([
    { propertyId: 'end', value: { start: '2024-03-12T10:00:00.000Z', end: '2024-03-13T10:00:00.000Z', timeZone: 'Europe/Paris' } },
  ])
  expect(splitTimelineDateWrites(source, original, original)).toEqual([])
})

test('capture snapshots both source objects without aliases', () => {
  const source: TimelineSplitDateSource = {
    startPropertyId: 'start', startValue: { start: '2024-01-10', end: '2024-01-11' },
    endPropertyId: 'end', endValue: { start: '2024-01-12', end: '2024-01-13' },
  }
  const captured = captureSplitTimelineDateSource(source)
  expect(captured).toEqual(source)
  expect(captured.startValue).not.toBe(source.startValue)
  expect(captured.endValue).not.toBe(source.endValue)
})

test('date-only offsets use calendar days across DST and preserve each cell range', () => {
  const source: TimelineSplitDateSource = {
    startPropertyId: 'start', endPropertyId: 'end',
    startValue: { start: '2024-03-09', end: '2024-03-10' },
    endValue: { start: '2024-03-11', end: '2024-03-13' },
  }
  const original = createSplitTimelineDateValue(source)!
  expect(splitTimelineDateWrites(source, original, { start: '2024-03-10', end: '2024-03-12' })).toEqual([
    { propertyId: 'start', value: { start: '2024-03-10', end: '2024-03-11' } },
    { propertyId: 'end', value: { start: '2024-03-12', end: '2024-03-14' } },
  ])
})

test('both resize handles use virtual endpoints and write only their own physical cell', () => {
  const source: TimelineSplitDateSource = {
    startPropertyId: 'start', endPropertyId: 'end',
    startValue: { start: '2024-03-10T06:30:00.000Z', end: '2024-03-10T07:30:00.000Z', timeZone: 'America/New_York' },
    endValue: { start: '2024-03-12T09:00:00.000Z', end: '2024-03-13T09:00:00.000Z', timeZone: 'Europe/Paris' },
  }
  const original = createSplitTimelineDateValue(source)!
  const resize = (endpoint: 'start' | 'end', from: string, to: string) => resizeTimelineDateValueFromX(
    original, endpoint,
    timeToX(Date.parse(to), transform) - timeToX(Date.parse(from), transform), transform, 'UTC',
  )!
  expect(splitTimelineDateWrites(source, original, resize('start', '2024-03-10T06:30:00.000Z', '2024-03-11T06:30:00.000Z'))).toEqual([
    { propertyId: 'start', value: { start: '2024-03-11T06:30:00.000Z', end: '2024-03-11T07:30:00.000Z', timeZone: 'America/New_York' } },
  ])
  expect(splitTimelineDateWrites(source, original, resize('end', '2024-03-12T09:00:00.000Z', '2024-03-13T09:00:00.000Z'))).toEqual([
    { propertyId: 'end', value: { start: '2024-03-13T09:00:00.000Z', end: '2024-03-14T09:00:00.000Z', timeZone: 'Europe/Paris' } },
  ])
})

test('empty End becomes a point matching Start precision and wire shape', () => {
  const stringStart: TimelineSplitDateSource = { startPropertyId: 'start', startValue: '2024-01-10', endPropertyId: 'end', endValue: null }
  const point = createSplitTimelineDateValue(stringStart)!
  expect(point).toEqual({ start: '2024-01-10' })
  expect(splitTimelineDateWrites(stringStart, point, { start: '2024-01-10', end: '2024-01-12' }))
    .toEqual([{ propertyId: 'end', value: '2024-01-12' }])
  const instantStart: TimelineSplitDateSource = {
    startPropertyId: 'start', startValue: { start: '2024-01-10T00:00:00.000Z', end: '2024-01-11T00:00:00.000Z', timeZone: 'UTC' },
    endPropertyId: 'end', endValue: null,
  }
  const instantPoint = createSplitTimelineDateValue(instantStart)!
  expect(splitTimelineDateWrites(instantStart, instantPoint, { start: '2024-01-10T00:00:00.000Z', end: '2024-01-12T00:00:00.000Z', timeZone: 'UTC' }))
    .toEqual([{ propertyId: 'end', value: { start: '2024-01-12T00:00:00.000Z', timeZone: 'UTC' } }])
})

test('invalid, mixed precision, reversed, and overflowing split dates fail closed', () => {
  const base: TimelineSplitDateSource = { startPropertyId: 'start', startValue: '2024-01-10', endPropertyId: 'end', endValue: '2024-01-12' }
  expect(createSplitTimelineDateValue({ ...base, endValue: 'invalid' })).toBeNull()
  expect(createSplitTimelineDateValue({ ...base, endValue: { start: '2024-01-12T00:00:00.000Z', timeZone: 'UTC' } })).toBeNull()
  expect(createSplitTimelineDateValue({ ...base, endValue: '2024-01-09' })).toBeNull()
  expect(createSplitTimelineDateValue({ ...base, endPropertyId: 'start' })).toBeNull()
  expect(splitTimelineDateWrites(base, createSplitTimelineDateValue(base)!, { start: '2024-01-10', end: '2024-01-09' })).toBeNull()
  expect(splitTimelineDateWrites(base, createSplitTimelineDateValue(base)!, { start: '2024-01-10T00:00:00.000Z', end: '2024-01-12T00:00:00.000Z', timeZone: 'UTC' })).toBeNull()
  expect(splitTimelineDateWrites(base, { start: '2024-01-11', end: '2024-01-12' }, { start: '2024-01-11', end: '2024-01-13' })).toBeNull()
  const edge: TimelineSplitDateSource = { ...base, startValue: { start: '9999-12-30', end: '9999-12-31' }, endValue: '9999-12-31' }
  const original = createSplitTimelineDateValue(edge)!
  expect(splitTimelineDateWrites(edge, original, { start: '9999-12-31', end: '9999-12-31' })).toBeNull()
})
