import { isValidTimelineViewOptions, type DatabaseProperty, type DatabaseViewConfig } from '@eotion/domain/database'
import type { TimelineItemGeometry, TimelineRowWindow } from './layout'
import type { TimelineRecordInput } from './projection'

export type TimelineDependencyEdge = {
  id: string
  predecessorRecordId: string
  successorRecordId: string
}

export type TimelineDependencyGeometry = {
  path: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export function resolveTimelineDependencyOptions(config: DatabaseViewConfig): { propertyId: string; direction: 'depends-on' | 'blocks' } | null {
  const timeline = (config as { options?: unknown }).options
  if (timeline === null || typeof timeline !== 'object' || Array.isArray(timeline)) return null
  const options = (timeline as Record<string, unknown>).timeline
  if (!isValidTimelineViewOptions(options) || !options.dependency) return null
  return { propertyId: options.dependency.propertyId, direction: options.dependency.direction }
}

export function projectTimelineDependencies(args: {
  databaseId: string
  properties: readonly DatabaseProperty[]
  records: readonly TimelineRecordInput[]
  config: DatabaseViewConfig
}): TimelineDependencyEdge[] {
  const options = resolveTimelineDependencyOptions(args.config)
  if (!options || typeof args.databaseId !== 'string' || args.databaseId.length === 0) return []

  const property = args.properties.find(candidate => candidate.id === options.propertyId)
  if (!property || property.databaseId !== args.databaseId || property.type !== 'relation') return []
  const propertyConfig = property.config
  if (!propertyConfig || typeof propertyConfig !== 'object' || Array.isArray(propertyConfig)
    || !('targetDatabaseId' in propertyConfig) || propertyConfig.targetDatabaseId !== args.databaseId) return []

  const loadedRecordIds = new Set(args.records.map(record => record.id).filter(id => typeof id === 'string' && id.length > 0))
  const edges = new Map<string, TimelineDependencyEdge>()
  for (const record of args.records) {
    const value: unknown = record.properties?.[options.propertyId]
    if (!Array.isArray(value)) continue
    const uniqueTargets = new Set<string>()
    for (const targetId of value) {
      if (typeof targetId !== 'string' || targetId.length === 0 || targetId === record.id || uniqueTargets.has(targetId) || !loadedRecordIds.has(targetId)) continue
      uniqueTargets.add(targetId)
      const [predecessorRecordId, successorRecordId] = options.direction === 'depends-on'
        ? [targetId, record.id]
        : [record.id, targetId]
      const id = JSON.stringify([options.propertyId, predecessorRecordId, successorRecordId])
      edges.set(id, { id, predecessorRecordId, successorRecordId })
    }
  }
  return [...edges.values()].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

function finiteGeometry(geometry: TimelineItemGeometry): boolean {
  return [geometry.rawX, geometry.rawWidth, geometry.rowIndex, geometry.rowTop, geometry.top, geometry.height].every(Number.isFinite)
    && geometry.rawWidth >= 0 && geometry.height >= 0
}

function clampX(x: number, width: number): number {
  return Math.max(0, Math.min(width, x))
}

export function layoutTimelineDependency(
  predecessor: TimelineItemGeometry,
  successor: TimelineItemGeometry,
  canvasWidth: number,
): TimelineDependencyGeometry | null {
  if (predecessor.recordId === successor.recordId || !Number.isFinite(canvasWidth) || canvasWidth < 0
    || !finiteGeometry(predecessor) || !finiteGeometry(successor)) return null

  const exitX = predecessor.marker || predecessor.kind === 'point' ? predecessor.rawX : predecessor.rawX + predecessor.rawWidth
  const entryX = successor.rawX
  const startY = predecessor.top + predecessor.height / 2
  const endY = successor.top + successor.height / 2
  if (![exitX, entryX, startY, endY].every(Number.isFinite)
    || exitX < 0 || exitX > canvasWidth || entryX < 0 || entryX > canvasWidth) return null

  let path: string
  if (entryX - exitX >= 24) {
    const turnX = clampX(exitX + (entryX - exitX) / 2, canvasWidth)
    path = `M ${exitX} ${startY} H ${turnX} V ${endY} H ${entryX}`
  } else {
    const exitLead = clampX(exitX + 12, canvasWidth)
    const entryLead = clampX(entryX - 12, canvasWidth)
    let gapY: number
    if (predecessor.rowIndex !== successor.rowIndex) {
      const upper = predecessor.rowIndex < successor.rowIndex ? predecessor : successor
      const lower = predecessor.rowIndex < successor.rowIndex ? successor : predecessor
      const upperBottom = upper.rowTop + Math.max(0, 2 * (upper.top - upper.rowTop) + upper.height)
      const lowerTop = lower.rowTop
      gapY = upperBottom <= lowerTop ? upperBottom + (lowerTop - upperBottom) / 2 : (upperBottom + lowerTop) / 2
    } else {
      const stableOrder = predecessor.recordId < successor.recordId
      gapY = startY + (stableOrder ? -12 : 12)
    }
    if (!Number.isFinite(gapY)) return null
    path = `M ${exitX} ${startY} H ${exitLead} V ${gapY} H ${entryLead} V ${endY} H ${entryX}`
  }
  return { path, start: { x: exitX, y: startY }, end: { x: entryX, y: endY } }
}

export function selectTimelineDependencyEdges(
  edges: readonly TimelineDependencyEdge[],
  geometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>,
  window: TimelineRowWindow,
  canvasWidth: number,
): TimelineDependencyEdge[] {
  if (!Number.isFinite(canvasWidth) || canvasWidth < 0 || !Number.isFinite(window.first) || !Number.isFinite(window.last)) return []
  return edges.filter(edge => {
    const predecessor = geometryByRecordId.get(edge.predecessorRecordId)
    const successor = geometryByRecordId.get(edge.successorRecordId)
    if (!predecessor || !successor) return false
    if (!layoutTimelineDependency(predecessor, successor, canvasWidth)) return false
    const low = Math.min(predecessor.rowIndex, successor.rowIndex)
    const high = Math.max(predecessor.rowIndex, successor.rowIndex)
    const intersectsWindow = high >= window.first && low < window.last
    return intersectsWindow || predecessor.rowIndex === window.focusedRowIndex || successor.rowIndex === window.focusedRowIndex
  })
}
