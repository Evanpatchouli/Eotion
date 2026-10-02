<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PageResponse } from '@eotion/contracts'

import { buildPageTree, collectSubtreeIds, flattenPageTree } from '../../utils/pageTree'
import EotionButton from '../ui/EotionButton.vue'
import EotionIcon from '../ui/EotionIcon.vue'
import { IconName } from '../ui/icons'

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
})
const canSubmit = computed(() => !props.pending && selection.value !== (props.currentParentId ?? ''))

function submit() {
  if (!canSubmit.value) return
  emit('submit', selection.value === '' ? null : selection.value)
}
</script>

<template>
  <form class="product-popover-form product-page-move-form" @submit.prevent="submit">
    <fieldset class="product-page-move-options" role="radiogroup" aria-label="移动到" :disabled="pending">
      <legend>移动到</legend>
      <label class="product-page-move-option">
        <input v-model="selection" type="radio" name="page-move-destination" value="" />
        <span class="product-page-move-option__icon" aria-hidden="true"><EotionIcon :name="IconName.FileText" :size="16" /></span>
        <span class="product-page-move-option__title">根级</span>
        <EotionIcon v-if="selection === ''" class="product-page-move-option__check" :name="IconName.Check" :size="16" aria-hidden="true" />
      </label>
      <label
        v-for="destination in destinations"
        :key="destination.page.id"
        class="product-page-move-option"
        :style="{ paddingLeft: `calc(var(--e-space-3) + ${destination.depth} * var(--e-space-5))` }"
      >
        <input v-model="selection" type="radio" name="page-move-destination" :value="destination.page.id" />
        <span class="product-page-move-option__icon" aria-hidden="true">
          <span v-if="destination.page.icon">{{ destination.page.icon }}</span>
          <EotionIcon v-else :name="IconName.FileText" :size="16" />
        </span>
        <span class="product-page-move-option__title">{{ destination.page.title }}</span>
        <EotionIcon v-if="selection === destination.page.id" class="product-page-move-option__check" :name="IconName.Check" :size="16" aria-hidden="true" />
      </label>
    </fieldset>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <div class="product-popover-form__actions">
      <EotionButton type="submit" variant="primary" :disabled="!canSubmit">{{ pending ? '正在移动…' : '移动' }}</EotionButton>
      <EotionButton :disabled="pending" @click="emit('cancel')">取消</EotionButton>
    </div>
  </form>
</template>
