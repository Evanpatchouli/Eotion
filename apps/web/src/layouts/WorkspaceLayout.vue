<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { useRuntimeContext } from '../composables/useRuntimeContext'
import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const route = useRoute()
const router = useRouter()
const { layoutMode, inputMode, runtime, width } = useRuntimeContext()
const mobileNavOpen = ref(false)
const documentWrap = ref<HTMLElement | null>(null)
const showDevDemos = import.meta.env.DEV

const activePage = computed(
  () => workspace.pages.find((page) => page.id === workspace.activePageId) ?? workspace.pages[0],
)
const breadcrumbTitle = computed(() => route.name === 'workspace' ? activePage.value?.title : route.meta.title)

function choosePage(id: string) {
  workspace.selectPage(id)
  mobileNavOpen.value = false
  if (route.name !== 'workspace') void router.push({ name: 'workspace' })
}

watch(() => route.path, () => {
  if (documentWrap.value) documentWrap.value.scrollTop = 0
})
</script>

<template>
  <div
    class="workspace-shell"
    :data-layout="layoutMode"
    :data-input="inputMode"
    :data-runtime="runtime"
  >
    <aside class="sidebar" :class="{ 'sidebar--open': mobileNavOpen }">
      <div class="brand-row">
        <div class="brand-mark">E</div>
        <strong>Eotion</strong>
        <button class="icon-button sidebar-close" type="button" @click="mobileNavOpen = false">×</button>
      </div>

      <button class="search-button" type="button">
        <span>⌕</span>
        <span>搜索</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav class="page-list" aria-label="Pages">
        <button
          v-for="page in workspace.pages"
          :key="page.id"
          class="page-item"
          :class="{ 'page-item--active': route.name === 'workspace' && page.id === workspace.activePageId }"
          type="button"
          @click="choosePage(page.id)"
        >
          <span>{{ page.icon }}</span>
          <span>{{ page.title }}</span>
        </button>
        <RouterLink
          v-if="showDevDemos"
          class="page-item page-item--dev"
          to="/__dev/mobile-p1"
          @click="mobileNavOpen = false"
        >
          <span>◇</span>
          <span>移动端 P1 演示</span>
        </RouterLink>
        <RouterLink
          v-if="showDevDemos"
          class="page-item page-item--dev"
          to="/__dev/editor-p2"
          @click="mobileNavOpen = false"
        >
          <span>✎</span>
          <span>编辑器 P2 演示</span>
        </RouterLink>
        <RouterLink
          v-if="showDevDemos"
          class="page-item page-item--dev"
          to="/__dev/storage-p3"
          @click="mobileNavOpen = false"
        >
          <span>▣</span>
          <span>本地存储 P3 演示</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">Web-first · TypeScript</div>
    </aside>

    <div v-if="mobileNavOpen" class="sidebar-scrim" @click="mobileNavOpen = false" />

    <main class="main-pane">
      <header class="topbar">
        <button class="icon-button mobile-menu" type="button" @click="mobileNavOpen = true">☰</button>
        <div class="breadcrumb">私有空间 / {{ breadcrumbTitle }}</div>
        <div class="runtime-badges">
          <span>{{ runtime }}</span>
          <span>{{ layoutMode }}</span>
          <span>{{ inputMode }}</span>
          <span>{{ width }}px</span>
        </div>
      </header>

      <article ref="documentWrap" class="document-wrap">
        <RouterView />
      </article>
    </main>
  </div>
</template>
