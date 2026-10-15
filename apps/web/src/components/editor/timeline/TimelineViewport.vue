<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { TimelineTick, TimelineViewportState } from './types'
import type { TimelineRowGeometry, TimelineRowWindow } from './layout'
import type { TimelineUnscheduledReason } from './projection'
import type { TimelineBarDragSession } from './useTimelineBarDrag'
import type { TimelineMoveCommand } from './mutation'
import type { Transform } from './types'
import type { TimelineItemGeometry } from './layout'
import type { TimelineDependencyEdge } from './dependency'
import type { TimelineDependencyCapture, TimelineDependencyCommand } from './dependencyMutation'
import { useTimelineDependencyInteraction } from './useTimelineDependencyInteraction'
import TimelineGrid from './TimelineGrid.vue'
import TimelineRuler from './TimelineRuler.vue'
import TimelineTodayLine from './TimelineTodayLine.vue'
import TimelineBar from './TimelineBar.vue'
import TimelineDependencyLayer from './TimelineDependencyLayer.vue'

const props = defineProps<{
  state: TimelineViewportState | null
  rulerTicks: (TimelineTick & { labelOffsetX: number })[]
  gridTicks: TimelineTick[]
  todayX: number | null
  pinY: number
  canvasWidthPx: number
  bodyHeight: number
  rowWindow: TimelineRowWindow
  rows: TimelineRowGeometry[]
  dependencyEdges: readonly TimelineDependencyEdge[]
  windowDependencyEdges: readonly TimelineDependencyEdge[]
  dependencyGeometryById: ReadonlyMap<string, TimelineItemGeometry>
  selectedPageId: string | null
  hoveredRecordId: string | null
  scope: string
  transform: Transform | null
  displayTimeZone: string
  draggable: boolean
  dependencyEditable: boolean
  dependencyConfigKey: string
  recordTitleById: ReadonlyMap<string, string>
  online: boolean
  captureDependency: () => TimelineDependencyCapture | null
  mutateDependency: (command: TimelineDependencyCommand) => Promise<boolean>
  recordVersionById: ReadonlyMap<string, number>
  recordMutationBusyById: ReadonlyMap<string, boolean>
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  commitDrag: (command: TimelineMoveCommand) => Promise<boolean>
  isViewportCurrent: (snapshot: Transform) => boolean
}>()

