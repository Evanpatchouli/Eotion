<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseTimelineViewOptions, DatabaseViewConfig } from '@eotion/domain/database'
import type { TimelineBarDragSession } from './timeline/useTimelineBarDrag'
import type { TimelineMoveCommand, TimelineScheduleCapture, TimelineScheduleCommand } from './timeline/mutation'
import { normalizeDatabaseDateValue } from '@eotion/domain/date'
import { resolveTimelineDependencyProperty, type TimelineDependencyCapture, type TimelineDependencyCommand } from './timeline/dependencyMutation'
import { isDraggableTimelineDateSource, isWritableTimelineDateSource } from './timeline/mutation'
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

import { IconName } from '../ui/icons'
import EotionIcon from '../ui/EotionIcon.vue'
import TimelineHeader from './timeline/TimelineHeader.vue'
import TimelineViewport from './timeline/TimelineViewport.vue'
import FrozenTablePane from './timeline/FrozenTablePane.vue'
import { projectFrozenTableDisplay, resolveFrozenTableProperties } from './timeline/frozenTable'
import { layoutTimelineItem, layoutTimelineItems, TIMELINE_HEADER_HEIGHT, type TimelineItemGeometry } from './timeline/layout'
import { projectTimelineRecords } from './timeline/projection'
import { resolveTimelineTemporalGeometry } from './timeline/geometry'
import { viewportTransform } from './timeline/viewport'
import { useTimelineViewport } from './timeline/useTimelineViewport'
import { timelineInstantBounds } from './timeline/coordinates'
import { projectTimelineDependencies, selectTimelineDependencyEdges } from './timeline/dependency'
import { scheduleDropToDateValue, type ScheduleDropValue } from './timeline/scheduleDrop'
import type { Transform } from './timeline/types'

type TimelineRecord = DatabaseViewRecordsResponse['records'][number]

const props = defineProps<{
  databaseId: string
  scope: string
  config: DatabaseViewConfig
  records: readonly TimelineRecord[]
  properties: readonly DatabasePropertyResponse[]
  formatValue: (value: unknown, property: DatabasePropertyResponse) => string
  selectedPageId: string | null
  writable: boolean
  viewBusy: boolean
  databaseVersion: number
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  prepareSchedule: (recordId: string) => TimelineScheduleCapture | null
  moveRecord: (command: TimelineMoveCommand | TimelineScheduleCommand) => Promise<boolean>
  captureDependency: () => TimelineDependencyCapture | null
  mutateDependency: (command: TimelineDependencyCommand) => Promise<boolean>
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
  visibleRecords: [scope: string, recordIds: readonly string[]]
  toggleFrozenTable: [visible: boolean]
}>()

