import { normalizeDatabaseDateValue } from '@eotion/domain/date'
import type { DatabaseDateValue } from '@eotion/domain/date'
import type { TimelineDateSource } from '@eotion/domain/database'
import { calendarBoundary, nextCalendarBoundary, timeToX, xToTime, zonedFields } from './coordinates'
import { dateOnlyBoundary, inclusiveDateBeforeBoundary, snapTimelineEndpoint } from './snap'
import type { Transform } from './types'

const DAY_MS = 86_400_000
const MIN_DATETIME_MS = Date.parse('0000-01-01T00:00:00.000Z')
const MAX_DATETIME_MS = Date.parse('9999-12-31T23:59:59.999Z')

function canonicalInstant(ms: number): string | null {
  if (!Number.isSafeInteger(ms) || ms < MIN_DATETIME_MS || ms > MAX_DATETIME_MS) return null
  try { return new Date(ms).toISOString() }
  catch { return null }
}

export type TimelineTemporalOffset =
  | { kind: 'date-only'; days: number }
  | { kind: 'datetime'; milliseconds: number }

export interface TimelineMoveCommand {
  scope: string
  recordId: string
  propertyId: string
  expectedDatabaseVersion: number
  expectedRecordVersion: number
  /** Captured on pointerdown; required for an atomic cascade batch. */
  expectedViewVersion?: number
  /** Fingerprint of the full dateSource object captured on pointerdown. */
  dateSourceIdentity?: string
  /** Fingerprint of the complete Timeline dependency options captured on pointerdown. */
  dependencyConfigIdentity?: string
  originalValue: DatabaseDateValue
  value: DatabaseDateValue
}

export function timelineDateSourceIdentity(source: unknown): string | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  try { return JSON.stringify(source) } catch { return null }
}

export function isWritableTimelineDateSource(
  source: TimelineDateSource | undefined,
): source is Extract<TimelineDateSource, { mode: 'date-property' }> {
  return source?.mode === 'date-property'
}

function utcOrdinal(date: string): number | null {
  const normalized = normalizeDatabaseDateValue(date)
  if (!normalized || normalized.kind !== 'date-only') return null
  const [year, month, day] = date.split('-').map(Number)
  const instant = new Date(0)
  instant.setUTCHours(0, 0, 0, 0)
  instant.setUTCFullYear(year!, month! - 1, day!)
  return instant.getTime() / DAY_MS
}

function dateFromOrdinal(ordinal: number): string | null {
  if (!Number.isInteger(ordinal)) return null
  const date = new Date(ordinal * DAY_MS)
  if (!Number.isFinite(date.getTime())) return null
  const year = date.getUTCFullYear()
  if (year < 0 || year > 9999) return null
  const value = `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  return normalizeDatabaseDateValue(value)?.kind === 'date-only' ? value : null
}

function dateAt(ms: number, displayTimeZone: string): string | null {
  try {
    const fields = zonedFields(ms, displayTimeZone)
    const value = `${String(fields.year).padStart(4, '0')}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    return normalizeDatabaseDateValue(value)?.kind === 'date-only' ? value : null
  } catch {
    return null
  }
}

/** Convert a horizontal drag into a temporal offset without duplicating the scale math. */
export function temporalOffsetFromX(
  value: DatabaseDateValue,
  deltaX: number,
  transform: Transform,
  displayTimeZone: string,
): TimelineTemporalOffset | null {
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized || !Number.isFinite(deltaX) || !Number.isFinite(transform.pxPerMs) || transform.pxPerMs <= 0) return null
  let startMs: number
  if (normalized.kind === 'date-only') {
    try {
      const boundary = calendarBoundary(normalized.start, displayTimeZone)
      if (boundary.calendarDaySkipped) return null
      startMs = boundary.instantMs
    } catch {
      return null
    }
  } else {
    startMs = Date.parse(normalized.start)
  }
  const targetMs = Math.round(xToTime(timeToX(startMs, transform) + deltaX, transform))
  if (!Number.isFinite(startMs) || !Number.isSafeInteger(targetMs)) return null

  if (normalized.kind === 'datetime') {
    const milliseconds = targetMs - startMs
    return Number.isSafeInteger(milliseconds) ? { kind: 'datetime', milliseconds } : null
  }

  const targetDate = dateAt(targetMs, displayTimeZone)
  if (!targetDate) return null
  try {
    const targetBoundary = calendarBoundary(targetDate, displayTimeZone)
    const followingBoundary = nextCalendarBoundary(targetDate, displayTimeZone)
    const chosenBoundary = targetMs - targetBoundary.instantMs < followingBoundary.instantMs - targetMs
      ? targetBoundary
      : followingBoundary
    const snappedDate = dateAt(chosenBoundary.instantMs, displayTimeZone)
    if (!snappedDate) return null
    const originalOrdinal = utcOrdinal(normalized.start)
    const snappedOrdinal = utcOrdinal(snappedDate)
    if (originalOrdinal === null || snappedOrdinal === null) return null
    if (calendarBoundary(snappedDate, displayTimeZone).calendarDaySkipped) return null
    return { kind: 'date-only', days: snappedOrdinal - originalOrdinal }
  } catch {
    return null
  }
}

