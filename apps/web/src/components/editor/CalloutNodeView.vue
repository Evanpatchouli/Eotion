<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, ref, watch } from 'vue'

const props = defineProps(nodeViewProps)
const settingsOpen = ref(false)
const iconDraft = ref(typeof props.node.attrs.icon === 'string' ? props.node.attrs.icon : '💡')
const tone = computed(() => props.node.attrs.tone === 'info' || props.node.attrs.tone === 'warning' ? props.node.attrs.tone : 'neutral')

watch(() => props.node.attrs.icon, (value) => {
  iconDraft.value = typeof value === 'string' ? value : '💡'
})

function updateIcon(): void {
  if (!props.editor.isEditable) return
  if (iconDraft.value.length < 1 || iconDraft.value.length > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(iconDraft.value)) return
  props.updateAttributes({ icon: iconDraft.value })
}

function updateTone(event: Event): void {
  if (!props.editor.isEditable) return
  const value = (event.target as HTMLSelectElement).value
  if (value === 'neutral' || value === 'info' || value === 'warning') props.updateAttributes({ tone: value })
}
</script>

<template>
  <NodeViewWrapper class="eotion-callout" :data-tone="tone">
    <span class="eotion-callout-icon" aria-hidden="true" contenteditable="false">{{ props.node.attrs.icon || '💡' }}</span>
    <NodeViewContent class="eotion-callout-content" />
    <div v-if="props.editor.isEditable" class="eotion-callout-controls" contenteditable="false">
      <button
        type="button"
        class="eotion-callout-settings-trigger"
        aria-label="提示块设置"
        :aria-expanded="settingsOpen"
        @mousedown.stop
        @click="settingsOpen = !settingsOpen"
      >⋯</button>
      <div v-if="settingsOpen" class="eotion-callout-settings">
        <label>
          <span>图标</span>
          <input v-model="iconDraft" aria-label="提示块图标" maxlength="32" @input="updateIcon">
        </label>
        <label>
          <span>语气</span>
          <select :value="tone" aria-label="提示块语气" @change="updateTone">
            <option value="neutral">中性</option>
            <option value="info">信息</option>
            <option value="warning">警告</option>
          </select>
        </label>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.eotion-callout { position: relative; display: flex; min-width: 0; align-items: flex-start; gap: 10px; margin: 10px 0; border: 1px solid var(--e-color-border-subtle); border-left: 3px solid var(--e-color-border); border-radius: var(--e-radius-block); padding: 11px 12px; background: var(--e-color-surface-subtle); color: var(--e-color-text-primary); }
.eotion-callout[data-tone="info"] { border-left-color: var(--e-color-focus); }
.eotion-callout[data-tone="warning"] { border-left-color: var(--e-color-warning); }
.eotion-callout-icon { flex: 0 0 auto; line-height: 1.5; }
.eotion-callout-content { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.eotion-callout-controls { position: relative; flex: 0 0 auto; margin: -6px -6px 0 0; }
.eotion-callout-settings-trigger { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-muted); font-size: 20px; line-height: 1; cursor: pointer; }
.eotion-callout-settings-trigger:hover { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-callout-settings-trigger:focus-visible, .eotion-callout-settings input:focus-visible, .eotion-callout-settings select:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 1px; }
.eotion-callout-settings { position: absolute; z-index: 12; top: calc(100% + 4px); right: 0; display: grid; min-width: 190px; gap: 8px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); padding: 10px; background: var(--e-color-surface); box-shadow: var(--shadow-menu); }
.eotion-callout-settings label { display: grid; gap: 4px; color: var(--e-color-text-muted); font-size: 12px; }
.eotion-callout-settings input, .eotion-callout-settings select { box-sizing: border-box; width: 100%; min-height: 34px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); padding: 4px 7px; background: var(--e-color-surface-subtle); color: var(--e-color-text-primary); font: inherit; }
@media (max-width: 767px), (pointer: coarse) {
  .eotion-callout { gap: 9px; padding: 10px; }
  .eotion-callout-settings-trigger { width: 44px; height: 44px; margin: -7px -7px 0 0; }
  .eotion-callout-settings { right: -4px; min-width: min(220px, calc(100vw - 48px)); }
  .eotion-callout-settings input, .eotion-callout-settings select { min-height: 44px; }
}
</style>
