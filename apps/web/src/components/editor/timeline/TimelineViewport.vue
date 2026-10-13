<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineTick, TimelineViewportState } from './types'
import TimelineGrid from './TimelineGrid.vue'
import TimelineRuler from './TimelineRuler.vue'
import TimelineTodayLine from './TimelineTodayLine.vue'

const props = defineProps<{
  state: TimelineViewportState | null
  rulerTicks: (TimelineTick & { labelOffsetX: number })[]
  gridTicks: TimelineTick[]
  todayX: number | null
  pinY: number
  canvasWidthPx: number
}>()

const rulerAnchorStyle = computed(() => ({ transform: `translateY(${props.pinY}px)` }))
const canvasStyle = computed(() => ({ width: props.state ? `${props.canvasWidthPx}px` : '100%' }))

const emit = defineEmits<{
  scrollerRef: [element: HTMLElement | null]
  rulerRef: [element: HTMLElement | null]
  bodyRef: [element: HTMLElement | null]
}>()

function setScroller(element: unknown): void {
  emit('scrollerRef', typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null)
}

function setRulerAnchor(element: unknown): void {
  emit('rulerRef', typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null)
}

function setBody(element: unknown): void {
  emit('bodyRef', typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null)
}
</script>

<template>
  <div class="eotion-timeline-viewport" data-testid="timeline-viewport" :data-generation="state?.generation">
    <div class="eotion-timeline-ruler-slot">
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
          data-testid="timeline-canvas-body"
          :ref="setBody"
        >
          <TimelineGrid :ticks="gridTicks" />
          <TimelineTodayLine :x="todayX" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eotion-timeline-viewport { position:relative; min-width:0; max-width:100%; overflow:clip; }
.eotion-timeline-ruler-slot { position:relative; z-index:2; height:56px; }
.eotion-timeline-ruler-anchor { position:absolute; top:0; left:0; width:100%; height:56px; overflow:hidden; background:var(--e-color-canvas, var(--editor-canvas)); will-change:transform; }
.eotion-timeline-scroll { width:100%; min-width:0; max-width:100%; min-height:240px; overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain; }
.eotion-timeline-scroll:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:-2px; }
.eotion-timeline-canvas { position:relative; min-width:100%; min-height:240px; }
.eotion-timeline-body { position:relative; width:100%; min-height:240px; isolation:isolate; }
@media (prefers-reduced-motion: reduce) { .eotion-timeline-ruler-anchor { will-change:auto; } }
</style>
