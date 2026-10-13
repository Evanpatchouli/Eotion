import { getTimelineScale } from './scale'
import { addCalendar, calendarBoundary, nextCalendarBoundary, zonedFields } from './coordinates'
import type { TimelineScaleId, UnitStep } from './types'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function ordinal(date: string): number | null {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(0)
  value.setUTCHours(0, 0, 0, 0)
  value.setUTCFullYear(year!, month! - 1, day!)
  const result = value.getTime() / DAY_MS
  return Number.isFinite(result) ? result : null
}

function dateFromOrdinal(value: number): string | null {
  if (!Number.isInteger(value)) return null
  const date = new Date(value * DAY_MS)
  const year = date.getUTCFullYear()
  if (!Number.isFinite(date.getTime()) || year < 0 || year > 9999) return null
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function indexEstimate(originMs: number, targetMs: number, step: UnitStep, zone: string): number {
  const origin = zonedFields(originMs, zone)
  const target = zonedFields(targetMs, zone)
  if (step.unit === 'day' || step.unit === 'week') {
    const originDay = ordinal(`${String(origin.year).padStart(4, '0')}-${String(origin.month).padStart(2, '0')}-${String(origin.day).padStart(2, '0')}`)!
    const targetDay = ordinal(`${String(target.year).padStart(4, '0')}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`)!
    return (targetDay - originDay) / (step.amount * (step.unit === 'week' ? 7 : 1))
  }
  const monthsPerStep = step.amount * (step.unit === 'quarter' ? 3 : step.unit === 'year' ? 12 : 1)
  return ((target.year - origin.year) * 12 + target.month - origin.month) / monthsPerStep
}

function calendarCandidate(originMs: number, count: number, step: UnitStep, zone: string, dateOnly: boolean): number {
  if (count === 0) return originMs
  const candidate = addCalendar(originMs, { unit: step.unit, amount: count * step.amount }, zone)
  if (dateOnly) {
    const fields = zonedFields(candidate, zone)
    const date = `${String(fields.year).padStart(4, '0')}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    const boundary = fields.year === 10000 && fields.month === 1 && fields.day === 1
      ? nextCalendarBoundary('9999-12-31', zone)
      : calendarBoundary(date, zone)
    if (boundary.calendarDaySkipped) throw new RangeError('Calendar snap landed on a skipped date')
    return boundary.instantMs
  }
  // Calendar arithmetic deliberately works at whole-second precision. Keep the original wire millisecond.
  return candidate + new Date(originMs).getUTCMilliseconds()
}

function nearestCalendarStep(originMs: number, targetMs: number, step: UnitStep, zone: string, dateOnly: boolean): number | null {
  const estimate = indexEstimate(originMs, targetMs, step, zone)
  if (!Number.isFinite(estimate)) return null
  const low = Math.floor(estimate)
  const candidates = new Set<number>()
  for (let index = low - 2; index <= low + 3; index++) {
    try { candidates.add(calendarCandidate(originMs, index, step, zone, dateOnly)) }
    catch { /* Ignore candidates outside calendar bounds; nearby candidates may still be valid. */ }
  }
  const ordered = [...candidates].filter(Number.isSafeInteger).sort((a, b) => a - b)
  if (!ordered.length) return null
  let result = ordered[0]!
  for (const candidate of ordered.slice(1)) {
    const distance = Math.abs(candidate - targetMs)
    const bestDistance = Math.abs(result - targetMs)
    if (distance < bestDistance || (distance === bestDistance && candidate > result)) result = candidate
  }
  return result
}

function snapStep(scale: TimelineScaleId, dateOnly: boolean): UnitStep {
  const configured = getTimelineScale(scale).futureSnapUnit
  if (dateOnly && (configured.unit === 'minute' || configured.unit === 'hour')) return { unit: 'day', amount: 1 }
  return configured
}

/** Snap a target instant relative to its original endpoint, preserving milliseconds for calendar steps. */
export function snapTimelineEndpoint(
  originMs: number,
  targetMs: number,
  scale: TimelineScaleId,
  displayTimeZone: string,
  dateOnly: boolean,
): number | null {
  if (!Number.isSafeInteger(originMs) || !Number.isSafeInteger(targetMs)) return null
  try {
    const step = snapStep(scale, dateOnly)
    if (step.unit === 'minute' || step.unit === 'hour') {
      const size = step.amount * (step.unit === 'minute' ? MINUTE_MS : HOUR_MS)
      const count = Math.floor((targetMs - originMs) / size + 0.5)
      const snapped = originMs + count * size
      return Number.isSafeInteger(snapped) ? snapped : null
    }
    return nearestCalendarStep(originMs, targetMs, step, displayTimeZone, dateOnly)
  } catch { return null }
}

/** Resolve a date-only boundary to its stored inclusive calendar date. */
export function inclusiveDateBeforeBoundary(boundaryMs: number, displayTimeZone: string): string | null {
  try {
    const fields = zonedFields(boundaryMs, displayTimeZone)
    const boundaryDate = `${String(fields.year).padStart(4, '0')}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    if (fields.year > 10000 || (fields.year === 10000 && (fields.month !== 1 || fields.day !== 1))) return null
    const expectedBoundary = fields.year <= 9999
      ? calendarBoundary(boundaryDate, displayTimeZone)
      : nextCalendarBoundary('9999-12-31', displayTimeZone)
    if (expectedBoundary.calendarDaySkipped || expectedBoundary.instantMs !== boundaryMs) return null
    const day = ordinal(boundaryDate)
    if (day === null) return null
    // A skipped local calendar day has no display interval; map its exclusive boundary to the prior visible day.
    for (let offset = 1; offset <= 4; offset++) {
      const candidate = dateFromOrdinal(day - offset)
      if (!candidate) continue
      if (!calendarBoundary(candidate, displayTimeZone).calendarDaySkipped) return candidate
    }
    return null
  } catch { return null }
}

export function dateOnlyBoundary(date: string, displayTimeZone: string, exclusive: boolean): number | null {
  try {
    const source = calendarBoundary(date, displayTimeZone)
    if (source.calendarDaySkipped) return null
    if (!exclusive) return source.instantMs
    return nextCalendarBoundary(date, displayTimeZone).instantMs
  } catch { return null }
}
