import { addCalendar, floorCalendar, resolveWallTimeCandidates, timeToX, zonedFields, timelineInstantBounds } from './coordinates'
import { getTimelineScale } from './scale'
import type { CalendarUnit, Tick, Transform, UnitStep } from './types'

export type TimelineTickOptions = {
  transform: Transform
  overscanStartMs: number
  overscanEndMs: number
  locale: string
  weekStart: number
  budget?: number
}

export type TimelineTicks = { major: Tick[]; minor: Tick[]; bucketKey: string }

function stepKey(step: UnitStep): string { return `${step.amount}${step.unit}` }

const QUARTER_LABELS: Record<string, (number: string) => string> = {
  zh: number => `第${number}季度`, ja: number => `${number}四半期`, ko: number => `${number}분기`,
  fr: number => `T${number}`, de: number => `Q${number}`,
}

const labelFormatterCache = new Map<string, Intl.DateTimeFormat>()
const numberFormatterCache = new Map<string, Intl.NumberFormat>()

function dateFormatter(locale: string, zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}\u0000${zone}\u0000${JSON.stringify(options)}`
  const existing = labelFormatterCache.get(key)
  if (existing) {
    labelFormatterCache.delete(key)
    labelFormatterCache.set(key, existing)
    return existing
  }
  const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone, calendar: 'gregory', numberingSystem: 'latn' })
  labelFormatterCache.set(key, formatter)
  if (labelFormatterCache.size > 1024) labelFormatterCache.delete(labelFormatterCache.keys().next().value!)
  return formatter
}

function numberFormatter(locale: string): Intl.NumberFormat {
  const existing = numberFormatterCache.get(locale)
  if (existing) {
    numberFormatterCache.delete(locale)
    numberFormatterCache.set(locale, existing)
    return existing
  }
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false })
  numberFormatterCache.set(locale, formatter)
  if (numberFormatterCache.size > 1024) numberFormatterCache.delete(numberFormatterCache.keys().next().value!)
  return formatter
}

function makeLabel(ms: number, unit: CalendarUnit, level: 'major' | 'minor', locale: string, zone: string): string {
  const fields = zonedFields(ms, zone)
  if (unit === 'quarter') {
    const language = new Intl.Locale(locale).language
    const number = numberFormatter(locale).format(Math.floor((fields.month - 1) / 3) + 1)
    const year = numberFormatter(locale).format(fields.year)
    const quarter = (QUARTER_LABELS[language] ?? (value => `Q${value}`))(number)
    return `${quarter} ${year}`
  }
  if (unit === 'year') return dateFormatter(locale, zone, { year: 'numeric' }).format(new Date(ms))
  if (unit === 'month') return dateFormatter(locale, zone, { year: level === 'major' ? 'numeric' : undefined, month: level === 'major' ? 'long' : 'short' }).format(new Date(ms))
  if (unit === 'day' || unit === 'week') return dateFormatter(locale, zone, { month: level === 'major' ? 'long' : 'short', day: 'numeric', ...(level === 'major' ? { year: 'numeric', weekday: 'short' as const } : {}) }).format(new Date(ms))
  const base = dateFormatter(locale, zone, { hour: 'numeric', ...(unit === 'minute' ? { minute: '2-digit' as const } : {}) }).format(new Date(ms))
  if (unit !== 'hour') return base
  const resolution = resolveWallTimeCandidates({ ...fields }, zone)
  if (resolution.candidates.length < 2) return base
  return `${base} ${dateFormatter(locale, zone, { timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find(part => part.type === 'timeZoneName')?.value ?? ''}`
}

function exactTicks(options: TimelineTickOptions, step: UnitStep, level: Tick['level']): Tick[] {
  const { transform, locale, weekStart } = options
  const zone = transform.displayTimeZone
  const bounds = timelineInstantBounds(zone)
  let cursor = floorCalendar(options.overscanStartMs, step, zone, weekStart)
  const ticks: Tick[] = []
  const seen = new Set<number>()
  if (step.unit === 'hour' || step.unit === 'minute') {
    const initial = zonedFields(cursor, zone)
    const pseudo = new Date(0)
    pseudo.setUTCHours(initial.hour, initial.minute, initial.second, 0)
    pseudo.setUTCFullYear(initial.year, initial.month - 1, initial.day)
    if (step.unit === 'hour') pseudo.setUTCHours(Math.floor(initial.hour / step.amount) * step.amount, 0, 0, 0)
    else pseudo.setUTCMinutes(Math.floor(initial.minute / step.amount) * step.amount, 0, 0)
    const boundaries: number[] = []
    for (let iteration = 0; iteration < 768; iteration++) {
      const wall = { year: pseudo.getUTCFullYear(), month: pseudo.getUTCMonth() + 1, day: pseudo.getUTCDate(), hour: pseudo.getUTCHours(), minute: pseudo.getUTCMinutes(), second: 0 }
      const candidates = resolveWallTimeCandidates(wall, zone).candidates
      for (const instant of candidates) {
        if (instant < bounds.minMs || instant >= bounds.maxMsExclusive || seen.has(instant)) continue
        seen.add(instant)
        boundaries.push(instant)
      }
      if (pseudo.getTime() > options.overscanEndMs + 2 * 86_400_000) break
      if (step.unit === 'hour') pseudo.setUTCHours(pseudo.getUTCHours() + step.amount)
      else pseudo.setUTCMinutes(pseudo.getUTCMinutes() + step.amount)
    }
    boundaries.sort((a, b) => a - b)
    for (let index = 0; index < boundaries.length; index++) {
      const instant = boundaries[index]!
      if (instant < options.overscanStartMs || instant > options.overscanEndMs) continue
      const end = boundaries[index + 1] ?? instant + (step.unit === 'hour' ? step.amount * 3_600_000 : step.amount * 60_000)
      ticks.push({ key: `${transform.scale}:${level}:${step.unit}:${instant}`, level, unit: step.unit, boundaryMs: instant, spanEndMs: end, x: timeToX(instant, transform), width: (end - instant) * transform.pxPerMs, label: makeLabel(instant, step.unit, level, locale, zone) })
    }
    return ticks
  }
  for (let iteration = 0; iteration < 768 && cursor <= options.overscanEndMs && cursor < bounds.maxMsExclusive; iteration++) {
    if (cursor >= bounds.minMs && !seen.has(cursor)) {
      seen.add(cursor)
      const end = floorCalendar(addCalendar(cursor, step, zone), step, zone, weekStart)
      ticks.push({
        key: `${transform.scale}:${level}:${step.unit}:${cursor}`,
        level, unit: step.unit, boundaryMs: cursor, spanEndMs: end,
        x: timeToX(cursor, transform), width: (end - cursor) * transform.pxPerMs,
        label: makeLabel(cursor, step.unit, level, locale, zone),
      })
    }
    const next = floorCalendar(addCalendar(cursor, step, zone), step, zone, weekStart)
    if (next <= cursor) break
    cursor = next
  }
  return ticks
}

function bucket(options: TimelineTickOptions): { key: string; start: number; end: number } {
  const scale = getTimelineScale(options.transform.scale)
  const zone = options.transform.displayTimeZone
  const bounds = timelineInstantBounds(zone)
  const start = Math.max(bounds.minMs, floorCalendar(options.overscanStartMs, scale.minorUnit, zone, options.weekStart))
  const endFloor = floorCalendar(options.overscanEndMs, scale.minorUnit, zone, options.weekStart)
  const end = Math.min(bounds.maxMsExclusive, addCalendar(endFloor, scale.minorUnit, zone))
  const key = `${options.transform.scale}:${stepKey(scale.minorUnit)}:${start}:${end}:${options.locale}:${options.weekStart}:${zone}:${options.transform.generation}:${options.transform.originMs}:${options.budget ?? 256}`
  return { key, start, end }
}

export function timelineTickBucket(options: TimelineTickOptions): string { return bucket(options).key }

export function generateTimelineTicks(options: TimelineTickOptions): TimelineTicks {
  const scale = getTimelineScale(options.transform.scale)
  const budget = Math.max(1, Math.min(256, Math.floor(options.budget ?? 256)))
  const window = bucket(options)
  const bucketOptions = { ...options, overscanStartMs: window.start, overscanEndMs: window.end }
  const allMajor = exactTicks(bucketOptions, scale.majorUnit, 'major')
  const majorLimit = Math.min(allMajor.length, Math.max(1, Math.floor(budget * 0.6)))
  const majorStride = Math.max(1, Math.ceil(allMajor.length / majorLimit))
  const major = allMajor.filter((_, index) => index % majorStride === 0).slice(0, majorLimit)
  const remaining = Math.max(0, budget - major.length)
  const allMinor = remaining ? exactTicks(bucketOptions, scale.minorUnit, 'minor') : []
  const minorStride = Math.max(1, Math.ceil(allMinor.length / Math.max(1, remaining)))
  const minor = allMinor.filter((_, index) => index % minorStride === 0).slice(0, remaining)
  return { major, minor, bucketKey: window.key }
}
