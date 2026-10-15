<script setup lang="ts">
import type { TimelineItemGeometry } from './layout'
import type { TimelineItemProjection } from './projection'
import type { Transform } from './types'
import type { TimelineBarDragSession } from './useTimelineBarDrag'
import type { TimelineMoveCommand } from './mutation'
import { computed } from 'vue'
import { useTimelineBarDrag } from './useTimelineBarDrag'

const props = defineProps<{
  geometry: TimelineItemGeometry
  title: string
  dateLabel?: string
  visibleProperties: readonly { propertyId: string; propertyType: string; displayText: string }[]
  selected: boolean
  hovered?: boolean
  item: TimelineItemProjection
  transform: Transform | null
  displayTimeZone: string
  scope: string
  recordVersion?: number
  draggable: boolean
  mutationBusy?: boolean
  prepareDrag: (recordId: string) => TimelineBarDragSession | null
  commitDrag: (command: TimelineMoveCommand) => Promise<boolean>
  isViewportCurrent: (snapshot: Transform) => boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
  focusRow: []
}>()

const drag = useTimelineBarDrag({
  geometry: () => props.geometry,
  item: () => props.item,
  transform: () => props.transform,
  displayTimeZone: () => props.displayTimeZone,
  scope: () => props.scope,
  recordVersion: () => props.recordVersion,
  enabled: () => props.draggable,
  prepareDrag: recordId => props.prepareDrag(recordId),
  commitDrag: command => props.commitDrag(command),
  isViewportCurrent: snapshot => props.isViewportCurrent(snapshot),
})
const saving = computed(() => drag.state.value === 'saving')
const pending = computed(() => saving.value || props.mutationBusy === true)
const operation = computed(() => drag.activeMode.value ?? drag.pendingMode.value)
const previewLabelStyle = computed(() => {
  const transform = props.transform
  if (!drag.previewDate.value || !transform) return {}
  const visibleRight = transform.scrollLeft + transform.width
  const left = Math.max(transform.scrollLeft, Math.min(drag.geometry.value.x, visibleRight - 120))
  return { left: `${left}px`, top: '1px', maxWidth: `${Math.max(0, Math.min(180, visibleRight - left))}px` }
})
const barGeometry = computed(() => drag.geometry.value)
const showStartHandle = computed(() => props.draggable && props.item.kind === 'range' && (!barGeometry.value.clippedLeft || drag.activeMode.value === 'start'))
const showEndHandle = computed(() => props.draggable && (!barGeometry.value.clippedRight || drag.activeMode.value === 'end'))
const handleCenters = computed(() => {
  const geometry = barGeometry.value
  const viewport = props.transform
  const hasBounds = viewport && Number.isFinite(viewport.scrollLeft) && Number.isFinite(viewport.width)
  const minCenter = hasBounds ? viewport.scrollLeft + 6 : Number.NEGATIVE_INFINITY
  const maxCenter = hasBounds ? viewport.scrollLeft + Math.max(6, viewport.width - 6) : Number.POSITIVE_INFINITY
  const clamp = (center: number) => Math.min(maxCenter, Math.max(minCenter, center))
  const range = props.item.kind === 'range'
  const startAnchor = geometry.marker ? geometry.rawX - 18 : geometry.rawX - 6
  const endAnchor = geometry.marker ? geometry.rawX + 18 : geometry.rawX + geometry.rawWidth + 6
  let start = clamp(startAnchor)
  let end = clamp(endAnchor)
  if (range && end - start < 12) {
    const separation = Math.min(12, Math.max(0, maxCenter - minCenter))
    end = Math.min(maxCenter, start + separation)
    if (end - start < separation) start = Math.max(minCenter, end - separation)
  }
  return { start, end, startClamped: start !== startAnchor, endClamped: end !== endAnchor }
})
const startHandleStyle = computed(() => ({
  left: `${handleCenters.value.start}px`,
  top: `${barGeometry.value.top - barGeometry.value.rowTop - (handleCenters.value.startClamped && (barGeometry.value.marker || barGeometry.value.width < 24) ? 8 : 0)}px`,
}))
const endHandleStyle = computed(() => ({
  left: `${handleCenters.value.end}px`,
  top: `${barGeometry.value.top - barGeometry.value.rowTop - (handleCenters.value.endClamped && (barGeometry.value.marker || barGeometry.value.width < 24) ? 8 : 0)}px`,
}))
const startHandleCompact = computed(() => handleCenters.value.startClamped && (barGeometry.value.marker || barGeometry.value.width < 24))
const endHandleCompact = computed(() => handleCenters.value.endClamped && (barGeometry.value.marker || barGeometry.value.width < 24))

