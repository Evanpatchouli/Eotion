<script setup lang="ts">
import { computed } from 'vue'

import EotionIcon from '../ui/EotionIcon.vue'
import { useProductSyncStore } from '../../stores/productSync'

const sync = useProductSyncStore()

const status = computed(() => {
  if (sync.state === 'failed') return { state: 'error', text: `同步失败 · ${sync.pending} 项待同步 · 重试` }
  if (sync.state === 'offline') return { state: 'offline', text: '离线 · 本地已保存' }
  if (sync.state === 'syncing') return { state: 'saving', text: '正在同步…' }
  if (sync.pending > 0) return { state: 'saving', text: `${sync.pending} 项待同步` }
  if (sync.state === 'synced') return { state: 'synced', text: '已同步' }
  return { state: 'idle', text: '' }
})

const canRetry = computed(() => status.value.state === 'error' || status.value.state === 'offline')
</script>

<template>
  <div class="product-save-status product-sync-status" role="status" aria-live="polite" :data-state="status.state">
    <button v-if="canRetry" class="product-text-button product-sync-action" type="button" @click="sync.retry()">
      <EotionIcon name="refresh" :size="16" />{{ status.text }}
    </button>
    <span v-else>{{ status.text }}</span>
  </div>
</template>

<style scoped>
.product-sync-status {
  flex: none;
  min-width: 0;
  color: var(--e-color-text-muted);
  font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family);
  white-space: nowrap;
}

.product-sync-status[data-state="synced"] { color: var(--e-color-success); }
.product-sync-status[data-state="offline"] { color: var(--e-color-warning); }
.product-sync-status[data-state="error"] { color: var(--e-color-danger); }

.product-sync-status .product-sync-action {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.product-sync-status .product-sync-action:focus-visible {
  outline: var(--e-focus-ring-width) solid var(--e-color-focus);
  outline-offset: 1px;
}

@media (pointer: coarse) {
  .product-sync-status .product-sync-action { min-height: 44px; }
}
</style>
