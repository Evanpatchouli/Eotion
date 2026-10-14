import { reactive } from 'vue'

/**
 * P11.3C unified Timeline mutation interaction lifecycle.
 *
 * Drag and resize share one state machine. The ledger is the single source of
 * truth for the interaction phase; a monotonically increasing token fences
 * every completion callback, so a stale response can never write UI state.
 *
 * idle
 *   -> previewing   pointer is down and the local ephemeral preview owns the bar
 *   -> pending      one Record Cell PATCH is in flight
 *   -> idle         success / conflict / known failure / reconciled unknown
 *
 * A cancel from `previewing` returns to `idle` without any request.
 * A cancel from `pending` cannot undo the server mutation; it only detaches the
 * UI callback, and the in-flight response still cleans up its own token.
 */
export type TimelineInteractionPhase = 'idle' | 'previewing' | 'pending'

/** Horizontal pointer movement, in CSS pixels, required before a drag is real. */
export const TIMELINE_DRAG_THRESHOLD_PX = 4

export interface TimelineInteractionLedger {
  readonly phase: TimelineInteractionPhase
  readonly token: number
  /** Start a new interaction. Returns null when another interaction owns the ledger. */
  begin(): number | null
  /** Move the current previewing session into an in-flight mutation. */
  beginCommit(): number | null
  /** True when the completion token still belongs to the current interaction. */
  isCurrent(token: number): boolean
  /** Apply an in-flight completion. Returns false for stale or duplicate tokens. */
  complete(token: number): boolean
  /** Abort only the local preview; an in-flight mutation keeps its token. */
  cancelPreview(): void
  /** Abort the whole interaction, invalidating any in-flight callback. */
  cancel(): void
}

export function createTimelineInteractionLedger(): TimelineInteractionLedger {
  let phase: TimelineInteractionPhase = 'idle'
  let token = 0
  let commitToken: number | null = null
  return {
    get phase() { return phase },
    get token() { return token },
    begin() {
      if (phase !== 'idle') return null
      token += 1
      commitToken = null
      phase = 'previewing'
      return token
    },
    beginCommit() {
      if (phase !== 'previewing') return null
      commitToken = token
      phase = 'pending'
      return commitToken
    },
    isCurrent(value) { return value === commitToken },
    complete(value) {
      if (value !== commitToken) return false
      commitToken = null
      phase = 'idle'
      return true
    },
    cancelPreview() {
      if (phase !== 'pending') commitToken = null
      if (phase === 'previewing') phase = 'idle'
    },
    cancel() {
      if (phase === 'previewing') token += 1
      commitToken = null
      phase = 'idle'
    },
  }
}

export type TimelineDateMutationScope = { recordId: string; propertyId: string }

/**
 * View-scoped guard that keeps at most one Timeline Date mutation in flight for
 * the same record + property. The generic Record Cell service already serialises
 * mutations database-wide; this guard is what stops a second pointer release on
 * the same bar from queueing behind the first one with a stale version.
 */
const busyTimelineDateMutations = reactive(new Set<string>())

function timelineMutationKey(scope: TimelineDateMutationScope): string {
  return [scope.recordId, scope.propertyId].join('\u0000')
}

export function isTimelineDateMutationBusy(scope: TimelineDateMutationScope): boolean {
  return busyTimelineDateMutations.has(timelineMutationKey(scope))
}

export function beginTimelineDateMutation(scope: TimelineDateMutationScope): boolean {
  const key = timelineMutationKey(scope)
  if (busyTimelineDateMutations.has(key)) return false
  busyTimelineDateMutations.add(key)
  return true
}

export function endTimelineDateMutation(scope: TimelineDateMutationScope): void {
  busyTimelineDateMutations.delete(timelineMutationKey(scope))
}