function tooltip(): string {
  const details = props.visibleProperties.filter(property => property.displayText).map(property => property.displayText)
  const diagnostic = props.geometry.diagnostic === 'calendar-day-skipped' ? '显示时区内该日不存在' : ''
  const date = pending.value && !drag.previewDate.value
    ? '正在保存…'
    : drag.previewDate.value ? `预览日期 ${drag.previewDate.value}` : props.dateLabel
  return [props.title || '无标题', date, diagnostic, ...details].filter(Boolean).join(' · ')
}

/** The bar body is the Record-open affordance. */
function handleClick(event: MouseEvent): void {
  if (drag.click(event)) return
  emit('click', event)
}

/**
 * Resize handles are controls, not Record-open affordances: every activation
 * (pointer, modifier+click, or keyboard Enter/Space) is swallowed here and can
 * never fall through to the bar's Record open.
 */
function handleControlClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  drag.click(event)
}
</script>

<template>
  <!-- Zero-size anchor: the bar target and the resize handles are absolute
       siblings in the row coordinate space, so a handle can never nest inside
       the bar and a handle click can never open the record. -->
  <div class="eotion-timeline-bar-anchor" @focusin="emit('focusRow')">
    <button
      class="eotion-timeline-bar"
      :class="{
        'eotion-timeline-bar--marker': drag.geometry.value.marker,
        'is-selected': selected,
        'is-hovered': hovered,
        'is-draggable': draggable,
        'is-dragging': drag.state.value === 'dragging',
        'is-saving': saving,
        'is-pending': pending,
      }"
      :style="{
        left: `${drag.geometry.value.x}px`,
        top: `${drag.geometry.value.top - drag.geometry.value.rowTop + (drag.geometry.value.marker ? drag.geometry.value.height / 2 : 0)}px`,
        width: drag.geometry.value.marker ? undefined : `${Math.max(0, drag.geometry.value.width)}px`,
        borderWidth: !drag.geometry.value.marker && drag.geometry.value.width < 2 ? '0' : undefined,
      }"
      :aria-label="tooltip() || title || '无标题'"
      :aria-pressed="selected"
      :aria-busy="pending ? 'true' : 'false'"
      :title="tooltip()"
      :data-record-id="drag.geometry.value.recordId"
      :data-kind="drag.geometry.value.kind"
      :data-marker="drag.geometry.value.marker ? 'true' : 'false'"
      :data-drag-state="drag.state.value"
      :data-interaction-phase="drag.phase.value"
      :data-preview-date="drag.previewDate.value || undefined"
      :data-draggable="draggable ? 'true' : 'false'"
      :data-saving="pending ? 'true' : 'false'"
      :data-operation="operation ?? undefined"
      data-testid="timeline-bar"
      type="button"
      @keydown="drag.onKeydown"
      @pointerdown.stop="drag.begin"
      @pointermove.stop="drag.move"
      @pointerup.stop="drag.finish"
      @pointercancel.stop="drag.cancel"
      @lostpointercapture="drag.onLostPointerCapture"
      @click="handleClick"
    >
      <span class="eotion-timeline-bar-shape" :class="{ 'is-range': !drag.geometry.value.marker }" :data-testid="drag.geometry.value.marker ? 'timeline-marker' : undefined" aria-hidden="true" />
      <span class="eotion-timeline-bar-content">
        <span class="eotion-timeline-bar-title">{{ title || '无标题' }}</span>
        <span v-if="visibleProperties.some(property => property.displayText)" class="eotion-timeline-bar-properties">
          <span v-for="property in visibleProperties.filter(item => item.displayText)" :key="property.propertyId">
            {{ property.displayText }}
          </span>
        </span>
      </span>
    </button>
    <button
      v-if="showStartHandle"
      class="eotion-timeline-resize-handle eotion-timeline-resize-handle--start"
      :class="{ 'is-hovered': hovered, 'is-selected': selected, 'is-compact': startHandleCompact, 'is-busy': pending }"
      :style="startHandleStyle"
      :aria-label="`调整开始日期：${title || '无标题'}`"
      :aria-disabled="pending ? 'true' : undefined"
      :title="`调整开始日期：${title || '无标题'}`"
      :data-record-id="drag.geometry.value.recordId"
      data-testid="timeline-resize-start"
      type="button"
      @keydown="drag.onKeydown"
      @pointerdown.stop="drag.begin($event, 'start')"
      @pointermove.stop="drag.move"
      @pointerup.stop="drag.finish"
      @pointercancel.stop="drag.cancel"
      @lostpointercapture="drag.onLostPointerCapture"
      @click="handleControlClick"
    ><span aria-hidden="true" /></button>
    <button
      v-if="showEndHandle"
      class="eotion-timeline-resize-handle eotion-timeline-resize-handle--end"
      :class="{ 'is-hovered': hovered, 'is-selected': selected, 'is-compact': endHandleCompact, 'is-busy': pending }"
      :style="endHandleStyle"
      :aria-label="`调整结束日期：${title || '无标题'}`"
      :aria-disabled="pending ? 'true' : undefined"
      :title="`调整结束日期：${title || '无标题'}`"
      :data-record-id="drag.geometry.value.recordId"
      data-testid="timeline-resize-end"
      type="button"
      @keydown="drag.onKeydown"
      @pointerdown.stop="drag.begin($event, 'end')"
      @pointermove.stop="drag.move"
      @pointerup.stop="drag.finish"
      @pointercancel.stop="drag.cancel"
      @lostpointercapture="drag.onLostPointerCapture"
      @click="handleControlClick"
    ><span aria-hidden="true" /></button>
    <div
      v-if="drag.previewDate.value"
      class="eotion-timeline-drag-preview"
      :style="previewLabelStyle"
      data-testid="timeline-drag-preview"
      aria-live="polite"
      aria-atomic="true"
    >{{ saving ? `正在保存 ${drag.previewDate.value}` : `预览日期 ${drag.previewDate.value}` }}</div>
    <div v-else-if="saving" class="eotion-timeline-drag-preview" data-testid="timeline-save-status" role="status">正在保存…</div>
  </div>
