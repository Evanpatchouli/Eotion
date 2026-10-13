<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineTick } from './types'

const props = defineProps<{ ticks: TimelineTick[] }>()
const gridTicks = computed(() => props.ticks.map(tick => ({
  key: tick.key,
  level: tick.level,
  style: { left: `${tick.x}px` },
})))
</script>

<template>
  <div class="eotion-timeline-grid" data-testid="timeline-grid" aria-hidden="true">
    <i v-for="tick in gridTicks" :key="tick.key" class="eotion-timeline-grid-line" :class="`eotion-timeline-grid-line--${tick.level}`" :style="tick.style" />
  </div>
</template>

<style scoped>
.eotion-timeline-grid { position:absolute; z-index:0; inset:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-grid-line { position:absolute; top:0; bottom:0; border-left:1px solid; }
.eotion-timeline-grid-line--major { border-color:color-mix(in srgb,var(--e-color-border, var(--border-editor)) 62%,transparent); }
.eotion-timeline-grid-line--minor { border-color:color-mix(in srgb,var(--e-color-border, var(--border-editor)) 30%,transparent); }
</style>
