<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PageResponse } from '@eotion/contracts'

import { buildPageTree, collectSubtreeIds, flattenPageTree } from '../../utils/pageTree'

const props = defineProps<{
  pages: PageResponse[]
  pageId: string
  currentParentId: string | null
  pending: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  submit: [parentPageId: string | null]
  cancel: []
}>()

const selection = ref(props.currentParentId ?? '')

// A page can never be moved under itself or one of its descendants; the server
// enforces this too, this only keeps impossible targets out of the selector.
const excluded = computed(() => collectSubtreeIds(props.pages, props.pageId))
const destinations = computed(() => {
  const expandedIds = new Set(props.pages.map((page) => page.id))
  return flattenPageTree(buildPageTree(props.pages), expandedIds)
    .filter((row) => !excluded.value.has(row.page.id))
    .map((row) => ({ id: row.page.id, label: `${'　'.repeat(row.depth)}${row.page.title}` }))
})
const canSubmit = computed(() => !props.pending && selection.value !== (props.currentParentId ?? ''))

function submit() {
  if (!canSubmit.value) return
  emit('submit', selection.value === '' ? null : selection.value)
}
</script>

<template>
  <form class="product-form product-page-inline-form" @submit.prevent="submit">
    <label class="product-field">
      <span>移动到</span>
      <select v-model="selection" aria-label="移动到" :disabled="pending">
        <option value="">根级</option>
        <option v-for="destination in destinations" :key="destination.id" :value="destination.id">{{ destination.label }}</option>
      </select>
    </label>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <div class="product-inline-actions">
      <button class="product-button product-button--primary" type="submit" :disabled="!canSubmit">{{ pending ? '正在移动…' : '移动' }}</button>
      <button class="product-button" type="button" :disabled="pending" @click="emit('cancel')">取消</button>
    </div>
  </form>
</template>
