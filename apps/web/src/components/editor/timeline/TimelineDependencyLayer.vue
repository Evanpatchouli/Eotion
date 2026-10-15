<script setup lang="ts">
import { useId } from 'vue'
import type { TimelineItemGeometry } from './layout'
import type { TimelineDependencyEdge } from './dependency'
import TimelineDependencyPath from './TimelineDependencyPath.vue'

defineProps<{
  edges: readonly TimelineDependencyEdge[]
  windowEdges: readonly TimelineDependencyEdge[]
  geometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  previewGeometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  canvasWidth: number
  bodyHeight: number
}>()

const markerId = `timeline-dependency-arrow-${useId()}`
</script>

<template>
  <svg
    class="eotion-timeline-dependency-layer"
    :width="canvasWidth"
    :height="bodyHeight"
    :viewBox="`0 0 ${canvasWidth} ${bodyHeight}`"
    data-testid="timeline-dependency-layer"
    :data-projected-edge-count="edges.length"
    :data-window-edge-count="windowEdges.length"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <!-- Keep the arrow tip ahead of the endpoint's point diamond. The line
           itself still reaches the shared Bar anchor beneath the Bar layer. -->
      <marker :id="markerId" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="17" refY="3.5" orient="auto">
        <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="currentColor" />
      </marker>
    </defs>
    <TimelineDependencyPath
      v-for="edge in windowEdges"
      :key="edge.id"
      :edge="edge"
      :geometry-by-record-id="geometryByRecordId"
      :preview-geometry-by-record-id="previewGeometryByRecordId"
      :canvas-width="canvasWidth"
      :marker-id="markerId"
    />
  </svg>
</template>

<style scoped>
.eotion-timeline-dependency-layer { position:absolute; z-index:1; top:0; left:0; display:block; overflow:hidden; color:var(--e-color-text-secondary, var(--editor-muted)); pointer-events:none; }
</style>
