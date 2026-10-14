import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DatabaseDateValue } from '@eotion/domain/date'
import { normalizeDatabaseDateValue } from '@eotion/domain/date'
import { captureTimelineBarFocus, restoreTimelineBarFocus, type TimelineBarFocusReference } from './focus'
import {
  TIMELINE_DRAG_THRESHOLD_PX,
  createTimelineInteractionLedger,
  isTimelineDateMutationBusy,
  type TimelineInteractionPhase,
} from './interaction'
import type { TimelineMoveCommand } from './mutation'
import { offsetTimelineDateValue, resizeTimelineDateValueFromX, temporalOffsetFromX } from './mutation'
import { resolveTimelineTemporalGeometry } from './geometry'
import { layoutTimelineItem, type TimelineItemGeometry } from './layout'
import type { TimelineItemProjection, TimelineTemporalPoint } from './projection'
import type { Transform } from './types'

export type TimelineBarDragSession = Readonly<{
  scope: string
  recordId: string
  propertyId: string
  expectedDatabaseVersion: number
  expectedRecordVersion: number
  originalValue: DatabaseDateValue
  viewIdentityEpoch: number
  viewRoot: HTMLElement | null
}>

/** DOM projection of the interaction phase; `armed`/`dragging` are both previewing. */
export type TimelineBarDragState = 'idle' | 'armed' | 'dragging' | 'saving'

type DragMode = 'move' | 'start' | 'end'

type Options = {
  geometry: () => TimelineItemGeometry
  item: () => TimelineItemProjection
  transform: () => Transform | null
  displayTimeZone: () => string
  scope: () => string
  recordVersion: () => number | undefined
  enabled: () => boolean
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  commitDrag: (command: TimelineMoveCommand) => Promise<boolean>
  isViewportCurrent: (snapshot: Transform) => boolean
  focusContainer?: () => HTMLElement | null
}

type ActiveDrag = {
  mode: DragMode
  pointerId: number
  target: HTMLElement
  startX: number
  startY: number
  transform: Transform
  zone: string
  session: TimelineBarDragSession
  focus: TimelineBarFocusReference
  moved: boolean
}

function shiftedPoint(value: DatabaseDateValue, endpoint: 'start' | 'end'): TimelineTemporalPoint | null {
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized) return null
  if (normalized.kind === 'date-only') {
    const date = endpoint === 'start' ? normalized.start : normalized.end
    return date ? { kind: 'date-only', date } : null
  }
  const instant = endpoint === 'start' ? normalized.start : normalized.end
  return instant ? { kind: 'datetime', instantMs: Date.parse(instant), sourceTimeZone: normalized.timeZone } : null
}

function shiftedItem(item: TimelineItemProjection, value: DatabaseDateValue): TimelineItemProjection | null {
  if (item.kind === 'unscheduled') return null
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized) return null
  const start = shiftedPoint(value, 'start')
  if (!start) return null
  const base = {
    recordId: item.recordId,
    pageId: item.pageId,
    title: item.title,
    dateLabel: item.dateLabel,
    rowIndex: item.rowIndex,
    visibleProperties: item.visibleProperties,
  }
  if (!normalized.end) return { ...base, kind: 'point', start, end: null }
  const end = shiftedPoint(value, 'end')
  return end ? {
    ...base,
    kind: 'range',
    start,
    end,
    precision: normalized.kind,
    explicitZeroDuration: normalized.start === normalized.end,
  } : null
}

/**
 * Normalized equality keeps the wire-shape semantics that matter: an explicit
 * `end` (including an explicit equal end) is never treated as an absent end, so
 * a resize that only re-states the same endpoints stays a no-op.
 */
function normalizedValuesEqual(left: DatabaseDateValue, right: DatabaseDateValue): boolean {
  const normalizedLeft = normalizeDatabaseDateValue(left)
  const normalizedRight = normalizeDatabaseDateValue(right)
  return !!normalizedLeft && !!normalizedRight && JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight)
}

function previewDate(value: DatabaseDateValue | null): string {
  const normalized = value && normalizeDatabaseDateValue(value)
  if (!normalized) return ''
  if (normalized.kind === 'date-only') return normalized.end ? `${normalized.start} – ${normalized.end}` : normalized.start
  const start = normalized.start.replace('T', ' ').replace(/\.000Z$/u, 'Z')
  const end = normalized.end?.replace('T', ' ').replace(/\.000Z$/u, 'Z')
  return end ? `${start} – ${end}` : start
}

