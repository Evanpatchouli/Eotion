<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  pending: boolean
  error?: string | null
  submitLabel?: string
}>()

const emit = defineEmits<{
  submit: [name: string]
}>()

const name = ref('')
const canSubmit = computed(() => name.value.trim().length > 0 && !props.pending)

function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName || props.pending) return
  emit('submit', trimmedName)
}
</script>

<template>
  <form class="product-form" @submit.prevent="submit">
    <label class="product-field">
      <span>工作区名称</span>
      <input v-model="name" aria-label="工作区名称" autocomplete="organization" maxlength="200" required />
    </label>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <button class="product-button product-button--primary" type="submit" :disabled="!canSubmit">
      {{ pending ? '正在创建…' : submitLabel ?? '创建工作区' }}
    </button>
  </form>
</template>
