<script setup lang="ts">
withDefaults(defineProps<{
  as?: string
  variant?: 'canvas' | 'sidebar' | 'subtle' | 'surface' | 'elevated'
}>(), {
  as: 'div',
  variant: 'canvas',
})
</script>

<template>
  <component :is="as" class="eotion-surface" :class="`eotion-surface--${variant}`"><slot /></component>
</template>

<style scoped>
.eotion-surface--canvas { background: var(--e-color-canvas); }
.eotion-surface--sidebar { background: var(--e-color-sidebar); }
.eotion-surface--subtle { border-radius: var(--e-radius-block); background: var(--e-color-surface-subtle); }
.eotion-surface--surface { border-radius: var(--e-radius-control); background: var(--e-color-surface); }
.eotion-surface--elevated { border: var(--e-border-width) solid var(--e-color-border); border-radius: var(--e-radius-popover); background: var(--e-color-elevated); box-shadow: var(--e-shadow-popover); }
</style>
