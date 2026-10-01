<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{
  modelValue?: string | number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <input
    v-bind="$attrs"
    class="eotion-input"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.eotion-input {
  min-width: 0;
  min-height: 36px;
  padding: 0 var(--e-space-3);
  border: var(--e-border-width) solid var(--e-color-border);
  border-radius: var(--e-radius-control);
  background: var(--e-color-surface);
  color: var(--e-color-text-primary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
}
.eotion-input::placeholder { color: var(--e-color-text-muted); }
.eotion-input:focus-visible { border-color: var(--e-color-focus); outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 1px; }
.eotion-input:disabled { color: var(--e-color-text-muted); cursor: not-allowed; }
</style>
