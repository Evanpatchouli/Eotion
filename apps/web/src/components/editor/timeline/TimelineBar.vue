<script setup lang="ts">
import type { TimelineItemGeometry } from './layout'

const props = defineProps<{
  geometry: TimelineItemGeometry
  title: string
  dateLabel?: string
  visibleProperties: readonly { propertyId: string; propertyType: string; displayText: string }[]
  selected: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
  focusRow: []
}>()

function tooltip(): string {
  const details = props.visibleProperties.filter(property => property.displayText).map(property => property.displayText)
  const diagnostic = props.geometry.diagnostic === 'calendar-day-skipped' ? '显示时区内该日不存在' : ''
  return [props.title || '无标题', props.dateLabel, diagnostic, ...details].filter(Boolean).join(' · ')
}
</script>

<template>
  <button
    class="eotion-timeline-bar"
    :class="{ 'eotion-timeline-bar--marker': geometry.marker, 'is-selected': selected }"
    :style="{
      left: `${geometry.x}px`,
      top: `${geometry.top - geometry.rowTop + (geometry.marker ? geometry.height / 2 : 0)}px`,
      width: geometry.marker ? undefined : `${Math.max(0, geometry.width)}px`,
      borderWidth: !geometry.marker && geometry.width < 2 ? '0' : undefined,
    }"
    :title="tooltip()"
    :aria-label="tooltip() || title || '无标题'"
    :aria-pressed="selected"
    data-testid="timeline-bar"
    :data-record-id="geometry.recordId"
    :data-kind="geometry.kind"
    :data-marker="geometry.marker ? 'true' : 'false'"
    type="button"
    @focus="emit('focusRow')"
    @click="emit('click', $event)"
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
.eotion-timeline-bar.is-selected { border-color: var(--e-color-focus, var(--editor-focus)); background: var(--e-color-selected, var(--editor-selected)); }
.eotion-timeline-bar:focus-visible { z-index: 5; outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 1px; }
.eotion-timeline-bar-shape { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-bar-shape.is-range { width: 100%; opacity: .12; }
.eotion-timeline-bar-content { position: relative; display:flex; min-width:0; width:100%; align-items:center; gap:6px; overflow:hidden; padding:0 8px; }
.eotion-timeline-bar-title { min-width: 0; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.eotion-timeline-bar-properties { display: flex; min-width: 0; gap: 4px; overflow: hidden; color: var(--e-color-text-secondary, var(--editor-muted)); font-size: 11px; white-space: nowrap; }
.eotion-timeline-bar-properties span { overflow: hidden; text-overflow: ellipsis; }
.eotion-timeline-bar--marker { z-index: 4; width:24px; height:24px; justify-content: center; overflow: visible; border: 0; padding: 0; background: transparent; transform:translate(-50%, -50%); }
.eotion-timeline-bar--marker:hover, .eotion-timeline-bar--marker.is-selected { background: transparent; }
.eotion-timeline-bar--marker .eotion-timeline-bar-shape { position: relative; z-index: 1; inset: auto; width: 12px; height: 12px; flex: 0 0 12px; transform: rotate(45deg); border: 2px solid var(--e-color-accent, var(--editor-accent)); background: var(--e-color-surface, var(--editor-surface)); }
.eotion-timeline-bar--marker .eotion-timeline-bar-content { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; }
.eotion-timeline-bar--marker:hover .eotion-timeline-bar-shape { background: var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-bar--marker.is-selected .eotion-timeline-bar-shape { background: var(--e-color-accent, var(--editor-accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--e-color-accent, var(--editor-accent)) 24%, transparent); }
.eotion-timeline-bar--marker:focus-visible .eotion-timeline-bar-shape { box-shadow: 0 0 0 3px color-mix(in srgb, var(--e-color-focus, var(--editor-focus)) 28%, transparent); }
@media (pointer:coarse) { .eotion-timeline-bar--marker { width:44px; height:44px; } }
</style>
