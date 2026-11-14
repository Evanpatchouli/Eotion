<script setup lang="ts">
import { IconName } from '../../ui/icons'
import EotionButton from '../../ui/EotionButton.vue'
import EotionIcon from '../../ui/EotionIcon.vue'
import type { TimelineScaleId } from './types'

defineProps<{
  scale: TimelineScaleId
  periodLabel: string
}>()

const emit = defineEmits<{
  previous: []
  today: []
  next: []
  selectScale: [scale: TimelineScaleId]
}>()

const scales: { id: TimelineScaleId; label: string }[] = [
  { id: 'hour', label: '小时' },
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'biweek', label: '双周' },
  { id: 'month', label: '月' },
  { id: 'quarter', label: '季度' },
  { id: 'year', label: '年' },
]
</script>

<template>
  <header class="eotion-timeline-header">
    <span class="eotion-timeline-period" aria-live="polite">{{ periodLabel }}</span>
    <div class="eotion-timeline-controls">
      <label class="eotion-timeline-scale-control">
        <span class="eotion-sr-only">时间轴刻度</span>
        <select :value="scale" aria-label="时间轴刻度" @change="emit('selectScale', ($event.target as HTMLSelectElement).value as TimelineScaleId)">
          <option v-for="item in scales" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>
      <EotionButton class="eotion-timeline-arrow" variant="ghost" aria-label="上一个时间段" title="上一个时间段" @click="emit('previous')">
        <EotionIcon :name="IconName.ArrowLeft" :size="18" />
      </EotionButton>
      <EotionButton class="eotion-timeline-today" variant="ghost" @click="emit('today')">今天</EotionButton>
      <EotionButton class="eotion-timeline-arrow" variant="ghost" aria-label="下一个时间段" title="下一个时间段" @click="emit('next')">
        <EotionIcon :name="IconName.ArrowLeft" :size="18" class="eotion-timeline-arrow-next" />
      </EotionButton>
    </div>
  </header>
</template>

<style scoped>
.eotion-timeline-header { display:flex; min-width:0; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding:4px 0; }
.eotion-timeline-controls { display:flex; min-width:0; flex:0 0 auto; align-items:center; justify-content:flex-end; gap:4px; }
.eotion-timeline-arrow { width:36px; min-height:36px; padding:0; }
.eotion-timeline-today { min-height:36px; padding:0 8px; }
.eotion-timeline-arrow-next { transform:rotate(180deg); }
.eotion-timeline-period { min-width:0; flex:1 1 140px; overflow:hidden; color:var(--e-color-text-primary, var(--editor-text)); font-size:14px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.eotion-timeline-scale-control { min-width:0; }
.eotion-timeline-scale-control select { max-width:100%; min-width:0; min-height:36px; border:0; border-radius:var(--e-radius-control, 6px); padding:0 4px 0 8px; background:transparent; color:var(--e-color-text-primary, var(--editor-text)); font:inherit; cursor:pointer; }
.eotion-timeline-scale-control select:focus-visible { outline:var(--e-focus-ring-width, 2px) solid var(--e-color-focus, var(--editor-focus)); outline-offset:2px; }
.eotion-sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; clip-path:inset(50%); }
@media (pointer: coarse) { .eotion-timeline-arrow, .eotion-timeline-today { min-height:36px; } }
</style>
