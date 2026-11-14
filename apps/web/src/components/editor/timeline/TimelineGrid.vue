<script setup lang="ts">
import { computed } from 'vue'
import { timelineLocalDate, timelineWeekendBands } from './weekends'
import type { TimelineTick, TimelineViewportState, Transform } from './types'

const props = defineProps<{ ticks: TimelineTick[]; displayTimeZone: string; state: TimelineViewportState | null; transform: Transform | null }>()
const gridTicks = computed(() => props.ticks.map(tick => ({
  key: tick.key,
  level: tick.level,
  style: { left: `${tick.x}px` },
})))
// These primitive keys change only when the visible date or transform changes,
// so a pixel of native scroll does not regenerate every weekend band.
const firstDate = computed(() => props.state ? timelineLocalDate(props.state.visibleStartMs, props.displayTimeZone) : null)
const lastDate = computed(() => props.state ? timelineLocalDate(Math.max(props.state.visibleStartMs, props.state.visibleEndMs - 1), props.displayTimeZone) : null)
const originMs = computed(() => props.transform?.originMs)
const pxPerMs = computed(() => props.transform?.pxPerMs)
const scale = computed(() => props.transform?.scale)
const weekends = computed(() => {
  if (!firstDate.value || !lastDate.value || originMs.value === undefined || pxPerMs.value === undefined || !scale.value) return []
  const transform: Transform = { originMs: originMs.value, pxPerMs: pxPerMs.value, scale: scale.value,
    displayTimeZone: props.displayTimeZone, scrollLeft: 0, width: 0, generation: 0 }
  return timelineWeekendBands(firstDate.value, lastDate.value, transform)
})
</script>

<template>
  <div class="eotion-timeline-grid" data-testid="timeline-grid" aria-hidden="true">
    <i v-for="weekend in weekends" :key="weekend.date" class="eotion-timeline-weekend" :style="{ left: `${weekend.x}px`, width: `${weekend.width}px` }" :data-boundary-ms="weekend.boundaryMs" :data-date="weekend.date" data-testid="timeline-weekend" />
    <i v-for="tick in gridTicks" :key="tick.key" class="eotion-timeline-grid-line" :class="`eotion-timeline-grid-line--${tick.level}`" :style="tick.style" />
  </div>
</template>

<style scoped>
.eotion-timeline-grid { position:absolute; z-index:0; inset:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-weekend { position:absolute; top:0; bottom:0; background:color-mix(in srgb, var(--e-color-text-primary, var(--editor-text)) 3%, transparent); }
.eotion-timeline-grid-line { position:absolute; top:0; bottom:0; border-left:1px solid; }
.eotion-timeline-grid-line--major { border-color:color-mix(in srgb,var(--e-color-border, var(--border-editor)) 62%,transparent); }
.eotion-timeline-grid-line--minor { border-color:color-mix(in srgb,var(--e-color-border, var(--border-editor)) 30%,transparent); }
</style>
