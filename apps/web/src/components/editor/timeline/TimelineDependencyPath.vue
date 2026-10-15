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
  hit?: boolean
  selected?: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

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
    :marker-end="hit ? undefined : `url(#${markerId})`"
    :data-start-x="geometry.start.x"
    :data-start-y="geometry.start.y"
    :data-end-x="geometry.end.x"
    :data-end-y="geometry.end.y"
    :data-edge-id="edge.id"
    :data-predecessor-id="edge.predecessorRecordId"
    :data-successor-id="edge.successorRecordId"
    :data-testid="hit ? 'timeline-dependency-hit' : 'timeline-dependency-path'"
    fill="none"
    :stroke="hit ? 'transparent' : selected ? 'var(--e-color-accent, var(--editor-accent))' : 'var(--e-color-text-secondary, var(--editor-muted))'"
    :stroke-width="hit ? 14 : selected ? 2 : 1.25"
    :opacity="hit ? 1 : 0.7"
    :pointer-events="hit ? 'stroke' : 'none'"
    aria-hidden="true"
    focusable="false"
    @click.stop="hit && emit('select', edge.id)"
  />
</template>
