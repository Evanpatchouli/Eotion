<script setup lang="ts">
import { RouterLink } from 'vue-router'

import P2Editor from '../components/editor/P2Editor.vue'
import { useRuntimeContext } from '../composables/useRuntimeContext'

const { runtime, layoutMode, inputMode, width } = useRuntimeContext()
</script>

<template>
  <main class="p2-demo" :data-layout="layoutMode" :data-input="inputMode" :data-runtime="runtime">
    <div class="p2-demo-inner">
      <RouterLink class="p2-demo-back" to="/">← 返回工作区</RouterLink>
      <header>
        <span class="p2-demo-kicker">开发验证 · P2</span>
        <h1>Tiptap 3 编辑器概念验证</h1>
        <p>这里运行与 Web、Electron 和移动 WebView 共用的编辑器。请直接在下方输入和选择文字。</p>
      </header>
      <div class="p2-demo-context" aria-label="运行环境">
        <span>runtime: {{ runtime }}</span>
        <span>layout: {{ layoutMode }}</span>
        <span>input: {{ inputMode }}</span>
        <span>width: {{ width }}px</span>
      </div>
      <P2Editor />
    </div>
  </main>
</template>

<style scoped>
.p2-demo { min-height: 100dvh; overflow: auto; background: #fafaf8; }
.p2-demo-inner { width: min(860px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 90px; }
.p2-demo-back { color: #4469a6; font-size: 14px; text-decoration: none; }
.p2-demo header { margin: 30px 0 18px; }
.p2-demo-kicker { color: #767873; font-size: 12px; letter-spacing: .08em; }
.p2-demo h1 { margin: 7px 0 12px; font-size: clamp(28px, 5vw, 42px); }
.p2-demo header p { margin: 0; color: #686b66; line-height: 1.6; }
.p2-demo-context { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.p2-demo-context span { padding: 5px 8px; border: 1px solid #e4e4df; border-radius: 5px; background: #fff; color: #62655f; font-size: 12px; }
</style>
