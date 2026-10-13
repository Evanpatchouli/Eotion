<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseTimelineViewOptions, DatabaseViewConfig } from '@eotion/domain/database'
import { computed, ref, watch } from 'vue'

import { IconName } from '../ui/icons'
import EotionIcon from '../ui/EotionIcon.vue'
import TimelineHeader from './timeline/TimelineHeader.vue'
import TimelineViewport from './timeline/TimelineViewport.vue'
import { layoutTimelineItems } from './timeline/layout'
import { projectTimelineRecords } from './timeline/projection'
import { resolveTimelineTemporalGeometry } from './timeline/geometry'
import { viewportTransform } from './timeline/viewport'
import { useTimelineViewport } from './timeline/useTimelineViewport'

type TimelineRecord = DatabaseViewRecordsResponse['records'][number]

const props = defineProps<{
  scope: string
  config: DatabaseViewConfig
  records: readonly TimelineRecord[]
  properties: readonly DatabasePropertyResponse[]
  formatValue: (value: unknown, property: DatabasePropertyResponse) => string
  selectedPageId: string | null
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
}>()

const recordsExpanded = ref(false)

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const rulerAnchor = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const focusedRecordId = ref<string | null>(null)
const timelineOptions = computed(() => (props.config.options as DatabaseTimelineViewOptions | undefined)?.timeline)
const configuredScale = computed(() => timelineOptions.value?.scale ?? 'month')
const projectedItems = computed(() => projectTimelineRecords({
  records: props.records,
  properties: props.properties,
  config: props.config,
  formatValue: props.formatValue,
}))
const rowIndexByRecordId = computed(() => new Map(projectedItems.value.map(item => [item.recordId, item.rowIndex])))
const focusedRowIndex = computed(() => focusedRecordId.value === null ? null : rowIndexByRecordId.value.get(focusedRecordId.value) ?? null)
const unscheduledItems = computed(() => projectedItems.value.filter(item => item.kind === 'unscheduled'))
watch(() => unscheduledItems.value.length, count => { if (count === 0) recordsExpanded.value = false })
watch(() => props.scope, () => { focusedRecordId.value = null; recordsExpanded.value = false }, { flush: 'sync' })
const viewport = useTimelineViewport({
  root,
  scroller,
  rulerAnchor,
  body,
  scope: () => props.scope,
  configuredScale,
  rowCount: () => projectedItems.value.length,
  focusedRowIndex: () => focusedRowIndex.value,
})
const temporalMap = computed(() => resolveTimelineTemporalGeometry(projectedItems.value, viewport.displayTimeZone.value))
const rowGeometry = computed(() => {
  const state = viewport.state.value
  if (!state) return []
  return layoutTimelineItems(projectedItems.value, temporalMap.value, viewportTransform(state), viewport.rowWindow.value)
})
const bodyHeight = computed(() => Math.max(240, viewport.rowWindow.value.totalHeight))

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Element && next.closest('[data-timeline-row]') && root.value?.contains(next)) return
  focusedRecordId.value = null
}

function focusRow(rowIndex: number): void {
  focusedRecordId.value = projectedItems.value[rowIndex]?.recordId ?? null
}

function onUnscheduledToggle(event: Event): void {
  const details = event.currentTarget
  if (!(details instanceof HTMLDetailsElement) || !details.isConnected || !root.value?.contains(details)) return
  recordsExpanded.value = details.open
}

async function openUnscheduledItem(event: MouseEvent, item: typeof unscheduledItems.value[number]): Promise<void> {
  const isSimplePrimary = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  if (!isSimplePrimary) {
    emit('openRecord', event, item.pageId)
    return
  }
  const rowIndex = rowIndexByRecordId.value.get(item.recordId)
  if (rowIndex === undefined) return
  focusedRecordId.value = item.recordId
  const capturedScope = props.scope
  const revealed = await viewport.revealRow(rowIndex)
  if (!revealed || capturedScope !== props.scope || rowIndexByRecordId.value.get(item.recordId) !== rowIndex || !root.value?.isConnected) return
  emit('openRecord', event, item.pageId)
}
</script>

<template>
  <section
    ref="root"
    class="eotion-database-timeline"
    data-testid="database-timeline"
    :data-scale="viewport.effectiveScale.value"
    :data-configured-scale="configuredScale"
    :data-today-ms="viewport.todayMs.value"
    @pointerdown.stop
    @focusout="onFocusOut"
  >
    <TimelineHeader
      :scale="viewport.effectiveScale.value"
      :period-label="viewport.periodLabel.value"
      @previous="viewport.previous"
      @today="viewport.today"
      @next="viewport.next"
      @select-scale="viewport.selectScale"
    />
    <TimelineViewport
      :state="viewport.state.value"
      :ruler-ticks="viewport.rulerTicks.value"
      :grid-ticks="viewport.ticks.value"
      :today-x="viewport.todayX.value"
      :pin-y="viewport.pinY.value"
      :canvas-width-px="viewport.canvasWidthPx.value"
      :body-height="bodyHeight"
      :row-window="viewport.rowWindow.value"
      :rows="rowGeometry"
      :selected-page-id="selectedPageId"
      @scroller-ref="viewport.bindScroller"
      @ruler-ref="viewport.bindRulerAnchor"
      @body-ref="viewport.bindBody"
      @open-record="(event, pageId) => emit('openRecord', event, pageId)"
      @focus-row="focusRow"
    />
    <p v-if="records.length === 0" class="eotion-database-timeline-empty">暂无记录</p>
    <details v-if="unscheduledItems.length > 0" :key="scope" class="eotion-database-timeline-records" @toggle="onUnscheduledToggle">
      <summary>未排期（{{ unscheduledItems.length }}）</summary>
      <ul v-if="recordsExpanded">
        <li v-for="item in unscheduledItems" :key="item.recordId">
          <button
            class="eotion-database-timeline-record-link"
            type="button"
            :data-record-id="item.recordId"
            :aria-label="`打开记录：${item.title || item.recordId}`"
            @click="openUnscheduledItem($event, item)"
          >
            <span>{{ item.title || '无标题' }}</span>
            <EotionIcon :name="IconName.ChevronRight" :size="16" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.eotion-database-timeline {
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: clip;
  color: var(--e-color-text-primary, var(--editor-text));
}
.eotion-database-timeline-records { margin-top: 10px; border-top: 1px solid var(--e-color-border, var(--border-editor)); }
.eotion-database-timeline-records summary { min-height: 40px; padding: 10px 2px; color: var(--e-color-text-secondary, var(--editor-muted)); cursor: pointer; }
.eotion-database-timeline-records summary:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-records ul { display: grid; gap: 2px; margin: 0; padding: 0 0 8px; list-style: none; }
.eotion-database-timeline-record-link { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--e-radius-control, 6px); padding: 6px 8px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.eotion-database-timeline-record-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-database-timeline-record-link small { color: var(--e-color-text-secondary, var(--editor-muted)); font-size: 11px; }
.eotion-database-timeline-record-link :deep(svg) { flex: 0 0 auto; color: var(--e-color-text-secondary, var(--editor-muted)); }
.eotion-database-timeline-record-link:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-database-timeline-record-link:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-empty { margin: 10px 0 0; padding: 8px 0; color: var(--e-color-text-secondary, var(--editor-muted)); }
</style>
