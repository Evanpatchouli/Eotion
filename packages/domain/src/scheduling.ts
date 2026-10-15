import type { DatabaseRecord, TimelineDateSource, TimelineShiftMode } from './database'
import { isValidCanonicalUtcInstant, normalizeDatabaseDateValue, type DatabaseDateValue, type NormalizedDatabaseDateValue } from './date'

export const MAX_SCHEDULE_RECORDS = 500
export const MAX_SCHEDULE_EDGES = 10_000
export const MAX_SCHEDULE_SCAN_RECORDS = 10_000
export const MAX_SCHEDULE_SCAN_EDGES = 500_000
const DAY_MS = 86_400_000

export class SchedulingError extends Error {
  constructor(public readonly code: 'cycle' | 'limit' | 'invalid-date') {
    super(`Scheduling failed: ${code}`)
    this.name = 'SchedulingError'
  }
}

type RecordInput = Pick<DatabaseRecord, 'id' | 'properties'>
type Edge = { predecessorRecordId: string; successorRecordId: string }
type Dates = { kind: NormalizedDatabaseDateValue['kind']; start: number; finish: number; cells: DatabaseDateValue[] }

/** Pure planner for the server's canonical post-relation predecessor → successor graph. */
export function planDatabaseSchedule(input: {
  records: readonly RecordInput[]
  edges: readonly Edge[]
  dateSource: TimelineDateSource
  rootRecordId: string
  rootProperties?: DatabaseRecord['properties']
  shiftMode: TimelineShiftMode
  avoidWeekends: boolean
}): { mutations: { recordId: string; properties: DatabaseRecord['properties'] }[]; nodeCount: number; edgeCount: number } {
  const { records, edges, dateSource, rootRecordId, rootProperties, shiftMode, avoidWeekends } = input
  if (shiftMode === 'no_auto_shift') return { mutations: [], nodeCount: 0, edgeCount: 0 }
  if (records.length > MAX_SCHEDULE_SCAN_RECORDS || edges.length > MAX_SCHEDULE_SCAN_EDGES) throw new SchedulingError('limit')
  const byId = new Map(records.map((record, index) => [record.id, { record, index }]))
  const root = byId.get(rootRecordId)
  if (!root || byId.size !== records.length) throw new SchedulingError('limit')
  const empty = { mutations: [], nodeCount: 0, edgeCount: 0 }

  const outgoing = new Map<string, Edge[]>()
  const incoming = new Map<string, Edge[]>()
  for (const edge of edges) {
    if (!byId.has(edge.predecessorRecordId) || !byId.has(edge.successorRecordId)) continue
    const out = outgoing.get(edge.predecessorRecordId) ?? []
    out.push(edge)
    outgoing.set(edge.predecessorRecordId, out)
    const inc = incoming.get(edge.successorRecordId) ?? []
    inc.push(edge)
    incoming.set(edge.successorRecordId, inc)
  }
  const original = new Map<string, Dates | null>()
  const current = new Map<string, Dates | null>()
  const getOriginal = (id: string): Dates | null => {
    if (!original.has(id)) original.set(id, readDates(byId.get(id)!.record.properties, dateSource))
    return original.get(id)!
  }
  const getCurrent = (id: string): Dates | null => {
    if (!current.has(id)) current.set(id, id === rootRecordId && rootProperties
      ? readDates(rootProperties, dateSource) : getOriginal(id))
    return current.get(id)!
  }
  if (!getCurrent(rootRecordId)) return empty

  // Unscheduled records terminate traversal. Only the scheduled reachable subgraph
  // participates in cycle detection; other graph cycles have no scheduling effect.
  const affected = new Set<string>([rootRecordId])
  const queue = [rootRecordId]
  for (let head = 0; head < queue.length; head++) {
    for (const edge of outgoing.get(queue[head]!) ?? []) {
      const id = edge.successorRecordId
      if (!affected.has(id) && getCurrent(id)) {
        affected.add(id)
        if (affected.size > MAX_SCHEDULE_RECORDS) throw new SchedulingError('limit')
        queue.push(id)
      }
    }
  }
  const indegree = new Map([...affected].map(id => [id, 0]))
  let edgeCount = 0
  for (const id of affected) for (const edge of outgoing.get(id) ?? []) {
    if (!affected.has(edge.successorRecordId)) continue
    indegree.set(edge.successorRecordId, indegree.get(edge.successorRecordId)! + 1)
    edgeCount++
    if (edgeCount > MAX_SCHEDULE_EDGES) throw new SchedulingError('limit')
  }
  const ready = new MinHeap<string>((a, b) => a < b ? -1 : a > b ? 1 : 0)
  for (const [id, degree] of indegree) if (degree === 0) ready.push(id)
  const planned = new Map<string, Dates>()
  planned.set(rootRecordId, getCurrent(rootRecordId)!)
  const mutations: { recordId: string; properties: DatabaseRecord['properties'] }[] = []
  let processed = 0
  while (ready.size) {
    const id = ready.pop()!
    processed++
    if (id !== rootRecordId) {
      const old = getCurrent(id)!
      let required = old.start
      for (const edge of incoming.get(id) ?? []) {
        const pred = planned.get(edge.predecessorRecordId) ?? getCurrent(edge.predecessorRecordId)
        if (!pred) continue
        const oldPred = getOriginal(edge.predecessorRecordId)
        const gap = shiftMode === 'shift_and_keep_gap' && oldPred
          ? Math.max(0, old.start - oldPred.finish) : 0
        const candidate = checkedAdd(pred.finish, gap)
        if (candidate > required) required = candidate
      }
      if (required > old.start) {
        if (old.kind === 'date-only') required = Math.ceil(required / DAY_MS) * DAY_MS
        if (avoidWeekends) required = nextWeekday(required, old.cells[0]!)
        const shifted = shiftDates(old, required, dateSource)
        planned.set(id, shifted.dates)
        mutations.push({ recordId: id, properties: shifted.properties })
      } else planned.set(id, old)
    }
    for (const edge of outgoing.get(id) ?? []) {
      const next = edge.successorRecordId
      if (!affected.has(next)) continue
      const degree = indegree.get(next)! - 1
      indegree.set(next, degree)
      if (degree === 0) ready.push(next)
    }
  }
  if (processed !== affected.size) throw new SchedulingError('cycle')
  return { mutations, nodeCount: affected.size, edgeCount }
}

