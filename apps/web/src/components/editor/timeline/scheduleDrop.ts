import { isValidCanonicalUtcInstant, isValidDateOnly, isValidIanaTimeZone } from '@eotion/domain/date'
import { floorCalendar, timelineInstantBounds, TIMELINE_MAX_INSTANT, TIMELINE_MIN_INSTANT, xToTime, zonedFields } from './coordinates'
import type { TimelineScaleId, Transform } from './types'

export type ScheduleDropInput = {
  clientX: number
  viewportLeft: number
  viewportWidth: number
  transform: Transform
  displayTimeZone: string
}

export type ScheduledDateTimeValue = { start: string; timeZone: string }
export type ScheduleDropValue = string | ScheduledDateTimeValue

const SCALES: readonly TimelineScaleId[] = ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year']

function isValidTransform(transform: Transform): boolean {
  return Boolean(transform && typeof transform === 'object')
    && Number.isFinite(transform.originMs)
    && Number.isFinite(transform.pxPerMs) && transform.pxPerMs > 0
    && Number.isFinite(transform.scrollLeft)
    && Number.isFinite(transform.width) && transform.width >= 0
    && Number.isFinite(transform.generation)
    && SCALES.includes(transform.scale)
}

/** Convert a drop's client coordinate into a snapped Date value in the display zone. */
export function scheduleDropToDateValue(input: ScheduleDropInput): ScheduleDropValue | null {
  const { clientX, viewportLeft, viewportWidth, transform, displayTimeZone } = input
  const viewportRight = viewportLeft + viewportWidth
  if (!Number.isFinite(clientX) || !Number.isFinite(viewportLeft)
    || !Number.isFinite(viewportWidth) || viewportWidth <= 0
    || !Number.isFinite(viewportRight) || clientX < viewportLeft || clientX >= viewportRight
    || !isValidTransform(transform)
    || !isValidIanaTimeZone(displayTimeZone)
    || transform.displayTimeZone !== displayTimeZone) return null

  try {
    const contentX = transform.scrollLeft + clientX - viewportLeft
    const instant = xToTime(contentX, transform)
    if (!Number.isFinite(instant) || !Number.isSafeInteger(Math.round(instant))) return null
    const instantMs = Math.round(instant)

    if (transform.scale === 'hour' || transform.scale === 'day') {
      if (instantMs < TIMELINE_MIN_INSTANT || instantMs >= TIMELINE_MAX_INSTANT) return null
      // Minute-based flooring is elapsed-time aware and keeps both instants in a DST fold.
      const step = transform.scale === 'hour' ? 15 : 60
      const snapped = floorCalendar(instantMs, { unit: 'minute', amount: step }, displayTimeZone, 1)
      const bounds = timelineInstantBounds(displayTimeZone)
      if (!Number.isSafeInteger(snapped) || snapped < bounds.minMs || snapped >= bounds.maxMsExclusive) return null
      const start = new Date(snapped).toISOString()
      if (!isValidCanonicalUtcInstant(start)) return null
      return { start, timeZone: displayTimeZone }
    }

    const fields = zonedFields(instantMs, displayTimeZone)
    const date = `${String(fields.year).padStart(4, '0')}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    return isValidDateOnly(date) ? date : null
  } catch {
    return null
  }
}
