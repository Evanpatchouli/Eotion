<script setup lang="ts">
import type { StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  active?: boolean
  disabled?: boolean
  rowClass?: string
  rowStyle?: StyleValue
}>(), {
  active: false,
  disabled: false,
  rowClass: '',
})
</script>

<template>
  <div
    class="eotion-nav-item"
    :class="[rowClass, { 'eotion-nav-item--active': active, 'eotion-nav-item--disabled': disabled }]"
    :style="rowStyle"
  >
    <span v-if="$slots.leading" class="eotion-nav-item__leading" :inert="disabled">
      <slot name="leading" :disabled="disabled" />
    </span>
    <button
      v-bind="$attrs"
      class="eotion-nav-item__main"
      type="button"
      :disabled="disabled"
      :aria-current="active ? 'page' : undefined"
    >
      <slot name="icon" />
      <slot />
    </button>
    <span v-if="$slots.trailing" class="eotion-nav-item__trailing" :inert="disabled">
      <slot name="trailing" :disabled="disabled" />
    </span>
  </div>
</template>

<style scoped>
.eotion-nav-item {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 32px;
  align-items: center;
  gap: 2px;
  border-radius: var(--e-radius-control);
  background: transparent;
  transition: background-color var(--e-motion-fast) ease;
}

.eotion-nav-item:not(.eotion-nav-item--disabled):hover {
  background: var(--e-color-hover);
}

.eotion-nav-item:not(.eotion-nav-item--disabled):has(> .eotion-nav-item__main:active:not(:disabled)) {
  background: var(--e-color-selected);
}

.eotion-nav-item--active,
.eotion-nav-item--active:hover,
.eotion-nav-item--active:has(> .eotion-nav-item__main:active:not(:disabled)) {
  background: var(--e-color-selected);
}

.eotion-nav-item--disabled,
.eotion-nav-item--disabled:hover {
  background: transparent;
}

.eotion-nav-item__leading {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.eotion-nav-item__main {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  flex: 1;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  overflow: hidden;
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  color: var(--e-color-text-secondary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
  text-align: left;
  cursor: pointer;
}

.eotion-nav-item__main[aria-current="page"] {
  background: transparent;
  color: var(--e-color-text-primary);
}

.eotion-nav-item__main:focus-visible {
  position: relative;
  outline: var(--e-focus-ring-width) solid var(--e-color-focus);
  outline-offset: -2px;
}

.eotion-nav-item__main:disabled {
  color: var(--e-color-text-muted);
  cursor: not-allowed;
  opacity: 0.65;
}

.eotion-nav-item__trailing {
  display: flex;
  flex: none;
  align-items: center;
}

@media (pointer: coarse) {
  .eotion-nav-item { height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .eotion-nav-item { transition-duration: 0.01ms; }
}
</style>
