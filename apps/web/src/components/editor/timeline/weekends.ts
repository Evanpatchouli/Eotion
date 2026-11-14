import { isValidDateOnly } from '@eotion/domain/date'
import { calendarBoundary, nextCalendarBoundary, timeToX, zonedFields } from './coordinates'
import type { Transform } from './types'

const DAY_MS = 86_400_000
const MAX_VISIBLE_DAYS = 2048

/** The display-zone calendar date containing an instant, without UTC date drift. */
export function timelineLocalDate(instantMs: number, zone: string): string | null {
  if (!Number.isFinite(instantMs)) return null
  try {
    const { year, month, day } = zonedFields(instantMs, zone)
    const result = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return isValidDateOnly(result) ? result : null
  } catch { return null }
}

function dateOrdinal(value: string): number | null {
  if (!isValidDateOnly(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year!, month! - 1, day!)
  return date.getTime() / DAY_MS
}

/** Weekend bands are independent of the ruler's sampled label budget. */
export function timelineWeekendBands(firstDate: string, lastDate: string, transform: Transform): Array<{ date: string; boundaryMs: number; x: number; width: number }> {
  if (!['week', 'biweek', 'month'].includes(transform.scale) || !Number.isFinite(transform.originMs)
    || !Number.isFinite(transform.pxPerMs) || transform.pxPerMs <= 0) return []
  const first = dateOrdinal(firstDate)
  const last = dateOrdinal(lastDate)
  if (first === null || last === null || last < first) return []
  const result: Array<{ date: string; boundaryMs: number; x: number; width: number }> = []
  // A bounded visible window keeps the DOM independent of the unbounded canvas.
  const limit = Math.min(last, first + MAX_VISIBLE_DAYS - 1)
  for (let ordinal = first; ordinal <= limit; ordinal++) {
    const date = new Date(ordinal * DAY_MS)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) continue
    const value = `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    try {
      const start = calendarBoundary(value, transform.displayTimeZone)
      const end = nextCalendarBoundary(value, transform.displayTimeZone)
      if (start.calendarDaySkipped || end.instantMs <= start.instantMs) continue
      result.push({ date: value, boundaryMs: start.instantMs, x: timeToX(start.instantMs, transform), width: timeToX(end.instantMs, transform) - timeToX(start.instantMs, transform) })
    } catch { /* Invalid or out-of-range calendar boundaries cannot be drawn. */ }
  }
  return result
}
