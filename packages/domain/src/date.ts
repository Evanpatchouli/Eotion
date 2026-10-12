/** A legacy all-day value or the strict range/datetime object introduced by P11.1A. */
export type DatabaseDateValue = string | DatabaseDateRangeValue

/**
 * The wire object intentionally does not distinguish all-day and datetime with a
 * second discriminator. `timeZone` is absent for all-day values and required for
 * datetime values; validators enforce that distinction at runtime.
 */
export interface DatabaseDateRangeValue {
  start: string
  end?: string
  timeZone?: string
}

export interface NormalizedDatabaseDateOnlyValue {
  kind: 'date-only'
  start: string
  end?: string
}

export interface NormalizedDatabaseDateTimeValue {
  kind: 'datetime'
  start: string
  end?: string
  timeZone: string
}

export type NormalizedDatabaseDateValue = NormalizedDatabaseDateOnlyValue | NormalizedDatabaseDateTimeValue

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

/** Validates a zero-padded proleptic Gregorian calendar date without a timezone. */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * Validates the canonical UTC instant used by the P11.1A wire contract.
 * Offsets other than `Z`, missing milliseconds, and invalid calendar/time values
 * are intentionally rejected instead of being silently normalized.
 */
export function isValidCanonicalUtcInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_INSTANT_PATTERN.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

/** Validates an IANA timezone identifier supported by the current runtime. */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false
  if (/^[+-]\d{2}(?::?\d{2})?$/u.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

/** Validates the strict `{ start, end?, timeZone? }` object shape and range rules. */
export function isValidDatabaseDateRangeValue(value: unknown): value is DatabaseDateRangeValue {
  if (!isObject(value) || !hasExactFields(value, ['start'], ['end', 'timeZone'])) return false

  const hasEnd = Object.hasOwn(value, 'end')
  const hasTimeZone = Object.hasOwn(value, 'timeZone')
  if (hasTimeZone) {
    if (!isValidCanonicalUtcInstant(value.start) || !isValidIanaTimeZone(value.timeZone)) return false
    if (hasEnd && !isValidCanonicalUtcInstant(value.end)) return false
    return !hasEnd || Date.parse(value.start) <= Date.parse(value.end as string)
  }

  if (!isValidDateOnly(value.start)) return false
  if (!hasEnd) return true
  if (!isValidDateOnly(value.end)) return false
  return value.start <= value.end
}

/** Validates both legacy date-only strings and new strict date/range objects. */
export function isValidDatabaseDateValue(value: unknown): value is DatabaseDateValue {
  return isValidDateOnly(value) || isValidDatabaseDateRangeValue(value)
}

/**
 * Purely maps a legacy or new valid value to the common shape consumed by later
 * filter/sort/formula work. Invalid or mixed values return null.
 */
export function normalizeDatabaseDateValue(value: unknown): NormalizedDatabaseDateValue | null {
  if (isValidDateOnly(value)) return { kind: 'date-only', start: value }
  if (!isValidDatabaseDateRangeValue(value)) return null

  if (Object.hasOwn(value, 'timeZone')) {
    return {
      kind: 'datetime',
      start: value.start,
      ...(Object.hasOwn(value, 'end') ? { end: value.end } : {}),
      timeZone: value.timeZone as string,
    }
  }

  return {
    kind: 'date-only',
    start: value.start,
    ...(Object.hasOwn(value, 'end') ? { end: value.end } : {}),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...fields, ...optional])
  return fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field))
}
