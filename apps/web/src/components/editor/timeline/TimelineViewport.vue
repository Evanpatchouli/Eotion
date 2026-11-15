<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { TimelineTick, TimelineViewportState } from './types'
import type { TimelineRowGeometry, TimelineRowWindow } from './layout'
import type { TimelineUnscheduledReason } from './projection'
import type { TimelineBarDragMode, TimelineBarDragSession } from './useTimelineBarDrag'
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
import type { DatabaseViewGroupKey } from '@eotion/contracts'
import type { DatabaseGroupWindow } from '../databaseGroupWindows'
import { databaseGroupKeyId } from '../databaseGroupWindows'
import type { TimelineGroupHeader } from './groupLayout'
import TimelineGroupHeaderView from './TimelineGroupHeader.vue'

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
  groupHeaders?: readonly TimelineGroupHeader[]
  groupWindows?: readonly DatabaseGroupWindow[]
  groupControlsVisible?: boolean
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
  orderEnabled: boolean
  orderSorted: boolean
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  commitDrag: (command: TimelineMoveCommand, mode: TimelineBarDragMode) => Promise<boolean>
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
const offscreenLeftStyle = computed(() => ({ left: `${(props.state?.scrollLeft ?? 0) + 4}px` }))
const offscreenRightStyle = computed(() => ({ right: `${Math.max(0, props.canvasWidthPx - ((props.state?.scrollLeft ?? 0) + (props.state?.width ?? 0))) + 4}px` }))
const previewGeometryById = reactive(new Map<string, TimelineItemGeometry>())
watch(() => props.scope, () => previewGeometryById.clear(), { flush: 'sync' })
const canvasBody = ref<HTMLElement | null>(null)
const dependencyControl = ref<HTMLButtonElement | null>(null)
const dependencyDeleteArmed = ref(false)
let dependencyTouchSession: { pointerId: number; scope: string; configKey: string; edgeId: string | null } | null = null
let suppressDependencyTouchClick = false
const renderedRecordIds = computed(() => new Set(props.rows.filter(row => row.item.kind !== 'unscheduled' && row.geometry && !row.geometry.offscreen).map(row => row.item.recordId)))
const dependency = useTimelineDependencyInteraction({
  scope: () => props.scope,
  writable: () => props.dependencyEditable && previewGeometryById.size === 0 && !canvasBody.value?.querySelector('[data-drag-state="armed"], [data-drag-state="dragging"]'),
  online: () => props.online,
  transform: () => props.transform,
  configKey: () => props.dependencyConfigKey,
  isViewportCurrent: snapshot => props.isViewportCurrent(snapshot),
  edges: () => props.dependencyEdges,
  recordTitleById: () => props.recordTitleById,
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
  dependencyControl.value?.focus({ preventScroll: true })
}
function activateDependencyControl(keyboard: boolean): void {
  // Browser focus selects the first edge before click. A pointer's first
  // activation of the management control must only select, never delete it.
  if (!dependency.selectedEdge.value) {
    dependency.selectRelative(1)
    dependencyDeleteArmed.value = false
    return
  }
  if (keyboard || dependencyDeleteArmed.value) void dependency.removeSelected()
  dependencyDeleteArmed.value = false
}
function onDependencyControlPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'touch' && !event.isPrimary) return
  dependencyTouchSession = null
  suppressDependencyTouchClick = false
  dependencyDeleteArmed.value = dependency.selectedEdge.value !== null
  if (event.pointerType === 'touch' && event.isPrimary) {
    // A touch tap must work without a synthesized mouse click inside NodeViews.
    event.preventDefault()
    dependencyTouchSession = { pointerId: event.pointerId, scope: props.scope, configKey: props.dependencyConfigKey, edgeId: dependency.selectedEdgeId.value }
  }
}
function onDependencyControlPointerUp(event: PointerEvent): void {
  const session = dependencyTouchSession
  if (event.pointerType !== 'touch' || !session || event.pointerId !== session.pointerId) return
  dependencyTouchSession = null
  suppressDependencyTouchClick = true
  if (session.scope !== props.scope || session.configKey !== props.dependencyConfigKey
    || session.edgeId !== null && session.edgeId !== dependency.selectedEdgeId.value) return
  const bounds = dependencyControl.value?.getBoundingClientRect()
  if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return
  activateDependencyControl(false)
}
function onDependencyControlClick(event: MouseEvent): void {
  const touchClick = event instanceof PointerEvent && event.pointerType === 'touch'
  if (suppressDependencyTouchClick && (event.detail > 0 || touchClick)) {
    suppressDependencyTouchClick = false
    return
  }
  suppressDependencyTouchClick = false
  activateDependencyControl(event.detail === 0)
}
function onDependencyControlKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); dependency.selectRelative(1) }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); dependency.selectRelative(-1) }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void dependency.removeSelected() }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dependencyTouchSession = null; dependencyDeleteArmed.value = false; dependency.selectedEdgeId.value = null }
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

