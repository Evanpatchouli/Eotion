import { expect, test } from '@playwright/test'
import type { DatabaseViewConfig } from '@eotion/domain/database'
import { timelineDateSourceIdentity } from '../src/components/editor/timeline/mutation'
import { timelineDependencyConfigIdentity } from '../src/components/editor/timeline/dependencyMutation'

test('Timeline Date source capture fingerprints its complete configuration', () => {
  const source = { mode: 'date-property', propertyId: 'date', displayTimeZone: 'Europe/Paris' }
  expect(timelineDateSourceIdentity(source)).toBe(JSON.stringify(source))
  expect(timelineDateSourceIdentity({ ...source, displayTimeZone: 'UTC' })).not.toBe(timelineDateSourceIdentity(source))
  expect(timelineDateSourceIdentity(null)).toBeNull()
})

test('Timeline dependency capture fingerprints every scheduling option', () => {
  const config = (shiftMode: string, avoidWeekends: boolean): DatabaseViewConfig => ({
    options: { timeline: { dependency: { propertyId: 'depends', direction: 'depends-on', shiftMode, avoidWeekends } } },
  } as unknown as DatabaseViewConfig)
  const identity = timelineDependencyConfigIdentity(config('shift_when_overlapping', false))
  expect(identity).toBeTruthy()
  expect(timelineDependencyConfigIdentity(config('shift_and_keep_gap', false))).not.toBe(identity)
  expect(timelineDependencyConfigIdentity(config('shift_when_overlapping', true))).not.toBe(identity)
})
