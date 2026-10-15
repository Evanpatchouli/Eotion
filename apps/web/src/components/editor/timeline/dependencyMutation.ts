import type { DatabaseProperty, DatabaseViewConfig } from '@eotion/domain/database'
import { DATABASE_RELATION_MAX_LINKS } from '@eotion/domain/database'
import { resolveTimelineDependencyOptions } from './dependency'

export type TimelineDependencyCapture = {
  scope: string
  userId: string
  workspaceId: string
  databaseId: string
  viewId: string
  blockId: string
  propertyId: string
  direction: 'depends-on' | 'blocks'
  configIdentity: string
  propertyVersion: number
  expectedDatabaseVersion: number
  expectedViewVersion?: number
  viewIdentityEpoch: number
  viewRoot: HTMLElement | null
  records: readonly { id: string; version: number; originalValue: unknown }[]
}

export type TimelineDependencyCommand = {
  capture: TimelineDependencyCapture
  operation: 'create' | 'delete'
  predecessorRecordId: string
  successorRecordId: string
}

export type TimelineDependencyProperty = {
  property: DatabaseProperty
  propertyId: string
  direction: 'depends-on' | 'blocks'
  configIdentity: string
  propertyVersion: number
  shiftMode: 'shift_when_overlapping' | 'shift_and_keep_gap' | 'no_auto_shift'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

/** Stable semantic fingerprint for the complete dependency options object. */
export function timelineDependencyConfigIdentity(config: DatabaseViewConfig): string | null {
  const options = (config as { options?: unknown }).options
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null
  const timeline = (options as Record<string, unknown>).timeline
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) return null
  const dependency = (timeline as Record<string, unknown>).dependency
  if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) return null
  const value = dependency as Record<string, unknown>
  if (typeof value.propertyId !== 'string' || typeof value.direction !== 'string'
    || typeof value.shiftMode !== 'string' || typeof value.avoidWeekends !== 'boolean') return null
  return JSON.stringify([value.propertyId, value.direction, value.shiftMode, value.avoidWeekends])
}

export function resolveDependencyRelationMutation(args: {
  predecessorRecordId: string
  successorRecordId: string
  direction: 'depends-on' | 'blocks'
}): { ownerRecordId: string; relatedRecordId: string } | null {
  const { predecessorRecordId, successorRecordId, direction } = args
  if (!isNonEmptyString(predecessorRecordId) || !isNonEmptyString(successorRecordId)
    || predecessorRecordId === successorRecordId
    || direction !== 'depends-on' && direction !== 'blocks') return null
  return direction === 'depends-on'
    ? { ownerRecordId: successorRecordId, relatedRecordId: predecessorRecordId }
    : { ownerRecordId: predecessorRecordId, relatedRecordId: successorRecordId }
}

export function resolveTimelineDependencyProperty(
  databaseId: string,
  properties: readonly DatabaseProperty[],
  config: DatabaseViewConfig,
): TimelineDependencyProperty | null {
  if (!isNonEmptyString(databaseId) || !Array.isArray(properties)) return null
  const options = resolveTimelineDependencyOptions(config)
  const configIdentity = timelineDependencyConfigIdentity(config)
  if (!options || !configIdentity) return null
  const dependencyOptions = (config.options as { timeline: { dependency: { shiftMode: TimelineDependencyProperty['shiftMode'] } } }).timeline.dependency
  const property = properties.find(candidate => candidate.id === options.propertyId)
  const propertyConfig: unknown = property?.config
  if (!property || property.databaseId !== databaseId || property.type !== 'relation' || !isVersion(property.version)
    || !propertyConfig || typeof propertyConfig !== 'object' || Array.isArray(propertyConfig)
    || !('targetDatabaseId' in propertyConfig) || propertyConfig.targetDatabaseId !== databaseId) return null
  return {
    property,
    propertyId: property.id,
    direction: options.direction,
    configIdentity,
    propertyVersion: property.version,
    shiftMode: dependencyOptions.shiftMode,
  }
}

function isCaptureValid(capture: TimelineDependencyCapture): boolean {
  return isNonEmptyString(capture.scope) && isNonEmptyString(capture.userId)
    && isNonEmptyString(capture.workspaceId) && isNonEmptyString(capture.databaseId)
    && isNonEmptyString(capture.viewId) && isNonEmptyString(capture.blockId)
    && isNonEmptyString(capture.propertyId) && isNonEmptyString(capture.configIdentity)
    && (capture.direction === 'depends-on' || capture.direction === 'blocks')
    && isVersion(capture.propertyVersion) && isVersion(capture.expectedDatabaseVersion)
    && (capture.expectedViewVersion === undefined || isVersion(capture.expectedViewVersion))
    && isVersion(capture.viewIdentityEpoch) && (capture.viewRoot === null || typeof capture.viewRoot === 'object')
    && Array.isArray(capture.records) && capture.records.every(record => !!record && typeof record === 'object'
      && isNonEmptyString(record.id) && isVersion(record.version))
}

export function prepareDependencyRelationMutation(
  command: TimelineDependencyCommand,
  current: { databaseId: string; properties: readonly DatabaseProperty[]; config: DatabaseViewConfig },
): {
  ownerRecordId: string
  relatedRecordId: string
  expectedRecordVersion: number
  originalValue: unknown
  value: string[]
  noop: boolean
} | null {
  const { capture } = command
  if (!capture || !isCaptureValid(capture)
    || command.operation !== 'create' && command.operation !== 'delete'
    || current.databaseId !== capture.databaseId) return null

  const resolved = resolveTimelineDependencyProperty(current.databaseId, current.properties, current.config)
  if (!resolved || resolved.propertyId !== capture.propertyId || resolved.direction !== capture.direction
    || resolved.configIdentity !== capture.configIdentity || resolved.propertyVersion !== capture.propertyVersion) return null

  const relation = resolveDependencyRelationMutation({
    predecessorRecordId: command.predecessorRecordId,
    successorRecordId: command.successorRecordId,
    direction: capture.direction,
  })
  if (!relation) return null
  const owner = capture.records.find(record => record.id === relation.ownerRecordId)
  if (!owner || !isVersion(owner.version)) return null
  const originalValue = owner.originalValue
  if (originalValue !== undefined && (!Array.isArray(originalValue) || !originalValue.every(isNonEmptyString))) return null
  const value = originalValue === undefined ? [] : [...originalValue] as string[]
  if (value.length > DATABASE_RELATION_MAX_LINKS) return null

  if (command.operation === 'create') {
    if (value.includes(relation.relatedRecordId)) return {
      ...relation, expectedRecordVersion: owner.version, originalValue, value, noop: true,
    }
    const next = [...new Set(value), relation.relatedRecordId]
    if (next.length > DATABASE_RELATION_MAX_LINKS) return null
    return { ...relation, expectedRecordVersion: owner.version, originalValue, value: next, noop: false }
  }

  const next = value.filter(id => id !== relation.relatedRecordId)
  const noop = next.length === value.length
  return { ...relation, expectedRecordVersion: owner.version, originalValue, value: next, noop }
}

export function isDependencyRelationMutationConfirmed(
  value: unknown,
  relatedRecordId: string,
  operation: 'create' | 'delete',
): boolean {
  if (!isNonEmptyString(relatedRecordId) || operation !== 'create' && operation !== 'delete') return false
  if (value === undefined) return operation === 'delete'
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) return false
  return operation === 'create' ? value.includes(relatedRecordId) : !value.includes(relatedRecordId)
}
