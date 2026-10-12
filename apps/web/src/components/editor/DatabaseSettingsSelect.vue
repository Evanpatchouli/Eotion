<script setup lang="ts">
import { computed, ref } from 'vue'
import EotionPopover from '../ui/EotionPopover.vue'
import EotionIcon from '../ui/EotionIcon.vue'
import { IconName } from '../ui/icons'

const props = defineProps<{
  modelValue: string
  options: { value: string; label: string; disabled?: boolean }[]
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const container = ref<HTMLDivElement | null>(null)
const teleportTo = computed(() => container.value?.closest<HTMLElement>('.eotion-product-overlay') ?? 'body')
const selectedLabel = computed(() => props.options.find(option => option.value === props.modelValue)?.label ?? '')
</script>

<template>
  <div ref="container" class="database-settings-select">
    <EotionPopover :disabled="disabled" :label="label" :teleport-to="teleportTo" panel-width="220px">
      <template #trigger="{ triggerProps }"><button v-bind="triggerProps" class="eotion-database-settings-select-trigger" :aria-label="label" :data-value="modelValue" :disabled="disabled"><span>{{ selectedLabel }}</span><EotionIcon :name="IconName.ChevronDown" :size="16" /></button></template>
      <template #default="{ close }">
        <button v-for="option in options" :key="option.value" type="button" role="menuitem" class="eotion-database-settings-select-option" :disabled="disabled || option.disabled" :aria-current="modelValue === option.value ? 'true' : undefined" @click="emit('update:modelValue', option.value); close()">{{ option.label }}<EotionIcon v-if="modelValue === option.value" :name="IconName.Check" :size="16" /></button>
      </template>
    </EotionPopover>
  </div>
</template>

<style scoped>
.database-settings-select { min-width: 0; }
.database-settings-select :deep(.eotion-popover-anchor) { display: block; min-width: 0; }
.eotion-database-settings-select-trigger { display:flex; width:100%; min-width:0; min-height:36px; justify-content:space-between; align-items:center; gap:8px; padding:5px 9px; border:1px solid var(--border-editor); border-radius:6px; background:var(--surface-raised); color:var(--editor-text); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.eotion-database-settings-select-trigger span { min-width:0; overflow:hidden; flex:1 1 auto; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-settings-select-trigger svg { flex:0 0 auto; }
.eotion-database-settings-select-trigger:hover,.eotion-database-settings-select-option:hover { background:var(--surface-editor-hover); }
.eotion-database-settings-select-option { display:flex; width:100%; min-height:34px; justify-content:space-between; align-items:center; gap:8px; padding:5px 9px; border:0; border-radius:4px; background:transparent; color:var(--editor-text); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.eotion-database-settings-select-option[aria-current="true"] { background:var(--surface-editor-hover); font-weight:600; }
.eotion-database-settings-select-option:disabled { opacity:.55; cursor:default; }
@media (max-width:767px) { .eotion-database-settings-select-trigger,.eotion-database-settings-select-option { min-height:44px; } }
</style>