const recordsExpanded = ref(false)
const scheduleForm = shallowRef<{ capture: TimelineScheduleCapture; title: string; trigger: HTMLElement; root: HTMLElement; error: string } | null>(null)
const scheduleDate = ref('')
type ScheduleGesture = { pointerId: number; startX: number; startY: number; capture: TimelineScheduleCapture; transform: Transform; scroller: HTMLElement; root: HTMLElement; handle: HTMLElement; previewing: boolean }
const schedulePreview = shallowRef<{ x: number; top: number; height: number; value: ScheduleDropValue } | null>(null)
let scheduleGesture: ScheduleGesture | null = null
function clearScheduleGesture(): void {
  const gesture = scheduleGesture
  scheduleGesture = null
  schedulePreview.value = null
  if (!gesture) return
  window.removeEventListener('pointermove', moveSchedulePointer, true)
  window.removeEventListener('pointerup', releaseSchedulePointer, true)
  window.removeEventListener('pointercancel', cancelSchedulePointer, true)
  window.removeEventListener('keydown', cancelScheduleKey, true)
  window.removeEventListener('blur', clearScheduleGesture)
  document.removeEventListener('visibilitychange', cancelScheduleVisibility)
  gesture.scroller.removeEventListener('scroll', clearScheduleGesture)
  gesture.handle.removeEventListener('lostpointercapture', cancelSchedulePointer)
  try { if (gesture.handle.hasPointerCapture(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId) }
  catch { /* Detached handles have already lost capture. */ }
}
function cancelSchedulePointer(event: PointerEvent): void { if (event.pointerId === scheduleGesture?.pointerId) clearScheduleGesture() }
function cancelScheduleKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !scheduleGesture) return
  event.preventDefault()
  event.stopPropagation()
  clearScheduleGesture()
}
function cancelScheduleVisibility(): void { if (document.hidden) clearScheduleGesture() }
function scheduleTarget(event: PointerEvent, gesture: ScheduleGesture): { x: number; top: number; height: number; value: ScheduleDropValue } | null {
  const area = gesture.scroller.getBoundingClientRect()
  const grid = gesture.scroller.querySelector<HTMLElement>('[data-testid="timeline-canvas-body"]')
  const bodyRect = grid?.getBoundingClientRect()
  const visibleTop = Math.max(area.top, bodyRect?.top ?? Infinity)
  const visibleBottom = Math.min(area.top + gesture.scroller.clientHeight, bodyRect?.bottom ?? -Infinity)
  if (!bodyRect || event.clientY < visibleTop || event.clientY >= visibleBottom) return null
  const value = scheduleDropToDateValue({ clientX: event.clientX, viewportLeft: area.left, viewportWidth: gesture.scroller.clientWidth,
    transform: gesture.transform, displayTimeZone: viewport.displayTimeZone.value })
  return value ? { x: event.clientX, top: visibleTop, height: visibleBottom - visibleTop, value } : null
}
function scheduleGestureCurrent(gesture: ScheduleGesture): boolean {
  return scheduleGesture === gesture && root.value === gesture.root && gesture.root.isConnected && scroller.value === gesture.scroller
    && gesture.handle.isConnected && gesture.root.contains(gesture.handle)
    && props.scope === gesture.capture.scope && props.writable && online.value && !props.viewBusy && !pendingTimelineMutations.size
    && canSchedule(gesture.capture.recordId) && recordsById.value.get(gesture.capture.recordId)?.version === gesture.capture.expectedRecordVersion
    && props.databaseVersion === gesture.capture.expectedDatabaseVersion && isBarViewportCurrent(gesture.transform)
}
function moveSchedulePointer(event: PointerEvent): void {
  const gesture = scheduleGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  if (!scheduleGestureCurrent(gesture)) { clearScheduleGesture(); return }
  if (!gesture.previewing && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 4) return
  gesture.previewing = true
  schedulePreview.value = scheduleTarget(event, gesture)
}
function releaseSchedulePointer(event: PointerEvent): void {
  const gesture = scheduleGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const target = gesture.previewing && scheduleGestureCurrent(gesture) ? scheduleTarget(event, gesture) : null
  clearScheduleGesture()
  if (target) void commitTimelineDrag({ ...gesture.capture, value: target.value, intent: 'drop' })
}
function startSchedulePointer(event: PointerEvent, recordId: string): void {
  if (event.button !== 0 || !event.isPrimary || scheduleGesture || !props.writable || !online.value || props.viewBusy
    || pendingTimelineMutations.size || !canSchedule(recordId)) return
  const handle = event.currentTarget
  const currentRoot = root.value
  const currentScroller = scroller.value
  const transform = barTransform.value
  if (!(handle instanceof HTMLElement) || !currentRoot || !currentScroller || !transform || !isBarViewportCurrent(transform)) return
  const capture = props.prepareSchedule(recordId)
  if (!capture || capture.scope !== props.scope || capture.expectedDatabaseVersion !== props.databaseVersion
    || capture.propertyId !== writablePropertyId.value) return
  event.preventDefault()
  event.stopPropagation()
  scheduleGesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, capture, transform,
    scroller: currentScroller, root: currentRoot, handle, previewing: false }
  try { handle.setPointerCapture(event.pointerId) }
  catch { clearScheduleGesture(); return }
  window.addEventListener('pointermove', moveSchedulePointer, true)
  window.addEventListener('pointerup', releaseSchedulePointer, true)
  window.addEventListener('pointercancel', cancelSchedulePointer, true)
  window.addEventListener('keydown', cancelScheduleKey, true)
  window.addEventListener('blur', clearScheduleGesture)
  document.addEventListener('visibilitychange', cancelScheduleVisibility)
  currentScroller.addEventListener('scroll', clearScheduleGesture)
  handle.addEventListener('lostpointercapture', cancelSchedulePointer)
}
onBeforeUnmount(clearScheduleGesture)
const validScheduleDate = computed(() => Boolean(scheduleDate.value && normalizeDatabaseDateValue(scheduleDate.value)?.kind === 'date-only'))
/**
 * Timeline-local pending fence: the window between pointer release, session
 * validation and the in-flight generic Cell PATCH. The shared Record Cell
 * service serialises database-wide; this map is what keeps the same bar from
 * queueing a second mutation with a stale version and drives the quiet saving
 * affordance without remounting the bar.
 */
