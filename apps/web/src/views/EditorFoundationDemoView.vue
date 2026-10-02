<script setup lang="ts">
import { computed, ref } from 'vue'

import DocumentEditor from '../components/editor/DocumentEditor.vue'
import EotionButton from '../components/ui/EotionButton.vue'
import { cloneEditorDocument, type EditorDocument } from '../editor/editorDocument'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const initialFixture = deepFreeze<EditorDocument>({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '一个安静的画布' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '这是独立的 Tiptap 文档原语。点击正文后输入，也可以用 Control / Command + B 切换粗体。' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '初始 JSON 只在挂载时读取；更换文档身份时通过 key 重建编辑器。' }] },
  ],
})
const initialFixtureSnapshot = JSON.stringify(initialFixture)
const currentDocument = ref<EditorDocument>(cloneEditorDocument(initialFixture))
const editable = ref(true)
const mounted = ref(true)
const editorKey = ref(0)
const editorRef = ref<{ focus: () => void } | null>(null)
const fixtureUnchanged = computed(() => JSON.stringify(initialFixture) === initialFixtureSnapshot)

function updateDocument(document: EditorDocument): void {
  currentDocument.value = document
}

function resetDocument(): void {
  currentDocument.value = cloneEditorDocument(initialFixture)
  editorKey.value++
}

function mountEditor(): void {
  currentDocument.value = cloneEditorDocument(initialFixture)
  mounted.value = true
}
</script>

<template>
  <main class="editor-foundation" data-testid="editor-foundation-demo">
    <header class="demo-heading">
      <p class="eyebrow">P5.8.1 · EDITOR FOUNDATION</p>
      <h1>文档画布</h1>
      <p>独立验证编辑器生命周期、输入边界与基础 JSON 输出。</p>
    </header>

    <div class="demo-layout">
      <section class="canvas" aria-label="文档画布">
        <DocumentEditor
          v-if="mounted"
          :key="editorKey"
          ref="editorRef"
          :content="initialFixture"
          :editable="editable"
          aria-label="演示文档正文"
          @update="updateDocument"
        />
        <p v-else class="unmounted-placeholder" data-testid="editor-unmounted">编辑器已卸载</p>
      </section>

      <aside class="debug-panel" aria-label="编辑器调试区">
        <h2>调试区</h2>
        <div class="controls">
          <EotionButton data-testid="readonly-toggle" :aria-pressed="!editable" @click="editable = !editable">{{ editable ? '设为只读' : '恢复编辑' }}</EotionButton>
          <EotionButton data-testid="reset-button" @click="resetDocument">重置文档</EotionButton>
          <EotionButton data-testid="focus-button" @click="editorRef?.focus()">聚焦正文</EotionButton>
          <EotionButton v-if="mounted" data-testid="mount-toggle" @click="mounted = false">卸载编辑器</EotionButton>
          <EotionButton v-else data-testid="mount-toggle" @click="mountEditor">挂载编辑器</EotionButton>
        </div>
        <p class="fixture-evidence" data-testid="fixture-evidence" :data-unchanged="fixtureUnchanged">
          初始输入对象 {{ fixtureUnchanged ? '保持不变' : '发生变化' }}
        </p>
        <section aria-labelledby="json-heading">
          <h3 id="json-heading">当前文档 JSON</h3>
          <pre data-testid="document-json">{{ JSON.stringify(currentDocument, null, 2) }}</pre>
        </section>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.editor-foundation { box-sizing: border-box; width: min(100%, 1180px); min-height: 100vh; margin-inline: auto; padding: var(--e-space-8); color: var(--e-color-text-primary); background: var(--e-color-canvas); font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family); }
.demo-heading { margin-bottom: var(--e-space-8); }
.eyebrow { color: var(--e-color-text-muted); font-size: var(--e-type-caption-size); letter-spacing: .08em; }
h1 { margin: var(--e-space-2) 0; font-size: var(--e-type-page-title-size); line-height: var(--e-type-page-title-line); font-weight: var(--e-type-page-title-weight); letter-spacing: var(--e-type-page-title-tracking); }
.demo-heading > p:last-child { color: var(--e-color-text-secondary); }
.demo-layout { display: grid; grid-template-columns: minmax(0, 740px) minmax(240px, 1fr); align-items: start; gap: var(--e-space-8); }
.canvas { box-sizing: border-box; min-width: 0; width: 100%; padding-block: var(--e-space-6); }
.debug-panel { min-width: 0; padding: var(--e-space-4); border-left: 1px solid var(--e-color-border); }
.debug-panel h2 { margin-top: 0; font-size: var(--e-type-heading-2-size); line-height: var(--e-type-heading-2-line); }
.controls { display: flex; flex-wrap: wrap; gap: var(--e-space-2); }
.fixture-evidence { color: var(--e-color-success); font-size: var(--e-type-metadata-size); }
.fixture-evidence[data-unchanged="false"] { color: var(--e-color-danger); }
.debug-panel h3 { font-size: var(--e-type-metadata-size); }
pre { box-sizing: border-box; max-width: 100%; max-height: 380px; overflow: auto; padding: var(--e-space-3); background: var(--e-color-surface-subtle); color: var(--e-color-text-secondary); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.unmounted-placeholder { min-height: 320px; color: var(--e-color-text-muted); }
@media (max-width: 760px) { .editor-foundation { padding: var(--e-space-4); } .demo-layout { grid-template-columns: minmax(0, 1fr); gap: var(--e-space-4); } .debug-panel { border-top: 1px solid var(--e-color-border); border-left: 0; padding: var(--e-space-4) 0 0; } h1 { font-size: var(--e-type-heading-1-size); line-height: var(--e-type-heading-1-line); } }
</style>
