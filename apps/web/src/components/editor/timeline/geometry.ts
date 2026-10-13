import { calendarBoundary, nextCalendarBoundary } from './coordinates'
import type { TimelineItemProjection, TimelineTemporalPoint } from './projection'

export type TimelineTemporalGeometry = {
  recordId: string
  startMs: number
  visualEndMs: number | null
  diagnostic?: 'calendar-day-skipped'
}

function pointInstant(point: TimelineTemporalPoint, zone: string): { instantMs: number; calendarDaySkipped: boolean } {
  if (point.kind === 'datetime') return { instantMs: point.instantMs, calendarDaySkipped: false }
  return calendarBoundary(point.date, zone)
}

export function resolveTimelineTemporalGeometry(items: readonly TimelineItemProjection[], displayTimeZone: string): Map<string, TimelineTemporalGeometry> {
  const result = new Map<string, TimelineTemporalGeometry>()
  for (const item of items) {
    if (item.kind === 'unscheduled') continue
    const start = pointInstant(item.start, displayTimeZone)
    let visualEndMs: number | null = null
    let skipped = start.calendarDaySkipped
    if (item.kind === 'range') {
      if (item.precision === 'date-only') {
        const endDate = item.end.kind === 'date-only' ? item.end.date : ''
        if (!endDate) continue
        const endPointBoundary = calendarBoundary(endDate, displayTimeZone)
        const endBoundary = nextCalendarBoundary(endDate, displayTimeZone)
        visualEndMs = endBoundary.instantMs
        skipped ||= endPointBoundary.calendarDaySkipped
      } else {
        visualEndMs = item.end.kind === 'datetime' ? item.end.instantMs : null
      }
    }
    result.set(item.recordId, {
      recordId: item.recordId,
      startMs: start.instantMs,
      visualEndMs,
      ...(skipped ? { diagnostic: 'calendar-day-skipped' as const } : {}),
    })
  }
  return result
}
