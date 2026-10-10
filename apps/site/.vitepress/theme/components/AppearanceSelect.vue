<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'
import SiteSelect from './SiteSelect.vue'

type AppearanceChoice = 'auto' | 'light' | 'dark'

const options = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
const choice = ref<AppearanceChoice>('auto')
const { isDark } = useData()
let media: MediaQueryList | undefined

function apply(): void {
  isDark.value = choice.value === 'dark' || (choice.value === 'auto' && !!media?.matches)
  localStorage.setItem('vitepress-theme-appearance', choice.value)
}
function updateChoice(value: string): void {
  if (value !== 'auto' && value !== 'light' && value !== 'dark') return
  choice.value = value
  apply()
}
function systemChanged(): void { if (choice.value === 'auto') apply() }

onMounted(() => {
  const saved = localStorage.getItem('vitepress-theme-appearance')
  choice.value = saved === 'light' || saved === 'dark' ? saved : 'auto'
  media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', systemChanged)
  apply()
})
onUnmounted(() => media?.removeEventListener('change', systemChanged))
</script>

<template>
  <div class="appearance-select">
    <SiteSelect
      id="site-appearance"
      :model-value="choice"
      :options="options"
      aria-label="网站外观"
      @update:model-value="updateChoice"
    />
  </div>
</template>
