<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseTimelineViewOptions, DatabaseViewConfig } from '@eotion/domain/database'
import type { TimelineBarDragSession } from './timeline/useTimelineBarDrag'
import type { TimelineMoveCommand } from './timeline/mutation'
import { isWritableTimelineDateSource } from './timeline/mutation'
import { computed, reactive, ref, watch } from 'vue'

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
import { projectTimelineDependencies, selectTimelineDependencyEdges } from './timeline/dependency'

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
  databaseVersion: number
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  moveRecord: (command: TimelineMoveCommand) => Promise<boolean>
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
  visibleRecords: [scope: string, recordIds: readonly string[]]
}>()

const recordsExpanded = ref(false)
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
const barDraggable = computed(() => props.writable && isWritableTimelineDateSource(timelineOptions.value?.dateSource))
const barTransform = computed(() => viewport.state.value ? viewportTransform(viewport.state.value) : null)
const recordVersionById = computed(() => new Map(props.records.map(record => [record.id, record.version])))
const writablePropertyId = computed(() => {
  const source = timelineOptions.value?.dateSource
  return isWritableTimelineDateSource(source) ? source.propertyId : ''
})
const recordMutationBusyById = computed(() => new Map([...pendingTimelineMutations.values()].map(pending => [pending.recordId, true] as const)))
const frozenColumns = computed(() => resolveFrozenTableProperties(props.properties, props.config))
const frozenTableVisible = computed(() => timelineOptions.value?.frozenTable?.visible === true)
const frozenDisplayMap = computed(() => frozenTableVisible.value
  ? projectFrozenTableDisplay(props.records, frozenColumns.value, props.formatValue)
  : new Map())
const projectedItems = computed(() => projectTimelineRecords({
  records: props.records,
  properties: props.properties,
  config: props.config,
  formatValue: props.formatValue,
}))
const rowIndexByRecordId = computed(() => new Map(projectedItems.value.map(item => [item.recordId, item.rowIndex])))
const focusedRowIndex = computed(() => focusedRecordId.value === null ? null : rowIndexByRecordId.value.get(focusedRecordId.value) ?? null)
const unscheduledItems = computed(() => projectedItems.value.filter(item => item.kind === 'unscheduled'))
watch(() => unscheduledItems.value.length, count => { if (count === 0) recordsExpanded.value = false })
watch(() => props.scope, () => { focusedRecordId.value = null; hoveredRecordId.value = null; recordsExpanded.value = false }, { flush: 'sync' })
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
const temporalMap = computed(() => resolveTimelineTemporalGeometry(projectedItems.value, viewport.displayTimeZone.value))
const dependencyEdges = computed(() => projectTimelineDependencies({
  databaseId: props.databaseId,
  properties: props.properties,
  records: props.records,
  config: props.config,
}))
const dependencyGeometryById = computed(() => {
  if (dependencyEdges.value.length === 0) return new Map<string, TimelineItemGeometry>()
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

async function commitTimelineDrag(command: TimelineMoveCommand): Promise<boolean> {
  const captured = { recordId: command.recordId, propertyId: command.propertyId }
  pendingTimelineMutations.set(captured.recordId, captured)
  try {
    return await props.moveRecord(command)
  } finally {
    const pending = pendingTimelineMutations.get(captured.recordId)
    if (pending && pending.propertyId === captured.propertyId) pendingTimelineMutations.delete(captured.recordId)
  }
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
        @open-record="(event, pageId) => emit('openRecord', event, pageId)"
        @hover-record="hoveredRecordId = $event"
        @focus-row="focusRow"
      />
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
        :record-version-by-id="recordVersionById"
        :record-mutation-busy-by-id="recordMutationBusyById"
        :prepare-drag="prepareTimelineDrag"
        :commit-drag="commitTimelineDrag"
        :is-viewport-current="isBarViewportCurrent"
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
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.eotion-database-timeline {
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: clip;
  container: eotion-timeline-root / inline-size;
  color: var(--e-color-text-primary, var(--editor-text));
}
.eotion-timeline-content { display:flex; width:100%; min-width:0; max-width:100%; align-items:stretch; overflow:clip; }
.eotion-timeline-content > :deep(.eotion-timeline-viewport) { flex:1 1 0; width:auto; min-width:0; }
@container eotion-timeline-root (max-width:700px) {
  .eotion-timeline-content > :deep(.eotion-timeline-frozen) { flex:0 0 min(120px, 40%); width:min(120px, 40%); min-width:0; max-width:40%; }
  .eotion-timeline-content > :deep(.eotion-timeline-frozen .eotion-timeline-frozen-cell:not(.is-title)) { display:none; }
  .eotion-timeline-content > :deep(.eotion-timeline-frozen .eotion-timeline-frozen-cell.is-title) { order:-1; flex:1 1 0; }
}
.eotion-database-timeline-records { margin-top: 10px; border-top: 1px solid var(--e-color-border, var(--border-editor)); }
.eotion-database-timeline-records summary { min-height: 40px; padding: 10px 2px; color: var(--e-color-text-secondary, var(--editor-muted)); cursor: pointer; }
.eotion-database-timeline-records summary:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-records ul { display: grid; gap: 2px; margin: 0; padding: 0 0 8px; list-style: none; }
.eotion-database-timeline-record-link { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--e-radius-control, 6px); padding: 6px 8px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.eotion-database-timeline-record-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-database-timeline-record-link small { color: var(--e-color-text-secondary, var(--editor-muted)); font-size: 11px; }
.eotion-database-timeline-record-link :deep(svg) { flex: 0 0 auto; color: var(--e-color-text-secondary, var(--editor-muted)); }
.eotion-database-timeline-record-link:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-database-timeline-record-link:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-empty { margin: 10px 0 0; padding: 8px 0; color: var(--e-color-text-secondary, var(--editor-muted)); }
</style>
