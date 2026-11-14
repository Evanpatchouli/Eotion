<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { TimelineGroupHeader } from './groupLayout'
import type { DatabaseGroupWindow } from '../databaseGroupWindows'

const props = defineProps<{ header: TimelineGroupHeader; window: DatabaseGroupWindow; observe?: boolean }>()
const emit = defineEmits<{ visible: []; toggle: []; loadMore: [] }>()
const element = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let generation = 0
watch([element, () => props.header.key, () => props.window.collapsed, () => props.window.hasLoaded, () => props.window.error], () => {
  observer?.disconnect()
  observer = null
  const current = ++generation
  if (!props.observe || props.window.collapsed || props.window.hasLoaded || props.window.error || !element.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(entries => {
    if (current === generation && entries.some(entry => entry.isIntersecting) && !props.window.loading) {
      observer?.disconnect()
      emit('visible')
    }
  }, { threshold: 0.01 })
  observer.observe(element.value)
}, { flush: 'post', immediate: true })
onBeforeUnmount(() => { generation++; observer?.disconnect() })
</script>

<template>
  <div ref="element" class="eotion-timeline-group-header" data-timeline-group-header :data-group-id="JSON.stringify(header.key.kind === 'option' ? ['option', header.key.optionId] : ['ungrouped'])" :data-row-index="header.rowIndex">
    <button type="button" class="eotion-timeline-group-toggle" :aria-expanded="!window.collapsed" :aria-label="`${window.collapsed ? '展开' : '折叠'}分组：${header.label}`" @click="emit('toggle')">{{ window.collapsed ? '▸' : '▾' }}</button>
    <span class="eotion-timeline-group-label">{{ header.label }}</span>
    <span v-if="window.loading" role="status">加载中…</span>
    <span v-else-if="window.error" role="alert">加载失败</span>
    <span v-else-if="window.hasLoaded">已加载 {{ window.records.length }} 条{{ window.nextCursor ? '，还有更多' : '' }}</span>
    <button v-if="!window.collapsed && !window.loading && (window.error || !window.hasLoaded || window.nextCursor)" type="button" class="eotion-timeline-group-load" @click="emit('loadMore')">{{ window.error ? '重试' : window.hasLoaded ? '加载更多' : '加载记录' }}</button>
  </div>
</template>

<style scoped>
.eotion-timeline-group-header { box-sizing:border-box; display:flex; align-items:center; gap:7px; width:100%; height:48px; overflow:hidden; border-bottom:1px solid var(--e-color-border, var(--border-editor)); padding:0 8px; background:var(--e-color-surface, var(--editor-surface)); color:var(--e-color-text-secondary, var(--editor-muted)); font-size:11px; white-space:nowrap; }
.eotion-timeline-group-label { min-width:0; overflow:hidden; color:var(--e-color-text-primary, var(--editor-text)); font-size:12px; font-weight:600; text-overflow:ellipsis; }
.eotion-timeline-group-toggle,.eotion-timeline-group-load { flex:none; min-height:32px; border:0; border-radius:4px; padding:0 5px; background:transparent; color:var(--e-color-accent, var(--editor-accent)); font:inherit; cursor:pointer; }
.eotion-timeline-group-toggle:focus-visible,.eotion-timeline-group-load:focus-visible { outline:2px solid var(--e-color-focus, var(--editor-focus)); }
@media (pointer:coarse) { .eotion-timeline-group-toggle,.eotion-timeline-group-load { min-height:44px; } }
</style>
