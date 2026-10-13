<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ x: number | null }>()
const lineStyle = computed(() => ({ left: props.x === null ? undefined : `${props.x}px` }))
</script>

<template>
  <div v-if="x !== null" class="eotion-timeline-today-layer" aria-hidden="true">
    <i class="eotion-timeline-today-line" data-testid="timeline-today-line" :style="lineStyle" />
  </div>
</template>

<style scoped>
.eotion-timeline-today-layer { position:absolute; z-index:1; inset:0; overflow:hidden; pointer-events:none; }
.eotion-timeline-today-line { position:absolute; top:0; bottom:0; border-left:2px solid var(--e-color-danger, var(--editor-danger)); opacity:.85; pointer-events:none; }
</style>
