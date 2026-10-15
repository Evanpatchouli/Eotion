<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineItemGeometry } from './layout'
import { layoutTimelineDependency, type TimelineDependencyEdge } from './dependency'

const props = defineProps<{
  edge: TimelineDependencyEdge
  geometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  previewGeometryByRecordId: ReadonlyMap<string, TimelineItemGeometry>
  canvasWidth: number
  markerId: string
}>()

const geometry = computed(() => {
  const predecessor = props.previewGeometryByRecordId.get(props.edge.predecessorRecordId)
    ?? props.geometryByRecordId.get(props.edge.predecessorRecordId)
  const successor = props.previewGeometryByRecordId.get(props.edge.successorRecordId)
    ?? props.geometryByRecordId.get(props.edge.successorRecordId)
  return predecessor && successor
    ? layoutTimelineDependency(predecessor, successor, props.canvasWidth)
    : null
})
</script>

<template>
  <path
    v-if="geometry"
    :d="geometry.path"
    :marker-end="`url(#${markerId})`"
    :data-start-x="geometry.start.x"
    :data-start-y="geometry.start.y"
    :data-end-x="geometry.end.x"
    :data-end-y="geometry.end.y"
    :data-edge-id="edge.id"
    :data-predecessor-id="edge.predecessorRecordId"
    :data-successor-id="edge.successorRecordId"
    data-testid="timeline-dependency-path"
    fill="none"
    stroke="var(--e-color-text-secondary, var(--editor-muted))"
    stroke-width="1.25"
    opacity="0.7"
    aria-hidden="true"
    focusable="false"
  />
</template>