</template>

<style scoped>
.eotion-timeline-bar-anchor {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  /* Positioning anchor only: the body and handles own every hit target, so the
     anchor can never shadow a resize handle or a bar click. */
  pointer-events: none;
}
.eotion-timeline-bar {
  position: absolute;
  z-index: 3;
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  height: 32px;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  border: 1px solid var(--e-color-border, var(--border-editor));
  border-radius: var(--e-radius-control, 6px);
  padding: 0;
  background: var(--e-color-surface, var(--editor-surface));
  color: var(--e-color-text-primary, var(--editor-text));
  text-align: left;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
.eotion-timeline-bar:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-bar.is-draggable { cursor: grab; touch-action: pan-y; }
.eotion-timeline-bar.is-dragging, .eotion-timeline-bar.is-saving { cursor: grabbing; }
.eotion-timeline-bar.is-pending { cursor: progress; opacity: .72; }
.eotion-timeline-bar.is-selected { border-color: var(--e-color-focus, var(--editor-focus)); background: var(--e-color-selected, var(--editor-selected)); }
.eotion-timeline-bar.is-hovered:not(.is-selected) { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-bar:focus-visible { z-index: 5; outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 1px; }
.eotion-timeline-bar-shape { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-bar-shape.is-range { width: 100%; opacity: .12; }
.eotion-timeline-bar-content { position: relative; display:flex; min-width:0; width:100%; align-items:center; gap:6px; overflow:hidden; padding:0 8px; }
.eotion-timeline-bar-title { min-width: 0; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.eotion-timeline-bar-properties { display: flex; min-width: 0; gap: 4px; overflow: hidden; color: var(--e-color-text-secondary, var(--editor-muted)); font-size: 11px; white-space: nowrap; }
.eotion-timeline-bar-properties span { overflow: hidden; text-overflow: ellipsis; }
.eotion-timeline-drag-preview { position:absolute; z-index:8; box-sizing:border-box; overflow:hidden; border:1px solid var(--e-color-border, var(--border-editor)); border-radius:var(--e-radius-control, 6px); padding:2px 7px; background:var(--e-color-surface, var(--editor-surface)); color:var(--e-color-text-primary, var(--editor-text)); box-shadow:0 2px 8px color-mix(in srgb, var(--e-color-text-primary, var(--editor-text)) 14%, transparent); font-size:11px; line-height:16px; text-overflow:ellipsis; white-space:nowrap; pointer-events:none; }
.eotion-timeline-bar--marker { z-index: 4; width:24px; height:24px; justify-content: center; overflow: visible; border: 0; padding: 0; background: transparent; transform:translate(-50%, -50%); }
.eotion-timeline-bar--marker:hover, .eotion-timeline-bar--marker.is-selected { background: transparent; }
.eotion-timeline-bar--marker .eotion-timeline-bar-shape { position: relative; z-index: 1; inset: auto; width: 12px; height: 12px; flex: 0 0 12px; transform: rotate(45deg); border: 2px solid var(--e-color-accent, var(--editor-accent)); background: var(--e-color-surface, var(--editor-surface)); }
.eotion-timeline-bar--marker .eotion-timeline-bar-content { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; }
.eotion-timeline-bar--marker:hover .eotion-timeline-bar-shape { background: var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-bar--marker.is-selected .eotion-timeline-bar-shape { background: var(--e-color-accent, var(--editor-accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--e-color-accent, var(--editor-accent)) 24%, transparent); }
.eotion-timeline-bar--marker:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; border-radius: 50%; }
.eotion-timeline-bar--marker .eotion-timeline-bar-shape { pointer-events: none; }
.eotion-timeline-resize-handle { position:absolute; z-index:6; box-sizing:border-box; width:12px; height:32px; transform:translateX(-50%); border:0; border-radius:4px; padding:0; background:transparent; opacity:0; cursor:ew-resize; touch-action:none; pointer-events:auto; }
.eotion-timeline-resize-handle span { display:block; width:2px; height:18px; margin:auto; border-radius:2px; background:var(--e-color-accent, var(--editor-accent)); box-shadow:0 0 0 2px var(--e-color-surface, var(--editor-surface)); }
.eotion-timeline-resize-handle.is-compact { height:16px; }
.eotion-timeline-resize-handle.is-compact span { height:12px; pointer-events:none; }
.eotion-timeline-resize-handle.is-busy { cursor:progress; pointer-events:none; }
.eotion-timeline-resize-handle.is-hovered, .eotion-timeline-resize-handle.is-selected, .eotion-timeline-resize-handle:hover, .eotion-timeline-resize-handle:focus-visible { opacity:1; }
.eotion-timeline-resize-handle:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:1px; }
.eotion-timeline-bar-anchor:has(> .eotion-timeline-bar:focus-visible) .eotion-timeline-resize-handle { opacity:1; }
.eotion-timeline-row.is-hovered .eotion-timeline-resize-handle, .eotion-timeline-row.is-selected .eotion-timeline-resize-handle { opacity:1; }
@media (pointer:coarse) { .eotion-timeline-bar--marker { width:44px; height:44px; } }
@media (pointer:coarse) { .eotion-timeline-resize-handle { opacity:1; width:10px; } }
</style>
