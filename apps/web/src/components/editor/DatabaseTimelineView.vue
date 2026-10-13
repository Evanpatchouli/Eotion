<script setup lang="ts">
import type { DatabaseTimelineViewOptions, DatabaseViewConfig } from '@eotion/domain/database'
import { computed, ref, watch } from 'vue'

import { IconName } from '../ui/icons'
import EotionIcon from '../ui/EotionIcon.vue'
import TimelineHeader from './timeline/TimelineHeader.vue'
import TimelineViewport from './timeline/TimelineViewport.vue'
import { useTimelineViewport } from './timeline/useTimelineViewport'

const props = defineProps<{
  scope: string
  config: DatabaseViewConfig
  recordLinks: { id: string; pageId: string; title: string }[]
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
}>()
const recordsExpanded = ref(false)
watch(() => props.recordLinks.length, count => { if (count === 0) recordsExpanded.value = false })

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const rulerAnchor = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const timelineOptions = computed(() => (props.config.options as DatabaseTimelineViewOptions | undefined)?.timeline)
const configuredScale = computed(() => timelineOptions.value?.scale ?? 'month')
const viewport = useTimelineViewport({
  root,
  scroller,
  rulerAnchor,
  body,
  scope: () => props.scope,
  configuredScale,
})
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
      @scroller-ref="viewport.bindScroller"
      @ruler-ref="viewport.bindRulerAnchor"
      @body-ref="viewport.bindBody"
    />
    <p class="eotion-database-timeline-stage">记录时间条将在后续阶段显示。</p>
    <p v-if="recordLinks.length === 0" class="eotion-database-timeline-empty">暂无记录</p>
    <details v-else class="eotion-database-timeline-records" @toggle="recordsExpanded = ($event.currentTarget as HTMLDetailsElement).open">
      <summary>记录（{{ recordLinks.length }}）</summary>
      <ul v-if="recordsExpanded">
        <li v-for="record in recordLinks" :key="record.id">
          <button
            class="eotion-database-timeline-record-link"
            type="button"
            :aria-label="`打开记录：${record.title || '无标题'}`"
            @click="emit('openRecord', $event, record.pageId)"
          >
            <span>{{ record.title || '无标题' }}</span>
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
.eotion-database-timeline-stage {
  margin: 10px 0 0;
  color: var(--e-color-text-secondary, var(--editor-muted));
  font-size: 13px;
}
.eotion-database-timeline-records { margin-top: 10px; border-top: 1px solid var(--e-color-border, var(--border-editor)); }
.eotion-database-timeline-records summary { min-height: 40px; padding: 10px 2px; color: var(--e-color-text-secondary, var(--editor-muted)); cursor: pointer; }
.eotion-database-timeline-records summary:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-records ul { display: grid; gap: 2px; margin: 0; padding: 0 0 8px; list-style: none; }
.eotion-database-timeline-record-link { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--e-radius-control, 6px); padding: 6px 8px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.eotion-database-timeline-record-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-database-timeline-record-link :deep(svg) { flex: 0 0 auto; color: var(--e-color-text-secondary, var(--editor-muted)); }
.eotion-database-timeline-record-link:hover { background: var(--e-color-hover, var(--editor-hover)); }
.eotion-database-timeline-record-link:focus-visible { outline: var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset: 2px; }
.eotion-database-timeline-empty { margin: 10px 0 0; padding: 8px 0; color: var(--e-color-text-secondary, var(--editor-muted)); }
</style>