function requestOffscreenNavigation(event: MouseEvent, recordId: string, direction: 'left' | 'right'): void {
  const target = event.currentTarget
  if (!(target instanceof HTMLButtonElement) || !target.isConnected || !canvasBody.value?.contains(target)
    || target.dataset.recordId !== recordId || target.dataset.scope !== props.scope) return
  if (dependency.active.value || dependency.pending.value || previewGeometryById.size > 0
    || canvasBody.value?.querySelector('[data-drag-state="armed"], [data-drag-state="dragging"]')) return
  emit('navigateOffscreen', recordId, direction)
}

const emit = defineEmits<{
  scrollerRef: [element: HTMLElement | null]
  rulerRef: [element: HTMLElement | null]
  bodyRef: [element: HTMLElement | null]
  openRecord: [event: MouseEvent, pageId: string]
  focusRow: [rowIndex: number]
  hoverRecord: [recordId: string | null]
  navigateOffscreen: [recordId: string, direction: 'left' | 'right']
  groupVisible: [key: DatabaseViewGroupKey]
  toggleGroup: [key: DatabaseViewGroupKey, collapsed: boolean]
  loadGroupMore: [key: DatabaseViewGroupKey]
  selectGroup: [recordId: string, groupId: string]
}>()
function groupWindow(header: TimelineGroupHeader): DatabaseGroupWindow { return props.groupWindows!.find(group => databaseGroupKeyId(group.key) === databaseGroupKeyId(header.key))! }

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
  <div class="eotion-timeline-viewport" :class="{ 'is-grouped': !!groupWindows }" data-testid="timeline-viewport" :data-generation="state?.generation">
    <span class="eotion-timeline-dependency-live" :class="{ 'is-visible': dependency.showKeyboardStatus.value }" aria-live="polite" aria-atomic="true" data-testid="timeline-dependency-live">{{ dependency.liveMessage.value }}</span>
    <div class="eotion-timeline-ruler-slot">
      <div
        class="eotion-timeline-ruler-anchor"
        :style="rulerAnchorStyle"
        data-testid="timeline-ruler-anchor"
        :ref="setRulerAnchor"
      >
        <TimelineRuler :ticks="rulerTicks" :today-x="todayX === null ? null : todayX - (state?.scrollLeft ?? 0)" />
      </div>
    </div>
    <div class="eotion-timeline-order-rail" aria-label="记录顺序操作区">
      <button v-for="row in rows" :key="row.item.recordId" class="eotion-timeline-order-handle" :class="{ 'is-grouped': !!groupWindows }" type="button" data-testid="timeline-order-handle"
        :style="{ top: `${row.top + row.height / 2}px` }"
        :data-record-id="row.item.recordId"
        :aria-label="groupWindows && orderSorted ? `移动分组：${row.item.title || '无标题'}。拖动到其他分组` : `调整顺序：${row.item.title || '无标题'}。方向键上移或下移，也可拖动`"
        :aria-disabled="!orderEnabled ? 'true' : undefined"
        :title="orderSorted ? groupWindows ? '拖动到其他分组；当前排序禁用组内手排' : '当前视图设置了排序，关闭排序后可手动调整顺序' : '拖动或用方向键调整顺序'"
        @focus="emit('focusRow', row.rowIndex)" @pointerdown.stop @click.stop.prevent>⋮⋮</button>
      <select v-for="row in groupWindows ? rows : []" :key="`group-${row.item.recordId}`" class="eotion-timeline-group-select" :style="{ top: `${row.top + row.height / 2}px` }"
        :value="groupWindows?.find(group => group.records.some(record => record.id === row.item.recordId)) && databaseGroupKeyId(groupWindows!.find(group => group.records.some(record => record.id === row.item.recordId))!.key)"
        :aria-label="`移动${row.item.title || '无标题'}到分组`" :disabled="!orderEnabled" :data-record-id="row.item.recordId"
        @focus="emit('focusRow', row.rowIndex)" @change="emit('selectGroup', row.item.recordId, ($event.target as HTMLSelectElement).value)">
        <option v-for="group in groupWindows" :key="databaseGroupKeyId(group.key)" :value="databaseGroupKeyId(group.key)">{{ group.label }}</option>
      </select>
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
            <TimelineGrid :ticks="gridTicks" :display-time-zone="displayTimeZone" :state="state" :transform="transform" />
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
          <div v-for="header in groupHeaders" :key="databaseGroupKeyId(header.key)" class="eotion-timeline-grid-group"
            :style="{ top: `${header.top}px`, left: `${state?.scrollLeft ?? 0}px`, width: `${state?.width ?? 0}px`, height: `${header.height}px` }">
            <TimelineGroupHeaderView :header="header" :window="groupWindow(header)" observe :decorative="!groupControlsVisible"
              @visible="emit('groupVisible', header.key)" @toggle="emit('toggleGroup', header.key, !header.collapsed)" @load-more="emit('loadGroupMore', header.key)" />
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
              <button
                v-if="row.geometry && (row.geometry.offscreen === 'left' || row.geometry.clippedLeft)"
                class="eotion-timeline-offscreen-jump"
                :class="{ 'is-clipped': row.geometry.offscreen === undefined }"
                :style="offscreenLeftStyle"
                type="button"
                data-testid="timeline-offscreen-left"
                :data-record-id="row.item.recordId"
                :data-scope="scope"
                :aria-label="`跳转到${row.item.title || '无标题'}的${row.item.kind === 'point' ? '日期' : '开始日期'}`"
                @focus="emit('focusRow', row.rowIndex)"
                @pointerdown.stop
                @click.stop="requestOffscreenNavigation($event, row.item.recordId, 'left')"
              >←</button>
              <button
                v-if="row.geometry && (row.geometry.offscreen === 'right' || row.geometry.clippedRight)"
                class="eotion-timeline-offscreen-jump"
                :class="{ 'is-clipped': row.geometry.offscreen === undefined }"
                :style="offscreenRightStyle"
                type="button"
                data-testid="timeline-offscreen-right"
                :data-record-id="row.item.recordId"
                :data-scope="scope"
                :aria-label="`跳转到${row.item.title || '无标题'}的${row.item.kind === 'point' ? '日期' : '结束日期'}`"
                @focus="emit('focusRow', row.rowIndex)"
                @pointerdown.stop
                @click.stop="requestOffscreenNavigation($event, row.item.recordId, 'right')"
              >→</button>
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
                :dependency-target-selected="dependency.active.value?.mode === 'keyboard' && dependency.targetRecordId.value === row.item.recordId"
                :begin-dependency="dependency.start"
                :keydown-dependency="dependency.keydown"
                :blur-dependency="dependency.blurKeyboard"
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
    <div v-if="dependencyEdges.length || dependency.pending.value" class="eotion-timeline-dependency-toolbar">
      <span v-if="dependency.pending.value" class="eotion-timeline-dependency-status" role="status">正在保存依赖关系…</span>
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
        @pointerdown.stop="onDependencyControlPointerDown"
        @pointerup.stop="onDependencyControlPointerUp"
        @pointercancel="dependencyTouchSession = null"
        @click="onDependencyControlClick"
      >{{ dependency.selectedEdge.value ? `删除依赖 ${selectedEdgePosition}/${dependencyEdges.length}` : `依赖关系 ${dependencyEdges.length}` }}</button>
    </div>
  </div>