const pendingTimelineMutations = reactive(new Map<string, { recordId: string; propertyId: string }>())

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const rulerAnchor = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const focusedRecordId = ref<string | null>(null)
const hoveredRecordId = ref<string | null>(null)
const timelineOptions = computed(() => (props.config.options as DatabaseTimelineViewOptions | undefined)?.timeline)
const configuredScale = computed(() => timelineOptions.value?.scale ?? 'month')
const barDraggable = computed(() => props.writable && isDraggableTimelineDateSource(timelineOptions.value?.dateSource))
const dependencyProperty = computed(() => resolveTimelineDependencyProperty(props.databaseId, props.properties, props.config))
const dependencyEditable = computed(() => props.writable && dependencyProperty.value !== null)
const dependencyConfigKey = computed(() => JSON.stringify([
  props.scope, dependencyProperty.value?.configIdentity, dependencyProperty.value?.propertyVersion,
]))
const online = ref(typeof navigator === 'undefined' || navigator.onLine)
const offscreenNavigationBusy = ref(false)
if (typeof window !== 'undefined') {
  const onOnline = () => { online.value = true }
  const onOffline = () => { online.value = false }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  onBeforeUnmount(() => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) })
}
const barTransform = computed(() => viewport.state.value ? viewportTransform(viewport.state.value) : null)
const recordVersionById = computed(() => new Map(props.records.map(record => [record.id, record.version])))
const recordsById = computed(() => new Map(props.records.map(record => [record.id, record])))
const writablePropertyId = computed(() => {
  const source = timelineOptions.value?.dateSource
  return source?.mode === 'start-end' ? source.startPropertyId : isWritableTimelineDateSource(source) ? source.propertyId : ''
})
watch(() => JSON.stringify([props.scope, props.config]), () => { scheduleForm.value = null }, { flush: 'sync' })
const recordMutationBusyById = computed(() => new Map([...pendingTimelineMutations.values()].map(pending => [pending.recordId, true] as const)))
const frozenColumns = computed(() => resolveFrozenTableProperties(props.properties, props.config))
const frozenTableVisible = computed(() => timelineOptions.value?.frozenTable?.visible === true)
let frozenToggleFocus: { scope: string; root: HTMLElement; visible: boolean; trigger: Element; initialFocus: Element | null; wasBusy: boolean } | null = null
const clearFrozenToggleFocus = () => { frozenToggleFocus = null }
if (typeof document !== 'undefined') {
  const onDocumentPointer = (event: PointerEvent) => {
    if (frozenToggleFocus && event.target !== frozenToggleFocus.trigger) clearFrozenToggleFocus()
  }
  const onDocumentKey = (event: KeyboardEvent) => {
    if (frozenToggleFocus && (event.key === 'Tab' || event.key === 'Escape'
      || event.target === frozenToggleFocus.initialFocus && event.target !== frozenToggleFocus.trigger)) clearFrozenToggleFocus()
  }
  const onDocumentFocus = (event: FocusEvent) => {
    if (frozenToggleFocus && event.target !== frozenToggleFocus.trigger
      && event.target !== frozenToggleFocus.initialFocus && event.target !== document.body) clearFrozenToggleFocus()
  }
  document.addEventListener('pointerdown', onDocumentPointer, true)
  document.addEventListener('keydown', onDocumentKey, true)
  document.addEventListener('focusin', onDocumentFocus, true)
  onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocumentPointer, true); document.removeEventListener('keydown', onDocumentKey, true); document.removeEventListener('focusin', onDocumentFocus, true); clearFrozenToggleFocus() })
}
watch(() => props.scope, clearFrozenToggleFocus, { flush: 'sync' })
watch([frozenTableVisible, () => props.viewBusy], async ([visible, busy]) => {
  const intent = frozenToggleFocus
  if (!intent) return
  if (busy) intent.wasBusy = true
  if (intent.scope !== props.scope || intent.root !== root.value || !intent.root.isConnected) { clearFrozenToggleFocus(); return }
  if (visible === intent.visible && !busy) {
    await nextTick()
    if (frozenToggleFocus !== intent || intent.scope !== props.scope || intent.root !== root.value || !intent.root.isConnected) return
    window.setTimeout(() => {
      if (frozenToggleFocus !== intent || intent.scope !== props.scope || intent.root !== root.value || !intent.root.isConnected) return
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== intent.trigger
        && document.activeElement !== intent.initialFocus) {
        clearFrozenToggleFocus()
        return
      }
      intent.root.querySelector<HTMLButtonElement>('[data-testid="timeline-frozen-toggle"]')?.focus()
      clearFrozenToggleFocus()
    }, 0)
  } else if (!busy && intent.wasBusy) {
    window.setTimeout(() => {
      if (frozenToggleFocus === intent && !props.viewBusy && frozenTableVisible.value !== intent.visible) clearFrozenToggleFocus()
    }, 100)
  }
}, { flush: 'post' })
function toggleFrozenTable(visible: boolean): void {
  const trigger = root.value?.querySelector('[data-testid="timeline-frozen-toggle"]')
  if (trigger && root.value) frozenToggleFocus = { scope: props.scope, root: root.value, visible, trigger, initialFocus: document.activeElement, wasBusy: false }
  emit('toggleFrozenTable', visible)
}
const frozenDisplayMap = computed(() => frozenTableVisible.value
  ? projectFrozenTableDisplay(props.records, frozenColumns.value, props.formatValue)
  : new Map())
