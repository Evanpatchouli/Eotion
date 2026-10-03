<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

const choice = ref('auto')
const { isDark } = useData()
let media: MediaQueryList | undefined
function apply() {
  isDark.value = choice.value === 'dark' || (choice.value === 'auto' && !!media?.matches)
  localStorage.setItem('vitepress-theme-appearance', choice.value)
}
function systemChanged() { if (choice.value === 'auto') apply() }
onMounted(() => {
  const saved = localStorage.getItem('vitepress-theme-appearance')
  choice.value = saved === 'light' || saved === 'dark' ? saved : 'auto'
  media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', systemChanged)
})
onUnmounted(() => media?.removeEventListener('change', systemChanged))
</script>

<template>
  <label class="appearance-select">
    <span class="sr-only">网站外观</span>
    <select v-model="choice" aria-label="网站外观" @change="apply">
      <option value="auto">跟随系统</option>
      <option value="light">浅色</option>
      <option value="dark">深色</option>
    </select>
  </label>
</template>
