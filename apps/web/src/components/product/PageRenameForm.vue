<script setup lang="ts">
import { computed, ref } from 'vue'

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
  <form class="product-form product-page-inline-form" @submit.prevent="submit">
    <label class="product-field">
      <span>页面标题</span>
      <input v-model="title" aria-label="页面标题" maxlength="200" required />
    </label>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <div class="product-inline-actions">
      <button class="product-button product-button--primary" type="submit" :disabled="!canSubmit">{{ pending ? '正在保存…' : '保存标题' }}</button>
      <button class="product-button" type="button" :disabled="pending" @click="emit('cancel')">取消</button>
    </div>
  </form>
</template>
