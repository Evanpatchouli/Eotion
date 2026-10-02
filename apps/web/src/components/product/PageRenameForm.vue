<script setup lang="ts">
import { computed, ref } from 'vue'

import EotionButton from '../ui/EotionButton.vue'
import EotionInput from '../ui/EotionInput.vue'

const props = defineProps<{
  initialTitle: string
  pending: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  submit: [title: string]
  cancel: []
}>()

const title = ref(props.initialTitle)
const canSubmit = computed(() => title.value.trim().length > 0 && !props.pending && title.value.trim() !== props.initialTitle)

function submit() {
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle || props.pending || trimmedTitle === props.initialTitle) return
  emit('submit', trimmedTitle)
}
</script>

<template>
  <form class="product-popover-form product-page-rename-form" @submit.prevent="submit">
    <label class="product-page-rename-field">
      <span>页面标题</span>
      <EotionInput v-model="title" data-page-rename-input aria-label="页面标题" maxlength="200" required :disabled="pending" />
    </label>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <div class="product-popover-form__actions">
      <EotionButton type="submit" variant="primary" :disabled="!canSubmit">{{ pending ? '正在保存…' : '保存标题' }}</EotionButton>
      <EotionButton :disabled="pending" @click="emit('cancel')">取消</EotionButton>
    </div>
  </form>
</template>
