<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}>(), {
  variant: 'secondary',
})
</script>

<template>
  <button class="eotion-button" :class="`eotion-button--${variant}`" type="button">
    <slot />
  </button>
</template>

<style scoped>
.eotion-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: var(--e-space-2);
  padding: 0 var(--e-space-3);
  border: var(--e-border-width) solid transparent;
  border-radius: var(--e-radius-control);
  color: var(--e-color-text-primary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
  cursor: pointer;
  transition: background-color var(--e-motion-fast) ease, border-color var(--e-motion-fast) ease;
}
.eotion-button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 2px; }
.eotion-button:disabled { cursor: not-allowed; opacity: 0.55; }
@media (pointer: coarse) { .eotion-button { min-height: 44px; } }
.eotion-button--primary { background: var(--e-color-accent); color: var(--e-color-canvas); }
.eotion-button--primary:hover:not(:disabled) { background: var(--e-color-text-primary); }
.eotion-button--secondary { border-color: var(--e-color-border); background: var(--e-color-surface); }
.eotion-button--secondary:hover:not(:disabled) { background: var(--e-color-hover); }
.eotion-button--ghost { background: transparent; }
.eotion-button--ghost:hover:not(:disabled) { background: var(--e-color-hover); }
.eotion-button--danger { color: var(--e-color-danger); background: var(--e-color-surface-subtle); }
.eotion-button--danger:hover:not(:disabled) { text-decoration: underline; }
</style>
