<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: boolean
  label: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <button
    class="eotion-switch"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  ><span class="eotion-switch__thumb" /></button>
</template>

<style scoped>
.eotion-switch {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  cursor: pointer;
}
.eotion-switch:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 2px; }
.eotion-switch:disabled { cursor: not-allowed; opacity: 0.55; }
.eotion-switch__thumb {
  position: relative;
  display: block;
  width: 40px;
  height: 24px;
  border: var(--e-border-width) solid var(--e-color-text-secondary);
  border-radius: 999px;
  background: var(--e-color-selected);
  transition: background-color var(--e-motion-fast) ease, border-color var(--e-motion-fast) ease;
}
.eotion-switch__thumb::after {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--e-color-surface);
  content: '';
  transition: transform var(--e-motion-fast) ease;
}
.eotion-switch[aria-checked="true"] .eotion-switch__thumb { border-color: var(--e-color-accent); background: var(--e-color-accent); }
.eotion-switch[aria-checked="true"] .eotion-switch__thumb::after { transform: translateX(16px); }
</style>
