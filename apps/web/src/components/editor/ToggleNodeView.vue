<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed } from 'vue'

import { isToggleCollapsed, toggleToggleCollapsed } from '../../editor/togglePreference'
import EotionIcon from '../ui/EotionIcon.vue'

const props = defineProps(nodeViewProps)

const blockId = computed(() => (typeof props.node.attrs.blockId === 'string' ? props.node.attrs.blockId : ''))
const collapsed = computed(() => blockId.value !== '' && isToggleCollapsed(blockId.value))

function toggle(): void {
  if (blockId.value) toggleToggleCollapsed(blockId.value)
}
</script>

<template>
  <NodeViewWrapper class="eotion-toggle" :class="{ 'eotion-toggle--collapsed': collapsed }" :data-collapsed="String(collapsed)">
    <button
      type="button"
      class="eotion-toggle-chevron"
      contenteditable="false"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? '展开折叠列表' : '折叠列表'"
      @mousedown.prevent
      @click="toggle"
    >
      <EotionIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="16" />
    </button>
    <NodeViewContent class="eotion-toggle-body" />
  </NodeViewWrapper>
</template>

<style scoped>
.eotion-toggle { position: relative; }
.eotion-toggle-chevron { position: absolute; top: 2px; left: 0; display: inline-flex; width: 20px; height: 24px; align-items: center; justify-content: center; border: 0; border-radius: var(--e-radius-control); padding: 0; background: transparent; color: var(--e-color-text-muted); cursor: pointer; }
.eotion-toggle-chevron:hover { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-toggle-chevron:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 1px; }
.eotion-toggle-body { padding-left: 1.5em; }
.eotion-toggle-body > :deep(:not(:first-child)) { padding-left: 1.25em; }
.eotion-toggle--collapsed .eotion-toggle-body > :deep(:not(:first-child)) { display: none; }
@media (max-width: 767px), (pointer: coarse) {
  .eotion-toggle-chevron { top: -3px; left: -6px; width: 36px; height: 36px; }
  .eotion-toggle-body { padding-left: 1.85em; }
}
</style>