const projectedItems = computed(() => projectTimelineRecords({
  records: props.records,
  properties: props.properties,
  config: props.config,
  formatValue: props.formatValue,
}))
const recordTitleById = computed(() => new Map(projectedItems.value.map(item => [item.recordId, item.title])))
const rowIndexByRecordId = computed(() => new Map(projectedItems.value.map(item => [item.recordId, item.rowIndex])))
const focusedRowIndex = computed(() => focusedRecordId.value === null ? null : rowIndexByRecordId.value.get(focusedRecordId.value) ?? null)
const unscheduledItems = computed(() => projectedItems.value.filter(item => item.kind === 'unscheduled'))
watch(() => unscheduledItems.value.length, count => { if (count === 0) recordsExpanded.value = false })
watch(() => props.scope, () => { focusedRecordId.value = null; hoveredRecordId.value = null; recordsExpanded.value = false; scheduleForm.value = null }, { flush: 'sync' })
const viewport = useTimelineViewport({
  root,
  scroller,
  rulerAnchor,
  body,
  scope: () => props.scope,
  configuredScale,
  rowCount: () => projectedItems.value.length,
  focusedRowIndex: () => focusedRowIndex.value,
})
watch([() => props.scope, () => props.config, () => props.writable, () => props.viewBusy, online,
  () => viewport.effectiveScale.value, () => viewport.state.value?.scrollLeft], clearScheduleGesture, { flush: 'sync' })
const temporalMap = computed(() => resolveTimelineTemporalGeometry(projectedItems.value, viewport.displayTimeZone.value))
const dependencyEdges = computed(() => projectTimelineDependencies({
  databaseId: props.databaseId,
  properties: props.properties,
  records: props.records,
  config: props.config,
}))
const dependencyGeometryById = computed(() => {
  if (!dependencyEditable.value && dependencyEdges.value.length === 0) return new Map<string, TimelineItemGeometry>()
  const transform = barTransform.value
  if (!transform) return new Map<string, TimelineItemGeometry>()
  const geometry = new Map<string, TimelineItemGeometry>()
  for (const item of projectedItems.value) {
    if (item.kind === 'unscheduled') continue
    const temporal = temporalMap.value.get(item.recordId)
    if (!temporal) continue
    geometry.set(item.recordId, layoutTimelineItem(item, temporal, item.rowIndex, transform))
  }
  return geometry
})
const windowDependencyEdges = computed(() => selectTimelineDependencyEdges(
  dependencyEdges.value,
  dependencyGeometryById.value,
  viewport.rowWindow.value,
  viewport.canvasWidthPx.value,
))
const rowGeometry = computed(() => {
  const state = viewport.state.value
  if (!state) return []
  return layoutTimelineItems(projectedItems.value, temporalMap.value, viewportTransform(state), viewport.rowWindow.value)
})
watch(
  [() => props.scope, () => rowGeometry.value.map(row => row.item.recordId).join('\u0000')],
  ([scope]) => emit('visibleRecords', scope, rowGeometry.value.map(row => row.item.recordId)),
  { flush: 'post', immediate: true },
)
const bodyHeight = computed(() => Math.max(240, viewport.rowWindow.value.totalHeight))
watch(rowGeometry, rows => {
  if (hoveredRecordId.value && !rows.some(row => row.item.recordId === hoveredRecordId.value)) hoveredRecordId.value = null
})

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Element && next.closest('[data-timeline-row], [data-timeline-frozen-row]') && root.value?.contains(next)) return
  focusedRecordId.value = null
}

function focusRow(rowIndex: number): void {
  focusedRecordId.value = projectedItems.value[rowIndex]?.recordId ?? null
}

function prepareTimelineDrag(recordId: string): TimelineBarDragSession | null {
  if (!barDraggable.value) return null
  const propertyId = writablePropertyId.value
  if (!propertyId || pendingTimelineMutations.has(recordId)) return null
  const session = props.prepareDrag(recordId)
  return session?.expectedDatabaseVersion === props.databaseVersion && session.propertyId === propertyId ? session : null
}

