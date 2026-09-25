<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { exitSuggestion } from '@tiptap/suggestion'

import { createSlashCommand } from '../../editor/slashCommand'

defineProps<{ touchToolbar: boolean }>()

const composing = ref(false)
const compositionEvents = ref<string[]>([])
const compositionTransactions = ref(0)
const selection = ref({ from: 0, to: 0, empty: true })
const lastInputLatencyMs = ref<number | null>(null)
const longPressObservation = ref('尚无')
const keyboardInset = ref(0)
let pendingInputStart: number | null = null
let touchStartedAt: number | null = null

function updateKeyboardInset() {
  const viewport = window.visualViewport
  keyboardInset.value = viewport
    ? Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))
    : 0
}

onMounted(() => {
  updateKeyboardInset()
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'touch') touchStartedAt = performance.now()
}

function onPointerFinish(event: PointerEvent) {
  if (event.pointerType !== 'touch' || touchStartedAt === null) return
  const duration = Math.round(performance.now() - touchStartedAt)
  if (duration >= 500) longPressObservation.value = `触摸持续 ${duration} ms；请检查原生选择手柄与菜单`
  touchStartedAt = null
}

function onContextMenu() {
  longPressObservation.value = '收到原生 contextmenu；未阻止默认行为'
}

function onBeforeInput(event: Event) {
  const input = event as InputEvent
  if (!composing.value && !input.isComposing && input.inputType === 'insertText' && input.data?.length === 1) {
    pendingInputStart = performance.now()
  }
}

function recordComposition(event: CompositionEvent) {
  compositionEvents.value = [
    ...compositionEvents.value.slice(-11),
    `${event.type}${event.data ? ` (${event.data})` : ''}`,
  ]
}

function onCompositionStart(event: CompositionEvent) {
  composing.value = true
  recordComposition(event)
  if (editor.value) exitSuggestion(editor.value.view)
}

function onCompositionUpdate(event: CompositionEvent) {
  recordComposition(event)
}

function onCompositionEnd(event: CompositionEvent) {
  recordComposition(event)
  composing.value = false
}

function updateSelection() {
  if (!editor.value) return
  const { from, to, empty } = editor.value.state.selection
  selection.value = { from, to, empty }
}

const editor = useEditor({
  extensions: [StarterKit, createSlashCommand(() => composing.value)],
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '在这里输入文字，尝试段落、标题和项目列表。' }],
      },
    ],
  },
  editorProps: {
    attributes: {
      'aria-label': 'P2 Tiptap 编辑区域',
      spellcheck: 'false',
    },
  },
  onCreate: updateSelection,
  onSelectionUpdate: updateSelection,
  onTransaction: ({ transaction }) => {
    if (composing.value) compositionTransactions.value += 1
    if (transaction.docChanged && pendingInputStart !== null) {
      const start = pendingInputStart
      pendingInputStart = null
      requestAnimationFrame(() => {
        lastInputLatencyMs.value = Math.round((performance.now() - start) * 10) / 10
      })
    }
  },
})

defineExpose({ editor, lastInputLatencyMs })
</script>

<template>
  <section class="p2-editor" aria-label="Tiptap 编辑器">
    <div class="p2-editor-toolbar" role="toolbar" aria-label="块类型">
      <button
        type="button"
        :aria-pressed="editor?.isActive('paragraph') ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().setParagraph().run()"
      >段落</button>
      <button
        type="button"
        :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
      >二级标题</button>
      <button
        type="button"
        :aria-pressed="editor?.isActive('bulletList') ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleBulletList().run()"
      >项目列表</button>
    </div>
    <EditorContent
      :editor="editor"
      class="p2-editor-content"
      @compositionstart="onCompositionStart"
      @compositionupdate="onCompositionUpdate"
      @compositionend="onCompositionEnd"
      @beforeinput="onBeforeInput"
      @pointerdown="onPointerDown"
      @pointerup="onPointerFinish"
      @pointercancel="onPointerFinish"
      @contextmenu="onContextMenu"
    />
    <div class="p2-editor-observation" aria-label="输入与选择观测">
      <span>composition: {{ composing ? '进行中' : '未进行' }}</span>
      <span>selection: {{ selection.from }}–{{ selection.to }} ({{ selection.empty ? '光标' : '选区' }})</span>
      <span>composition 中 transaction: {{ compositionTransactions }}</span>
      <span>事件: {{ compositionEvents.length ? compositionEvents.join(' → ') : '尚无' }}</span>
      <span>最近单字符输入至下一帧: {{ lastInputLatencyMs === null ? '尚无' : `${lastInputLatencyMs} ms` }}</span>
      <span>长按观察: {{ longPressObservation }}</span>
      <span>可视视口底部遮挡: {{ keyboardInset }} px</span>
    </div>
    <div
      v-if="touchToolbar"
      class="p2-touch-toolbar"
      role="toolbar"
      aria-label="触摸编辑工具栏"
      :style="{ bottom: `${keyboardInset}px` }"
    >
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()">粗体</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()">斜体</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().setParagraph().run()">文本</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">标题</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">列表</button>
    </div>
  </section>
</template>

<style scoped>
.p2-editor { border: 1px solid #e5e5e1; border-radius: 10px; background: #fff; }
.p2-editor-toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border-bottom: 1px solid #e5e5e1; }
.p2-editor-toolbar button { min-height: 32px; padding: 5px 10px; border: 1px solid #deded9; border-radius: 6px; background: #fff; cursor: pointer; }
.p2-editor-toolbar button[aria-pressed="true"] { border-color: #7290d1; background: #eef3ff; }
.p2-editor-toolbar button:disabled { cursor: default; opacity: .5; }
.p2-editor-content { min-height: 260px; padding: 20px 22px; line-height: 1.75; }
.p2-editor-content :deep(.tiptap) { min-height: 220px; outline: none; overflow-wrap: anywhere; }
.p2-editor-content :deep(.tiptap > :first-child) { margin-top: 0; }
.p2-editor-content :deep(.tiptap ul) { padding-left: 1.5em; }
.p2-editor-content :deep(.tiptap h2) { line-height: 1.3; }
.p2-editor-observation { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px; border-top: 1px solid #e5e5e1; color: #62655f; font-size: 12px; overflow-wrap: anywhere; }
.p2-touch-toolbar { position: fixed; z-index: 15; right: 0; left: 0; display: flex; gap: 6px; overflow-x: auto; padding: 9px max(12px, var(--safe-right)) calc(9px + var(--safe-bottom)) max(12px, var(--safe-left)); border-top: 1px solid #d9ded6; background: #fff; box-shadow: 0 -5px 20px #0001; }
.p2-touch-toolbar button { flex: 1 0 auto; min-width: 54px; min-height: 42px; padding: 7px 10px; border: 1px solid #dce2d7; border-radius: 7px; background: #f7f9f5; }
.p2-touch-toolbar button:disabled { opacity: .5; }
</style>

<style>
.p2-slash-menu { z-index: 20; min-width: 190px; padding: 5px; border: 1px solid #deded9; border-radius: 8px; background: white; box-shadow: 0 8px 24px #0002; color: #2b2e29; font-size: 13px; }
.p2-slash-item { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 5px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.p2-slash-item[aria-selected="true"], .p2-slash-item:hover { background: #eef3ff; }
</style>
