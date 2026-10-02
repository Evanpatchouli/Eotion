<script setup lang="ts">
import EotionIcon from './EotionIcon.vue'
import { IconName } from './icons'

interface EotionContextMenuItem {
  label: string
  icon: IconName
  danger?: boolean
  disabled?: boolean
  shortcut?: string
  action: () => void
}

withDefaults(defineProps<{
  items: EotionContextMenuItem[]
  itemRole?: 'menuitem' | 'button'
}>(), {
  itemRole: 'menuitem',
})
</script>

<template>
  <div class="eotion-context-menu">
    <button
      v-for="item in items"
      :key="item.label"
      class="eotion-context-menu__item"
      :class="{ 'eotion-context-menu__item--danger': item.danger }"
      type="button"
      :role="itemRole"
      :disabled="item.disabled"
      :data-danger="item.danger ? 'true' : undefined"
      data-popover-item
      @click="item.action"
    >
      <EotionIcon class="eotion-context-menu__icon" :name="item.icon" :size="16" />
      <span class="eotion-context-menu__label">{{ item.label }}</span>
      <span v-if="item.shortcut" class="eotion-context-menu__shortcut">{{ item.shortcut }}</span>
    </button>
  </div>
</template>

<style scoped>
.eotion-context-menu {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.eotion-context-menu__item {
  display: grid;
  width: 100%;
  min-height: 28px;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  color: var(--e-color-text-secondary);
  text-align: left;
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
  cursor: pointer;
}

.eotion-context-menu__icon {
  width: 16px;
  height: 16px;
  flex: none;
}

.eotion-context-menu__label { min-width: 0; line-height: var(--e-type-ui-line); }
.eotion-context-menu__shortcut { color: var(--e-color-text-muted); font-size: 12px; line-height: var(--e-type-ui-line); }

.eotion-context-menu__item:hover:not(:disabled) {
  background: var(--e-color-hover);
  color: var(--e-color-text-primary);
}

.eotion-context-menu__item:focus-visible {
  outline: var(--e-focus-ring-width) solid var(--e-color-focus);
  outline-offset: 1px;
}

.eotion-context-menu__item:disabled {
  color: var(--e-color-text-muted);
  cursor: not-allowed;
}

.eotion-context-menu__item--danger { color: var(--e-color-danger); }
.eotion-context-menu__item--danger:hover:not(:disabled) { color: var(--e-color-danger); }
</style>