function readDates(properties: DatabaseRecord['properties'], source: TimelineDateSource): Dates | null {
  const keys = source.mode === 'date-property' ? [source.propertyId] :
    properties[source.endPropertyId] == null || properties[source.endPropertyId] === ''
      ? [source.startPropertyId] : [source.startPropertyId, source.endPropertyId]
  const raw = keys.map(key => properties[key])
  if (raw.some(value => value == null || value === '')) return null
  const cells = raw.map(value => normalizeDatabaseDateValue(value))
  if (cells.some(value => !value)) throw new SchedulingError('invalid-date')
  const startCell = cells[0]!
  const endCell = source.mode === 'start-end' ? cells[1] : undefined
  if (endCell && endCell.kind !== startCell.kind) throw new SchedulingError('invalid-date')
  const start = instant(startCell.start)
  const finish = endCell ? instant(endCell.start) : startCell.end ? instant(startCell.end) : start
  if (finish < start) throw new SchedulingError('invalid-date')
  const inclusiveFinish = startCell.kind === 'date-only' && (endCell || startCell.end)
    ? checkedAdd(finish, DAY_MS) : finish
  return { kind: startCell.kind, start, finish: inclusiveFinish, cells: raw as DatabaseDateValue[] }
}

function instant(value: string): number {
  const timestamp = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (!Number.isFinite(timestamp)) throw new SchedulingError('invalid-date')
  return timestamp
}

function checkedAdd(a: number, b: number): number {
  const result = a + b
  if (!Number.isSafeInteger(result) || !Number.isFinite(new Date(result).getTime())) throw new SchedulingError('invalid-date')
  return result
}