async function commitTimelineDrag(command: TimelineMoveCommand | TimelineScheduleCommand): Promise<boolean> {
  const captured = { recordId: command.recordId, propertyId: command.propertyId }
  pendingTimelineMutations.set(captured.recordId, captured)
  try {
    return await props.moveRecord(command)
  } finally {
    const pending = pendingTimelineMutations.get(captured.recordId)
    if (pending && pending.propertyId === captured.propertyId) pendingTimelineMutations.delete(captured.recordId)
  }
}

function canSchedule(recordId: string): boolean {
  const source = timelineOptions.value?.dateSource
  if (!isWritableTimelineDateSource(source) || !props.properties.some(property => property.id === source.propertyId && property.type === 'date')) return false
  const record = recordsById.value.get(recordId)
  return Boolean(record && (record.properties[source.propertyId] === null || record.properties[source.propertyId] === undefined))
}

async function openSchedule(event: MouseEvent, recordId: string): Promise<void> {
  const trigger = event.currentTarget
  const currentRoot = root.value
  if (!(trigger instanceof HTMLElement) || !trigger.isConnected || !currentRoot?.contains(trigger)
    || trigger.dataset.recordId !== recordId || trigger.dataset.scope !== props.scope) return
  if (!props.writable || !online.value || pendingTimelineMutations.size || !canSchedule(recordId)) return
  const capture = props.prepareSchedule(recordId)
  if (!capture) return
  const form = { capture, title: recordTitleById.value.get(recordId) || '无标题', trigger, root: currentRoot, error: '' }
  const activeAtOpen = document.activeElement
  scheduleDate.value = ''
  scheduleForm.value = form
  await nextTick()
  if (scheduleForm.value === form && capture.scope === props.scope && root.value === currentRoot && currentRoot.isConnected
    && (document.activeElement === activeAtOpen || document.activeElement === trigger || document.activeElement === document.body)) {
    currentRoot.querySelector<HTMLInputElement>('[data-testid="timeline-schedule-form"] input')?.focus()
  }
}

function cancelSchedule(): void {
  const form = scheduleForm.value
  if (!form || pendingTimelineMutations.size) return
  scheduleForm.value = null
  if (form.capture.scope === props.scope && root.value === form.root && form.trigger.isConnected && form.root.contains(form.trigger)) form.trigger.focus()
}

async function saveSchedule(): Promise<void> {
  const form = scheduleForm.value
  const expectedRoot = root.value
  if (!form || !validScheduleDate.value || !props.writable || !online.value || pendingTimelineMutations.size) return
  const saved = await commitTimelineDrag({ ...form.capture, value: scheduleDate.value, intent: 'form' })
  if (scheduleForm.value !== form || form.capture.scope !== props.scope || root.value !== expectedRoot || !expectedRoot?.isConnected) return
  if (!saved) { scheduleForm.value = { ...form, error: '日期未保存，请检查当前记录或重新加载后再安排。' }; return }
  scheduleForm.value = null
  const temporal = temporalMap.value.get(form.capture.recordId)
  const row = rowIndexByRecordId.value.get(form.capture.recordId)
  if (!temporal || row === undefined) return
  const item = projectedItems.value.find(candidate => candidate.recordId === form.capture.recordId)
  focusedRecordId.value = form.capture.recordId
  await viewport.revealInstant(temporal.startMs, row, () => root.value === expectedRoot && props.scope === form.capture.scope && scheduleForm.value === null
    && rowIndexByRecordId.value.get(form.capture.recordId) === row && temporalMap.value.get(form.capture.recordId) === temporal
    && projectedItems.value[row] === item)
}

function isBarViewportCurrent(snapshot: NonNullable<typeof barTransform.value>): boolean {
  const element = scroller.value
  const current = viewport.state.value
  if (!element?.isConnected || !current) return false
  const transform = viewportTransform(current)
  return Math.abs(element.scrollLeft - snapshot.scrollLeft) <= 0.5
    && Math.abs(element.clientWidth - snapshot.width) <= 0.5
    && Math.abs(transform.scrollLeft - snapshot.scrollLeft) <= 0.5
    && Math.abs(transform.width - snapshot.width) <= 0.5
    && transform.originMs === snapshot.originMs
    && transform.pxPerMs === snapshot.pxPerMs
    && transform.scale === snapshot.scale
    && transform.generation === snapshot.generation
    && transform.displayTimeZone === snapshot.displayTimeZone
    && viewport.effectiveScale.value === snapshot.scale
    && viewport.displayTimeZone.value === snapshot.displayTimeZone
}

function onUnscheduledToggle(event: Event): void {
  const details = event.currentTarget
  if (!(details instanceof HTMLDetailsElement) || !details.isConnected || !root.value?.contains(details)) return
  recordsExpanded.value = details.open
}