const rulerAnchorStyle = computed(() => ({ transform: `translateY(${props.pinY}px)` }))
const canvasStyle = computed(() => ({ width: props.state ? `${props.canvasWidthPx}px` : '100%' }))
const bodyStyle = computed(() => ({ width: props.state ? `${props.canvasWidthPx}px` : '100%', height: `${props.bodyHeight}px`, minHeight: `${props.bodyHeight}px` }))
const overlayStyle = computed(() => ({
  top: `${props.rowWindow.top}px`,
  height: `${props.rowWindow.totalHeight === 0 ? 240 : props.rowWindow.height}px`,
  width: `${props.state ? props.canvasWidthPx : 0}px`,
}))
const unscheduledStyle = computed(() => ({
  left: `${props.state?.scrollLeft ?? 0}px`,
  width: `${props.state?.width ?? 0}px`,
}))
const previewGeometryById = reactive(new Map<string, TimelineItemGeometry>())
watch(() => props.scope, () => previewGeometryById.clear(), { flush: 'sync' })
const canvasBody = ref<HTMLElement | null>(null)
const dependencyControl = ref<HTMLButtonElement | null>(null)
const dependencyDeleteArmed = ref(false)
const renderedRecordIds = computed(() => new Set(props.rows.filter(row => row.geometry && !row.geometry.offscreen).map(row => row.item.recordId)))
const dependency = useTimelineDependencyInteraction({
  scope: () => props.scope,
  writable: () => props.dependencyEditable && previewGeometryById.size === 0 && !canvasBody.value?.querySelector('[data-drag-state="armed"], [data-drag-state="dragging"]'),
  online: () => props.online,
  transform: () => props.transform,
  configKey: () => props.dependencyConfigKey,
  isViewportCurrent: snapshot => props.isViewportCurrent(snapshot),
  edges: () => props.dependencyEdges,
  renderedRecordIds: () => renderedRecordIds.value,
  canvas: () => canvasBody.value,
  captureDependency: () => props.captureDependency(),
  mutateDependency: command => props.mutateDependency(command),
})
const selectedEdgePosition = computed(() => {
  const edge = dependency.selectedEdge.value
  if (!edge) return 0
  return props.dependencyEdges.findIndex(candidate => candidate.id === edge.id) + 1
})
function selectDependencyEdge(id: string): void {
  dependency.selectEdge(id)
  dependencyControl.value?.focus()
}
function onDependencyControlClick(event: MouseEvent): void {
  // Browser focus selects the first edge before click. A pointer's first
  // activation of the management control must only select, never delete it.
  if ((event.detail === 0 || dependencyDeleteArmed.value) && dependency.selectedEdge.value) void dependency.removeSelected()
  dependencyDeleteArmed.value = false
}
function onDependencyControlKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); dependency.selectRelative(1) }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); dependency.selectRelative(-1) }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void dependency.removeSelected() }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dependency.selectedEdgeId.value = null }
}
function guardConcurrentPointer(event: PointerEvent): void {
  if (!dependency.active.value) return
  const target = event.target
  if (target instanceof Element && target.closest('[data-testid="timeline-bar"], [data-testid^="timeline-resize-"]')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function updatePreviewGeometry(recordId: string, geometry: TimelineItemGeometry | null): void {
  if (geometry) previewGeometryById.set(recordId, geometry)
  else previewGeometryById.delete(recordId)
}

const emit = defineEmits<{
  scrollerRef: [element: HTMLElement | null]
  rulerRef: [element: HTMLElement | null]
  bodyRef: [element: HTMLElement | null]
  openRecord: [event: MouseEvent, pageId: string]
  focusRow: [rowIndex: number]
  hoverRecord: [recordId: string | null]
}>()

function setScroller(element: unknown): void {
  emit('scrollerRef', typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null)
}

function setRulerAnchor(element: unknown): void {
  emit('rulerRef', typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null)
}

function setBody(element: unknown): void {
  canvasBody.value = typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null
  emit('bodyRef', canvasBody.value)
}

function reasonLabel(reason: TimelineUnscheduledReason): string {
  switch (reason) {
    case 'unconfigured-source': return '未配置日期来源'
    case 'missing-start': return '缺少开始日期'
    case 'invalid-date': return '日期无效'
    case 'incompatible-kinds': return '起止日期精度不同'
    case 'end-before-start': return '结束日期早于开始日期'
  }
}
</script>

<template>
  <div class="eotion-timeline-viewport" data-testid="timeline-viewport" :data-generation="state?.generation">
    <div class="eotion-timeline-ruler-slot">
      <button
        v-if="dependencyEdges.length"
        ref="dependencyControl"
        class="eotion-timeline-dependency-control"
        type="button"
        data-testid="timeline-dependency-control"
        :data-selected-edge-id="dependency.selectedEdgeId.value ?? undefined"
        :aria-label="dependency.selectedEdge.value ? `删除依赖：${recordTitleById.get(dependency.selectedEdge.value.predecessorRecordId) || '无标题'} → ${recordTitleById.get(dependency.selectedEdge.value.successorRecordId) || '无标题'}。第 ${selectedEdgePosition}/${dependencyEdges.length} 条，方向键选择` : `管理 ${dependencyEdges.length} 条依赖关系。方向键选择，Delete 删除`"
        :aria-busy="dependency.pending.value ? 'true' : 'false'"
        :aria-disabled="!dependencyEditable || !online || dependency.pending.value ? 'true' : undefined"
        @focus="!dependency.selectedEdge.value && dependency.selectRelative(1)"
        @keydown="onDependencyControlKeydown"
        @pointerdown="dependencyDeleteArmed = dependency.selectedEdge.value !== null"
        @click="onDependencyControlClick"
      >{{ dependency.selectedEdge.value ? `删除依赖 ${selectedEdgePosition}/${dependencyEdges.length}` : `依赖关系 ${dependencyEdges.length}` }}</button>
      <span v-if="dependency.pending.value" class="eotion-timeline-dependency-status" role="status">正在保存依赖关系…</span>
      <div
        class="eotion-timeline-ruler-anchor"
        :style="rulerAnchorStyle"
        data-testid="timeline-ruler-anchor"
        :ref="setRulerAnchor"
      >
        <TimelineRuler :ticks="rulerTicks" />
      </div>
    </div>
    <div
      class="eotion-timeline-scroll"
      data-testid="timeline-scroll"
      role="region"
      aria-label="时间轴"
      tabindex="0"
      :data-visible-start="state?.visibleStartMs"
      :data-visible-end="state?.visibleEndMs"
      :data-origin-ms="state?.originMs"
      :data-generation="state?.generation"
      :ref="setScroller"
    >
      <div class="eotion-timeline-canvas" :style="canvasStyle">
        <div
          class="eotion-timeline-body"
          :style="bodyStyle"
          data-testid="timeline-canvas-body"
          :data-row-window-first="rowWindow.first"
          :data-row-window-last="rowWindow.last"
          :data-row-window-height="rowWindow.height"
          :data-row-window-total-height="rowWindow.totalHeight"
          :data-rendered-row-count="rows.length"
          :ref="setBody"
          :onPointerdownCapture="dependency.active.value ? guardConcurrentPointer : undefined"
        >
          <div class="eotion-timeline-draw-window" :style="overlayStyle" aria-hidden="true">
            <TimelineGrid :ticks="gridTicks" />
          </div>
          <TimelineDependencyLayer
            :edges="dependencyEdges"
            :window-edges="windowDependencyEdges"
            :geometry-by-record-id="dependencyGeometryById"
            :preview-geometry-by-record-id="previewGeometryById"
            :canvas-width="canvasWidthPx"
            :body-height="bodyHeight"
            :selected-edge-id="dependency.selectedEdgeId.value"
            :preview-edge="dependency.previewEdge.value"
            :preview-source-record-id="dependency.active.value?.predecessorRecordId ?? null"
            :preview-pointer="dependency.pointer.value"
            @select-edge="selectDependencyEdge"
          />
          <div class="eotion-timeline-today" :style="overlayStyle" aria-hidden="true">
            <TimelineTodayLine :x="todayX" />
          </div>
          <div
            v-for="row in rows"
            :key="row.item.recordId"
            class="eotion-timeline-row"
            :class="{ 'eotion-timeline-row--unscheduled': row.item.kind === 'unscheduled', 'is-hovered': hoveredRecordId === row.item.recordId, 'is-selected': selectedPageId === row.item.pageId }"
            :style="{ top: `${row.top}px`, height: `${row.height}px` }"
            data-timeline-row
            :data-row-index="row.rowIndex"
            :data-record-id="row.item.recordId"
            @pointerenter="emit('hoverRecord', row.item.recordId)"
            @pointerleave="emit('hoverRecord', null)"
          >
            <div class="eotion-timeline-row-content" :style="row.item.kind === 'unscheduled' ? unscheduledStyle : undefined">
              <TimelineBar
                v-if="row.geometry && !row.geometry.offscreen"
                :geometry="row.geometry"
                :item="row.item"
                :title="row.item.title"
                :date-label="row.item.dateLabel"
                :visible-properties="row.item.visibleProperties"
                :selected="selectedPageId === row.item.pageId"
                :hovered="hoveredRecordId === row.item.recordId"
                :scope="scope"
                :transform="transform"
                :display-time-zone="displayTimeZone"
                :record-version="recordVersionById.get(row.item.recordId)"
                :draggable="draggable && row.item.kind !== 'unscheduled'"
                :mutation-busy="recordMutationBusyById.get(row.item.recordId) === true"
                :dependency-connectable="dependencyEditable && online && row.item.kind !== 'unscheduled'"
                :dependency-pending="dependency.pending.value"
                :begin-dependency="dependency.start"
                :move-dependency="dependency.move"
                :finish-dependency="dependency.finish"
                :cancel-dependency="dependency.cancel"
                :prepare-drag="prepareDrag"
                :commit-drag="commitDrag"
                :is-viewport-current="isViewportCurrent"
                @focus-row="emit('focusRow', row.rowIndex)"
                @preview-geometry="updatePreviewGeometry"
                @click="emit('openRecord', $event, row.item.pageId)"
              />
              <div v-else-if="row.item.kind === 'unscheduled'" class="eotion-timeline-unscheduled" data-testid="timeline-unscheduled-row" :data-record-id="row.item.recordId">
                <span class="eotion-timeline-unscheduled-title">{{ row.item.title || '无标题' }}</span>
                <span class="eotion-timeline-unscheduled-reason">{{ row.item.kind === 'unscheduled' ? reasonLabel(row.item.reason) : '暂无排期' }}</span>
                <button type="button" :aria-label="`打开记录：${row.item.title || '无标题'}`" @focus="emit('focusRow', row.rowIndex)" @click="emit('openRecord', $event, row.item.pageId)">打开</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eotion-timeline-viewport { position:relative; min-width:0; max-width:100%; overflow:clip; }
.eotion-timeline-ruler-slot { position:relative; z-index:2; height:var(--timeline-header-height, 56px); }
.eotion-timeline-dependency-control { position:absolute; z-index:4; right:6px; top:4px; min-height:26px; border:1px solid var(--e-color-border, var(--border-editor)); border-radius:var(--e-radius-control, 6px); padding:2px 8px; background:var(--e-color-surface, var(--editor-surface)); color:var(--e-color-text-primary, var(--editor-text)); font:inherit; font-size:11px; cursor:pointer; }
.eotion-timeline-dependency-control:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); }
.eotion-timeline-dependency-status { position:absolute; z-index:4; right:8px; bottom:2px; padding:2px 5px; background:var(--e-color-surface, var(--editor-surface)); color:var(--e-color-text-secondary, var(--editor-muted)); font-size:10px; }
.eotion-timeline-ruler-anchor { position:absolute; top:0; left:0; width:100%; height:var(--timeline-header-height, 56px); overflow:hidden; background:var(--e-color-canvas, var(--editor-canvas)); will-change:transform; }
.eotion-timeline-scroll { width:100%; min-width:0; max-width:100%; min-height:240px; overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain; }
.eotion-timeline-scroll:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:-2px; }
.eotion-timeline-canvas { position:relative; min-width:100%; min-height:240px; }
.eotion-timeline-body { position:relative; width:100%; min-height:240px; isolation:isolate; }
.eotion-timeline-draw-window { position:absolute; z-index:0; left:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-today { position:absolute; z-index:2; left:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-row { position:absolute; left:0; width:100%; }
.eotion-timeline-row:has(.eotion-timeline-bar[data-drag-state="dragging"]), .eotion-timeline-row:has(.eotion-timeline-bar[data-drag-state="saving"]) { z-index:6; }
.eotion-timeline-row.is-hovered { background:color-mix(in srgb, var(--e-color-hover, var(--editor-hover)) 48%, transparent); }
.eotion-timeline-row.is-selected { background:color-mix(in srgb, var(--e-color-selected, var(--editor-selected)) 56%, transparent); }
.eotion-timeline-row-content { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
.eotion-timeline-row--unscheduled { z-index:4; }
.eotion-timeline-unscheduled { display:flex; width:100%; height:100%; align-items:center; gap:8px; overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); padding:0 8px; background:transparent; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:12px; pointer-events:auto; }
.eotion-timeline-unscheduled-title { min-width:0; overflow:hidden; color:var(--e-color-text-primary, var(--editor-text)); font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-unscheduled-reason { flex:0 0 auto; }
.eotion-timeline-unscheduled button { flex:0 0 auto; min-height:32px; border:0; border-radius:var(--e-radius-control, 6px); padding:0 8px; background:transparent; color:var(--e-color-accent, var(--editor-accent)); font:inherit; cursor:pointer; }
.eotion-timeline-unscheduled button:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:1px; }
@media (prefers-reduced-motion: reduce) { .eotion-timeline-ruler-anchor { will-change:auto; } }
</style>
