import type { PageSummary } from '@eotion/domain'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const samplePages: PageSummary[] = [
  { id: 'welcome', title: '欢迎使用 Eotion', icon: '✦', updatedAt: new Date().toISOString() },
  { id: 'architecture', title: '架构决策', icon: '⌘', updatedAt: new Date().toISOString() },
  { id: 'roadmap', title: 'Roadmap', icon: '↗', updatedAt: new Date().toISOString() },
]

export const useWorkspaceStore = defineStore('workspace', () => {
  const pages = ref(samplePages)
  const activePageId = ref('welcome')

  function selectPage(id: string) {
    activePageId.value = id
  }

  return { pages, activePageId, selectPage }
})
