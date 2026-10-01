<script setup lang="ts">
import EotionIcon from './EotionIcon.vue'
import type { IconName } from './icons'

defineProps<{
  name: `${IconName}`
  label: string
  size?: 16 | 18 | 20 | 24
}>()
</script>

<template>
  <button class="eotion-icon-button" type="button" :aria-label="label">
    <EotionIcon :name="name" :size="size ?? 18" />
  </button>
</template>

<style scoped>
.eotion-icon-button {
  display: inline-grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  color: var(--e-color-text-secondary);
  cursor: pointer;
}
.eotion-icon-button:hover:not(:disabled) { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-icon-button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 2px; }
.eotion-icon-button:disabled { cursor: not-allowed; opacity: 0.55; }
@media (pointer: coarse) { .eotion-icon-button { width: 44px; height: 44px; } }
</style>
