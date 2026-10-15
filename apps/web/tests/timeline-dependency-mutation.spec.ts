import { expect, test } from '@playwright/test'
import type { DatabaseProperty, DatabaseViewConfig } from '@eotion/domain/database'
import {
  isDependencyRelationMutationConfirmed,
  prepareDependencyRelationMutation,
  resolveDependencyRelationMutation,
  resolveTimelineDependencyProperty,
  type TimelineDependencyCapture,
  type TimelineDependencyCommand,
} from '../src/components/editor/timeline/dependencyMutation'

const databaseId = 'db'
const relationProperty: DatabaseProperty = {
  id: 'dependency', databaseId, workspaceId: 'ws', name: 'Dependency', type: 'relation',
  config: { targetDatabaseId: databaseId }, version: 3, createdAt: '', updatedAt: '',
}

function config(direction: 'depends-on' | 'blocks' = 'depends-on', shiftMode: 'shift_when_overlapping' | 'shift_and_keep_gap' | 'no_auto_shift' = 'no_auto_shift', avoidWeekends = false): DatabaseViewConfig {
  return { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: {
    dependency: { propertyId: relationProperty.id, direction, shiftMode, avoidWeekends },
  } } }
}

function capture(args: {
  direction?: 'depends-on' | 'blocks'
  originalValue?: unknown
  ownerId?: string
  propertyVersion?: number
  expectedDatabaseVersion?: number
} = {}): TimelineDependencyCapture {
  const direction = args.direction ?? 'depends-on'
  return {
    scope: 'scope', userId: 'user', workspaceId: 'ws', databaseId, viewId: 'view', blockId: 'block',
    propertyId: relationProperty.id, direction,
    configIdentity: resolveTimelineDependencyProperty(databaseId, [relationProperty], config(direction))!.configIdentity,
    propertyVersion: args.propertyVersion ?? relationProperty.version,
    expectedDatabaseVersion: args.expectedDatabaseVersion ?? 10,
    viewIdentityEpoch: 2, viewRoot: null,
    records: [{ id: args.ownerId ?? 'successor', version: 7, originalValue: args.originalValue }],
  }
}

function command(args: {
  operation?: 'create' | 'delete'
  direction?: 'depends-on' | 'blocks'
  originalValue?: unknown
  ownerId?: string
  predecessorRecordId?: string
  successorRecordId?: string
  propertyVersion?: number
} = {}): TimelineDependencyCommand {
  const direction = args.direction ?? 'depends-on'
  return {
    capture: capture(args), operation: args.operation ?? 'create',
    predecessorRecordId: args.predecessorRecordId ?? 'predecessor',
    successorRecordId: args.successorRecordId ?? 'successor',
  }
}

function prepare(
  input: TimelineDependencyCommand,
  currentConfig: DatabaseViewConfig = config(input.capture.direction),
  properties: readonly DatabaseProperty[] = [relationProperty],
  currentDatabaseId = databaseId,
) {
  return prepareDependencyRelationMutation(input, { databaseId: currentDatabaseId, properties, config: currentConfig })
}

test('depends-on stores predecessor in successor owner cell', () => {
  expect(resolveDependencyRelationMutation({ predecessorRecordId: 'p', successorRecordId: 's', direction: 'depends-on' }))
    .toEqual({ ownerRecordId: 's', relatedRecordId: 'p' })
})

test('blocks stores successor in predecessor owner cell', () => {
  expect(resolveDependencyRelationMutation({ predecessorRecordId: 'p', successorRecordId: 's', direction: 'blocks' }))
    .toEqual({ ownerRecordId: 'p', relatedRecordId: 's' })
})

test('relation resolver rejects self edges and invalid record IDs', () => {
  expect(resolveDependencyRelationMutation({ predecessorRecordId: 'same', successorRecordId: 'same', direction: 'blocks' })).toBeNull()
  expect(resolveDependencyRelationMutation({ predecessorRecordId: '', successorRecordId: 's', direction: 'blocks' })).toBeNull()
})

test('property resolver requires an existing relation property', () => {
  expect(resolveTimelineDependencyProperty(databaseId, [], config())).toBeNull()
  expect(resolveTimelineDependencyProperty(databaseId, [{ ...relationProperty, type: 'text' }], config())).toBeNull()
})

test('property resolver rejects a relation targeting another database', () => {
  expect(resolveTimelineDependencyProperty(databaseId, [{ ...relationProperty, config: { targetDatabaseId: 'other' } }], config())).toBeNull()
})

test('property resolver rejects properties owned by another database', () => {
  expect(resolveTimelineDependencyProperty(databaseId, [{ ...relationProperty, databaseId: 'other' }], config())).toBeNull()
})

test('property resolver returns direction, version, and complete dependency identity', () => {
  const resolved = resolveTimelineDependencyProperty(databaseId, [relationProperty], config('blocks', 'shift_and_keep_gap', true))
  expect(resolved).toMatchObject({ propertyId: 'dependency', direction: 'blocks', propertyVersion: 3 })
  expect(resolved?.configIdentity).toBe(JSON.stringify(['dependency', 'blocks', 'shift_and_keep_gap', true]))
})

test('property resolver rejects malformed dependency config', () => {
  expect(resolveTimelineDependencyProperty(databaseId, [relationProperty], {
    ...config(), options: { timeline: { dependency: { propertyId: 'dependency', direction: 'depends-on' } } },
  })).toBeNull()
})

test('create prepares depends-on owner cell and preserves unloaded target IDs', () => {
  const result = prepare(command({ originalValue: ['unloaded', 'first'] }))
  expect(result).toEqual({ ownerRecordId: 'successor', relatedRecordId: 'predecessor', expectedRecordVersion: 7,
    originalValue: ['unloaded', 'first'], value: ['unloaded', 'first', 'predecessor'], noop: false })
})