/** Apply an offset to each stored endpoint while preserving the original wire shape. */
export function offsetTimelineDateValue(
  value: DatabaseDateValue,
  offset: TimelineTemporalOffset,
): DatabaseDateValue | null {
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized || normalized.kind !== offset.kind) return null
  if (normalized.kind === 'date-only' && offset.kind === 'date-only' && !Number.isInteger(offset.days)) return null
  if (normalized.kind === 'datetime' && offset.kind === 'datetime' && !Number.isSafeInteger(offset.milliseconds)) return null

  const shift = (point: string): string | null => {
    if (normalized.kind === 'date-only' && offset.kind === 'date-only') {
      const ordinal = utcOrdinal(point)
      return ordinal === null ? null : dateFromOrdinal(ordinal + offset.days)
    }
    if (normalized.kind !== 'datetime' || offset.kind !== 'datetime') return null
    const instant = Date.parse(point)
    const shifted = instant + offset.milliseconds
    if (!Number.isSafeInteger(shifted) || shifted < Date.parse('0000-01-01T00:00:00.000Z') || shifted >= Date.parse('10000-01-01T00:00:00.000Z')) return null
    return new Date(shifted).toISOString()
  }

  const start = shift(normalized.start)
  if (!start) return null
  let result: DatabaseDateValue
  if (typeof value === 'string') {
    result = start
  } else {
    const hasEnd = Object.hasOwn(value, 'end')
    let end: string | undefined
    if (hasEnd) {
      const shiftedEnd = shift(normalized.end!)
      if (!shiftedEnd) return null
      end = shiftedEnd
    }
    result = { ...value, start, ...(hasEnd ? { end } : {}) }
  }
  return normalizeDatabaseDateValue(result) ? result : null
}

function dateAtBoundary(ms: number, displayTimeZone: string): string | null {
  try {
    const fields = zonedFields(ms, displayTimeZone)
    const date = `${String(fields.year).padStart(4, '0')}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    return normalizeDatabaseDateValue(date)?.kind === 'date-only' ? date : null
  } catch { return null }
}

/** Resize one endpoint while preserving the existing generic Date wire shape. */
export function resizeTimelineDateValueFromX(
  value: DatabaseDateValue,
  endpoint: 'start' | 'end',
  deltaX: number,
  transform: Transform,
  displayTimeZone: string,
): DatabaseDateValue | null {
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized || !Number.isFinite(deltaX)) return null
  if (!normalized.end && endpoint === 'start') return null
  if (deltaX === 0) return value
  if (!Number.isFinite(transform.originMs) || !Number.isFinite(transform.pxPerMs) || transform.pxPerMs <= 0) return null

  const dateOnly = normalized.kind === 'date-only'
  const isPoint = normalized.end === undefined
  const endpointValue = endpoint === 'start' ? normalized.start : normalized.end ?? normalized.start
  const originMs = dateOnly
    ? dateOnlyBoundary(endpointValue, displayTimeZone, endpoint === 'end' && !isPoint)
    : Date.parse(endpointValue)
  if (originMs === null || !Number.isSafeInteger(originMs)) return null
  let targetMs: number
  try { targetMs = xToTime(timeToX(originMs, transform) + deltaX, transform) }
  catch { return null }
  if (!Number.isFinite(targetMs) || !Number.isSafeInteger(Math.round(targetMs))) return null
  const snapped = snapTimelineEndpoint(originMs, Math.round(targetMs), transform.scale, displayTimeZone, dateOnly)
  if (snapped === null) return null

  if (dateOnly) {
    let nextValue: string | null
    if (endpoint === 'end') nextValue = inclusiveDateBeforeBoundary(snapped, displayTimeZone)
    else nextValue = dateAtBoundary(snapped, displayTimeZone)
    if (!nextValue) return null
    if (isPoint) {
      if (endpoint !== 'end' || snapped <= originMs || nextValue < normalized.start) return null
      const result = typeof value === 'string' ? { start: value, end: nextValue } : { ...value, end: nextValue }
      return normalizeDatabaseDateValue(result) ? result : null
    }
    const start = endpoint === 'start' ? nextValue : normalized.start
    const end = endpoint === 'end' ? nextValue : normalized.end!
    const clamped = endpoint === 'start' && start > end ? end : endpoint === 'end' && end < start ? start : nextValue
    const result = typeof value === 'string'
      ? clamped
      : { ...value, [endpoint]: clamped }
    return normalizeDatabaseDateValue(result) ? result : null
  }

  if (isPoint) {
    if (endpoint !== 'end' || snapped <= originMs || snapped <= Date.parse(normalized.start)) return null
    const snappedValue = canonicalInstant(snapped)
    if (!snappedValue) return null
    const result = typeof value === 'string' ? { start: value, end: snappedValue } : { ...value, end: snappedValue }
    return normalizeDatabaseDateValue(result) ? result : null
  }
  const startMs = endpoint === 'start' ? snapped : Date.parse(normalized.start)
  const endMs = endpoint === 'end' ? snapped : Date.parse(normalized.end!)
  const clamped = endpoint === 'start' && startMs > endMs ? endMs : endpoint === 'end' && endMs < startMs ? startMs : snapped
  const clampedValue = canonicalInstant(clamped)
  if (!clampedValue) return null
  const result = typeof value === 'string' ? clampedValue : { ...value, [endpoint]: clampedValue }
  return normalizeDatabaseDateValue(result) ? result : null
}
