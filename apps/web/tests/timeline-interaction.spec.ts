import { expect, test } from '@playwright/test'
import {
  TIMELINE_DRAG_THRESHOLD_PX,
  beginTimelineDateMutation,
  createTimelineInteractionLedger,
  endTimelineDateMutation,
  isTimelineDateMutationBusy,
} from '../src/components/editor/timeline/interaction'

test('interaction ledger starts idle and only one interaction can own it', () => {
  const ledger = createTimelineInteractionLedger()
  expect(ledger.phase).toBe('idle')
  expect(ledger.token).toBe(0)
  expect(ledger.begin()).toBe(1)
  expect(ledger.phase).toBe('previewing')
  expect(ledger.begin()).toBeNull()
  expect(ledger.phase).toBe('previewing')
  expect(ledger.beginCommit()).toBe(1)
  expect(ledger.phase).toBe('pending')
  expect(ledger.beginCommit()).toBeNull()
  expect(ledger.begin()).toBeNull()
  expect(ledger.complete(1)).toBe(true)
  expect(ledger.phase).toBe('idle')
  expect(ledger.begin()).toBe(2)
})

test('pending completion is fenced: a stale or duplicate token can never settle the interaction', () => {
  const ledger = createTimelineInteractionLedger()
  ledger.begin()
  const token = ledger.beginCommit()
  expect(token).toBe(1)
  expect(ledger.isCurrent(1)).toBe(true)
  expect(ledger.isCurrent(0)).toBe(false)
  expect(ledger.complete(0)).toBe(false)
  expect(ledger.phase).toBe('pending')
  expect(ledger.isCurrent(1)).toBe(true)
  expect(ledger.complete(1)).toBe(true)
  expect(ledger.complete(1)).toBe(false)
  expect(ledger.phase).toBe('idle')
  expect(ledger.isCurrent(1)).toBe(false)
})

test('cancelPreview clears a local preview without invalidating an in-flight mutation', () => {
  const preview = createTimelineInteractionLedger()
  preview.begin()
  preview.cancelPreview()
  expect(preview.phase).toBe('idle')
  expect(preview.begin()).toBe(2)

  const pending = createTimelineInteractionLedger()
  const token = pending.begin()!
  expect(pending.beginCommit()).toBe(token)
  pending.cancelPreview()
  expect(pending.phase).toBe('pending')
  expect(pending.isCurrent(token)).toBe(true)
  expect(pending.complete(token)).toBe(true)
})

test('cancel invalidates a pending callback and resets the machine', () => {
  const ledger = createTimelineInteractionLedger()
  const token = ledger.begin()!
  ledger.beginCommit()
  ledger.cancel()
  expect(ledger.phase).toBe('idle')
  expect(ledger.isCurrent(token)).toBe(false)
  expect(ledger.complete(token)).toBe(false)
  expect(ledger.phase).toBe('idle')
  expect(ledger.begin()).toBe(token + 1)
})

test('cancel from previewing advances the token so the old session can never resume', () => {
  const ledger = createTimelineInteractionLedger()
  const first = ledger.begin()!
  ledger.cancel()
  expect(ledger.phase).toBe('idle')
  const second = ledger.begin()!
  expect(second).toBeGreaterThan(first)
  expect(ledger.beginCommit()).toBe(second)
  expect(ledger.isCurrent(first)).toBe(false)
})

test('drag threshold is a single shared interaction constant', () => {
  expect(TIMELINE_DRAG_THRESHOLD_PX).toBe(4)
})

test('same record + property busy fence serialises Timeline Date mutations', () => {
  const scope = { recordId: 'record-a', propertyId: 'date-a' }
  expect(isTimelineDateMutationBusy(scope)).toBe(false)
  expect(beginTimelineDateMutation(scope)).toBe(true)
  expect(isTimelineDateMutationBusy(scope)).toBe(true)
  expect(beginTimelineDateMutation({ ...scope })).toBe(false)
  endTimelineDateMutation(scope)
  expect(isTimelineDateMutationBusy(scope)).toBe(false)
  expect(beginTimelineDateMutation(scope)).toBe(true)
  endTimelineDateMutation(scope)
})

test('busy fence keeps other records, other properties, and end-of-flight cleanup independent', () => {
  const held = { recordId: 'record-b', propertyId: 'date-b' }
  expect(beginTimelineDateMutation(held)).toBe(true)
  expect(isTimelineDateMutationBusy({ recordId: 'record-c', propertyId: 'date-b' })).toBe(false)
  expect(isTimelineDateMutationBusy({ recordId: 'record-b', propertyId: 'date-c' })).toBe(false)
  expect(beginTimelineDateMutation({ recordId: 'record-c', propertyId: 'date-b' })).toBe(true)
  endTimelineDateMutation(held)
  expect(isTimelineDateMutationBusy(held)).toBe(false)
  endTimelineDateMutation({ recordId: 'record-c', propertyId: 'date-b' })
  expect(isTimelineDateMutationBusy({ recordId: 'record-c', propertyId: 'date-b' })).toBe(false)
})

test('busy fence is idempotent for unknown cleanup and does not leak across a full lifecycle', () => {
  endTimelineDateMutation({ recordId: 'never-started', propertyId: 'date' })
  const scope = { recordId: 'record-d', propertyId: 'date-d' }
  const ledger = createTimelineInteractionLedger()
  ledger.begin()
  const token = ledger.beginCommit()!
  expect(beginTimelineDateMutation(scope)).toBe(true)
  expect(beginTimelineDateMutation(scope)).toBe(false)
  endTimelineDateMutation(scope)
  expect(ledger.complete(token)).toBe(true)
  expect(isTimelineDateMutationBusy(scope)).toBe(false)
})
