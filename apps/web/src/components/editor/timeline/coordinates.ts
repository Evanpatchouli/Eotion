import type { Transform, UnitStep } from './types'
import { isValidDateOnly } from '@eotion/domain/date'

const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000
const MAX_CACHE = 1024
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const segmentCache = new Map<string, OffsetSegment[]>()
const candidateCache = new Map<string, WallResolution>()

export type ZonedFields = { year: number; month: number; day: number; hour: number; minute: number; second: number }
export type WallTime = ZonedFields
export type WallResolution = { candidates: number[]; nextValidMs: number | null }
type OffsetSegment = { start: number; end: number; offset: number }

function remember<K, V>(map: Map<K, V>, key: K, value: V, limit = MAX_CACHE): V {
  map.delete(key)
  map.set(key, value)
  if (map.size > limit) map.delete(map.keys().next().value as K)
  return value
}

function formatter(zone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(zone)
  if (cached) return remember(formatterCache, zone, cached)
  const created = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', era: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  return remember(formatterCache, zone, created)
}

function utcMs(fields: Pick<ZonedFields, 'year' | 'month' | 'day'> & Partial<ZonedFields>): number {
  const date = new Date(0)
  date.setUTCHours(fields.hour ?? 0, fields.minute ?? 0, fields.second ?? 0, 0)
  date.setUTCFullYear(fields.year, fields.month - 1, fields.day)
  return date.getTime()
}

function partsAt(ms: number, zone: string): ZonedFields {
  const parts = formatter(zone).formatToParts(new Date(ms))
  const values: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value
  const year = Number(values.year)
  return {
    year: values.era?.toLowerCase().startsWith('b') ? 1 - year : year,
    month: Number(values.month), day: Number(values.day), hour: Number(values.hour) % 24,
    minute: Number(values.minute), second: Number(values.second),
  }
}

export function zonedFields(ms: number, zone: string): ZonedFields {
  if (!Number.isFinite(ms)) throw new RangeError('Instant must be finite')
  return partsAt(ms, zone)
}

function offsetAt(ms: number, zone: string): number {
  const secondAligned = Math.floor(ms / 1000) * 1000
  return utcMs(partsAt(secondAligned, zone)) - secondAligned
}

function offsetSegments(wallMs: number, zone: string): OffsetSegment[] {
  const dayStart = Math.floor(wallMs / DAY) * DAY
  const cacheKey = `${zone}\u0000${dayStart}`
  const cached = segmentCache.get(cacheKey)
  if (cached) return remember(segmentCache, cacheKey, cached)
  const start = dayStart - 2 * DAY
  const end = dayStart + 3 * DAY
  const step = 15 * MINUTE
  const segments: OffsetSegment[] = []
  let segmentStart = start
  let previousAt = start
  let previousOffset = offsetAt(start, zone)
  for (let sample = start + step; sample <= end; sample += step) {
    const sampleAt = Math.min(sample, end)
    const sampleOffset = offsetAt(sampleAt, zone)
    if (sampleOffset !== previousOffset) {
      let low = previousAt
      let high = sampleAt
      while (high - low > 1) {
        const mid = low + Math.floor((high - low) / 2)
        if (offsetAt(mid, zone) === previousOffset) low = mid
        else high = mid
      }
      const transition = high
      segments.push({ start: segmentStart, end: transition, offset: previousOffset })
      segmentStart = transition
      previousOffset = offsetAt(transition, zone)
    }
    previousAt = sampleAt
    if (sampleAt === end) break
  }
  segments.push({ start: segmentStart, end, offset: previousOffset })
  return remember(segmentCache, cacheKey, segments)
}

function sameWall(a: ZonedFields, b: ZonedFields): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute && a.second === b.second
}

export function resolveWallTimeCandidates(wall: WallTime, zone: string): WallResolution {
  const target = utcMs(wall)
  const cacheKey = `${zone}\u0000${target}`
  const cached = candidateCache.get(cacheKey)
  if (cached) return remember(candidateCache, cacheKey, cached)
  const segments = offsetSegments(target, zone)
  const candidates = new Set<number>()
  for (const segment of segments) {
    const instant = target - segment.offset
    if (instant >= segment.start && instant < segment.end && sameWall(partsAt(instant, zone), wall)) candidates.add(instant)
  }
  let nextValidMs: number | null = null
  if (!candidates.size) {
    for (let i = 1; i < segments.length; i++) {
      const before = segments[i - 1]!
      const after = segments[i]!
      const oldOffset = before.offset
      const newOffset = after.offset
      const at = after.start
      if (newOffset > oldOffset && target >= at + oldOffset && target < at + newOffset) {
        nextValidMs = at
        break
      }
    }
  }
  return remember(candidateCache, cacheKey, { candidates: [...candidates].sort((a, b) => a - b), nextValidMs })
}

export function timeToX(ms: number, transform: Transform): number {
  return (ms - transform.originMs) * transform.pxPerMs
}

export function xToTime(contentX: number, transform: Transform): number {
  return transform.originMs + contentX / transform.pxPerMs
}

export function timeToScreenX(ms: number, transform: Transform): number {
  return timeToX(ms, transform) - transform.scrollLeft
}

export function screenXToTime(screenX: number, transform: Transform): number {
  return xToTime(screenX + transform.scrollLeft, transform)
}

