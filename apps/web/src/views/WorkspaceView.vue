<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { useRuntimeContext } from '../composables/useRuntimeContext'
import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const { layoutMode, inputMode, runtime, width } = useRuntimeContext()
const mobileNavOpen = ref(false)
const showDevDemos = import.meta.env.DEV

const activePage = computed(
  () => workspace.pages.find((page) => page.id === workspace.activePageId) ?? workspace.pages[0],
)

function choosePage(id: string) {
  workspace.selectPage(id)
  mobileNavOpen.value = false
}
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
          :class="{ 'page-item--active': page.id === workspace.activePageId }"
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
      </nav>

      <div class="sidebar-footer">Web-first · TypeScript</div>
    </aside>

    <div v-if="mobileNavOpen" class="sidebar-scrim" @click="mobileNavOpen = false" />

    <main class="main-pane">
      <header class="topbar">
        <button class="icon-button mobile-menu" type="button" @click="mobileNavOpen = true">☰</button>
        <div class="breadcrumb">私有空间 / {{ activePage?.title }}</div>
        <div class="runtime-badges">
          <span>{{ runtime }}</span>
          <span>{{ layoutMode }}</span>
          <span>{{ inputMode }}</span>
          <span>{{ width }}px</span>
        </div>
      </header>

      <article class="document-wrap">
        <div class="document">
          <div class="page-icon">{{ activePage?.icon }}</div>
          <h1 contenteditable="true" spellcheck="false">{{ activePage?.title }}</h1>
          <p class="lead">
            这是 Eotion 的初始 Web UI。它会被浏览器、Electron 和移动端 WebView 共同复用。
          </p>

          <section class="callout">
            <strong>架构约束已写入仓库：</strong>
            <span>只维护一套主 UI；Desktop / Tablet / Mobile 由同一个 Web App 提供不同布局与交互模式。</span>
          </section>

          <div class="editor-placeholder" contenteditable="true" spellcheck="false">
            在这里输入一些内容……目前只是可编辑占位区。下一阶段由 Codex 接入 Tiptap 3 / ProseMirror，先验证中文输入法、长文档和移动 WebView。
          </div>

          <div class="feature-grid">
            <div class="feature-card">
              <span class="feature-kicker">Desktop</span>
              <strong>Electron</strong>
              <p>electron-vite 直接把 apps/web 作为 renderer root。</p>
            </div>
            <div class="feature-card">
              <span class="feature-kicker">Mobile</span>
              <strong>Vue Lynx</strong>
              <p>只做壳、WebView 与未来的原生桥，不重写整个产品 UI。</p>
            </div>
            <div class="feature-card">
              <span class="feature-kicker">Server</span>
              <strong>NestJS + Fastify</strong>
              <p>MongoDB 可选连接启动；Redis/Kafka 暂不成为 v0.1 强依赖。</p>
            </div>
          </div>
        </div>
      </article>
    </main>
  </div>
</template>
