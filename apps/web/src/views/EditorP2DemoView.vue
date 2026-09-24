<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'

import P2Editor from '../components/editor/P2Editor.vue'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { loadP2Fixture, type P2LoadMeasurement } from '../editor/p2Benchmark'

const { runtime, layoutMode, inputMode, width } = useRuntimeContext()
const editorView = ref<InstanceType<typeof P2Editor> | null>(null)
const loading = ref(false)
const loadError = ref('')
const measurement = ref<P2LoadMeasurement | null>(null)

async function loadLargeDocument() {
  const editor = editorView.value?.editor
  if (!editor || loading.value) return

  loading.value = true
  loadError.value = ''
  measurement.value = null
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  try {
    measurement.value = await loadP2Fixture(editor)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}
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
      <section class="p2-demo-benchmark" aria-label="5000 区块验证">
        <div>
          <strong>5,000 区块合成文档</strong>
          <p>同一编辑器加载确定性的段落、标题、列表及格式化文字。加载后点击内容输入普通字符，并观察下方耗时和选区。</p>
        </div>
        <button type="button" :disabled="loading" @click="loadLargeDocument">{{ loading ? '加载中…' : '加载 5,000 区块' }}</button>
        <p v-if="loadError" role="alert">加载失败：{{ loadError }}</p>
        <div v-if="measurement" class="p2-demo-metrics" aria-label="加载指标">
          <span>可编辑文本块：{{ measurement.stats.textBlocks }}</span>
          <span>实际渲染：{{ measurement.renderedTextBlocks }}</span>
          <span>生成：{{ measurement.generationMs }} ms</span>
          <span>setContent：{{ measurement.setContentMs }} ms</span>
          <span>至下一次绘制机会：{{ measurement.readyMs }} ms</span>
        </div>
      </section>
      <P2Editor ref="editorView" :touch-toolbar="layoutMode === 'mobile' || inputMode !== 'mouse'" />
      <section class="p2-demo-checks" aria-label="编辑器人工验证步骤">
        <h2>输入与选择验证</h2>
        <ol>
          <li>在空段落输入 <code>/</code>，用 ↑/↓ 选择 Text、Heading、Bullet List，按 Enter 执行；再次输入并按 Esc 验证关闭。</li>
          <li>用真实中文输入法输入词组，观察 compositionstart/update/end、过程中的 transaction 数和光标位置；组合输入期间 Slash 菜单不应出现。</li>
          <li>拖选文字、移动光标，核对上方 selection 的 from/to/empty；输入后使用 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z 检查撤销与重做。</li>
          <li>在触摸设备上长按并拖动原生选择手柄，观察长按记录；用底部工具栏切换格式。弹出虚拟键盘后确认光标、工具栏及编辑区域仍可见。</li>
        </ol>
      </section>
    </div>
  </main>
</template>

<style scoped>
.p2-demo { min-height: 100dvh; overflow: auto; background: #fafaf8; }
.p2-demo-inner { width: min(860px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 130px; }
.p2-demo-back { color: #4469a6; font-size: 14px; text-decoration: none; }
.p2-demo header { margin: 30px 0 18px; }
.p2-demo-kicker { color: #767873; font-size: 12px; letter-spacing: .08em; }
.p2-demo h1 { margin: 7px 0 12px; font-size: clamp(28px, 5vw, 42px); }
.p2-demo header p { margin: 0; color: #686b66; line-height: 1.6; }
.p2-demo-context { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.p2-demo-context span { padding: 5px 8px; border: 1px solid #e4e4df; border-radius: 5px; background: #fff; color: #62655f; font-size: 12px; }
.p2-demo-benchmark { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-bottom: 16px; padding: 14px; border: 1px solid #e4e4df; border-radius: 9px; background: #fff; }
.p2-demo-benchmark > div:first-child { flex: 1 1 300px; }
.p2-demo-benchmark strong { font-size: 14px; }
.p2-demo-benchmark p { margin: 4px 0 0; color: #666b63; font-size: 12px; line-height: 1.5; }
.p2-demo-benchmark button { min-height: 36px; padding: 6px 12px; border: 1px solid #ced6ca; border-radius: 6px; background: #f1f6ed; cursor: pointer; }
.p2-demo-benchmark button:disabled { cursor: default; opacity: .6; }
.p2-demo-metrics { display: flex; flex: 1 1 100%; flex-wrap: wrap; gap: 6px 14px; color: #434a41; font-size: 12px; }
.p2-demo-checks { margin-top: 24px; color: #555a53; line-height: 1.7; }
.p2-demo-checks h2 { margin: 0 0 8px; color: #252a24; font-size: 17px; }
.p2-demo-checks ol { margin: 0; padding-left: 22px; }
</style>