test('mutation accepts frozen readonly Relation snapshot arrays', () => {
  const originalValue = Object.freeze(['unloaded', 'first'])
  const result = prepare(command({ originalValue }))
  expect(result).toMatchObject({ originalValue, value: ['unloaded', 'first', 'predecessor'], noop: false })
  expect(originalValue).toEqual(['unloaded', 'first'])
})

test('create prepares blocks owner cell', () => {
  const result = prepare(command({ direction: 'blocks', ownerId: 'predecessor', originalValue: [] }))
  expect(result).toMatchObject({ ownerRecordId: 'predecessor', relatedRecordId: 'successor', value: ['successor'], noop: false })
})

test('duplicate create is a no-op and preserves the existing array', () => {
  const value = ['predecessor', 'other']
  expect(prepare(command({ originalValue: value }))).toMatchObject({ value, noop: true })
  expect(value).toEqual(['predecessor', 'other'])
})

test('create stably deduplicates existing values before appending', () => {
  expect(prepare(command({ originalValue: ['x', 'x', 'y'] }))).toMatchObject({ value: ['x', 'y', 'predecessor'], noop: false })
})

test('delete removes only the requested depends-on relation and retains order', () => {
  expect(prepare(command({ operation: 'delete', originalValue: ['x', 'predecessor', 'y', 'predecessor'] })))
    .toMatchObject({ value: ['x', 'y'], noop: false })
})

test('delete removes only the requested blocks relation', () => {
  expect(prepare(command({ operation: 'delete', direction: 'blocks', ownerId: 'predecessor', originalValue: ['a', 'successor', 'b'] })))
    .toMatchObject({ ownerRecordId: 'predecessor', value: ['a', 'b'], noop: false })
})

test('missing delete target is a no-op', () => {
  expect(prepare(command({ operation: 'delete', originalValue: ['other'] }))).toMatchObject({ value: ['other'], noop: true })
})

test('undefined relation snapshot is treated as empty for create', () => {
  expect(prepare(command())).toMatchObject({ originalValue: undefined, value: ['predecessor'], noop: false })
})

test('malformed relation values fail closed', () => {
  for (const originalValue of [null, 'predecessor', ['ok', 3], ['']]) {
    expect(prepare(command({ originalValue }))).toBeNull()
  }
})

test('relation mutation enforces the 50-link limit', () => {
  const atLimit = Array.from({ length: 50 }, (_, index) => `r${index}`)
  expect(prepare(command({ originalValue: atLimit }))).toBeNull()
  expect(prepare(command({ originalValue: atLimit.slice(0, 49) }))).toMatchObject({ value: [...atLimit.slice(0, 49), 'predecessor'] })
  expect(prepare(command({ originalValue: [...atLimit, 'extra'] }))).toBeNull()
})

test('mutation requires a captured owner record and valid record version', () => {
  const base = command()
  const noOwner = { ...base, capture: { ...base.capture, records: [] } }
  expect(prepare(noOwner)).toBeNull()
  const badVersion = { ...base, capture: { ...base.capture, records: [{ id: 'successor', version: -1, originalValue: [] }] } }
  expect(prepare(badVersion)).toBeNull()
})

test('mutation rejects a stale property version', () => {
  expect(prepare(command({ propertyVersion: 2 }))).toBeNull()
})

test('mutation rejects a stale dependency direction', () => {
  const input = command({ direction: 'depends-on' })
  expect(prepare(input, config('blocks'))).toBeNull()
})

test('mutation rejects stale shiftMode and avoidWeekends config', () => {
  const input = command()
  expect(prepare(input, config('depends-on', 'shift_when_overlapping', false))).toBeNull()
  expect(prepare(input, config('depends-on', 'no_auto_shift', true))).toBeNull()
})

test('mutation rejects a different current database', () => {
  expect(prepare(command(), config(), [relationProperty], 'other')).toBeNull()
})

test('mutation allows cycles because it only prepares the requested Relation cell patch', () => {
  expect(prepare(command({ originalValue: ['predecessor'] }))).toMatchObject({ noop: true, value: ['predecessor'] })
  expect(prepare(command({ originalValue: ['other'] }))).toMatchObject({ noop: false, value: ['other', 'predecessor'] })
})

test('semantic dependency identity is deterministic across object key order', () => {
  const reordered = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
    options: { timeline: { dependency: { avoidWeekends: false, shiftMode: 'no_auto_shift', direction: 'depends-on', propertyId: 'dependency' } } } } as unknown as DatabaseViewConfig
  expect(resolveTimelineDependencyProperty(databaseId, [relationProperty], reordered)?.configIdentity)
    .toBe(resolveTimelineDependencyProperty(databaseId, [relationProperty], config())?.configIdentity)
})

test('confirmation compares canonical unknown values for create and delete', () => {
  expect(isDependencyRelationMutationConfirmed(['other', 'target'], 'target', 'create')).toBe(true)
  expect(isDependencyRelationMutationConfirmed(['other'], 'target', 'create')).toBe(false)
  expect(isDependencyRelationMutationConfirmed(['other'], 'target', 'delete')).toBe(true)
  expect(isDependencyRelationMutationConfirmed(['target'], 'target', 'delete')).toBe(false)
  expect(isDependencyRelationMutationConfirmed(undefined, 'target', 'delete')).toBe(true)
  expect(isDependencyRelationMutationConfirmed(undefined, 'target', 'create')).toBe(false)
  expect(isDependencyRelationMutationConfirmed(null, 'target', 'delete')).toBe(false)
  expect(isDependencyRelationMutationConfirmed(['target', 1], 'target', 'delete')).toBe(false)
})