function parseDate(date: string): { year: number; month: number; day: number } {
  if (!isValidDateOnly(date)) throw new RangeError('Expected a valid domain date-only value')
  const [year, month, day] = date.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

function dateBoundary(fields: { year: number; month: number; day: number }, zone: string): { instantMs: number; calendarDaySkipped: boolean } {
  const wall = { ...fields, hour: 0, minute: 0, second: 0 }
  const resolution = resolveWallTimeCandidates(wall, zone)
  if (resolution.candidates.length) return { instantMs: resolution.candidates[0]!, calendarDaySkipped: false }
  if (resolution.nextValidMs !== null) {
    const first = zonedFields(resolution.nextValidMs, zone)
    if (first.year === fields.year && first.month === fields.month && first.day === fields.day) return { instantMs: resolution.nextValidMs, calendarDaySkipped: false }
  }
  const targetDay = utcMs(fields)
  for (let days = 1; days <= 3; days++) {
    const next = new Date(targetDay + days * DAY)
    const nextFields = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
    const nextResolution = resolveWallTimeCandidates({ ...nextFields, hour: 0, minute: 0, second: 0 }, zone)
    const instant = nextResolution.candidates[0] ?? nextResolution.nextValidMs
    if (instant !== null) return { instantMs: instant, calendarDaySkipped: true }
  }
  throw new RangeError('Unable to resolve calendar boundary within bound')
}

export function calendarBoundary(date: string, zone: string): { instantMs: number; calendarDaySkipped: boolean } {
  return dateBoundary(parseDate(date), zone)
}

function addDays(fields: ZonedFields, amount: number): ZonedFields {
  const date = new Date(utcMs({ ...fields, hour: 0, minute: 0, second: 0 }) + amount * DAY)
  return { ...fields, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function resolveFields(fields: ZonedFields, zone: string): number {
  const resolution = resolveWallTimeCandidates(fields, zone)
  return resolution.candidates[0] ?? resolution.nextValidMs ?? (() => { throw new RangeError('Wall time could not be resolved within bound') })()
}

export function addCalendar(ms: number, step: UnitStep, zone: string): number {
  if (!Number.isInteger(step.amount)) throw new RangeError('Calendar amount must be an integer')
  if (step.unit === 'minute') return ms + step.amount * MINUTE
  if (step.unit === 'hour') return ms + step.amount * HOUR
  const fields = zonedFields(ms, zone)
  if (step.unit === 'day' || step.unit === 'week') return resolveFields(addDays(fields, step.amount * (step.unit === 'week' ? 7 : 1)), zone)
  const months = step.amount * (step.unit === 'quarter' ? 3 : step.unit === 'year' ? 12 : 1)
  const index = fields.year * 12 + fields.month - 1 + months
  const year = Math.floor(index / 12)
  const month = ((index % 12) + 12) % 12 + 1
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const monthEnd = new Date(utcMs({ year: nextYear, month: nextMonth, day: 1 }) - DAY).getUTCDate()
  return resolveFields({ ...fields, year, month, day: Math.min(fields.day, monthEnd) }, zone)
}

export function floorCalendar(ms: number, step: UnitStep, zone: string, weekStart: number): number {
  const fields = zonedFields(ms, zone)
  if (step.unit === 'minute') return ms - (fields.second * 1000 + new Date(ms).getUTCMilliseconds()) - (fields.minute % step.amount) * MINUTE
  if (step.unit === 'hour') {
    const hour = Math.floor(fields.hour / step.amount) * step.amount
    return resolveFields({ ...fields, hour, minute: 0, second: 0 }, zone)
  }
  if (step.unit === 'day') return dateBoundary(fields, zone).instantMs
  if (step.unit === 'week') {
    const date = utcMs({ ...fields, hour: 0, minute: 0, second: 0 })
    const weekday = new Date(date).getUTCDay()
    const startDate = addDays({ ...fields, hour: 0, minute: 0, second: 0 }, -((weekday - weekStart + 7) % 7))
    let result = dateBoundary(startDate, zone).instantMs
    if (step.amount === 2) {
      const yearOne = utcMs({ year: 1, month: 1, day: 1 })
      const weekdayOne = new Date(yearOne).getUTCDay()
      const anchor = yearOne - ((weekdayOne - weekStart + 7) % 7) * DAY
      const anchorWeek = Math.floor((utcMs(startDate) - anchor) / (7 * DAY))
      if (anchorWeek % 2 !== 0) result = addCalendar(result, { unit: 'week', amount: -1 }, zone)
    }
    return result
  }
  if (step.unit === 'month') return dateBoundary({ year: fields.year, month: fields.month, day: 1 }, zone).instantMs
  if (step.unit === 'quarter') return dateBoundary({ year: fields.year, month: Math.floor((fields.month - 1) / 3) * 3 + 1, day: 1 }, zone).instantMs
  return dateBoundary({ year: fields.year, month: 1, day: 1 }, zone).instantMs
}

export const TIMELINE_MIN_INSTANT = utcMs({ year: 0, month: 1, day: 1 })
export const TIMELINE_MAX_INSTANT = utcMs({ year: 10000, month: 1, day: 1 })

const boundsCache = new Map<string, { minMs: number; maxMsExclusive: number }>()

export function timelineInstantBounds(zone: string): { minMs: number; maxMsExclusive: number } {
  const cached = boundsCache.get(zone)
  if (cached) return remember(boundsCache, zone, cached)
  const bounds = {
    minMs: Math.min(TIMELINE_MIN_INSTANT, dateBoundary({ year: 0, month: 1, day: 1 }, zone).instantMs),
    maxMsExclusive: Math.max(TIMELINE_MAX_INSTANT, dateBoundary({ year: 10000, month: 1, day: 1 }, zone).instantMs),
  }
  return remember(boundsCache, zone, bounds)
}