async function openUnscheduledItem(event: MouseEvent, item: typeof unscheduledItems.value[number]): Promise<void> {
  const isSimplePrimary = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  if (!isSimplePrimary) {
    emit('openRecord', event, item.pageId)
    return
  }
  const rowIndex = rowIndexByRecordId.value.get(item.recordId)
  if (rowIndex === undefined) return
  focusedRecordId.value = item.recordId
  const capturedScope = props.scope
  const revealed = await viewport.revealRow(rowIndex)
  if (!revealed || capturedScope !== props.scope || rowIndexByRecordId.value.get(item.recordId) !== rowIndex || !root.value?.isConnected) return
  emit('openRecord', event, item.pageId)
}

async function navigateOffscreen(recordId: string, direction: 'left' | 'right'): Promise<void> {
  if (offscreenNavigationBusy.value || pendingTimelineMutations.size > 0) return
  if (root.value?.querySelector('[data-drag-state="armed"], [data-drag-state="dragging"]')) return
  const row = rowGeometry.value.find(candidate => candidate.item.recordId === recordId)
  const temporal = temporalMap.value.get(recordId)
  const rowIndex = rowIndexByRecordId.value.get(recordId)
  const expectedScope = props.scope
  const expectedRoot = root.value
  if (!row || row.item.kind === 'unscheduled' || !row.geometry || !temporal || rowIndex === undefined) return
  const canGoLeft = row.geometry.offscreen === 'left' || row.geometry.clippedLeft
  const canGoRight = row.geometry.offscreen === 'right' || row.geometry.clippedRight
  if (direction === 'left' ? !canGoLeft : !canGoRight) return
  const requestedInstant = direction === 'left' ? temporal.startMs : temporal.visualEndMs ?? temporal.startMs
  const bounds = timelineInstantBounds(viewport.displayTimeZone.value)
  if (!Number.isFinite(requestedInstant) || requestedInstant < bounds.minMs || requestedInstant > bounds.maxMsExclusive) return
  const instantMs = Math.min(bounds.maxMsExclusive - 1, Math.max(bounds.minMs, requestedInstant))
  const expectedTemporal = temporal
  const expectedItem = row.item
  const isTargetCurrent = () => {
    const currentRow = rowGeometry.value.find(candidate => candidate.item.recordId === recordId)
    return pendingTimelineMutations.size === 0
      && props.scope === expectedScope && root.value === expectedRoot && expectedRoot?.isConnected === true
      && rowIndexByRecordId.value.get(recordId) === rowIndex && currentRow?.item === expectedItem
      && temporalMap.value.get(recordId) === expectedTemporal
  }
  if (!isTargetCurrent()) return
  offscreenNavigationBusy.value = true
  try {
    focusedRecordId.value = recordId
    const currentDuringNavigation = () => offscreenNavigationBusy.value && isTargetCurrent()
    const revealed = await viewport.revealInstant(instantMs, rowIndex, currentDuringNavigation)
    if (!revealed || !isTargetCurrent()) return
  } finally {
    offscreenNavigationBusy.value = false
  }
}
</script>