export function useTimelineBarDrag(options: Options) {
  const ledger = createTimelineInteractionLedger()
  const previewGeometry = ref<TimelineItemGeometry | null>(null)
  const previewValue = ref<DatabaseDateValue | null>(null)
  const state = ref<TimelineBarDragState>('idle')
  const phase = ref<TimelineInteractionPhase>('idle')
  const active = ref<ActiveDrag | null>(null)
  const pending = ref<{ session: TimelineBarDragSession; mode: DragMode; token: number } | null>(null)
  const activeMode = computed<DragMode | null>(() => active.value?.mode ?? null)
  const pendingMode = computed<DragMode | null>(() => pending.value?.mode ?? null)
  const suppressNextClick = ref(false)
  let previewListeners: AbortController | null = null
  const geometry = computed(() => previewGeometry.value ?? options.geometry())
  const date = computed(() => previewDate(previewValue.value))
  const mutationBusy = computed(() => {
    const session = pending.value?.session
    if (phase.value !== 'pending' || !session) return false
    return isTimelineDateMutationBusy(session)
  })

  function releasePreviewListeners(): void {
    previewListeners?.abort()
    previewListeners = null
  }

  function clearPreviewGeometry(): void {
    previewGeometry.value = null
    previewValue.value = null
  }

  function clearActive(): ActiveDrag | null {
    const current = active.value
    active.value = null
    window.removeEventListener('blur', onWindowBlur)
    releasePreviewListeners()
    if (current) {
      try {
        if (current.target.isConnected && current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId)
      } catch { /* element may have detached or capture may already be gone */ }
    }
    return current
  }

  /**
   * Local preview cancellation (pointercancel, lost capture, blur, viewport or
   * scope change, offline transition). It never invalidates an in-flight
   * mutation: the pending PATCH keeps its token and still owns its cleanup.
   */
  function abortPreview(): void {
    ledger.cancelPreview()
    clearActive()
    if (ledger.phase !== 'pending') {
      clearPreviewGeometry()
      state.value = 'idle'
    }
    phase.value = ledger.phase
  }

  /** Full cancellation (Escape / unmount): detaches any in-flight response too. */
  function cancel(): void {
    const suppressCanceledDragClick = active.value?.moved === true
    ledger.cancel()
    clearActive()
    pending.value = null
    clearPreviewGeometry()
    phase.value = ledger.phase
    state.value = 'idle'
    suppressNextClick.value = suppressCanceledDragClick
  }

  function begin(event: PointerEvent, mode: DragMode = 'move'): void {
    if (active.value || pending.value) return
    suppressNextClick.value = false
    if (!options.enabled() || event.button !== 0 || event.isPrimary === false || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const transform = options.transform()
    if (!transform || !options.isViewportCurrent(transform) || !Number.isFinite(options.recordVersion())) return
    const session = options.prepareDrag(options.item().recordId)
    if (!session || session.scope !== options.scope() || session.expectedRecordVersion !== options.recordVersion()) return
    if (isTimelineDateMutationBusy(session)) return
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    if (ledger.begin() === null) return
    if (mode !== 'move') { event.preventDefault(); event.stopPropagation() }
    active.value = {
      mode,
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      transform: { ...transform },
      zone: options.displayTimeZone(),
      session,
      focus: captureTimelineBarFocus(options.item().recordId),
      moved: false,
    }
    phase.value = ledger.phase
    state.value = 'armed'
    suppressNextClick.value = false
    window.addEventListener('blur', onWindowBlur, { once: true })
    const listeners = new AbortController()
    previewListeners = listeners
    window.addEventListener('keydown', onPreviewKeydown, { signal: listeners.signal })
    document.addEventListener('visibilitychange', onVisibilityChange, { signal: listeners.signal })
    try { target.setPointerCapture(event.pointerId) } catch { cancel() }
  }

  function updatePreview(value: DatabaseDateValue | null, current: ActiveDrag): void {
    const item = value ? shiftedItem(options.item(), value) : null
    const temporal = item ? resolveTimelineTemporalGeometry([item], current.zone).get(item.recordId) : undefined
    previewValue.value = value
    previewGeometry.value = item && temporal
      ? layoutTimelineItem(item as Exclude<TimelineItemProjection, { kind: 'unscheduled' }>, temporal, item.rowIndex, current.transform)
      : null
  }

  function move(event: PointerEvent): void {
    const current = active.value
    if (!current || event.pointerId !== current.pointerId) return
    if (!options.isViewportCurrent(current.transform)) { cancel(); return }
    const deltaX = event.clientX - current.startX
    const deltaY = event.clientY - current.startY
    if (state.value === 'armed' && Math.hypot(deltaX, deltaY) < TIMELINE_DRAG_THRESHOLD_PX) return
    if (Math.abs(deltaY) > Math.abs(deltaX) && state.value === 'armed') { cancel(); return }
    event.preventDefault()
    current.moved = true
    state.value = 'dragging'
    const value = computeValue(current, deltaX)
    updatePreview(value, current)
  }

  function computeValue(current: ActiveDrag, deltaX: number): DatabaseDateValue | null {
    if (current.mode === 'move') {
      const offset = temporalOffsetFromX(current.session.originalValue, deltaX, current.transform, current.zone)
      return offset ? offsetTimelineDateValue(current.session.originalValue, offset) : null
    }
    return resizeTimelineDateValueFromX(current.session.originalValue, current.mode, deltaX, current.transform, current.zone)
  }

  /** End an interaction that never produced a request and return the machine to idle. */
  function settleWithoutCommit(mode: DragMode): void {
    // A resize handle is a control, not a Record open affordance: releasing it
    // without a commit must never fall through to the bar click handler.
    suppressNextClick.value = mode !== 'move'
    ledger.cancelPreview()
    clearPreviewGeometry()
    phase.value = ledger.phase
    state.value = 'idle'
  }

  async function finish(event: PointerEvent): Promise<void> {
    const current = active.value
    if (!current || event.pointerId !== current.pointerId) return
    if (!options.isViewportCurrent(current.transform)) { cancel(); return }
    const deltaX = event.clientX - current.startX
    const deltaY = event.clientY - current.startY
    const didMove = current.moved || Math.abs(deltaX) >= TIMELINE_DRAG_THRESHOLD_PX && Math.abs(deltaX) >= Math.abs(deltaY)
    const value = didMove ? computeValue(current, deltaX) : null
    if (!didMove) {
      settleWithoutCommit(current.mode)
      clearActive()
      return
    }
    suppressNextClick.value = true
    clearActive()
    if (!value || normalizedValuesEqual(current.session.originalValue, value)) {
      // No-op drag/resize: snap back to the canonical geometry without any PATCH.
      suppressNextClick.value = current.mode !== 'move'
      clearPreviewGeometry()
      ledger.cancelPreview()
      phase.value = ledger.phase
      state.value = 'idle'
      return
    }
    // The pending fence is registered and released by the mutation adapter that
    // owns the in-flight request; the controller only owns the interaction phase.
    const token = ledger.beginCommit()
    if (token === null) {
      suppressNextClick.value = current.mode !== 'move'
      clearPreviewGeometry()
      ledger.cancelPreview()
      phase.value = ledger.phase
      state.value = 'idle'
      return
    }
    updatePreview(value, current)
    pending.value = { session: current.session, mode: current.mode, token }
    phase.value = ledger.phase
    state.value = 'saving'
    try {
      const succeeded = await options.commitDrag({ ...current.session, value })
      if (ledger.isCurrent(token)) {
        if (!succeeded) clearPreviewGeometry()
        restoreTimelineBarFocus(current.focus)
      }
    } catch {
      if (ledger.isCurrent(token)) clearPreviewGeometry()
    } finally {
      const settled = ledger.complete(token)
      if (pending.value?.token === token) pending.value = null
      if (settled) {
        clearPreviewGeometry()
        phase.value = ledger.phase
        state.value = 'idle'
      }
    }
  }

  function click(event: MouseEvent): boolean {
    if (!suppressNextClick.value) return false
    event.preventDefault()
    event.stopPropagation()
    suppressNextClick.value = false
    return true
  }

  function onPreviewKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !active.value) return
    event.preventDefault()
    cancel()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && phase.value !== 'idle') { event.preventDefault(); cancel(); return }
    if (event.key === 'Enter' || event.key === ' ') suppressNextClick.value = false
  }

  function onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && active.value) abortPreview()
  }

  function onWindowBlur(): void { if (active.value) abortPreview() }

  /** A lost capture can only cancel a local preview; a pending PATCH keeps its token. */
  function onLostPointerCapture(event: PointerEvent): void {
    if (active.value?.pointerId === event.pointerId) abortPreview()
  }

  watch(
    [options.scope, options.recordVersion, options.transform, options.enabled],
    ([scope, version, transform, enabled], [oldScope, oldVersion, oldTransform, oldEnabled]) => {
      const activeSession = active.value?.session ?? pending.value?.session
      const contextChanged = activeSession && (scope !== activeSession.scope || version !== activeSession.expectedRecordVersion || !transform)
      if (contextChanged || active.value && !enabled) abortPreview()
      else if (!active.value && !pending.value && (scope !== oldScope || version !== oldVersion || !transform || !oldTransform || transform.generation !== oldTransform.generation || transform.scrollLeft !== oldTransform.scrollLeft || transform.scale !== oldTransform.scale || enabled !== oldEnabled)) {
        clearPreviewGeometry()
        phase.value = ledger.phase
        state.value = 'idle'
      }
    },
    { flush: 'sync' },
  )

  onBeforeUnmount(() => {
    cancel()
    suppressNextClick.value = false
    window.removeEventListener('blur', onWindowBlur)
    releasePreviewListeners()
  })

  return {
    geometry,
    previewDate: date,
    state,
    phase,
    mutationBusy,
    activeMode,
    pendingMode,
    begin,
    move,
    finish,
    cancel,
    click,
    onKeydown,
    onLostPointerCapture,
  }
}
