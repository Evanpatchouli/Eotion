<script setup lang="ts">
import { computed, useId } from 'vue'
import type { TimelineItemGeometry } from './layout'
import { layoutTimelineDependency, type TimelineDependencyEdge } from './dependency'
import TimelineDependencyPath from './TimelineDependencyPath.vue'

const emit = defineEmits<{ selectEdge: [id: string] }>()

const markerId = `timeline-dependency-arrow-${useId()}`
const props = defineProps<{
  edges: readonly TimelineDependencyEdge[]
  windowEdges: readonly TimelineDependencyEdge[]
  geometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  previewGeometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  canvasWidth: number
  bodyHeight: number
  selectedEdgeId: string | null
  previewEdge: TimelineDependencyEdge | null
  previewSourceRecordId: string | null
  previewPointer: { x: number; y: number } | null
}>()
const previewPath = computed(() => {
  const edge = props.previewEdge
  if (edge) {
    const source = props.geometryByRecordId.get(edge.predecessorRecordId)
    const target = props.geometryByRecordId.get(edge.successorRecordId)
    return source && target ? layoutTimelineDependency(source, target, props.canvasWidth)?.path ?? null : null
  }
  const source = props.previewSourceRecordId && props.geometryByRecordId.get(props.previewSourceRecordId)
  const pointer = props.previewPointer
  if (!source || !pointer) return null
  const target: TimelineItemGeometry = {
    recordId: '__pointer__', kind: 'point', x: pointer.x, width: 0,
    rawX: pointer.x, rawWidth: 0, rowIndex: source.rowIndex,
    rowTop: pointer.y - source.height / 2, top: pointer.y - source.height / 2,
    height: source.height, clippedLeft: false, clippedRight: false, marker: true,
  }
  return layoutTimelineDependency(source, target, props.canvasWidth)?.path ?? null
})
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
      :selected="selectedEdgeId === edge.id"
    />
    <path v-if="previewPath" :d="previewPath" data-testid="timeline-dependency-preview" fill="none" stroke="var(--e-color-accent, var(--editor-accent))" stroke-width="2" stroke-dasharray="5 4" pointer-events="none" aria-hidden="true" />
  </svg>
  <svg
    v-if="windowEdges.length"
    class="eotion-timeline-dependency-hit-layer"
    :width="canvasWidth"
    :height="bodyHeight"
    :viewBox="`0 0 ${canvasWidth} ${bodyHeight}`"
    aria-hidden="true"
    focusable="false"
  >
    <TimelineDependencyPath
      v-for="edge in windowEdges"
      :key="edge.id"
      :edge="edge"
      :geometry-by-record-id="geometryByRecordId"
      :preview-geometry-by-record-id="previewGeometryByRecordId"
      :canvas-width="canvasWidth"
      :marker-id="markerId"
      hit
      @select="emit('selectEdge', $event)"
    />
  </svg>
</template>

<style scoped>
.eotion-timeline-dependency-layer { position:absolute; z-index:1; top:0; left:0; display:block; overflow:hidden; color:var(--e-color-text-secondary, var(--editor-muted)); pointer-events:none; }
.eotion-timeline-dependency-hit-layer { position:absolute; z-index:3; top:0; left:0; display:block; overflow:hidden; pointer-events:none; }
</style>
