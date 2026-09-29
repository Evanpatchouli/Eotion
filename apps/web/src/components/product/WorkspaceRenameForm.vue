<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  initialName: string
  pending: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  submit: [name: string]
}>()

const name = ref(props.initialName)
const canSubmit = computed(() => name.value.trim().length > 0 && !props.pending && name.value.trim() !== props.initialName)

function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName || props.pending || trimmedName === props.initialName) return
  emit('submit', trimmedName)
}
</script>

<template>
  <form class="product-form" @submit.prevent="submit">
    <label class="product-field">
      <span>新工作区名称</span>
      <input v-model="name" aria-label="新工作区名称" autocomplete="organization" maxlength="200" required />
    </label>
    <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
    <button class="product-button product-button--primary" type="submit" :disabled="!canSubmit">
      {{ pending ? '正在保存…' : '保存名称' }}
    </button>
  </form>
</template>
