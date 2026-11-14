<script setup lang="ts">
import type { DatabaseProperty } from '@eotion/domain/database'
import type { TimelineRowGeometry } from './layout'
import EotionIcon from '../../ui/EotionIcon.vue'
import { IconName } from '../../ui/icons'
import type { DatabaseViewGroupKey } from '@eotion/contracts'
import type { DatabaseGroupWindow } from '../databaseGroupWindows'
import { databaseGroupKeyId } from '../databaseGroupWindows'
import type { TimelineGroupHeader } from './groupLayout'
import TimelineGroupHeaderView from './TimelineGroupHeader.vue'
import { computed } from 'vue'

const props = defineProps<{
  columns: readonly DatabaseProperty[]
  displayMap: ReadonlyMap<string, ReadonlyMap<string, string>>
  rows: readonly TimelineRowGeometry[]
  groupHeaders?: readonly TimelineGroupHeader[]
  groupWindows?: readonly DatabaseGroupWindow[]
  bodyHeight: number
  pinY: number
  selectedPageId: string | null
  hoveredRecordId: string | null
  toggleDisabled: boolean
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
  hoverRecord: [recordId: string | null]
  focusRow: [rowIndex: number]
  toggleVisibility: []
  toggleGroup: [key: DatabaseViewGroupKey, collapsed: boolean]
  loadGroupMore: [key: DatabaseViewGroupKey]
}>()
function groupWindow(header: TimelineGroupHeader): DatabaseGroupWindow { return props.groupWindows!.find(group => databaseGroupKeyId(group.key) === databaseGroupKeyId(header.key))! }

function isTitle(property: DatabaseProperty): boolean {
  return property.type === 'title'
}

const contentWidth = computed(() => props.columns.reduce((width, property) => width + (isTitle(property) ? 180 : 128), 0))
const contentStyle = computed(() => ({ width: `max(100%, ${contentWidth.value}px)` }))
function cellStyle(property: DatabaseProperty) {
  const width = isTitle(property) ? 180 : 128
  return { flex: `0 0 ${width}px`, width: `${width}px`, minWidth: `${width}px` }
}

function displayText(row: TimelineRowGeometry, property: DatabaseProperty): string {
  if (isTitle(property)) return row.item.title || '无标题'
  return props.displayMap.get(row.item.recordId)?.get(property.id) || '—'
}
</script>

<template>
  <aside class="eotion-timeline-frozen" data-testid="timeline-frozen-table" aria-label="记录属性">
    <div class="eotion-timeline-frozen-scroll" data-testid="timeline-frozen-scroll" tabindex="0" aria-label="横向滚动记录属性">
    <div class="eotion-timeline-frozen-ruler-slot" :style="contentStyle">
      <div
        class="eotion-timeline-frozen-header"
        :style="{ ...contentStyle, transform: `translateY(${pinY}px)` }"
        data-testid="timeline-frozen-header"
      >
        <div v-for="property in columns" :key="property.id" class="eotion-timeline-frozen-cell" :class="{ 'is-title': isTitle(property) }" :style="cellStyle(property)" :title="property.name" :data-property-id="property.id">
          <span>{{ property.name }}</span>
        </div>
      </div>
    </div>
    <div class="eotion-timeline-frozen-body" :style="{ ...contentStyle, height: `${bodyHeight}px`, minHeight: `${bodyHeight}px` }" data-testid="timeline-frozen-body">
      <div v-for="header in groupHeaders" :key="databaseGroupKeyId(header.key)" class="eotion-timeline-frozen-group" :style="{ top: `${header.top}px`, height: `${header.height}px` }">
        <TimelineGroupHeaderView :header="header" :window="groupWindow(header)" @toggle="emit('toggleGroup', header.key, !header.collapsed)" @load-more="emit('loadGroupMore', header.key)" />
      </div>
      <div
        v-for="row in rows"
        :key="row.item.recordId"
        class="eotion-timeline-frozen-row"
        :class="{ 'is-hovered': hoveredRecordId === row.item.recordId, 'is-selected': selectedPageId === row.item.pageId }"
        :style="{ ...contentStyle, top: `${row.top}px`, height: `${row.height}px` }"
        data-timeline-frozen-row
        :data-row-index="row.rowIndex"
        :data-record-id="row.item.recordId"
        @focusin="emit('focusRow', row.rowIndex)"
        @pointerenter="emit('hoverRecord', row.item.recordId)"
        @pointerleave="emit('hoverRecord', null)"
      >
        <div v-for="property in columns" :key="property.id" class="eotion-timeline-frozen-cell" :class="{ 'is-title': isTitle(property) }" :style="cellStyle(property)" :title="displayText(row, property)" :data-property-id="property.id">
          <slot name="cell" :record-id="row.item.recordId" :property-id="property.id" :display-text="displayText(row, property)" :page-id="row.item.pageId">
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
          </slot>
        </div>
      </div>
    </div>
    </div>
    <button
      class="eotion-timeline-frozen-toggle"
      type="button"
      data-testid="timeline-frozen-toggle"
      aria-label="折叠左侧记录表格"
      aria-expanded="true"
      title="折叠左侧记录表格"
      :style="{ transform: `translateY(${pinY}px)` }"
      :disabled="toggleDisabled"
      @click="emit('toggleVisibility')"
    ><EotionIcon :name="IconName.SidebarClose" :size="18" aria-hidden="true" /></button>
  </aside>
