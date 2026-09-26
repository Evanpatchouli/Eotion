<script setup lang="ts">
import { computed } from 'vue'

import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const activePage = computed(
  () => workspace.pages.find((page) => page.id === workspace.activePageId) ?? workspace.pages[0],
)
</script>

<template>
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
</template>
