import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DatabaseDateValue } from '@eotion/domain/date'
import { normalizeDatabaseDateValue } from '@eotion/domain/date'
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
}

type ActiveDrag = {
  pointerId: number
  target: HTMLElement
  mode: 'move' | 'start' | 'end'
  startX: number
  startY: number
  transform: Transform
  zone: string
  session: TimelineBarDragSession
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
  const previewGeometry = ref<TimelineItemGeometry | null>(null)
  const previewValue = ref<DatabaseDateValue | null>(null)
  const state = ref<'idle' | 'armed' | 'dragging' | 'saving'>('idle')
  const active = ref<ActiveDrag | null>(null)
  const activeMode = computed(() => active.value?.mode ?? null)
  const pending = ref<{ session: TimelineBarDragSession; transform: Transform } | null>(null)
  const suppressNextClick = ref(false)
  let epoch = 0
  const geometry = computed(() => previewGeometry.value ?? options.geometry())
  const date = computed(() => previewDate(previewValue.value))

  function clearActive(): ActiveDrag | null {
    const current = active.value
    active.value = null
    window.removeEventListener('blur', onWindowBlur)
    if (current) {
      try { if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId) } catch { /* element may have detached */ }
    }
    state.value = 'idle'
    return current
  }

  function cancel(): void {
    const preserveReleaseClick = pending.value !== null
    const suppressCanceledDragClick = active.value?.moved === true
    epoch += 1
    clearActive()
    pending.value = null
    previewGeometry.value = null
    previewValue.value = null
    if (suppressCanceledDragClick) suppressNextClick.value = true
    else if (!preserveReleaseClick) suppressNextClick.value = false
  }

  function begin(event: PointerEvent, mode: 'move' | 'start' | 'end' = 'move'): void {
    if (active.value || pending.value) return
    suppressNextClick.value = false
    if (!options.enabled() || event.button !== 0 || event.isPrimary === false || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const transform = options.transform()
    if (!transform || !options.isViewportCurrent(transform) || !Number.isFinite(options.recordVersion())) return
    const session = options.prepareDrag(options.item().recordId)
    if (!session || session.scope !== options.scope() || session.expectedRecordVersion !== options.recordVersion()) return
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    if (mode !== 'move') { event.preventDefault(); event.stopPropagation() }
    epoch += 1
    active.value = {
      pointerId: event.pointerId,
      target,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      transform: { ...transform },
      zone: options.displayTimeZone(),
      session,
      moved: false,
    }
    state.value = 'armed'
    window.addEventListener('blur', onWindowBlur, { once: true })
    try { target.setPointerCapture(event.pointerId) } catch { clearActive() }
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
    if (state.value === 'armed' && Math.hypot(deltaX, deltaY) < 4) return
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

  async function finish(event: PointerEvent): Promise<void> {
    const current = active.value
    if (!current || event.pointerId !== current.pointerId) return
    if (!options.isViewportCurrent(current.transform)) { cancel(); return }
    const deltaX = event.clientX - current.startX
    const didMove = current.moved || Math.abs(deltaX) >= 4 && Math.abs(deltaX) >= Math.abs(event.clientY - current.startY)
    const value = didMove ? computeValue(current, deltaX) : null
    clearActive()
    if (!didMove) return
    suppressNextClick.value = true
    if (!value || normalizedValuesEqual(current.session.originalValue, value)) {
      previewGeometry.value = null
      previewValue.value = null
      return
    }
    updatePreview(value, current)
    const token = epoch
    pending.value = { session: current.session, transform: current.transform }
    state.value = 'saving'
    previewValue.value = value
    try {
      const succeeded = await options.commitDrag({ ...current.session, value })
      if (token !== epoch) return
      if (!succeeded) {
        previewGeometry.value = null
        previewValue.value = null
      }
    } catch {
      if (token === epoch) { previewGeometry.value = null; previewValue.value = null }
    } finally {
      if (token === epoch) {
        previewGeometry.value = null
        previewValue.value = null
        pending.value = null
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

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (active.value || pending.value)) { event.preventDefault(); cancel(); return }
    if (event.key === 'Enter' || event.key === ' ') suppressNextClick.value = false
  }
  function onWindowBlur(): void { if (active.value) cancel() }
  function onLostPointerCapture(event: PointerEvent): void { if (active.value?.pointerId === event.pointerId) cancel() }

  watch(
    [options.scope, options.recordVersion, options.transform, options.enabled],
    ([scope, version, transform, enabled], [oldScope, oldVersion, oldTransform, oldEnabled]) => {
      const activeTransform = active.value?.transform ?? pending.value?.transform
      const activeSession = active.value?.session ?? pending.value?.session
      const contextChanged = activeSession && (scope !== activeSession.scope || version !== activeSession.expectedRecordVersion || !transform || !activeTransform || transform.generation !== activeTransform.generation || transform.scrollLeft !== activeTransform.scrollLeft || transform.scale !== activeTransform.scale)
      if (contextChanged || active.value && !enabled) cancel()
      else if (!active.value && !pending.value && (scope !== oldScope || version !== oldVersion || !transform || !oldTransform || transform.generation !== oldTransform.generation || transform.scrollLeft !== oldTransform.scrollLeft || transform.scale !== oldTransform.scale || enabled !== oldEnabled)) {
        previewGeometry.value = null
        previewValue.value = null
      }
    },
    { flush: 'sync' },
  )

  onBeforeUnmount(() => { cancel(); suppressNextClick.value = false; window.removeEventListener('blur', onWindowBlur) })

  return { geometry, previewDate: date, state, activeMode, begin, move, finish, cancel, click, onKeydown, onLostPointerCapture }
}
