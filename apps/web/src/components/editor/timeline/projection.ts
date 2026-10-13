import type { DatabaseProperty, DatabasePropertyType, DatabaseRecord, DatabaseViewConfig, TimelineDateSource } from '@eotion/domain/database'
import { normalizeDatabaseDateValue } from '@eotion/domain/date'

export type TimelineRecordInput = Pick<DatabaseRecord, 'id' | 'pageId' | 'properties'>

export type TimelineTemporalPoint =
  | { kind: 'date-only'; date: string }
  | { kind: 'datetime'; instantMs: number; sourceTimeZone: string }

export type TimelineUnscheduledReason = 'unconfigured-source' | 'missing-start' | 'invalid-date' | 'incompatible-kinds' | 'end-before-start'

export type TimelineVisibleProperty = { propertyId: string; propertyType: DatabasePropertyType; displayText: string }

type TimelineItemProjectionBase = {
  recordId: string
  pageId: string
  title: string
  dateLabel: string
  rowIndex: number
  visibleProperties: TimelineVisibleProperty[]
}

export type TimelineItemProjection = TimelineItemProjectionBase & (
  | { kind: 'unscheduled'; start: null; end: null; reason: TimelineUnscheduledReason }
  | { kind: 'point'; start: TimelineTemporalPoint; end: null }
  | { kind: 'range'; start: TimelineTemporalPoint; end: TimelineTemporalPoint; precision: 'date-only' | 'datetime'; explicitZeroDuration: boolean }
)

export type TimelineProjectionConfig = DatabaseViewConfig
type NormalizedPoint = { kind: 'date-only'; date: string } | { kind: 'datetime'; instantMs: number; sourceTimeZone: string }
type FormatValue = (value: unknown, property: DatabaseProperty) => string
type ProjectionMeta = { byId: Map<string, DatabaseProperty>; titleProperty?: DatabaseProperty; displayProperties: DatabaseProperty[]; dateSource?: TimelineDateSource; dateSourceValid: boolean }

function hasRawValue(value: unknown): boolean { return value !== null && value !== undefined && value !== '' }

function normalizedPoint(value: ReturnType<typeof normalizeDatabaseDateValue>, endpoint: 'start' | 'end' = 'start'): NormalizedPoint | null {
  if (!value) return null
  if (value.kind === 'date-only') {
    const date = endpoint === 'start' ? value.start : value.end
    return date === undefined ? null : { kind: 'date-only', date }
  }
  const instant = endpoint === 'start' ? value.start : value.end
  if (instant === undefined) return null
  const instantMs = Date.parse(instant)
  return Number.isFinite(instantMs) ? { kind: 'datetime', instantMs, sourceTimeZone: value.timeZone } : null
}

function normalizePoint(value: unknown): NormalizedPoint | null {
  return normalizedPoint(normalizeDatabaseDateValue(value))
}

function comparePoints(left: NormalizedPoint, right: NormalizedPoint): number {
  if (left.kind === 'date-only' && right.kind === 'date-only') return left.date.localeCompare(right.date)
  if (left.kind === 'datetime' && right.kind === 'datetime') return left.instantMs - right.instantMs
  return NaN
}

function getDateSource(config: TimelineProjectionConfig): TimelineDateSource | undefined {
  const options = config.options
  if (!options || typeof options !== 'object') return undefined
  return (options as { timeline?: { dateSource?: TimelineDateSource } }).timeline?.dateSource
}

function createProjectionMeta(properties: readonly DatabaseProperty[], config: TimelineProjectionConfig): ProjectionMeta {
  const byId = new Map(properties.map(property => [property.id, property]))
  const titleProperties = properties.filter(property => property.type === 'title')
  const titleProperty = titleProperties.length === 1 ? titleProperties[0] : undefined
  const order = config.propertyOrder ?? []
  const ordered = [...order.map(id => byId.get(id)).filter((property): property is DatabaseProperty => Boolean(property)), ...properties.filter(property => !order.includes(property.id))]
  const visible = config.visibleProperties
  const displayProperties = (visible === null ? ordered : ordered.filter(property => property.type === 'title' || visible.includes(property.id)))
    .filter(property => property.type !== 'title')
  const dateSource = getDateSource(config)
  const referencedIds = dateSource?.mode === 'date-property' ? [dateSource.propertyId]
    : dateSource?.mode === 'start-end' ? [dateSource.startPropertyId, dateSource.endPropertyId] : []
  const dateSourceValid = !dateSource || referencedIds.every(id => byId.get(id)?.type === 'date')
  return { byId, titleProperty, displayProperties, dateSource, dateSourceValid }
}