function shiftDates(old: Dates, newStart: number, source: TimelineDateSource): {
  dates: Dates; properties: DatabaseRecord['properties']
} {
  const offset = newStart - old.start
  const keys = source.mode === 'date-property' ? [source.propertyId] :
    old.cells.length === 1 ? [source.startPropertyId] : [source.startPropertyId, source.endPropertyId]
  const properties: DatabaseRecord['properties'] = {}
  for (let i = 0; i < keys.length; i++) {
    const value = old.cells[i]!
    const move = (part: string) => {
      const result = checkedAdd(instant(part), offset)
      if (old.kind === 'date-only') {
        const iso = new Date(result).toISOString()
        if (result % DAY_MS !== 0 || !/^\d{4}-\d{2}-\d{2}T/u.test(iso)) throw new SchedulingError('invalid-date')
        return iso.slice(0, 10)
      }
      return new Date(result).toISOString()
    }
    properties[keys[i]!] = typeof value === 'string' ? move(value) : {
      ...value, start: move(value.start), ...(value.end === undefined ? {} : { end: move(value.end) }),
    }
  }
  const dates = readDates(properties, source)
  if (!dates) throw new SchedulingError('invalid-date')
  return { dates, properties }
}

function nextWeekday(start: number, value: DatabaseDateValue): number {
  if (typeof value === 'string' || !value.timeZone) {
    const date = new Date(start)
    const weekday = date.getUTCDay()
    date.setUTCDate(date.getUTCDate() + (weekday === 6 ? 2 : weekday === 0 ? 1 : 0))
    return checkedAdd(date.getTime(), 0)
  }
  const zone = value.timeZone
  const local = localParts(start, zone)
  const calendar = utcCalendar(local.year, local.month, local.day)
  const weekday = new Date(calendar).getUTCDay()
  const days = weekday === 6 ? 2 : weekday === 0 ? 1 : 0
  if (!days) return start
  const target = new Date(checkedAdd(calendar, days * DAY_MS))
  const desired = { ...local, year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() }
  const wallUtc = checkedAdd(utcCalendar(desired.year, desired.month, desired.day),
    ((desired.hour * 60 + desired.minute) * 60 + desired.second) * 1000 + desired.ms)
  // Derive actual offsets near the target; historical IANA offsets can include seconds.
  const offsets = new Set<number>()
  for (const daysFromTarget of [-2, -1, 0, 1, 2]) {
    const sample = checkedAdd(wallUtc, daysFromTarget * DAY_MS)
    const sampleLocal = localParts(sample, zone)
    const localAsUtc = checkedAdd(utcCalendar(sampleLocal.year, sampleLocal.month, sampleLocal.day),
      ((sampleLocal.hour * 60 + sampleLocal.minute) * 60 + sampleLocal.second) * 1000 + sampleLocal.ms)
    offsets.add(localAsUtc - sample)
  }
  for (const offset of [...offsets].sort((a, b) => b - a)) {
    const candidate = checkedAdd(wallUtc, -offset)
    if (!isValidCanonicalUtcInstant(new Date(candidate).toISOString())) continue
    const parts = localParts(candidate, zone)
    if (Object.keys(desired).every(key => parts[key as keyof typeof parts] === desired[key as keyof typeof desired])) return candidate
  }
  throw new SchedulingError('invalid-date')
}

function utcCalendar(year: number, month: number, day: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime()
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function localParts(time: number, zone: string) {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    formatters.set(zone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, Number(part.value)]))
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!,
    minute: parts.minute!, second: parts.second!, ms: new Date(time).getUTCMilliseconds() }
}

class MinHeap<T> {
  private items: T[] = []
  constructor(private readonly compare: (a: T, b: T) => number) {}
  get size() { return this.items.length }
  push(value: T) {
    const items = this.items
    let index = items.length
    items.push(value)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.compare(items[parent]!, value) <= 0) break
      items[index] = items[parent]!
      index = parent
    }
    items[index] = value
  }
  pop(): T | undefined {
    const items = this.items
    const first = items[0]
    const last = items.pop()
    if (items.length && last !== undefined) {
      let index = 0
      while (index * 2 + 1 < items.length) {
        let child = index * 2 + 1
        if (child + 1 < items.length && this.compare(items[child + 1]!, items[child]!) < 0) child++
        if (this.compare(last, items[child]!) <= 0) break
        items[index] = items[child]!
        index = child
      }
      items[index] = last
    }
    return first
  }
}