<template>
  <section
    ref="root"
    class="eotion-database-timeline"
    :style="{ '--timeline-header-height': `${TIMELINE_HEADER_HEIGHT}px` }"
    data-testid="database-timeline"
    :data-scale="viewport.effectiveScale.value"
    :data-configured-scale="configuredScale"
    :data-today-ms="viewport.todayMs.value"
    @pointerdown.stop
    @focusout="onFocusOut"
  >
    <TimelineHeader
      :scale="viewport.effectiveScale.value"
      :period-label="viewport.periodLabel.value"
      @previous="viewport.previous"
      @today="viewport.today"
      @next="viewport.next"
      @select-scale="viewport.selectScale"
    />
    <div class="eotion-timeline-content" data-testid="timeline-content">
      <FrozenTablePane
        v-if="frozenTableVisible"
        :columns="frozenColumns"
        :display-map="frozenDisplayMap"
        :rows="rowGeometry"
        :body-height="bodyHeight"
        :pin-y="viewport.pinY.value"
        :selected-page-id="selectedPageId"
        :hovered-record-id="hoveredRecordId"
        :toggle-disabled="viewBusy || !writable"
        @open-record="(event, pageId) => emit('openRecord', event, pageId)"
        @hover-record="hoveredRecordId = $event"
        @focus-row="focusRow"
        @toggle-visibility="toggleFrozenTable(false)"
      />
      <button
        v-if="!frozenTableVisible"
        class="eotion-timeline-frozen-toggle eotion-timeline-frozen-toggle--expand"
        type="button"
        data-testid="timeline-frozen-toggle"
        aria-label="展开左侧记录表格"
        aria-expanded="false"
        title="展开左侧记录表格"
        :disabled="viewBusy || !writable"
        @click="toggleFrozenTable(true)"
      ><EotionIcon :name="IconName.SidebarOpen" :size="18" aria-hidden="true" /></button>
      <TimelineViewport
        :state="viewport.state.value"
        :ruler-ticks="viewport.rulerTicks.value"
        :grid-ticks="viewport.ticks.value"
        :today-x="viewport.todayX.value"
        :pin-y="viewport.pinY.value"
        :canvas-width-px="viewport.canvasWidthPx.value"
        :body-height="bodyHeight"
        :row-window="viewport.rowWindow.value"
        :rows="rowGeometry"
        :dependency-edges="dependencyEdges"
        :window-dependency-edges="windowDependencyEdges"
        :dependency-geometry-by-id="dependencyGeometryById"
        :selected-page-id="selectedPageId"
        :hovered-record-id="hoveredRecordId"
        :scope="scope"
        :transform="barTransform"
        :display-time-zone="viewport.displayTimeZone.value"
        :draggable="barDraggable"
        :dependency-editable="dependencyEditable"
        :dependency-config-key="dependencyConfigKey"
        :record-title-by-id="recordTitleById"
        :online="online"
        :capture-dependency="captureDependency"
        :mutate-dependency="mutateDependency"
        :record-version-by-id="recordVersionById"
        :record-mutation-busy-by-id="recordMutationBusyById"
        :prepare-drag="prepareTimelineDrag"
        :commit-drag="commitTimelineDrag"
        :is-viewport-current="isBarViewportCurrent"
        @navigate-offscreen="navigateOffscreen"
        @scroller-ref="viewport.bindScroller"
        @ruler-ref="viewport.bindRulerAnchor"
        @body-ref="viewport.bindBody"
        @open-record="(event, pageId) => emit('openRecord', event, pageId)"
        @focus-row="focusRow"
        @hover-record="hoveredRecordId = $event"
      />
    </div>
    <p v-if="records.length === 0" class="eotion-database-timeline-empty">暂无记录</p>
    <details v-if="unscheduledItems.length > 0" :key="scope" class="eotion-database-timeline-records" @toggle="onUnscheduledToggle">
      <summary>未排期（{{ unscheduledItems.length }}）</summary>
      <ul v-if="recordsExpanded">
        <li v-for="item in unscheduledItems" :key="item.recordId">
          <button
            class="eotion-database-timeline-record-link"
            type="button"
            :data-record-id="item.recordId"
            :aria-label="`打开记录：${item.title || item.recordId}`"
            @click="openUnscheduledItem($event, item)"
          >
            <span>{{ item.title || '无标题' }}</span>
            <EotionIcon :name="IconName.ChevronRight" :size="16" aria-hidden="true" />
          </button>
          <button v-if="canSchedule(item.recordId)" type="button" class="eotion-timeline-schedule-action"
            :data-record-id="item.recordId" :data-scope="scope"
            :aria-label="`安排：${item.title || item.recordId}`" :disabled="!writable || !online || pendingTimelineMutations.size > 0"
            @click="openSchedule($event, item.recordId)">安排</button>
          <button v-if="canSchedule(item.recordId)" type="button" class="eotion-timeline-schedule-handle"
            data-testid="timeline-schedule-drag" :data-record-id="item.recordId" :aria-label="`拖动安排：${item.title || item.recordId}`"
            :disabled="!writable || !online || viewBusy || pendingTimelineMutations.size > 0"
            @pointerdown="startSchedulePointer($event, item.recordId)" @click.stop.prevent>拖动到时间轴</button>
          <form v-if="scheduleForm?.capture.recordId === item.recordId" class="eotion-timeline-schedule-form" data-testid="timeline-schedule-form" @submit.prevent="saveSchedule" @keydown.esc.stop.prevent="cancelSchedule">
            <span>安排：{{ scheduleForm.title }}</span>
            <p v-if="scheduleForm.error" role="status">{{ scheduleForm.error }}</p>
            <label>安排日期<input v-model="scheduleDate" type="date" aria-label="安排日期" required
              :disabled="!writable || !online || pendingTimelineMutations.size > 0" /></label>
            <button type="submit" :disabled="!validScheduleDate || !writable || !online || pendingTimelineMutations.size > 0">保存</button>
            <button type="button" :disabled="pendingTimelineMutations.size > 0" @click="cancelSchedule">取消</button>
          </form>
        </li>
      </ul>
    </details>
    <div v-if="schedulePreview" class="eotion-timeline-schedule-target" data-testid="timeline-schedule-target"
      :style="{ left: `${schedulePreview.x}px`, top: `${schedulePreview.top}px`, height: `${schedulePreview.height}px` }" aria-hidden="true">
      <span>{{ typeof schedulePreview.value === 'string' ? schedulePreview.value : schedulePreview.value.start }} · 松开安排</span>
    </div>
  </section>