function projectProperties(record: TimelineRecordInput, meta: ProjectionMeta, formatValue: FormatValue): { title: string; visibleProperties: TimelineVisibleProperty[] } {
  const titleProperty = meta.titleProperty
  const titleValue = titleProperty ? record.properties[titleProperty.id] : undefined
  const title = titleValue == null || titleValue === '' ? '无标题' : formatValue(titleValue, titleProperty!) || '无标题'
  const visibleProperties = meta.displayProperties.map(property => ({
    propertyId: property.id,
    propertyType: property.type,
    displayText: formatValue(record.properties[property.id], property),
  }))
  return { title, visibleProperties }
}

function valueFromPoint(point: NormalizedPoint): unknown {
  return point.kind === 'date-only' ? point.date : { start: new Date(point.instantMs).toISOString(), timeZone: point.sourceTimeZone }
}

type ProjectedDate = { start: NormalizedPoint; end: NormalizedPoint | null; explicitZeroDuration: boolean } | { reason: TimelineUnscheduledReason }

function projectDateLabel(record: TimelineRecordInput, meta: ProjectionMeta, formatValue: FormatValue, projected: ProjectedDate): string {
  const source = meta.dateSource
  if (!source) return ''
  if (source.mode === 'date-property') {
    const property = meta.byId.get(source.propertyId)
    const value = record.properties[source.propertyId]
    return property && hasRawValue(value) ? formatValue(value, property) : ''
  }
  if ('reason' in projected) return ''
  const startProperty = meta.byId.get(source.startPropertyId)
  const endProperty = meta.byId.get(source.endPropertyId)
  const start = startProperty ? formatValue(valueFromPoint(projected.start), startProperty) : ''
  const end = projected.end && endProperty ? formatValue(valueFromPoint(projected.end), endProperty) : ''
  return end ? `${start} – ${end}` : start
}

function unscheduled(base: TimelineItemProjectionBase, reason: TimelineUnscheduledReason): TimelineItemProjection {
  return { ...base, kind: 'unscheduled', start: null, end: null, reason }
}

function projectDate(record: TimelineRecordInput, source: TimelineDateSource | undefined, sourceValid: boolean): { start: NormalizedPoint; end: NormalizedPoint | null; explicitZeroDuration: boolean } | { reason: TimelineUnscheduledReason } {
  if (!source) return { reason: 'unconfigured-source' }
  if (!sourceValid) return { reason: 'invalid-date' }
  if (source.mode === 'date-property') {
    const raw = record.properties[source.propertyId]
    if (!hasRawValue(raw)) return { reason: 'missing-start' }
    const normalized = normalizeDatabaseDateValue(raw)
    if (!normalized) return { reason: 'invalid-date' }
    const start = normalizedPoint(normalized)!
    const end = normalized.end === undefined ? null : normalizedPoint(normalized, 'end')
    return { start, end, explicitZeroDuration: end !== null && comparePoints(start, end) === 0 }
  }

  const startRaw = record.properties[source.startPropertyId]
  const endRaw = record.properties[source.endPropertyId]
  if (!hasRawValue(startRaw)) return { reason: 'missing-start' }
  const start = normalizePoint(startRaw)
  if (!start) return { reason: 'invalid-date' }
  if (!hasRawValue(endRaw)) return { start, end: null, explicitZeroDuration: false }
  const end = normalizePoint(endRaw)
  if (!end) return { reason: 'invalid-date' }
  if (start.kind !== end.kind) return { reason: 'incompatible-kinds' }
  const order = comparePoints(end, start)
  if (order < 0) return { reason: 'end-before-start' }
  return { start, end, explicitZeroDuration: order === 0 }
}

export function projectTimelineRecords(args: {
  records: readonly TimelineRecordInput[]
  properties: readonly DatabaseProperty[]
  config: TimelineProjectionConfig
  formatValue: FormatValue
}): TimelineItemProjection[] {
  const meta = createProjectionMeta(args.properties, args.config)
  return args.records.map((record, rowIndex) => {
    const { title, visibleProperties } = projectProperties(record, meta, args.formatValue)
    const projected = projectDate(record, meta.dateSource, meta.dateSourceValid)
    const base = { recordId: record.id, pageId: record.pageId, title, dateLabel: projectDateLabel(record, meta, args.formatValue, projected), rowIndex, visibleProperties }
    if ('reason' in projected) return unscheduled(base, projected.reason)
    if (!projected.end) return { ...base, kind: 'point', start: projected.start, end: null }
    return { ...base, kind: 'range', start: projected.start, end: projected.end, precision: projected.start.kind, explicitZeroDuration: projected.explicitZeroDuration }
  })
}
