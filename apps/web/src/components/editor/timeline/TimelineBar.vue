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
const previewLabelStyle = computed(() => {
  const transform = props.transform
  if (!drag.previewDate.value || !transform) return {}
  const visibleRight = transform.scrollLeft + transform.width
  const left = Math.max(transform.scrollLeft, Math.min(drag.geometry.value.x, visibleRight - 120))
  return { left: `${left}px`, top: '1px', maxWidth: `${Math.max(0, Math.min(180, visibleRight - left))}px` }
})

function tooltip(): string {
  const details = props.visibleProperties.filter(property => property.displayText).map(property => property.displayText)
  const diagnostic = props.geometry.diagnostic === 'calendar-day-skipped' ? '显示时区内该日不存在' : ''
  const date = drag.previewDate.value ? `预览日期 ${drag.previewDate.value}` : props.dateLabel
  return [props.title || '无标题', date, diagnostic, ...details].filter(Boolean).join(' · ')
}
</script>

<template>
  <button
    class="eotion-timeline-bar"
    :class="{ 'eotion-timeline-bar--marker': geometry.marker, 'is-selected': selected, 'is-hovered': hovered, 'is-draggable': draggable, 'is-dragging': drag.state.value === 'dragging' || drag.state.value === 'saving' }"
    :style="{
      left: `${drag.geometry.value.x}px`,
      top: `${drag.geometry.value.top - drag.geometry.value.rowTop + (drag.geometry.value.marker ? drag.geometry.value.height / 2 : 0)}px`,
      width: drag.geometry.value.marker ? undefined : `${Math.max(0, drag.geometry.value.width)}px`,
      borderWidth: !drag.geometry.value.marker && drag.geometry.value.width < 2 ? '0' : undefined,
    }"
    :title="tooltip()"
    :aria-label="tooltip() || title || '无标题'"
    :aria-pressed="selected"
    data-testid="timeline-bar"
    :data-record-id="geometry.recordId"
    :data-kind="drag.geometry.value.kind"
    :data-marker="drag.geometry.value.marker ? 'true' : 'false'"
    :data-drag-state="drag.state.value"
    :data-preview-date="drag.previewDate.value || undefined"
    :data-draggable="draggable ? 'true' : 'false'"
    type="button"
    @focus="emit('focusRow')"
    @pointerdown.stop="drag.begin"
    @pointermove.stop="drag.move"
    @pointerup.stop="drag.finish"
    @pointercancel.stop="drag.cancel"
    @lostpointercapture="drag.onLostPointerCapture"
    @keydown="drag.onKeydown"
    @click="!drag.click($event) && emit('click', $event)"
  >
    <span class="eotion-timeline-bar-shape" :class="{ 'is-range': !geometry.marker }" :data-testid="geometry.marker ? 'timeline-marker' : undefined" aria-hidden="true" />
    <span class="eotion-timeline-bar-content">
      <span class="eotion-timeline-bar-title">{{ title || '无标题' }}</span>
      <span v-if="visibleProperties.some(property => property.displayText)" class="eotion-timeline-bar-properties">
        <span v-for="property in visibleProperties.filter(item => item.displayText)" :key="property.propertyId">
          {{ property.displayText }}
        </span>
      </span>
    </span>
  </button>
  <div
    v-if="drag.previewDate.value"
    class="eotion-timeline-drag-preview"
    :style="previewLabelStyle"
    data-testid="timeline-drag-preview"
    aria-live="polite"
    aria-atomic="true"
  >预览日期 {{ drag.previewDate.value }}</div>
</template>

<style scoped>
.eotion-timeline-bar {
  position: absolute;
  z-index: 3;
  display: flex;
  min-width: 0;
  box-sizing: border-box;
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
}
.eotion-timeline-bar:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-bar.is-draggable { cursor: grab; touch-action: pan-y; }
.eotion-timeline-bar.is-draggable.is-dragging { cursor: grabbing; }
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
.eotion-timeline-bar--marker:focus-visible .eotion-timeline-bar-shape { box-shadow: 0 0 0 3px color-mix(in srgb, var(--e-color-focus, var(--editor-focus)) 28%, transparent); }
@media (pointer:coarse) { .eotion-timeline-bar--marker { width:44px; height:44px; } }
</style>
