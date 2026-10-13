import { normalizeDatabaseDateValue } from '@eotion/domain/date'
import type { DatabaseDateValue } from '@eotion/domain/date'
import { calendarBoundary, nextCalendarBoundary, timeToX, xToTime, zonedFields } from './coordinates'
import type { Transform } from './types'

const DAY_MS = 86_400_000

export type TimelineTemporalOffset =
  | { kind: 'date-only'; days: number }
  | { kind: 'datetime'; milliseconds: number }

export interface TimelineMoveCommand {
  scope: string
  recordId: string
  propertyId: string
  expectedDatabaseVersion: number
  expectedRecordVersion: number
  originalValue: DatabaseDateValue
  value: DatabaseDateValue
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
