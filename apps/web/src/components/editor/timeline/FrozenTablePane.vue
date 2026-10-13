<script setup lang="ts">
import type { DatabaseProperty } from '@eotion/domain/database'
import type { TimelineRowGeometry } from './layout'

const props = defineProps<{
  columns: readonly DatabaseProperty[]
  displayMap: ReadonlyMap<string, ReadonlyMap<string, string>>
  rows: readonly TimelineRowGeometry[]
  bodyHeight: number
  pinY: number
  selectedPageId: string | null
  hoveredRecordId: string | null
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
  hoverRecord: [recordId: string | null]
  focusRow: [rowIndex: number]
}>()

function isTitle(property: DatabaseProperty): boolean {
  return property.type === 'title'
}

function displayText(row: TimelineRowGeometry, property: DatabaseProperty): string {
  if (isTitle(property)) return row.item.title || '无标题'
  return props.displayMap.get(row.item.recordId)?.get(property.id) || '—'
}
</script>

<template>
  <aside class="eotion-timeline-frozen" data-testid="timeline-frozen-table" aria-label="记录属性">
    <div class="eotion-timeline-frozen-ruler-slot">
      <div
        class="eotion-timeline-frozen-header"
        :style="{ transform: `translateY(${pinY}px)` }"
        data-testid="timeline-frozen-header"
      >
        <div v-for="property in columns" :key="property.id" class="eotion-timeline-frozen-cell" :class="{ 'is-title': isTitle(property) }" :title="property.name" :data-property-id="property.id">
          <span>{{ property.name }}</span>
        </div>
      </div>
    </div>
    <div class="eotion-timeline-frozen-body" :style="{ height: `${bodyHeight}px`, minHeight: `${bodyHeight}px` }" data-testid="timeline-frozen-body">
      <div
        v-for="row in rows"
        :key="row.item.recordId"
        v-memo="[row.item, row.top, row.height, displayMap.get(row.item.recordId), selectedPageId === row.item.pageId, hoveredRecordId === row.item.recordId]"
        class="eotion-timeline-frozen-row"
        :class="{ 'is-hovered': hoveredRecordId === row.item.recordId, 'is-selected': selectedPageId === row.item.pageId }"
        :style="{ top: `${row.top}px`, height: `${row.height}px` }"
        data-timeline-frozen-row
        :data-row-index="row.rowIndex"
        :data-record-id="row.item.recordId"
        @pointerenter="emit('hoverRecord', row.item.recordId)"
        @pointerleave="emit('hoverRecord', null)"
      >
        <div v-for="property in columns" :key="property.id" class="eotion-timeline-frozen-cell" :class="{ 'is-title': isTitle(property) }" :title="displayText(row, property)" :data-property-id="property.id">
          <button
            v-if="isTitle(property)"
            type="button"
            class="eotion-timeline-frozen-title"
            :aria-pressed="selectedPageId === row.item.pageId"
            @focus="emit('focusRow', row.rowIndex)"
            @click="emit('openRecord', $event, row.item.pageId)"
          >
            {{ displayText(row, property) }}
          </button>
          <span v-else>{{ displayText(row, property) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.eotion-timeline-frozen { position:relative; flex:0 1 32%; width:32%; min-width:120px; max-width:min(480px, 45%); overflow:clip; border-right:1px solid var(--e-color-border, var(--border-editor)); }
.eotion-timeline-frozen-ruler-slot { position:relative; z-index:2; height:var(--timeline-header-height, 56px); }
.eotion-timeline-frozen-header { position:absolute; top:0; left:0; display:flex; width:100%; height:var(--timeline-header-height, 56px); overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); background:var(--e-color-canvas, var(--editor-canvas)); will-change:transform; }
.eotion-timeline-frozen-body { position:relative; min-height:240px; overflow:clip; }
.eotion-timeline-frozen-row { position:absolute; left:0; display:flex; width:100%; border-bottom:1px solid var(--e-color-border, var(--border-editor)); }
.eotion-timeline-frozen-row.is-hovered { background:var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-frozen-row.is-selected { background:var(--e-color-selected, var(--editor-selected)); }
.eotion-timeline-frozen-cell { display:flex; flex:1 1 0; min-width:0; align-items:center; overflow:hidden; padding:0 8px; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:12px; white-space:nowrap; }
.eotion-timeline-frozen-cell.is-title { flex:1.35 1 0; color:var(--e-color-text-primary, var(--editor-text)); font-weight:600; }
.eotion-timeline-frozen-cell > span,.eotion-timeline-frozen-title { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-frozen-title { width:100%; border:0; padding:0; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }
.eotion-timeline-frozen-title:hover { color:var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-frozen-title:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:1px; }
@media (prefers-reduced-motion: reduce) { .eotion-timeline-frozen-header { will-change:auto; } }
</style>
