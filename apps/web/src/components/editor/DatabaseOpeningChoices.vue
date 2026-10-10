<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DeviceOpeningConfig, ProductLayoutMode, ProductOverlayMode } from '../ui/productOverlay'
import { openingOptions } from '../ui/productOverlay'
import EotionPopover from '../ui/EotionPopover.vue'

defineProps<{
  target: 'record' | 'property'
  config: DeviceOpeningConfig
  currentLayout: ProductLayoutMode
}>()

const emit = defineEmits<{
  change: [layout: ProductLayoutMode, mode: ProductOverlayMode]
}>()
const container = ref<HTMLDivElement | null>(null)
const teleportTo = computed(() => container.value?.closest<HTMLElement>('.eotion-product-overlay') ?? 'body')

const layouts = [
  { id: 'desktop', label: '桌面' },
  { id: 'tablet', label: '平板' },
  { id: 'mobile', label: '手机' },
] as const
const labels: Record<ProductOverlayMode, string> = {
  drawer: '抽屉', 'right-drawer': '右侧抽屉', 'bottom-drawer': '下方抽屉', modal: '弹窗', page: '页面',
}
</script>

<template>
  <div ref="container" class="opening-choices" :aria-label="`${target === 'record' ? '记录' : '属性'}打开方式配置`">
    <div v-for="layout in layouts" :key="layout.id" class="opening-choices__row" role="group" :aria-label="`${target === 'record' ? '记录' : '属性'}${layout.label}打开方式`">
      <div class="opening-choices__label">{{ layout.label }}<small v-if="currentLayout === layout.id">当前设备</small></div>
      <EotionPopover :label="`${target === 'record' ? '记录' : '属性'}${layout.label}打开方式`" :teleport-to="teleportTo" panel-width="168px">
        <template #trigger="{ triggerProps }"><button v-bind="triggerProps" class="opening-choices__trigger" :aria-label="`${target === 'record' ? '记录' : '属性'}${layout.label}打开方式`">{{ labels[config[layout.id]] }}<span aria-hidden="true">⌄</span></button></template>
        <template #default="{ close }">
          <button
            v-for="mode in openingOptions[layout.id]"
            :key="mode"
            type="button"
            role="menuitem"
            class="opening-choices__option"
            :aria-current="config[layout.id] === mode ? 'true' : undefined"
            @click="emit('change', layout.id, mode); close()"
          ><span>{{ labels[mode] }}</span><span v-if="config[layout.id] === mode" aria-hidden="true">✓</span></button>
        </template>
      </EotionPopover>
    </div>
  </div>
</template>

<style scoped>
.opening-choices { display: grid; gap: 12px; min-width: 0; }
.opening-choices__row { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(118px, 1fr); align-items: center; gap: 12px; min-width: 0; }
.opening-choices__label { display: flex; align-items: baseline; gap: 8px; font-size: 12px; font-weight: 600; color: var(--editor-text); }
.opening-choices__label small { font-size: 11px; font-weight: 400; color: var(--editor-muted); }
.opening-choices__trigger { display: flex; width: 100%; min-height: 36px; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 9px; border: 1px solid var(--border-editor); border-radius: 6px; background: var(--surface-raised); color: var(--editor-text); font: inherit; font-size: 12px; cursor: pointer; }
.opening-choices__trigger:hover, .opening-choices__option:hover { background: var(--surface-editor-hover); }
.opening-choices__option { display: flex; width: 100%; min-height: 34px; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 9px; border: 0; border-radius: 4px; background: transparent; color: var(--editor-text); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.opening-choices__option[aria-current="true"] { background: var(--surface-editor-hover); font-weight: 600; }
@media (max-width: 767px) { .opening-choices__trigger, .opening-choices__option { min-height: 44px; } }
</style>
