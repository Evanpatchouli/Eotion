<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineTick } from './types'

const props = defineProps<{ ticks: (TimelineTick & { labelOffsetX: number })[] }>()
const positionedTicks = computed(() => props.ticks.map(tick => ({
  ...tick,
  style: { left: `${tick.x}px`, width: `${tick.width}px` },
  labelStyle: {
    left: `${tick.labelOffsetX}px`,
    ...(tick.unit === 'day' && tick.level === 'minor'
      ? { maxWidth: `${Math.max(0, tick.width - tick.labelOffsetX)}px`, boxSizing: 'border-box' as const }
      : {}),
  },
})))
</script>

<template>
  <div class="eotion-timeline-ruler" data-testid="timeline-ruler" aria-hidden="true">
    <div v-for="tick in positionedTicks" :key="tick.key" class="eotion-timeline-ruler-tick" :class="`eotion-timeline-ruler-tick--${tick.level}`" :style="tick.style">
      <span class="eotion-timeline-ruler-label" :class="`eotion-timeline-ruler-label--${tick.level}`" :style="tick.labelStyle" :title="tick.label">{{ tick.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.eotion-timeline-ruler { position:relative; width:100%; height:var(--timeline-header-height, 56px); overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); background:var(--e-color-canvas, var(--editor-canvas)); }
.eotion-timeline-ruler-tick { position:absolute; top:0; height:100%; box-sizing:border-box; border-left:1px solid; }
.eotion-timeline-ruler-tick--major { border-color:color-mix(in srgb,var(--e-color-border-strong, var(--border-editor)) 75%,transparent); }
.eotion-timeline-ruler-tick--minor { border-color:color-mix(in srgb,var(--e-color-border, var(--border-editor)) 55%,transparent); }
.eotion-timeline-ruler-label { position:absolute; display:block; width:max-content; max-width:min(260px,80vw); overflow:hidden; padding:5px; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:11px; line-height:14px; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-ruler-label--major { top:0; color:var(--e-color-text-primary, var(--editor-text)); font-size:12px; font-weight:600; }
.eotion-timeline-ruler-label--minor { top:28px; color:var(--e-color-text-secondary, var(--editor-muted)); }
@media (pointer:coarse) { .eotion-timeline-ruler-label--minor { top:32px; } }
</style>