</template>

<style scoped>
.eotion-timeline-viewport { --timeline-offscreen-jump-size:28px; --timeline-dependency-handle-half-size:9px; --timeline-order-rail-width:36px; position:relative; min-width:0; max-width:100%; overflow:clip; }
.eotion-timeline-ruler-slot { position:relative; z-index:2; height:var(--timeline-header-height, 56px); margin-left:var(--timeline-order-rail-width); }
.eotion-timeline-order-rail { position:absolute; z-index:8; top:var(--timeline-header-height, 56px); left:0; bottom:0; width:var(--timeline-order-rail-width); background:var(--e-color-canvas, var(--editor-canvas)); pointer-events:none; }
.eotion-timeline-grid-group { position:absolute; z-index:5; }
.eotion-timeline-group-select { position:absolute; right:0; transform:translateY(-50%); width:18px; height:32px; overflow:hidden; border:0; padding:0; background:var(--e-color-canvas, var(--editor-canvas)); color:var(--e-color-accent, var(--editor-accent)); font-size:11px; pointer-events:auto; cursor:pointer; }
.eotion-timeline-group-select:focus-visible { outline:2px solid var(--e-color-focus, var(--editor-focus)); }
.eotion-timeline-dependency-toolbar { display:flex; min-width:0; align-items:center; justify-content:flex-end; gap:8px; padding:4px 0; }
.eotion-timeline-dependency-control { min-height:26px; border:0; border-radius:var(--e-radius-control, 6px); padding:2px 8px; background:transparent; color:var(--e-color-text-secondary, var(--editor-muted)); font:inherit; font-size:11px; cursor:pointer; }
.eotion-timeline-dependency-control:hover { background:var(--e-color-hover, var(--editor-hover)); color:var(--e-color-text-primary, var(--editor-text)); }
.eotion-timeline-dependency-control:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); }
.eotion-timeline-dependency-status { padding:2px 5px; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:10px; }
.eotion-timeline-dependency-live { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0, 0, 0, 0); clip-path:inset(50%); white-space:nowrap; }
.eotion-timeline-dependency-live.is-visible { z-index:5; top:32px; left:8px; box-sizing:border-box; width:max-content; max-width:calc(100% - 16px); height:auto; overflow:hidden; clip:auto; clip-path:none; border:1px solid var(--e-color-border, var(--border-editor)); border-radius:var(--e-radius-control, 6px); padding:3px 8px; background:var(--e-color-surface, var(--editor-surface)); color:var(--e-color-text-primary, var(--editor-text)); font-size:11px; line-height:16px; white-space:normal; overflow-wrap:anywhere; pointer-events:none; }
.eotion-timeline-ruler-anchor { position:absolute; top:0; left:0; width:100%; height:var(--timeline-header-height, 56px); overflow:hidden; background:var(--e-color-canvas, var(--editor-canvas)); will-change:transform; }
.eotion-timeline-scroll { width:calc(100% - var(--timeline-order-rail-width)); min-width:0; max-width:calc(100% - var(--timeline-order-rail-width)); min-height:240px; margin-left:var(--timeline-order-rail-width); overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain; }
@supports (scrollbar-color:auto) and (not selector(::-webkit-scrollbar)) {
  .eotion-timeline-scroll { scrollbar-color:var(--e-color-text-muted, var(--editor-muted)) var(--e-color-canvas, var(--editor-canvas)); }
}
@supports selector(::-webkit-scrollbar) {
  .eotion-timeline-scroll::-webkit-scrollbar { height:12px; }
  .eotion-timeline-scroll::-webkit-scrollbar-track { background:var(--e-color-canvas, var(--editor-canvas)); }
  .eotion-timeline-scroll::-webkit-scrollbar-thumb { min-width:24px; border:3px solid var(--e-color-canvas, var(--editor-canvas)); border-radius:8px; background:var(--e-color-text-muted, var(--editor-muted)); }
  .eotion-timeline-scroll::-webkit-scrollbar-thumb:hover { background:var(--e-color-text-secondary, var(--editor-muted)); }
}
.eotion-timeline-scroll:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:-2px; }
.eotion-timeline-canvas { position:relative; min-width:100%; min-height:240px; }
.eotion-timeline-body { position:relative; width:100%; min-height:240px; isolation:isolate; }
.eotion-timeline-draw-window { position:absolute; z-index:0; left:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-today { position:absolute; z-index:2; left:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-row { position:absolute; left:0; width:100%; scroll-margin-top:var(--timeline-header-height, 56px); }
.eotion-timeline-row:has(.eotion-timeline-bar[data-drag-state="dragging"]), .eotion-timeline-row:has(.eotion-timeline-bar[data-drag-state="saving"]) { z-index:6; }
.eotion-timeline-row.is-hovered { background:color-mix(in srgb, var(--e-color-hover, var(--editor-hover)) 48%, transparent); }
.eotion-timeline-row.is-selected { background:color-mix(in srgb, var(--e-color-selected, var(--editor-selected)) 56%, transparent); }
.eotion-timeline-row-content { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
.eotion-timeline-order-handle { position:absolute; left:3px; transform:translateY(-50%); width:30px; height:32px; border:0; border-radius:4px; background:var(--e-color-canvas, var(--editor-canvas)); color:var(--e-color-text-secondary, var(--editor-muted)); font:inherit; font-size:15px; letter-spacing:-3px; cursor:grab; pointer-events:auto; touch-action:none; }
.eotion-timeline-order-handle.is-grouped { left:0; width:18px; }
.eotion-timeline-order-handle:hover { color:var(--e-color-text-primary, var(--editor-text)); background:var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-order-handle:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); }
.eotion-timeline-order-handle[aria-disabled="true"] { opacity:.45; cursor:not-allowed; touch-action:pan-y; }
@media (pointer:coarse) {
  .eotion-timeline-viewport.is-grouped { --timeline-order-rail-width:96px; }
  .eotion-timeline-order-handle { left:0; width:36px; height:40px; }
  .eotion-timeline-order-handle.is-grouped { left:0; width:48px; height:44px; }
  .eotion-timeline-group-select { right:0; width:48px; height:44px; }
}
.eotion-timeline-offscreen-jump { position:absolute; z-index:7; top:50%; display:grid; width:var(--timeline-offscreen-jump-size); height:var(--timeline-offscreen-jump-size); transform:translateY(-50%); place-items:center; border:0; border-radius:var(--e-radius-control, 6px); padding:0; background:transparent; color:var(--e-color-text-secondary, var(--editor-muted)); font:inherit; line-height:1; cursor:pointer; pointer-events:auto; }
.eotion-timeline-offscreen-jump.is-clipped { top:0; height:20px; transform:none; }
.eotion-timeline-offscreen-jump:hover { background:var(--e-color-hover, var(--editor-hover)); color:var(--e-color-text-primary, var(--editor-text)); }
.eotion-timeline-offscreen-jump:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:2px; }
.eotion-timeline-row--unscheduled { z-index:4; }
.eotion-timeline-unscheduled { display:flex; width:100%; height:100%; align-items:center; gap:8px; overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); padding:0 8px; background:transparent; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:12px; pointer-events:auto; }
.eotion-timeline-unscheduled-title { min-width:0; overflow:hidden; color:var(--e-color-text-primary, var(--editor-text)); font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-unscheduled-reason { flex:0 0 auto; }
.eotion-timeline-unscheduled button { flex:0 0 auto; min-height:32px; border:0; border-radius:var(--e-radius-control, 6px); padding:0 8px; background:transparent; color:var(--e-color-accent, var(--editor-accent)); font:inherit; cursor:pointer; }
.eotion-timeline-unscheduled button:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:1px; }
@media (pointer:coarse) {
  .eotion-timeline-dependency-control { max-width:140px; min-height:36px; }
  .eotion-timeline-unscheduled button { min-height:36px; }
  .eotion-timeline-viewport { --timeline-offscreen-jump-size:36px; --timeline-dependency-handle-half-size:14px; }
}
@media (prefers-reduced-motion: reduce) { .eotion-timeline-ruler-anchor { will-change:auto; } }
</style>