</template>

<style scoped>
.eotion-timeline-schedule-form { display:flex; flex:1 0 100%; flex-wrap:wrap; align-items:end; gap:8px; padding:12px; width:100%; max-width:100%; box-sizing:border-box; }
.eotion-timeline-schedule-form > span { flex-basis:100%; }
.eotion-timeline-schedule-form label { display:flex; flex-direction:column; gap:4px; min-width:0; max-width:100%; }
.eotion-timeline-schedule-form input { min-width:0; max-width:100%; box-sizing:border-box; min-height:44px; }
.eotion-timeline-schedule-form button, .eotion-timeline-schedule-action { min-height:44px; padding:6px 12px; }
.eotion-timeline-schedule-handle { min-height:44px; padding:6px 12px; border:1px dashed var(--e-color-border, var(--border-editor)); border-radius:6px; background:transparent; color:var(--e-color-accent, var(--editor-accent)); cursor:grab; touch-action:none; }
.eotion-timeline-schedule-handle:disabled { opacity:.5; cursor:not-allowed; }
.eotion-timeline-schedule-target { position:fixed; z-index:100; width:2px; background:var(--e-color-accent, var(--editor-accent)); pointer-events:none; }
.eotion-timeline-schedule-target span { position:absolute; top:4px; left:8px; white-space:nowrap; padding:4px 7px; border-radius:4px; background:var(--e-color-canvas, var(--editor-canvas)); color:var(--e-color-text-primary, var(--editor-text)); box-shadow:0 1px 5px #0003; }
.eotion-database-timeline {
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: clip;
  container: eotion-timeline-root / inline-size;
  color: var(--e-color-text-primary, var(--editor-text));
}
.eotion-timeline-content { position:relative; display:flex; width:100%; min-width:0; max-width:100%; align-items:stretch; overflow:clip; }
.eotion-timeline-frozen-toggle { position:absolute; z-index:5; display:inline-flex; width:36px; height:36px; align-items:center; justify-content:center; border:1px solid var(--e-color-border, var(--border-editor)); border-radius:var(--e-radius-control, 6px); padding:0; background:var(--e-color-canvas, var(--editor-canvas)); color:var(--e-color-text-secondary, var(--editor-muted)); cursor:pointer; }
.eotion-timeline-frozen-toggle:hover:not(:disabled) { background:var(--e-color-hover, var(--editor-hover)); color:var(--e-color-text-primary, var(--editor-text)); }
.eotion-timeline-frozen-toggle:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:2px; }
.eotion-timeline-frozen-toggle:disabled { cursor:not-allowed; opacity:.55; }
.eotion-timeline-frozen-toggle--expand { top:10px; left:6px; }
.eotion-timeline-content > :deep(.eotion-timeline-viewport) { flex:1 1 0; width:auto; min-width:0; }
@container eotion-timeline-root (max-width:700px) {
  .eotion-timeline-content > :deep(.eotion-timeline-frozen) { flex:0 0 min(120px, 40%); width:min(120px, 40%); min-width:0; max-width:40%; }
  .eotion-timeline-content > :deep(.eotion-timeline-frozen .eotion-timeline-frozen-cell:not(.is-title)) { display:none; }
  .eotion-timeline-content > :deep(.eotion-timeline-frozen .eotion-timeline-frozen-cell.is-title) { order:-1; flex:1 1 0; }
}
.eotion-database-timeline-records { margin-top: 10px; border-top: 1px solid var(--e-color-border, var(--border-editor)); }
.eotion-database-timeline-records summary { min-height: 44px; padding: 10px 2px; color: var(--e-color-text-secondary, var(--editor-muted)); cursor: pointer; }
.eotion-database-timeline-records summary:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-records ul { display: grid; gap: 2px; margin: 0; padding: 0 0 8px; list-style: none; }
.eotion-database-timeline-record-link { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--e-radius-control, 6px); padding: 6px 8px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.eotion-database-timeline-record-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-database-timeline-record-link small { color: var(--e-color-text-secondary, var(--editor-muted)); font-size: 11px; }
.eotion-database-timeline-record-link :deep(svg) { flex: 0 0 auto; color: var(--e-color-text-secondary, var(--editor-muted)); }
.eotion-database-timeline-record-link:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-database-timeline-record-link:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-empty { margin: 10px 0 0; padding: 8px 0; color: var(--e-color-text-secondary, var(--editor-muted)); }
@media (pointer:coarse) {
  .eotion-database-timeline-records summary { min-height: 44px; }
  .eotion-database-timeline-record-link { min-height: 44px; }
}
</style>
