import type { DatabaseProperty, DatabaseViewConfig } from '@eotion/domain/database'
import type { TimelineRecordInput } from './projection'

/** Resolves the Timeline-only Frozen Table columns without changing the saved view config. */
export function resolveFrozenTableProperties(
  properties: readonly DatabaseProperty[],
  config: DatabaseViewConfig,
): DatabaseProperty[] {
  const timeline = config.options?.timeline
  if (!timeline || typeof timeline !== 'object') return []
  const frozenTable = (timeline as { frozenTable?: unknown }).frozenTable
  if (!frozenTable || typeof frozenTable !== 'object' || (frozenTable as { visible?: unknown }).visible !== true) return []

  const frozen = frozenTable as { visibleProperties?: unknown; propertyOrder?: unknown }
  const byId = new Map<string, DatabaseProperty>()
  for (const property of properties) if (!byId.has(property.id)) byId.set(property.id, property)

  const visibleIds = Array.isArray(frozen.visibleProperties)
    ? new Set(frozen.visibleProperties.filter((id): id is string => typeof id === 'string'))
    : null
  const included = new Set<string>()
  const resolved: DatabaseProperty[] = []
  const add = (property: DatabaseProperty | undefined) => {
    if (!property || included.has(property.id)) return
    if (property.type !== 'title' && visibleIds !== null && !visibleIds.has(property.id)) return
    included.add(property.id)
    resolved.push(property)
  }

  if (Array.isArray(frozen.propertyOrder)) {
    for (const id of frozen.propertyOrder) if (typeof id === 'string') add(byId.get(id))
  }
  for (const property of properties) add(byId.get(property.id))
  return resolved
}

/** Projects non-title Frozen Table values once per record; Title is shared with Timeline's item projection. */
export function projectFrozenTableDisplay(
  records: readonly TimelineRecordInput[],
  columns: readonly DatabaseProperty[],
  formatValue: (value: unknown, property: DatabaseProperty) => string,
): Map<string, ReadonlyMap<string, string>> {
  const displayByRecord = new Map<string, ReadonlyMap<string, string>>()
  const valueColumns = columns.filter(property => property.type !== 'title')
  for (const record of records) {
    const displayByProperty = new Map<string, string>()
    for (const property of valueColumns) displayByProperty.set(property.id, formatValue(record.properties[property.id], property))
    displayByRecord.set(record.id, displayByProperty)
  }
  return displayByRecord
}