</template>

<style scoped>
.eotion-timeline-frozen { position:relative; flex:0 0 min(360px, 44%); width:min(360px, 44%); min-width:120px; max-width:45%; overflow:clip; border-right:1px solid var(--e-color-border, var(--border-editor)); }
.eotion-timeline-frozen-scroll { width:100%; max-width:100%; overflow-x:auto; overflow-y:clip; overscroll-behavior-inline:contain; }
.eotion-timeline-frozen-scroll:focus-visible { outline:2px solid var(--e-color-focus, var(--editor-focus)); outline-offset:-2px; }
.eotion-timeline-frozen-ruler-slot { position:relative; z-index:2; height:var(--timeline-header-height, 56px); }
.eotion-timeline-frozen-header { position:absolute; top:0; left:0; display:flex; height:var(--timeline-header-height, 56px); overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); background:var(--e-color-canvas, var(--editor-canvas)); will-change:transform; }
.eotion-timeline-frozen-toggle { position:absolute; z-index:3; top:8px; right:6px; display:inline-flex; width:36px; height:36px; flex:0 0 36px; align-items:center; justify-content:center; border:1px solid var(--e-color-border, var(--border-editor)); border-radius:var(--e-radius-control, 6px); padding:0; background:var(--e-color-canvas, var(--editor-canvas)); color:var(--e-color-text-secondary, var(--editor-muted)); cursor:pointer; }
.eotion-timeline-frozen-toggle:hover:not(:disabled) { background:var(--e-color-hover, var(--editor-hover)); color:var(--e-color-text-primary, var(--editor-text)); }
.eotion-timeline-frozen-toggle:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:2px; }
.eotion-timeline-frozen-toggle:disabled { cursor:not-allowed; opacity:.55; }
.eotion-timeline-frozen-body { position:relative; min-height:240px; overflow:visible; }
.eotion-timeline-frozen-group { position:absolute; left:0; width:100%; }
.eotion-timeline-frozen-group :deep(.eotion-timeline-group-header) { overflow:visible; }
.eotion-timeline-frozen-group :deep(.eotion-timeline-group-toggle) { position:sticky; left:8px; z-index:1; background:var(--e-color-surface, var(--editor-surface)); }
.eotion-timeline-frozen-row { position:absolute; left:0; display:flex; width:100%; border-bottom:1px solid var(--e-color-border, var(--border-editor)); }
.eotion-timeline-frozen-row.is-hovered { background:var(--e-color-hover, var(--editor-hover)); }
.eotion-timeline-frozen-row.is-selected { background:var(--e-color-selected, var(--editor-selected)); }
.eotion-timeline-frozen-cell { box-sizing:border-box; display:flex; align-items:center; overflow:hidden; padding:0 8px; color:var(--e-color-text-secondary, var(--editor-muted)); font-size:12px; white-space:nowrap; }
.eotion-timeline-frozen-cell.is-title { color:var(--e-color-text-primary, var(--editor-text)); font-weight:600; }
.eotion-timeline-frozen-cell > span,.eotion-timeline-frozen-title { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-frozen-title { align-self:stretch; box-sizing:border-box; width:100%; height:100%; border:0; padding:0; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }
.eotion-timeline-frozen-title:hover { color:var(--e-color-accent, var(--editor-accent)); }
.eotion-timeline-frozen-title:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:1px; }
@media (prefers-reduced-motion: reduce) { .eotion-timeline-frozen-header { will-change:auto; } }
</style>
